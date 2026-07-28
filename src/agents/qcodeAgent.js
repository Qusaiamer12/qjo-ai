const { qcodeToolNames } = require('../tools/fileEditorTool');
const { sanitizeMathNotation } = require('../services/textSanitizer');

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

const MAX_STEPS = 8; // multi-step agent loop: lets Qcode write one file per step across several turns
const MAX_ACTIONS_TOTAL = 60;
// Groq's llama-3.3-70b-versatile (our primary Qcode provider) has a hard
// server-side ceiling of 8192 completion tokens. Requesting more than that
// causes the provider to reject the whole call with a 400 error instead of
// just returning a longer answer. Qwen/Kimi/Nvidia support far higher output
// limits, but we keep one shared, safe ceiling so the value works no matter
// which provider actually serves the request.
const GROQ_MAX_COMPLETION_TOKENS = 8192;
const SAFE_MAX_TOKENS = GROQ_MAX_COMPLETION_TOKENS - 200; // margin for token-count estimation drift
const PLAN_MAX_TOKENS = SAFE_MAX_TOKENS;
const CONTINUE_MAX_TOKENS = SAFE_MAX_TOKENS;
const REPAIR_JSON_MAX_TOKENS = SAFE_MAX_TOKENS;

function createQcodeAgent(deps) {
  const required = [
    'callQcodeRouter',
    'qcodeWorkspaceSummary',
    'projectKnowledgeContext',
    'usage',
    'extractJsonObject',
    'normalizeQcodeActions',
    'runQcodeAction',
    'runQcodeCommand',
    'verifyWorkspace',
    'learning'
  ];
  for (const key of required) {
    if (deps[key] === undefined || deps[key] === null) throw new Error(`createQcodeAgent missing dependency: ${key}`);
  }

  function buildKnownPitfallsSection() {
    const instincts = deps.learning.getTopInstincts(5, 2);
    if (!instincts.length) return '';
    const lines = instincts.map(i => `- (${i.category}, seen ${i.count}x) ${i.example}`);
    return `\n\nKnown pitfalls from past Qcode sessions in this deployment — avoid repeating these:\n${lines.join('\n')}`;
  }

  function buildSystemPrompt(workspace) {
    return `You are Qcode, Qjo's public code lab agent. Act like an elite senior full-stack engineer comparable to Claude Code/Cursor.
You can request file tools by returning STRICT JSON only in this shape:
{"answer":"short user-facing summary","actions":[{"tool":"list_files"},{"tool":"read_file","path":"..."},{"tool":"write_file","path":"...","content":"..."},{"tool":"edit_file","path":"...","find":"exact text","replace":"new text"},{"tool":"search_files","query":"..."},{"tool":"project_map"},{"tool":"create_snapshot","query":"label"},{"tool":"run_command","command":"npm test"},{"tool":"rollback_snapshot","snapshotId":"..."}],"continue":false}
Rules:
- Return ONLY the JSON object. No prose before or after it, no markdown code fences.
- Use actions when the user asks to create, inspect, edit, or search project files.
- Prefer write_file for new files with complete content.
- Prefer edit_file for small exact replacements.
- Never access files outside the Qcode workspace.
- Safe command execution is available through run_command for allowlisted commands only (npm/node/python/pytest/npx/ls/pwd/cat). Use it for tests/build after creating files.
- Always create or rely on snapshots before risky edits; write/edit tools create automatic snapshots.
- MULTI-FILE BUILDS (e.g. "build me a website/app"): do NOT try to cram every file into one giant response. Write ONE complete, working file per step (start with the most critical file, e.g. index.html or package.json). Set "continue": true if more files are still needed, and you will be called again automatically to write the next file, until the whole project is done. Set "continue": false only once the requested build is actually complete.
- After you finish, Qcode automatically syntax-checks changed files (and runs "npm test" if the project defines one) before telling the user the task is done. If that verification fails, you will be asked to fix it — so don't rely on your own claim that something works without it actually running.
- Current workspace files:\n${workspace}
${buildKnownPitfallsSection()}

${deps.projectKnowledgeContext}`;
  }

  async function callModelAsJson(conversation, maxTokens, temperature, res) {
    const ai = await deps.callQcodeRouter(conversation, { max_tokens: maxTokens, temperature });
    if (!ai.ok) return { ai, parsed: null };

    let parsed = deps.extractJsonObject(ai.answer);
    if (!parsed || typeof parsed !== 'object') {
      // The model didn't return valid JSON (common failure mode for open-ended
      // "build me a website" prompts). Give it one chance to reformat before
      // giving up and treating the reply as plain prose with zero actions.
      if (res) sseWrite(res, 'phase', { phase: 'reformat' });
      const reformatPrompt = `Your previous reply was not valid JSON, or was cut off. Re-send ONLY a single STRICT JSON object matching the required shape (no prose, no code fences, no explanation outside the JSON). If your previous answer was too long, write fewer/smaller files this step and set "continue": true.\n\nYour previous reply was:\n${String(ai.answer || '').slice(-4000)}`;
      const retryAi = await deps.callQcodeRouter([...conversation, { role: 'assistant', content: String(ai.answer || '').slice(-4000) }, { role: 'user', content: reformatPrompt }], { max_tokens: maxTokens, temperature: Math.min(temperature, 0.1) });
      if (retryAi.ok) {
        const retryParsed = deps.extractJsonObject(retryAi.answer);
        if (retryParsed && typeof retryParsed === 'object') return { ai: retryAi, parsed: retryParsed };
      }
      return { ai, parsed: null };
    }
    return { ai, parsed };
  }

  async function runActionsBatch(actions, res) {
    const toolResults = [];
    for (const action of actions) {
      sseWrite(res, 'tool_start', { id: action.id, name: action.tool, args: { path: action.path, query: action.query, find: action.find ? action.find.slice(0,120) : undefined } });
      try {
        let result = deps.runQcodeAction(action);
        if (action.tool === 'run_command') {
          sseWrite(res, 'tool_delta', { id: action.id, line: `$ ${action.command}` });
          result = await deps.runQcodeCommand(action.command, 30000);
          if (result.stdout) sseWrite(res, 'tool_delta', { id: action.id, line: result.stdout.slice(-4000) });
          if (result.stderr) sseWrite(res, 'tool_delta', { id: action.id, line: result.stderr.slice(-4000) });
        }
        toolResults.push({ action, ok: true, result });
        sseWrite(res, 'tool_end', { id: action.id, result });
        if (['write_file','edit_file'].includes(action.tool)) sseWrite(res, 'file_changed', { path: result.path || action.path });
      } catch (error) {
        const result = { error: error.message };
        toolResults.push({ action, ok: false, result });
        sseWrite(res, 'tool_end', { id: action.id, result });
      }
    }
    return toolResults;
  }

  function trackUsage(ai, inputMessages) {
    const approxTokens = Math.ceil((JSON.stringify(inputMessages).length + String(ai.answer || '').length) / 4);
    deps.usage.calls += 1;
    deps.usage.total_tokens += approxTokens;
    deps.usage.last_call = new Date().toISOString();
    const pname = ai.provider || 'unknown';
    deps.usage.by_provider[pname] ||= { calls: 0, tokens: 0, cost: 0 };
    deps.usage.by_provider[pname].calls += 1;
    deps.usage.by_provider[pname].tokens += approxTokens;
  }

  async function handleChat(req, res) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx/reverse-proxy buffering of this stream
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const startedAt = Date.now();
    let sessionRecorded = false;
    const recordSessionOnce = (fields) => {
      if (sessionRecorded) return;
      sessionRecorded = true;
      try { deps.learning.recordSession({ durationMs: Date.now() - startedAt, ...fields }); } catch (_) { /* learning log is best-effort */ }
    };
    try {
      const inputMessages = Array.isArray(req.body.messages) ? req.body.messages.slice(-16) : [];
      const toolNames = qcodeToolNames();
      sseWrite(res, 'routing', { provider_order: ['groq','qwen','nvidia','kimi'], separateKeys: true, tools: toolNames });

      let conversation = [{ role: 'system', content: buildSystemPrompt(deps.qcodeWorkspaceSummary()) }, ...inputMessages];
      let finalAnswer = '';
      let allToolResults = [];
      let lastAi = null;
      let totalActionsRun = 0;
      let stepsTaken = 0;

      for (let step = 1; step <= MAX_STEPS; step++) {
        stepsTaken = step;
        sseWrite(res, 'phase', { phase: step === 1 ? 'plan' : 'continue', step });
        const maxTokens = step === 1 ? PLAN_MAX_TOKENS : CONTINUE_MAX_TOKENS;
        const { ai, parsed } = await callModelAsJson(conversation, maxTokens, 0.12, res);
        if (!ai.ok) {
          if (step === 1) {
            deps.learning.recordFailure('provider_error', ai.error || 'Qcode provider failed with no error message.');
            sseWrite(res, 'error', { message: ai.error || 'Qcode provider failed.' });
            recordSessionOnce({ steps: stepsTaken, actionsRun: totalActionsRun, error: ai.error || 'provider_error' });
            return res.end();
          }
          break; // keep whatever was already built in earlier steps
        }
        lastAi = ai;
        trackUsage(ai, inputMessages);

        let stepAnswer = '';
        let actions = [];
        if (parsed && typeof parsed === 'object') {
          stepAnswer = String(parsed.answer || '').trim();
          actions = deps.normalizeQcodeActions(parsed.actions || []).slice(0, Math.max(0, MAX_ACTIONS_TOTAL - totalActionsRun));
        } else {
          // No valid JSON even after the reformat retry: treat as the final
          // plain-text answer and stop instead of silently producing nothing.
          deps.learning.recordFailure('invalid_json', String(ai.answer || '').slice(0, 300));
          stepAnswer = String(ai.answer || '').trim();
        }
        if (stepAnswer) finalAnswer = finalAnswer ? `${finalAnswer}\n\n${stepAnswer}` : stepAnswer;

        const toolResults = actions.length ? await runActionsBatch(actions, res) : [];
        allToolResults = allToolResults.concat(toolResults);
        totalActionsRun += actions.length;

        const failedRun = toolResults.find(t => t.action.tool === 'run_command' && t.result && Number(t.result.code) !== 0);
        if (failedRun) {
          deps.learning.recordFailure('run_command', `${failedRun.result.command}: ${String(failedRun.result.stderr || '').slice(0, 200)}`);
          sseWrite(res, 'phase', { phase: 'repair' });
          const repairPrompt = `A command failed in Qcode. Analyze the output and return STRICT JSON with a concise answer and corrective file actions if possible.\nCommand: ${failedRun.result.command}\nExit code: ${failedRun.result.code}\nSTDOUT:\n${String(failedRun.result.stdout||'').slice(-6000)}\nSTDERR:\n${String(failedRun.result.stderr||'').slice(-6000)}\nWorkspace files:\n${deps.qcodeWorkspaceSummary()}`;
          const { ai: repairAi, parsed: repairParsed } = await callModelAsJson([conversation[0], { role: 'user', content: repairPrompt }], REPAIR_JSON_MAX_TOKENS, 0.10, res);
          if (repairAi.ok) {
            const repairActions = deps.normalizeQcodeActions(repairParsed?.actions || []).filter(a => a.tool !== 'run_command').slice(0, 6);
            const repairResults = repairActions.length ? await runActionsBatch(repairActions, res) : [];
            allToolResults = allToolResults.concat(repairResults);
            if (repairParsed?.answer || repairResults.length) {
              finalAnswer += `\n\n### محاولة إصلاح تلقائي\n${repairParsed?.answer || ''}\n${repairResults.map(t => `${t.ok ? '✅' : '❌'} ${t.action.tool}${t.action.path ? ` ${t.action.path}` : ''}`).join('\n')}`;
            }
          }
        }

        const shouldContinue = !!(parsed && parsed.continue === true) && totalActionsRun < MAX_ACTIONS_TOTAL && step < MAX_STEPS;
        if (!shouldContinue) break;

        conversation = [
          conversation[0],
          ...inputMessages,
          { role: 'assistant', content: JSON.stringify({ answer: stepAnswer, actions: actions.map(a => ({ tool: a.tool, path: a.path })) }) },
          { role: 'user', content: `Continue the build. Remaining/next files still needed. Current workspace files:\n${deps.qcodeWorkspaceSummary()}\nWrite the next file(s) now, same JSON shape as before. Set "continue": false once everything requested is done.` }
        ];
      }

      if (allToolResults.length) {
        const summary = allToolResults.map(t => `${t.ok ? '✅' : '❌'} ${t.action.tool}${t.action.path ? ` ${t.action.path}` : ''}: ${t.ok ? 'done' : t.result.error}`).join('\n');
        finalAnswer = `${finalAnswer || 'تم تنفيذ أدوات Qcode.'}\n\n### نتائج الأدوات\n${summary}`;
      }

      // ---- Verification loop: don't just trust the model's own "done"
      // claim. Syntax-check every file it touched this session and, if the
      // project has a test script, actually run it before calling this done. ----
      const changedPaths = allToolResults
        .filter(t => t.ok && ['write_file', 'edit_file'].includes(t.action.tool))
        .map(t => t.result?.path || t.action.path)
        .filter(Boolean);

      let verification = null;
      if (changedPaths.length) {
        sseWrite(res, 'phase', { phase: 'verify' });
        verification = await deps.verifyWorkspace(changedPaths).catch(err => ({ ok: false, checks: [], testRun: null, error: err.message }));
        const failedChecks = (verification.checks || []).filter(c => !c.ok);
        const verifyLines = (verification.checks || []).map(c => `${c.ok ? '✅' : '❌'} ${c.type} ${c.path}${c.ok ? '' : `: ${c.error}`}`);
        if (verification.testRun) verifyLines.push(`${verification.testRun.ok ? '✅' : '❌'} npm test`);
        if (verifyLines.length) finalAnswer += `\n\n### تحقق تلقائي بعد البناء\n${verifyLines.join('\n')}`;

        if (!verification.ok) {
          for (const c of failedChecks) deps.learning.recordFailure('syntax_error', `${c.path}: ${String(c.error || '').slice(0, 200)}`);
          if (verification.testRun && !verification.testRun.ok) deps.learning.recordFailure('test_failure', String(verification.testRun.stderr || verification.testRun.stdout || '').slice(0, 200));

          // One automatic fix attempt driven by the real verification output,
          // not the model's own (possibly wrong) sense that it's done.
          sseWrite(res, 'phase', { phase: 'verify_repair' });
          const verifyRepairPrompt = `Automatic verification found real problems after your build. Fix them with STRICT JSON actions.\n${failedChecks.map(c => `- ${c.type} error in ${c.path}:\n${c.error}`).join('\n')}${verification.testRun && !verification.testRun.ok ? `\n- npm test failed:\n${String(verification.testRun.stderr || verification.testRun.stdout || '').slice(-3000)}` : ''}\nWorkspace files:\n${deps.qcodeWorkspaceSummary()}`;
          const { ai: verifyRepairAi, parsed: verifyRepairParsed } = await callModelAsJson([conversation[0], { role: 'user', content: verifyRepairPrompt }], REPAIR_JSON_MAX_TOKENS, 0.10, res);
          if (verifyRepairAi.ok) {
            const fixActions = deps.normalizeQcodeActions(verifyRepairParsed?.actions || []).slice(0, 10);
            const fixResults = fixActions.length ? await runActionsBatch(fixActions, res) : [];
            allToolResults = allToolResults.concat(fixResults);
            const fixedPaths = fixResults.filter(t => t.ok && ['write_file','edit_file'].includes(t.action.tool)).map(t => t.result?.path || t.action.path).filter(Boolean);
            const reverify = fixedPaths.length ? await deps.verifyWorkspace(fixedPaths).catch(() => null) : null;
            finalAnswer += `\n\n### محاولة إصلاح بعد التحقق\n${verifyRepairParsed?.answer || ''}\n${fixResults.map(t => `${t.ok ? '✅' : '❌'} ${t.action.tool}${t.action.path ? ` ${t.action.path}` : ''}`).join('\n')}`;
            if (reverify) {
              verification = { ok: reverify.ok, checks: [...(verification.checks||[]).filter(c=>c.ok), ...reverify.checks], testRun: reverify.testRun || verification.testRun };
              finalAnswer += `\n${reverify.ok ? '✅ التحقق نجح بعد الإصلاح.' : '⚠️ لسا فيه مشاكل بعد محاولة الإصلاح — راجع التفاصيل فوق.'}`;
            }
          }
        }
      }

      sseWrite(res, 'phase', { phase: 'answer' });
      const chunks = String(sanitizeMathNotation(finalAnswer) || 'تم.').match(/[\s\S]{1,800}/g) || [''];
      for (const delta of chunks) {
        sseWrite(res, 'assistant', { delta });
        sseWrite(res, 'delta', { text: delta });
      }
      sseWrite(res, 'assistant_full', { ok: true, provider: lastAi?.provider, model: lastAi?.model, toolsExecuted: allToolResults.length });
      sseWrite(res, 'done', { provider: lastAi?.provider, model: lastAi?.model, usage: deps.usage, verificationOk: verification ? verification.ok : null });
      recordSessionOnce({
        steps: stepsTaken,
        actionsRun: totalActionsRun,
        filesChanged: changedPaths.length,
        verificationOk: verification ? verification.ok : null,
        provider: lastAi?.provider,
        model: lastAi?.model
      });
      res.end();
    } catch (error) {
      deps.learning.recordFailure('agent_exception', error.message || 'Qcode agent threw.');
      recordSessionOnce({ error: error.message || 'agent_exception' });
      sseWrite(res, 'error', { message: error.message || 'Qcode failed.' });
      res.end();
    }
  }

  return { handleChat };
}

module.exports = { createQcodeAgent, sseWrite };

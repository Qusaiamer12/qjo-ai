// Runs a long task as a sequence of bounded steps instead of one long request.
//
// Why steps. A complex task needs many model calls, and on a free instance no
// process survives long enough to make them: the host sleeps after minutes of
// quiet and is replaced on every deploy. So each step is a complete unit of
// work — load state, make progress, write state back — and the task advances
// by being stepped, by whoever is around to step it. Close the tab mid-task and
// nothing is lost; the next step picks up from the last saved state.
//
// One step is one callAgent, which internally runs its own bounded tool loop.
// So a step is already several model calls and several tool calls — enough to
// be real progress, short enough to finish inside one request.

const { createRoutingEngine } = require('./RoutingEngine');
const { createWorkspace, workspaceToolDefinitions } = require('../tools/workspaceTools');
const { blankTask } = require('./taskStore');

const MAX_STEPS = 40;
const HISTORY_COMPACT_THRESHOLD = 24;
const HISTORY_KEEP_RECENT = 10;
const TRACE_OUTPUT_EXCERPT = 500;
const MAX_TRACE_ENTRIES = 60;

const UPDATE_PLAN_TOOL = {
  type: 'function',
  function: {
    name: 'update_plan',
    description: 'Record or revise your plan for this task. Call it early with the steps you intend to take, and again whenever reality changes them. Mark each step pending, active or done. This is what the person watching sees as progress.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'The full plan, in order. Send the whole list each time, not a delta.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'One short line describing the step.' },
              status: { type: 'string', enum: ['pending', 'active', 'done'], description: 'Where this step stands.' }
            },
            required: ['title', 'status']
          }
        }
      },
      required: ['steps']
    }
  }
};

const FINISH_TASK_TOOL = {
  type: 'function',
  function: {
    name: 'finish_task',
    description: 'Call this ONLY when the whole task is genuinely complete, with the final deliverable as the summary. Do not call it to report progress, and do not call it because you are running low on steps — an honest partial result belongs in the summary, said plainly.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'The final answer or deliverable, written for the person who asked. Complete, not a pointer to work done elsewhere.' }
      },
      required: ['summary']
    }
  }
};

function buildSystemPrompt(task, { stepsLeft, durable }) {
  const workspaceNote = task.kind === 'code'
    ? '\nYou have a project workspace. Write complete, runnable files with write_file, read a file back with read_file before editing it, and check what exists with list_files. Never write a fragment or a "rest unchanged" placeholder: the next step reads back exactly what you wrote.'
    : '';

  return [
    'You are executing a long task over several steps. Each step is a separate call; what you see below is the state carried forward from the previous ones.',
    '',
    'How to work:',
    '- Call update_plan early with the steps you intend to take, and revise it whenever reality changes them.',
    '- Do real work in every step. Use your tools rather than describing what you would do.',
    '- Search finds sources; fetch_page reads them. Do not answer a research question from search snippets alone when the detail matters.',
    '- Build on the findings already recorded below instead of repeating work that is done.',
    '- Call finish_task when the task is genuinely complete, with the full deliverable as the summary.',
    workspaceNote,
    '',
    `Steps remaining: ${stepsLeft}. Pace yourself: if you are running out, say what is done and what is not, plainly, in finish_task.`,
    durable ? '' : 'Note: this run is not on durable storage, so it may not survive a restart.',
    '',
    `THE TASK:\n${task.goal}`
  ].filter(Boolean).join('\n');
}

function renderPlan(plan) {
  if (!plan || !plan.length) return '';
  const mark = { done: '[x]', active: '[>]', pending: '[ ]' };
  return `\n\nYOUR PLAN:\n${plan.map(s => `${mark[s.status] || '[ ]'} ${s.title}`).join('\n')}`;
}

function renderTrace(trace) {
  if (!trace || !trace.length) return '';
  const lines = trace.slice(-20).map(entry => {
    const head = `${entry.tool}(${entry.input || ''})`;
    return entry.output ? `- ${head} -> ${entry.output}` : `- ${head}`;
  });
  return `\n\nWHAT YOU HAVE ALREADY DONE AND FOUND:\n${lines.join('\n')}`;
}

function renderHistory(history) {
  if (!history || !history.length) return '';
  return `\n\nNOTES FROM EARLIER STEPS:\n${history.map(h => `- ${h.content}`).join('\n')}`;
}

function createTaskRunner({ store, llmService, safeCalculate, searchService, keys, models, extraTools = {}, maxSteps = MAX_STEPS }) {
  if (!store || !llmService) throw new Error('createTaskRunner needs a store and an llmService');

  async function start({ uid, goal, kind = 'general', mode = 'max' }) {
    const trimmed = String(goal || '').trim();
    if (!trimmed) throw Object.assign(new Error('A task needs a goal.'), { statusCode: 400 });
    const task = blankTask({ uid, goal: trimmed, kind, mode });
    task.trace = [];
    await store.create(task);
    return task;
  }

  // Older notes are replaced by one summary so a long task does not outgrow the
  // context window. Summarising costs a cheap model call, which is far less
  // than the alternatives: dropping the early findings, or failing outright
  // once the prompt stops fitting.
  async function compactHistory(task, engine) {
    if (task.history.length <= HISTORY_COMPACT_THRESHOLD) return;
    const keep = task.history.slice(-HISTORY_KEEP_RECENT);
    const fold = task.history.slice(0, -HISTORY_KEEP_RECENT);
    const res = await engine.callAgent({
      agentType: 'chat',
      mode: 'flash',
      max_tokens: 700,
      useTools: false,
      budgetMs: 25000,
      messages: [{
        role: 'user',
        content: `Condense these notes from a long task into the shortest form that loses no fact, decision, figure, source or open question. Keep it factual, keep names and numbers, drop narration.\n\nTASK: ${task.goal}\n\nNOTES:\n${fold.map(h => `- ${h.content}`).join('\n')}`
      }]
    });
    if (res.ok && res.answer) {
      task.history = [{ role: 'note', content: `Summary of earlier steps: ${res.answer.trim()}` }, ...keep];
    } else {
      // Even without a summary the task must keep moving; recent notes are the
      // ones the next step needs most.
      task.history = keep;
    }
  }

  /**
   * Advances one task by a single bounded unit of work.
   * @param {string} taskId
   * @param {{uid?: string|null}} [caller] Owner check; a task is only steppable by its owner.
   * @returns {Promise<AgentTask>}
   */
  async function step(taskId, { uid } = {}) {
    const task = await store.get(taskId);
    if (!task) throw Object.assign(new Error('No such task.'), { statusCode: 404 });
    if (uid && task.uid && task.uid !== uid) throw Object.assign(new Error('That task belongs to someone else.'), { statusCode: 403 });
    if (task.status !== 'running') return task;

    if (task.step >= maxSteps) {
      task.status = 'failed';
      task.error = `Reached the ${maxSteps}-step limit without finishing.`;
      task.finishedAt = new Date().toISOString();
      await store.save(task);
      return task;
    }

    task.trace = task.trace || [];
    const workspace = createWorkspace(task.workspace || {});
    const stepTrace = [];
    let finished = null;

    // Every tool execution is recorded in the task itself, so the next step can
    // see the page this one read instead of fetching it again. The engine
    // reports its built-in tools through this hook too — wrapping only the
    // caller's tools missed web_search and fetch_page entirely, which are the
    // ones a research task depends on.
    const recordToolResult = ({ tool, input, output }) => {
      stepTrace.push({
        tool,
        input: String(input || '').slice(0, 160),
        output: String(output || '').replace(/\s+/g, ' ').slice(0, TRACE_OUTPUT_EXCERPT)
      });
    };

    const taskTools = {
      update_plan: {
        schema: UPDATE_PLAN_TOOL,
        label: 'Planning',
        run: (args, ctx) => {
          const steps = (Array.isArray(args.steps) ? args.steps : []).slice(0, 25).map(s => ({
            title: String(s.title || '').slice(0, 200),
            status: ['pending', 'active', 'done'].includes(s.status) ? s.status : 'pending'
          })).filter(s => s.title);
          task.plan = steps;
          ctx.note({ tool: 'update_plan', count: steps.length });
          return `Plan recorded with ${steps.length} steps.`;
        }
      },
      finish_task: {
        schema: FINISH_TASK_TOOL,
        label: 'Finishing',
        run: (args, ctx) => {
          finished = String(args.summary || '').trim();
          ctx.note({ tool: 'finish_task' });
          return 'Task marked complete.';
        }
      }
    };

    const toolSet = { ...extraTools };
    if (task.kind === 'code') Object.assign(toolSet, workspaceToolDefinitions(() => workspace));
    Object.assign(toolSet, taskTools);

    const engine = createRoutingEngine({
      llmService, safeCalculate, searchService, keys, models, extraTools: toolSet
    });

    await compactHistory(task, engine);

    const stepsLeft = maxSteps - task.step;
    const context = [
      buildSystemPrompt(task, { stepsLeft, durable: store.durable }),
      renderPlan(task.plan),
      renderHistory(task.history),
      renderTrace(task.trace)
    ].join('');

    const res = await engine.callAgent({
      agentType: 'chat',
      mode: task.mode,
      max_tokens: 4000,
      useTools: true,
      budgetMs: 90000,
      onToolResult: recordToolResult,
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: task.step === 0 ? task.goal : 'Continue the task. Do the next piece of real work.' }
      ]
    });

    task.step += 1;
    task.workspace = workspace.snapshot();
    task.trace = [...task.trace, ...stepTrace].slice(-MAX_TRACE_ENTRIES);
    task.toolsUsed = [...(task.toolsUsed || []), ...(/** @type {Array<{sources?: unknown}>} */ (res.toolsUsed || [])).map(({ sources: _pageCards, ...entry }) => entry)].slice(-100);

    if (!res.ok) {
      // A failed step is not a failed task: the state is intact, and stepping
      // again retries from exactly here.
      task.lastMessage = `Step ${task.step} did not complete: ${String(res.error || 'provider failure').slice(0, 200)}`;
      task.history.push({ role: 'note', content: task.lastMessage });
      await store.save(task);
      return task;
    }

    const answer = String(res.answer || '').trim();
    if (answer) task.history.push({ role: 'note', content: answer.slice(0, 4000) });
    task.lastMessage = answer.slice(0, 500);

    if (finished) {
      task.status = 'done';
      task.result = finished;
      task.finishedAt = new Date().toISOString();
    }

    await store.save(task);
    return task;
  }

  /**
   * @param {string} taskId
   * @param {{uid?: string|null}} [caller]
   * @returns {Promise<AgentTask|null>}
   */
  async function get(taskId, { uid } = {}) {
    const task = await store.get(taskId);
    if (!task) return null;
    if (uid && task.uid && task.uid !== uid) throw Object.assign(new Error('That task belongs to someone else.'), { statusCode: 403 });
    return task;
  }

  /**
   * @param {string} taskId
   * @param {{uid?: string|null}} [caller]
   * @returns {Promise<AgentTask>}
   */
  async function cancel(taskId, { uid } = {}) {
    const task = await get(taskId, { uid });
    if (!task) throw Object.assign(new Error('No such task.'), { statusCode: 404 });
    if (task.status === 'running') {
      task.status = 'cancelled';
      task.finishedAt = new Date().toISOString();
      await store.save(task);
    }
    return task;
  }

  /**
   * @param {{uid?: string|null, limit?: number}} [filter]
   * @returns {Promise<AgentTask[]>}
   */
  async function list({ uid, limit } = {}) {
    return store.list({ uid, limit });
  }

  return { start, step, get, cancel, list, maxSteps };
}

module.exports = { createTaskRunner, UPDATE_PLAN_TOOL, FINISH_TASK_TOOL, MAX_STEPS };

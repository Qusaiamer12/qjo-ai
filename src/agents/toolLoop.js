// The tool loop: call tools, feed back what they returned, let the model act
// on it, and always end in an answer.
//
// Split out of RoutingEngine.js, which picks providers and fails over between
// them. What is here decides when a tool-using turn is finished and what to do
// when it cannot finish on its own — the part that used to hand back the
// round that asked for the search as if it were the reply.
'use strict';

const { buildSynthesisMessages, formatEvidenceAnswer } = require('./toolAnswer');

/**
 * @param {object} deps
 * @param {{execute: Function, labelFor: (name: string) => string}} deps.toolRegistry
 * @param {(provider: string, slot: string, params: object) => Promise<any>} deps.tryProvider
 * @param {(text: string) => boolean} deps.isArabic
 */
function createToolLoop({ toolRegistry, tryProvider, isArabic }) {
  const TOOL_OUTPUT_MAX_CHARS = 6000;

  // timeoutMs is the budget for the whole round, shared by every call in it.
  // Each call used to get all of it, so a round of three stuck searches took
  // three times its budget and ate the time kept back for writing the answer.
  async function executeToolCalls(toolCalls, originalQuestion, { onToolCall, onToolResult, evidence, timeoutMs }) {
    const toolMessages = [];
    const used = [];
    const roundDeadline = Date.now() + (timeoutMs || TOOL_TIMEOUT_MS);
    for (const call of (toolCalls || []).slice(0, 4)) {
      const name = call?.function?.name;
      const label = toolRegistry.labelFor(name);
      const remaining = roundDeadline - Date.now();
      if (remaining < 1000) {
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: 'Tool not run: no time left in this turn. Answer with what you have.' });
        continue;
      }
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (_) {
        // A malformed argument blob is the model's mistake to correct on the
        // next round, not a reason to abandon the task.
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: `Tool error: arguments were not valid JSON.` });
        continue;
      }

      const detail = args.query || args.expression || args.url || args.path || '';
      if (onToolCall) onToolCall({ tool: name, label, detail, status: 'running' });

      let noted = false;
      const ctx = {
        originalQuestion,
        note: (entry) => { used.push(entry); noted = true; },
        addEvidence: (items) => { if (evidence) evidence.push(...items); }
      };
      const { output } = await toolRegistry.execute(name, args, ctx, { timeoutMs: remaining });
      if (!noted) used.push({ tool: name, input: detail });

      if (onToolCall) onToolCall({ tool: name, label, detail, status: 'done' });
      // Built-in tools live in this registry rather than in the caller's, so
      // without this hook a long task could not record what web_search or
      // fetch_page actually returned — and would re-run them next step.
      if (onToolResult) onToolResult({ tool: name, input: detail, output: String(output || '') });
      toolMessages.push({ role: 'tool', tool_call_id: call.id, content: String(output || '').slice(0, TOOL_OUTPUT_MAX_CHARS) });
    }
    return { toolMessages, used };
  }

  // Tool use has to be a loop. Real research is search → read → search again →
  // verify; building a project is write → run → read the error → fix. The
  // previous code ran tools exactly once and then called back with
  // `tools: undefined`, so the model could never act on what it had just
  // learned. That single line was the biggest gap against a real agent.
  const MAX_TOOL_ROUNDS = 6;
  const MAX_TOTAL_TOOL_CALLS = 20;
  // Every round runs against the request's deadline with this much held back,
  // so there is always time left to write the answer. Without the reserve a
  // search plus one slow round could spend the whole budget, and the loop's
  // only way out was to hand back the round that asked for the search.
  const SYNTHESIS_RESERVE_MS = 8000;
  const MIN_ROUND_MS = 4000;
  const TOOL_TIMEOUT_MS = 25000;

  const timeLeft = (params) => (params.deadlineMs ? params.deadlineMs - Date.now() : Infinity);

  async function runToolRounds({ provider, slot, params, originalQuestion, first, chain }) {
    let res = first;
    let messages = params.messages;
    const used = [];
    const evidence = [];
    const toolOutputs = [];
    const seen = new Set();
    let totalCalls = 0;
    let roundFailed = false;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const toolCalls = res.toolCalls || [];
      if (!toolCalls.length) break;
      if (totalCalls >= MAX_TOTAL_TOOL_CALLS) break;
      const toolTimeoutMs = Math.min(TOOL_TIMEOUT_MS, timeLeft(params) - SYNTHESIS_RESERVE_MS - MIN_ROUND_MS);
      if (toolTimeoutMs < 2000) break;

      // Asking for the exact same thing again means the model is stuck rather
      // than working, and each repeat costs a full round-trip.
      const fresh = toolCalls.filter((call) => {
        const signature = `${call?.function?.name}:${call?.function?.arguments}`;
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
      if (!fresh.length) break;

      const { toolMessages, used: roundUsed } = await executeToolCalls(fresh, originalQuestion, {
        onToolCall: params.onToolCall,
        onToolResult: params.onToolResult,
        evidence,
        timeoutMs: toolTimeoutMs
      });
      if (!toolMessages.length) break;
      totalCalls += toolMessages.length;
      used.push(...roundUsed);
      toolOutputs.push(...toolMessages.map((m) => m.content));
      messages = [...messages, res.message, ...toolMessages];

      const roundTimeoutMs = Math.min(params.maxPerProviderMs || 18000, timeLeft(params) - SYNTHESIS_RESERVE_MS);
      if (roundTimeoutMs < MIN_ROUND_MS) break;

      // On the final allowed round the tools come off, so the model has to
      // answer from what it has instead of asking for more and being cut off.
      //
      // Every round streams. Only the closing one used to, so the answer
      // after a search arrived as one silent body read: the person watched
      // "searching" with nothing happening for as long as the model took to
      // write, and a long answer that outlasted the round's clock was lost
      // outright. Streamed, it starts appearing as soon as it is written, and
      // a stream is only ever ended by silence. Text before another tool
      // call reaches the screen as the model's working notes.
      const closing = round === MAX_TOOL_ROUNDS - 1;
      const next = await tryProvider(provider, slot, {
        ...params,
        messages,
        timeoutMs: roundTimeoutMs,
        tools: closing ? undefined : params.tools
      });
      if (!next.ok) { roundFailed = true; break; }
      res = next;
      if (closing) break;
    }

    const finished = !(res.toolCalls || []).length && String(res.answer || '').trim() && res !== first;
    if (finished) {
      // Rounds after the first run with streaming off, so hand the answer
      // over here rather than leaving the bubble empty.
      if (params.onChunk && !res.streamed) params.onChunk(res.answer);
      return { ...res, toolsUsed: used, toolRounds: totalCalls };
    }
    return synthesizeAnswer({ provider, slot, chain, params, used, evidence, toolOutputs, totalCalls, originalQuestion, roundFailed });
  }

  // The loop ended without an answer: a round failed or stalled, time ran
  // short, or the model kept asking for tools. Ask for the answer once more,
  // without tools and with everything gathered folded into the question — this
  // provider first, then the rest of the chain. If none of them can, and the
  // search found something, the sources are the answer.
  async function synthesizeAnswer({ provider, slot, chain, params, used, evidence, toolOutputs, totalCalls, originalQuestion, roundFailed }) {
    const arabic = isArabic(originalQuestion);
    const messages = buildSynthesisMessages(params.messages, toolOutputs, { arabic });
    // A provider whose last round just failed or stalled goes to the back:
    // asking it again first would spend the reserve before anyone else is
    // tried.
    const current = [provider, slot];
    const others = (chain || []).filter(([p, s]) => !(p === provider && s === slot));
    const order = roundFailed ? [...others, current] : [current, ...others];
    for (const [p, s] of order) {
      const left = timeLeft(params);
      if (left < 2500) break;
      const r = await tryProvider(p, s, {
        ...params,
        messages,
        tools: undefined,
        timeoutMs: Math.min(params.maxPerProviderMs || 18000, left - 1000)
      });
      // A reply that still asks for a tool is a preamble, not an answer.
      if (r.ok && String(r.answer || '').trim() && !(r.toolCalls || []).length) {
        if (params.onChunk && !r.streamed) params.onChunk(r.answer);
        return { ...r, toolsUsed: used, toolRounds: totalCalls, synthesized: true };
      }
    }

    if (evidence.length) {
      const answer = formatEvidenceAnswer(evidence, { arabic });
      console.warn(`[RoutingEngine] no model could answer after tools — returning ${evidence.length} sources directly.`);
      if (params.onChunk) params.onChunk(answer);
      return {
        ok: true, answer, provider: 'sources', model: null, finish_reason: 'evidence_only',
        degraded: true, toolsUsed: used, toolRounds: totalCalls
      };
    }
    return { ok: false, status: 503, error: 'No provider could finish the answer after using tools.', toolsUsed: used };
  }

  return { runToolRounds, executeToolCalls };
}

module.exports = { createToolLoop };

// Reading a provider's answer once it has said 200: an OpenAI-compatible SSE
// stream or a JSON body in; text, reasoning, tool calls and the finish reason
// out — or a failure that names why.
//
// Split out of llmService.js, which owns keys, rotation and cooldowns. What is
// here owns the response body, including how long it may take, because that
// is where the hang was: the only timeout covered the wait for headers, so a
// provider that sent headers and then nothing held the request forever.
'use strict';

// A stream is judged by silence, not by length. Before it produces anything
// it has the caller's deadline; once text, reasoning or a tool call is
// flowing, only a gap this long ends it — a long answer being written is never
// cut off because the clock ran out, and a stream that stops mid-answer does
// not hold the request. Keep-alive comments reset the gap but do not count as
// progress, and nothing streams past the hard cap.
const STREAM_IDLE_MS = 15000;
const STREAM_HARD_CAP_MS = 240000;

function clientAbortError() {
  const err = new Error('Client disconnected.');
  err.name = 'ClientAbortError';
  return err;
}

function normalizeProviderFinishReason(provider, raw) {
  if (!raw) return '';
  return raw?.choices?.[0]?.finish_reason || raw?.choices?.[0]?.finishReason || '';
}

// ── Streaming tag boundary guard ──
// Providers stream token-by-token, so a control tag is routinely split across
// SSE deltas ("</" + "think" + ">"). The buffer must therefore hold back any
// trailing text that could still grow into one of these tags.
//
// The previous guard only covered partial OPENING tags, so a split "</think>"
// was never recognised: the closing tag leaked into the reasoning channel and
// every token after it followed, leaving the answer itself empty.
const STREAM_CONTROL_TAGS = ['<think>', '</think>', '<minimax:tool_call>', '</minimax:tool_call>'];
const LONGEST_CONTROL_TAG = Math.max(...STREAM_CONTROL_TAGS.map(t => t.length));

// True when `buffer` ends with a PROPER prefix of a control tag (a complete
// tag is not held back — it is ready to be processed).
function endsWithPartialControlTag(buffer) {
  const tail = buffer.slice(-LONGEST_CONTROL_TAG);
  for (const tag of STREAM_CONTROL_TAGS) {
    const maxLen = Math.min(tag.length - 1, tail.length);
    for (let len = maxLen; len > 0; len--) {
      if (tail.endsWith(tag.slice(0, len))) return true;
    }
  }
  return false;
}

// Parses an SSE stream from any OpenAI-compatible provider. Captures text
// content, reasoning deltas, indexed tool_call deltas and the real finish_reason.
// onActivity(progressed) runs on every read, so the caller can treat silence
// — not length — as the sign of a dead stream. `progressed` is true when the
// read carried text, reasoning or a tool call, not just a keep-alive.
async function consumeStream(response, onChunk, signal, onReasoning, onActivity) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let finishReason = '';
  let chunksDelivered = 0;
  const toolAcc = new Map();

  let contentBuffer = '';
  let insideMinimax = false;
  let insideThink = false;

  function processContentBuffer(forceFlush = false) {
    if (!contentBuffer) return;
    
    if (!forceFlush && endsWithPartialControlTag(contentBuffer)) {
      return;
    }
    
    if (contentBuffer.includes('<think>')) {
      const parts = contentBuffer.split('<think>');
      if (parts[0]) {
        fullText += parts[0];
        chunksDelivered++;
        if (onChunk) onChunk(parts[0]);
      }
      insideThink = true;
      contentBuffer = parts.slice(1).join('<think>');
    }

    if (insideThink) {
      if (contentBuffer.includes('</think>')) {
        const parts = contentBuffer.split('</think>');
        const thinkText = parts[0];
        insideThink = false;
        contentBuffer = parts.slice(1).join('</think>');
        
        if (thinkText && onReasoning) onReasoning(thinkText);
        processContentBuffer(forceFlush);
      } else {
        // Flush the ongoing think text immediately for live streaming!
        if (onReasoning) onReasoning(contentBuffer);
        contentBuffer = '';
      }
      return;
    }
    
    if (contentBuffer.includes('<minimax:tool_call>')) {
      const parts = contentBuffer.split('<minimax:tool_call>');
      if (parts[0]) {
        fullText += parts[0];
        chunksDelivered++;
        if (onChunk) onChunk(parts[0]);
      }
      insideMinimax = true;
      contentBuffer = parts.slice(1).join('<minimax:tool_call>');
    }
    
    if (insideMinimax) {
      if (contentBuffer.includes('</minimax:tool_call>')) {
        const parts = contentBuffer.split('</minimax:tool_call>');
        const xml = parts[0];
        insideMinimax = false;
        contentBuffer = parts.slice(1).join('</minimax:tool_call>');
        
        const nameMatch = xml.match(/<invoke\s+name="([^"]+)"/);
        if (nameMatch) {
          const name = nameMatch[1];
          const args = {};
          const paramRegex = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g;
          let match;
          while ((match = paramRegex.exec(xml)) !== null) {
            args[match[1]] = match[2];
          }
          const idx = toolAcc.size;
          toolAcc.set(idx, {
            id: 'call_' + Math.random().toString(36).substr(2, 9),
            name: name,
            arguments: JSON.stringify(args)
          });
        }
        processContentBuffer(forceFlush);
      }
      return;
    }
    
    fullText += contentBuffer;
    chunksDelivered++;
    if (onChunk) onChunk(contentBuffer);
    contentBuffer = '';
  }

  let sawDone = false;
  let progress = 0;
  function feedLine(cleanedLine) {
    if (cleanedLine === 'data: [DONE]') { sawDone = true; return; }
    if (!cleanedLine || !cleanedLine.startsWith('data: ')) return;
    let data;
    try { data = JSON.parse(cleanedLine.slice(6)); } catch (_) { return; }
    const choice = data?.choices?.[0] || {};
    const delta = choice.delta || {};

    const reasoningChunk = delta.reasoning_content || delta.reasoning;
    if (reasoningChunk) progress++;
    if (reasoningChunk && onReasoning) {
      onReasoning(reasoningChunk);
    }

    if (delta.content) {
      progress++;
      contentBuffer += delta.content;
      processContentBuffer(false);
    }
    for (const tc of (delta.tool_calls || [])) {
      progress++;
      const idx = tc.index ?? 0;
      const cur = toolAcc.get(idx) || { id: '', name: '', arguments: '' };
      if (tc.id) cur.id += tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.arguments += tc.function.arguments;
      toolAcc.set(idx, cur);
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      const before = progress;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) feedLine(line.trim());
      if (onActivity) onActivity(progress > before);
      // [DONE] is the end of the answer whether or not the provider closes
      // the connection after it. Waiting for the close as well meant a
      // provider that left it open turned a finished answer into a timeout.
      if (sawDone) {
        reader.cancel().catch(() => {});
        break;
      }
    }
    if (buffer.trim()) feedLine(buffer.trim());
    processContentBuffer(true);
  } catch (streamErr) {
    // If we already started delivering tokens to the user, return what we have
    // rather than failing the response or duplicating output.
    if (chunksDelivered > 0) {
      console.warn(`[llmService] stream reader interrupted after ${chunksDelivered} chunks. Gracefully preserving delivered answer.`);
      return { fullText, toolCalls: [], finishReason: 'interrupted', chunksDelivered };
    }
    throw streamErr;
  }

  const toolCalls = [...toolAcc.values()]
    .filter(t => t.name)
    .map((t, i) => ({ id: t.id || `call_stream_${i}`, type: 'function', function: { name: t.name, arguments: t.arguments || '{}' } }));
  return { fullText, toolCalls, finishReason: finishReason || 'stop', chunksDelivered };
}

/**
 * @typedef {object} BodyRead
 * @property {Response} response
 * @property {{rearm: (ms: number) => void, done: () => void, wasExternal: () => boolean, timedOut: () => boolean}} attempt
 * @property {string} provider
 * @property {string} model
 * @property {(text: string) => void} [onChunk] Present means the body is a stream.
 * @property {(text: string) => void} [onReasoning]
 * @property {AbortSignal} [signal]
 * @property {() => number} timeLeft Milliseconds left in the whole call.
 */

/**
 * Reads a 200 response to its end under the attempt's timer.
 *
 * Returns { result } on an answer, { error } when this key should be given up
 * on, and keyFailure when the key itself misbehaved (stalled, dropped) so the
 * caller can cool it down. Throws ClientAbortError when the person left.
 *
 * @param {BodyRead} p
 */
async function readAnswerBody(p) {
  return p.onChunk ? readStreamedBody(p) : readJsonBody(p);
}

/** @param {BodyRead} p */
async function readStreamedBody({ response, attempt, provider, model, onChunk, onReasoning, signal, timeLeft }) {
  const hardStop = Date.now() + STREAM_HARD_CAP_MS;
  let producing = false;
  const limit = () => Math.max(1, Math.min(
    STREAM_IDLE_MS,
    producing ? hardStop - Date.now() : timeLeft()
  ));
  attempt.rearm(limit());
  const onActivity = (progressed) => {
    if (progressed) producing = true;
    attempt.rearm(limit());
  };
  let streamed;
  try {
    streamed = await consumeStream(response, onChunk, signal, onReasoning, onActivity);
  } catch (streamErr) {
    attempt.done();
    if (attempt.wasExternal() || streamErr.name === 'ClientAbortError') throw clientAbortError();
    const stalled = attempt.timedOut();
    return {
      keyFailure: { status: stalled ? 504 : 500, errorMsg: streamErr.message },
      error: stalled
        ? { status: 504, error: `${provider} sent headers, then went silent.` }
        : { status: 502, error: `${provider} stream dropped: ${streamErr.message}` }
    };
  }
  attempt.done();
  const message = { role: 'assistant', content: streamed.fullText || null };
  if (streamed.toolCalls.length) message.tool_calls = streamed.toolCalls;
  return {
    // Cut off by the timer after words were delivered: the words are kept,
    // but the key still stalled and is not counted as healthy.
    keyFailure: streamed.finishReason === 'interrupted' && attempt.timedOut()
      ? { status: 504, errorMsg: 'stream went silent' }
      : null,
    result: {
      ok: true,
      answer: streamed.fullText || '',
      message,
      toolCalls: streamed.toolCalls,
      provider,
      model,
      finish_reason: streamed.finishReason || 'stop',
      streamed: true
    }
  };
}

/** @param {BodyRead} p */
async function readJsonBody({ response, attempt, provider, model, timeLeft }) {
  // Without streaming the whole answer is one body read — the round after a
  // search is one — and it gets whatever is left of the call's budget.
  attempt.rearm(Math.max(1, timeLeft()));
  let data;
  try {
    data = await response.json();
  } catch (bodyErr) {
    attempt.done();
    if (attempt.wasExternal()) throw clientAbortError();
    const stalled = attempt.timedOut();
    return {
      keyFailure: { status: stalled ? 504 : 502, errorMsg: bodyErr.message },
      error: stalled
        ? { status: 504, error: `${provider} sent headers, then no answer in time.` }
        : { status: 502, error: `${provider} returned a body that is not JSON.` }
    };
  }
  attempt.done();
  const message = data?.choices?.[0]?.message || {};
  return {
    keyFailure: null,
    result: {
      ok: true,
      answer: message.content || '',
      message,
      toolCalls: message.tool_calls || [],
      provider,
      model,
      finish_reason: normalizeProviderFinishReason(provider, data),
      raw: data
    }
  };
}

module.exports = {
  readAnswerBody,
  consumeStream,
  endsWithPartialControlTag,
  clientAbortError,
  normalizeProviderFinishReason,
  STREAM_IDLE_MS,
  STREAM_HARD_CAP_MS
};

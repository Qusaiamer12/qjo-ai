// What a request has to fit inside, and what to do when it does not.
//
// A provider can refuse a request for its size in two ways, and wait before
// answering one for its size. All three used to end long requests:
//
//   - A context window: the prompt is longer than the model reads. The middle
//     of the largest message is cut and the request sent again.
//   - A per-minute allowance: Groq's free tier counts a request as its prompt
//     plus the answer room it reserves, and refuses one over the model's
//     allowance with 413 "… Limit 8000, Requested 10587 …". The system prompt
//     alone is 4,000–6,100 tokens, so every long request was refused, and
//     nothing tried to make it fit. It is now sent again with the answer room
//     the provider can give, when that is still worth having.
//   - Time to first byte: a long prompt takes longer to read before anything
//     comes back. A fixed eight-second wait for headers turned every long
//     request into a timeout on every key.
'use strict';

// ── Refusals ─────────────────────────────────────────────────────────────────

// A provider can reject the CALL or reject the REQUEST, and the two need
// opposite handling. A rate limit or a dead key is about this key, so rotating
// to the next one is exactly right. A prompt that exceeds the context window is
// about the payload: every other key rejects it identically, so rotating only
// spends more round-trips AND puts healthy keys on cooldown — one oversized
// prompt used to sideline every key on every provider, degrading unrelated
// requests for the whole cooldown window.
function isContextLengthError(errorMsg) {
  return /context[\s_-]*length|maximum context|too many tokens|reduce the length|input is too long|prompt is too long|exceeds? the (?:model|maximum)|token limit/i.test(String(errorMsg || ''));
}

function isRequestFault(status, errorMsg) {
  if (status === 413 || status === 422) return true;
  if (status !== 400) return false;
  // A 400 naming a retired model is handled by migration in llmService.
  return !/decommissioned|no longer supported|not found|does not exist|invalid model/i.test(String(errorMsg || ''));
}

/**
 * The allowance a refusal names, when it names one.
 * @param {string} errorMsg
 * @returns {{limit: number, requested: number} | null}
 */
function tokenAllowance(errorMsg) {
  const m = String(errorMsg || '').match(/Limit\s+(\d+),\s*Requested\s+(\d+)/i);
  return m ? { limit: Number(m[1]), requested: Number(m[2]) } : null;
}

// Below this the answer would be cut off almost at once; the next provider,
// which has no such allowance, is the better bet.
const MIN_ANSWER_TOKENS = 1024;
const ALLOWANCE_MARGIN = 64;

/**
 * The request with its answer room cut to what the named allowance leaves,
 * or null when that is too little to be worth sending. The provider counted
 * the request as prompt plus max_tokens, so the prompt is what it reported
 * less the room that was asked for.
 * @template {{max_tokens?: number}} P
 * @param {P} params
 * @param {{limit: number, requested: number} | null} allowance
 * @returns {P | null}
 */
function fitToAllowance(params, allowance) {
  if (!allowance) return null;
  const asked = Number(params.max_tokens) || 0;
  const room = allowance.limit - (allowance.requested - asked) - ALLOWANCE_MARGIN;
  if (room < MIN_ANSWER_TOKENS || room >= asked) return null;
  return { ...params, max_tokens: room };
}

// Halves the biggest message so an over-long prompt can be retried instead
// of ending the request. The middle goes, not the tail: the question opens
// the message and the retrieved evidence closes it, so both ends carry more
// signal than the middle does. The model is told a cut happened rather than
// being handed a sentence that simply stops.
const SHRINK_NOTE = '\n\n[... part of this content was removed because the request exceeded the context limit. Work from the parts that remain, and say plainly if the missing part affects the accuracy of the answer ...]\n\n';

function shrinkMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  let biggestIndex = -1;
  let biggestLength = 0;
  list.forEach((m, i) => {
    const len = typeof m?.content === 'string' ? m.content.length : 0;
    if (len > biggestLength) { biggestLength = len; biggestIndex = i; }
  });
  // Nothing large enough left to cut usefully.
  if (biggestIndex === -1 || biggestLength < 2000) return null;

  const target = Math.floor(biggestLength / 2);
  const head = Math.floor(target * 0.6);
  const tail = target - head;
  const original = list[biggestIndex].content;
  const shrunk = original.slice(0, head) + SHRINK_NOTE + original.slice(-tail);
  return list.map((m, i) => (i === biggestIndex ? { ...m, content: shrunk } : m));
}

// ── Waiting ──────────────────────────────────────────────────────────────────

const BASE_HEADER_WAIT_MS = 8000;
const HEADER_WAIT_PER_KTOKEN_MS = 2000;
const MAX_HEADER_WAIT_MS = 30000;

function promptChars(messages) {
  return (Array.isArray(messages) ? messages : []).reduce((sum, m) => {
    if (typeof m?.content === 'string') return sum + m.content.length;
    if (Array.isArray(m?.content)) return sum + m.content.reduce((n, p) => n + (typeof p?.text === 'string' ? p.text.length : 0), 0);
    return sum;
  }, 0);
}

/**
 * How long a provider may take to start answering: eight seconds, plus two
 * for every thousand tokens it has to read first, up to thirty.
 * @param {Array<{content?: any}>} messages
 */
function headerWaitMs(messages) {
  const ktokens = promptChars(messages) / 4 / 1000;
  return Math.min(MAX_HEADER_WAIT_MS, Math.round(BASE_HEADER_WAIT_MS + ktokens * HEADER_WAIT_PER_KTOKEN_MS));
}

module.exports = {
  isContextLengthError,
  isRequestFault,
  tokenAllowance,
  fitToAllowance,
  shrinkMessages,
  headerWaitMs,
  MIN_ANSWER_TOKENS,
  MAX_HEADER_WAIT_MS
};

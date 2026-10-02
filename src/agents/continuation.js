// Asking a model to carry on after its answer hit the token limit, and
// joining what it writes to what came before.
//
// The request is written in the answer's own language. It used to be Arabic
// for every answer, which invited an English answer to finish in Arabic.
//
// An answer cut off inside its code is the common case — a whole web page
// does not fit one answer — and it broke three ways. The continuation was
// asked for with the whole conversation and the whole answer so far, which on
// Groq's free tier was over the 8,000 tokens a minute by itself. It was
// streamed to the page straight after the cut, with nothing between. And the
// model, asked to go on, opened its code block again: "```html" inside an
// open block ended it for the renderer, and the rest of the page showed as
// text under a preview of half of it. Now the request carries the end of the
// answer only, says where the cut is, and what comes back is joined there:
// a reopened block and lines written twice are dropped before the page sees
// them, and the page and the stored answer get the same text.
'use strict';

const { languageOfText } = require('../../public/domain/language');
const { openFence } = require('../../public/domain/streamBlocks');

const PROMPTS = {
  ar: {
    first: 'تابع من حيث توقفت بالضبط. لا تعِد البداية، ولا تضف مقدمة جديدة. أكمل الجملة أو الفقرة الناقصة فقط ثم أكمل باقي الإجابة.',
    again: 'تابع مرة أخيرة من حيث توقفت بدون إعادة.',
    code: (lang) => `تابع الكود من آخر حرف كتبته بالضبط: إجابتك انقطعت داخل كتلة كود${lang ? ` ${lang}` : ''} ما زالت مفتوحة. لا تفتح كتلة جديدة بـ \`\`\`، ولا تكرر أي سطر كتبته. اكتب باقي الكود، ثم أغلق الكتلة بـ \`\`\` على سطر وحده، ثم أكمل ما بقي من الإجابة إن وُجد.`
  },
  en: {
    first: 'Continue exactly where you stopped. Do not restart or add a new introduction: finish the incomplete sentence or paragraph, then the rest of the answer.',
    again: 'Continue one last time from where you stopped, without repeating anything.',
    code: (lang) => `Continue the code from exactly the last character you wrote: your answer was cut off inside a${lang ? ` ${lang}` : ''} code block that is still open. Do not open a new block with \`\`\`, and do not repeat any line you already wrote. Write the rest of the code, close the block with \`\`\` on a line of its own, then finish whatever the answer still needs.`
  }
};

/**
 * @param {string} answerSoFar
 * @returns {{first: string, again: string}}
 */
function continuationPrompts(answerSoFar) {
  const lang = languageOfText(answerSoFar) === 'ar' ? 'ar' : 'en';
  const fence = openFence(answerSoFar);
  if (!fence) return { first: PROMPTS[lang].first, again: PROMPTS[lang].again };
  const code = PROMPTS[lang].code(fence.info);
  return { first: code, again: code };
}

// How much of the answer the continuation is shown: enough code to go on
// from, little enough that the request fits a per-minute allowance.
const TAIL_CHARS = 6000;
const OMITTED = '[… the start of this answer is not repeated here …]\n';

/**
 * The messages that ask for the rest: the instructions and the person's last
 * request as they were, the end of the answer so far, and where it stopped.
 * The earlier conversation is left out: the answer already used it.
 * @param {Array<{role: string, content: any}>} messages the request that was cut short
 * @param {string} answerSoFar
 * @param {string} prompt
 */
function continuationMessages(messages, answerSoFar, prompt) {
  const list = Array.isArray(messages) ? messages : [];
  const system = list.filter((m) => m && m.role === 'system');
  const lastUser = [...list].reverse().find((m) => m && m.role === 'user');
  let shown = String(answerSoFar || '');
  if (shown.length > TAIL_CHARS) {
    const tail = shown.slice(-TAIL_CHARS);
    const lineStart = tail.indexOf('\n');
    shown = OMITTED + (lineStart >= 0 && lineStart < 400 ? tail.slice(lineStart + 1) : tail);
  }
  return [...system, ...(lastUser ? [lastUser] : []), { role: 'assistant', content: shown }, { role: 'user', content: prompt }];
}

// Text held back from the start of a continuation, to judge what it repeats.
const HEAD_CHARS = 400;
const REOPENED = /^[ \t]*`{3,}[ \t]*[A-Za-z0-9_+#.:-]+[ \t]*\r?\n/;

/**
 * What of a continuation's opening is new: without a code block opened again
 * inside the one the answer was cut off in, and without what it wrote twice —
 * the line it was cut in, written again from its start, or the last lines.
 * @param {string} before the answer so far
 * @param {string} head the start of the continuation
 */
function newPart(before, head) {
  const prior = String(before || '');
  let text = String(head || '');
  const inCode = Boolean(openFence(prior));
  if (inCode) text = text.replace(REOPENED, '');
  const lastLine = prior.slice(prior.lastIndexOf('\n') + 1);
  if (inCode && lastLine.trim().length >= 2 && text.startsWith(lastLine)) return text.slice(lastLine.length);
  const tail = prior.slice(-HEAD_CHARS);
  for (let k = Math.min(text.length, tail.length); k > 0; k--) {
    if (!tail.endsWith(text.slice(0, k))) continue;
    const wholeLines = (k === tail.length || tail[tail.length - k - 1] === '\n') && text[k - 1] === '\n';
    if (k >= 24 || wholeLines) return text.slice(k);
  }
  return text;
}

/**
 * Joins a continuation to the answer as it streams: its opening is held until
 * there is enough of it to judge, then only what is new is passed on, after
 * a line break where one belongs. `finish()` returns the joined text.
 * @param {string} before the answer so far
 * @param {(text: string) => void} [emit] what the page is sent
 */
function createJoiner(before, emit) {
  const inCode = Boolean(openFence(before));
  let head = '';
  let decided = false;
  let joined = '';
  const out = (text) => { if (!text) return; joined += text; if (emit) emit(text); };
  const decide = () => {
    decided = true;
    const text = newPart(before, head);
    // Prose goes on after a line break; code goes on from the exact character.
    const gap = text && !inCode && before && !before.endsWith('\n') && !text.startsWith('\n') ? '\n' : '';
    out(gap + text);
  };
  return {
    push(chunk) {
      if (decided) { out(chunk); return; }
      head += String(chunk || '');
      if (head.length >= HEAD_CHARS) decide();
    },
    finish() { if (!decided) decide(); return joined; }
  };
}

// Passes when the answer is cut off inside its code: a web page takes more
// than one answer's room, and half of one previews as nothing.
const CODE_PASSES = 3;

/**
 * Carries a cut-off answer on, up to `maxPasses` more times (CODE_PASSES while
 * it is inside a code block).
 * @param {{callAgent: Function, isTruncated: (ai: any) => boolean}} engine
 * @param {any} params what callAgent was given, plus { ai, maxPasses }
 */
async function completeIfTruncated({ callAgent, isTruncated }, params) {
  const { ai, messages, temperature, max_tokens: maxTokens, onChunk } = params;
  if (!isTruncated(ai)) return ai;
  let combined = ai.answer || '';
  const passes = Math.max(1, Math.min(Number(params.maxPasses ?? 1), 2));
  const toolsUsed = [...(ai.toolsUsed || [])];
  let last = ai;
  for (let i = 0; i < (openFence(combined) ? CODE_PASSES : passes); i++) {
    const prompts = continuationPrompts(combined);
    const inCode = Boolean(openFence(combined));
    const joiner = createJoiner(combined, onChunk);
    // Every answer reaches onChunk, streamed or not: the engine hands a
    // provider's whole answer over as one chunk when it did not stream.
    // Code goes on without this message's playbooks: they shaped the start.
    const next = await callAgent({
      ...params,
      turnContext: inCode ? undefined : params.turnContext,
      messages: continuationMessages(messages, combined, i === 0 ? prompts.first : prompts.again),
      temperature: Math.min(temperature, 0.3),
      max_tokens: Math.min(maxTokens, inCode ? 3000 : 1800),
      onChunk: (text) => joiner.push(text)
    });
    // What reached the page is kept, even from a call that then failed: the
    // stored answer is what was shown.
    combined += joiner.finish();
    if (!next.ok || !next.answer) break;
    toolsUsed.push(...(next.toolsUsed || []));
    last = next;
    if (!isTruncated(next)) return { ...next, answer: combined, continued: true, toolsUsed };
  }
  return { ...ai, ...(last !== ai ? { provider: last.provider, model: last.model } : {}), answer: combined, continued: true, toolsUsed, finish_reason: 'continued_but_may_be_truncated' };
}

module.exports = { continuationPrompts, continuationMessages, createJoiner, newPart, completeIfTruncated, CONTINUATION_PROMPTS: PROMPTS, TAIL_CHARS };

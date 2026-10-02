// Where each part of a chat request goes, so that most of it opens exactly as
// the request before it did.
//
// Groq caches the opening a request shares with an earlier one for the gpt-oss
// models, and cached tokens do not count toward its per-minute or daily
// limits (console.groq.com/docs/prompt-caching). A request used to open with
// the instructions, then everything chosen for this one message — its
// playbooks, the router's decision, the page's skill capsules, the time to the
// minute — and only then the conversation. Nothing after the first difference
// can be reused, so the whole history was new on every turn: measured over a
// nine-message conversation (tests/browser/measure-request.js), 59% of what
// was sent was new.
//
// Now a request opens with what does not change from one message to the next
// — the instructions and this person's own settings — then the conversation.
// What was chosen for this message travels with the message itself, attached
// at the moment of sending (attachTurnContext): after search, routing and the
// vision step have read the person's words exactly as they wrote them, and
// only on the calls that answer.
//
// Everything stays in the first system message or in the person's message.
// A system message placed later in the list is not something every chat
// template renders, and an instruction a template drops fails silently.

const { languageOfText } = require('../../public/domain/language');
const { ownWords } = require('../../public/domain/ownWords');

const CAPSULES = /(?:^|\n+)Task-specific skill capsules:\n[\s\S]*?(?=\n\n|$)/;
// The page and the server both build this note; the server's is the one kept.
const CONTINUITY = /^\s*Context continuity lock:/;

const textOf = (content) => (typeof content === 'string'
  ? content
  : (Array.isArray(content) ? content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n') : ''));

/**
 * The page's own system text, split into what belongs to the person — their
 * settings, the owner's and admin's instructions, saved corrections — and
 * what the page chose for this message: skill capsules, a continuity note.
 * @param {any[]} contents The page's system messages' contents.
 * @returns {{ standing: string, turn: string }}
 */
function splitClientSystem(contents) {
  const standing = [];
  const turn = [];
  for (const content of contents || []) {
    const text = textOf(content);
    if (!text.trim() || CONTINUITY.test(text)) continue;
    const capsules = text.match(CAPSULES);
    if (capsules) turn.push(capsules[0].trim());
    const rest = capsules ? text.replace(capsules[0], '\n') : text;
    if (rest.trim()) standing.push(rest.trim());
  }
  return { standing: standing.join('\n\n'), turn: turn.join('\n\n') };
}

/**
 * @param {object} p
 * @param {string} p.system The instructions that do not depend on the message.
 * @param {string} [p.standing] This person's own settings, from the page.
 * @param {string[]} [p.turn] Everything chosen for this message, in order.
 * @param {Array<{role: string, content: any}>} p.conversation History and the newest message.
 * @returns {{ messages: Array<{role: string, content: any}>, turnContext: string }}
 */
function layoutChatRequest({ system, standing = '', turn = [], conversation }) {
  const opening = [system, standing].filter((part) => part && String(part).trim()).join('\n\n');
  const newest = [...(conversation || [])].reverse().find((m) => m?.role === 'user');
  const language = languageOfText(textOf(newest?.content));
  const said = language === 'ar' ? 'Arabic' : (language === 'en' ? 'English' : '');
  const parts = [...turn, said ? `The person's message is in ${said}.` : ''].filter((part) => part && String(part).trim());
  return {
    messages: [...(opening ? [{ role: 'system', content: opening }] : []), ...(conversation || [])],
    turnContext: parts.join('\n\n')
  };
}

/**
 * The prompt's two parts from whichever builder the server was given; a
 * single-text builder or the legacy prompt opens the request whole.
 * @param {{buildChatPromptParts?: Function, buildChatSystemPrompt?: Function, fullSystemPrompt?: string}} deps
 * @param {object} options For the builder.
 * @param {string} legacyDate The date line the legacy prompt takes.
 * @returns {{ system: string, turn: string }}
 */
function promptParts(deps, options, legacyDate) {
  if (typeof deps.buildChatPromptParts === 'function') return deps.buildChatPromptParts(options);
  if (typeof deps.buildChatSystemPrompt === 'function') return { system: deps.buildChatSystemPrompt(options), turn: '' };
  if (deps.fullSystemPrompt) return { system: String(deps.fullSystemPrompt).replace(/\{\{current_datetime\}\}/g, legacyDate), turn: '' };
  return { system: '', turn: '' };
}

// Kept at the provider's default: work where thinking first is the job.
const THINKING_INTENTS = new Set(['code', 'math', 'reasoning', 'research', 'file']);

/**
 * How much the model thinks before it answers. gpt-oss reasons at "medium"
 * unless told otherwise, and every reasoning token is an output token: counted
 * against the per-minute and daily limits, and never cached. An everyday Flash
 * message does not need it; code, math, puzzles, research, documents and the
 * Max and Code modes keep the provider's default.
 * A question that needs thought (thinkingNeed) keeps it too.
 * @param {{mode?: string, intent?: string, mathIntent?: boolean, thought?: {needs: boolean}}} [route]
 * @returns {'low' | undefined}
 */
function reasoningEffort({ mode, intent, mathIntent, thought } = {}) {
  if (mode !== 'flash' || mathIntent || THINKING_INTENTS.has(String(intent)) || (thought && thought.needs)) return undefined;
  return 'low';
}

// What a question asks of the one answering it, in the person's own words.
// Flash answered everything at low effort except code, sums, research and
// files, so "which is better for a beginner, Python or JavaScript?", "why
// is the sky blue?" or a riddle got a fast first guess — the owner's "it
// answers too fast and gets things wrong". These think first (the provider's
// default effort), and the hardest — a puzzle, a long request, several asks
// at once — go to the larger model first.
const THOUGHT = {
  compare: /\b(?:compare|comparison|versus|vs\.?|difference between|better than|which (?:is|one is) better|pros and cons|trade-?offs?)\b|قارن|مقارنة|الفرق بين|شو الفرق|ايش الفرق|إيش الفرق|أيهما|ايهما|أفضل من|افضل من|أحسن من|احسن من|إيجابيات|ايجابيات|سلبيات|مزايا وعيوب|مميزات وعيوب/i,
  why: /\b(?:why|how come|what (?:would|will) happen|what if)\b|ليش|لماذا|ليه|ماذا لو|شو بصير لو|شو رح يصير/i,
  decide: /\b(?:plan|strategy|should i|would you recommend|advise me|decide|choose between|step[- ]by[- ]step|roadmap)\b|خطة|خطّة|استراتيجية|انصحني|بتنصحني|شو بتنصح|شو أعمل|شو اعمل|أختار|اختار بين|أقرر|خطوة بخطوة/i,
  puzzle: /\b(?:riddle|puzzle|brain ?teaser|logic(?:al)? (?:question|problem)|trick question)\b|لغز|فزورة|حزورة|سؤال منطقي|مسألة منطقية/i
};

/**
 * Whether the person's latest message needs thought before an answer, and
 * whether it is hard enough for the larger model.
 * @param {Array<{role: string, content: any}>} messages
 * @returns {{ needs: boolean, hard: boolean, why: string[] }}
 */
function thinkingNeed(messages) {
  const last = [...(messages || [])].reverse().find((m) => m && m.role === 'user');
  const text = ownWords(textOf(last && last.content));
  if (text.length < 12) return { needs: false, hard: false, why: [] };
  const why = Object.keys(THOUGHT).filter((k) => THOUGHT[k].test(text));
  if ((text.match(/[\d٠-٩]+(?:[.,][\d٠-٩]+)?/g) || []).length >= 2) why.push('numbers');
  const lines = text.split('\n').filter((l) => l.trim()).length;
  if (text.length >= 300 || lines >= 4 || (text.match(/[?؟]/g) || []).length >= 2) why.push('long');
  return { needs: why.length > 0, hard: why.includes('puzzle') || text.length >= 600 || why.length >= 2, why };
}

const TURN_OPEN = '[From Qjo, for this reply only — written by the app, not by the person. Follow it; never mention it.]';
const TURN_CLOSE = '[The person\'s message:]';

/**
 * The messages as sent: this message's context put in front of the person's
 * newest message. Everything before that message is left exactly as it was,
 * so it opens as the previous request did.
 * @template {{role: string, content: any}} M
 * @param {M[]} messages
 * @param {string} [turnContext]
 * @returns {M[]}
 */
function attachTurnContext(messages, turnContext) {
  if (!turnContext || !Array.isArray(messages)) return messages;
  let at = -1;
  messages.forEach((m, i) => { if (m?.role === 'user') at = i; });
  if (at < 0) return messages;
  const block = `${TURN_OPEN}\n${turnContext}\n\n${TURN_CLOSE}\n`;
  const m = messages[at];
  const content = Array.isArray(m.content) ? [{ type: 'text', text: block }, ...m.content] : block + textOf(m.content);
  return messages.map((x, i) => (i === at ? { ...m, content } : x));
}

/**
 * The request as dispatched: its turn context attached, and the field itself
 * gone so no provider is sent an argument it does not know.
 * @template {{messages?: any[], turnContext?: string}} P
 * @param {P} params
 * @returns {P}
 */
function withTurnContext(params) {
  if (!params || !('turnContext' in params)) return params;
  const { turnContext, ...rest } = params;
  return /** @type {P} */ ({ ...rest, messages: attachTurnContext(rest.messages || [], turnContext) });
}

module.exports = { textOf, splitClientSystem, promptParts, layoutChatRequest, attachTurnContext, withTurnContext, reasoningEffort, thinkingNeed, TURN_OPEN, TURN_CLOSE };

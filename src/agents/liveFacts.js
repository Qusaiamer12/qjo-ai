// Facts that change: a match, a score, who holds an office, a price, "the
// latest". gpt-oss-20b at low effort answered these from memory (14 sport
// answers wrong in the quality baseline) and Groq does not enforce
// tool_choice "required" on it, so the server makes the search itself, before
// the model's first call, and hands it over as a search tool's result.
//
// Judged on the person's own words only (ownWords), the newest message only.
// Narrow on purpose: a definition ("what is a president"), history ("who won
// the 2010 World Cup") and maths do not search. Every pattern is a short
// alternation with no unanchored lookahead, so a 200k-character paste with no
// match is judged in linear time.
'use strict';

const { ownWords } = require('../../public/domain/ownWords');

const AR = '\\u0621-\\u064A'; // letters; not the Arabic question mark U+061F
const NOT_AR = `(?<![${AR}])`;
const A = '[\\u0627\\u0623\\u0625\\u0622]'; // alef in its four forms
const arabic = (alts) => `${NOT_AR}[\u0648\u0628\u0644\u0641\u0643]?(?:${alts})(?![${AR}])`;

// When: "now" in either language.
const WHEN = new RegExp(
  `\\b(?:now|today|tonight|yesterday|tomorrow|latest|newest|currently|current|this (?:season|year|week|month)|last night|next (?:match|game|election|fixture|season))\\b|` +
  arabic(`${A}ل${A}ن|${A}ل${A}ن|هلا|هلق|حال${A}?ي${A}|${A}لحال[يى]|${A}ليوم|${A}مس|${A}لبار[حه]|مبارح|${A}مبارح|بكر[ةه]|غد${A}|${A}خر|${A}حدث|هذ${A} ${A}لموسم|ه${A}لموسم|هذ${A} ${A}لعام|ه${A}لسن[ةه]|هذه ${A}لسن[ةه]|هذ${A} ${A}لاسبوع|هذ${A} ${A}لأسبوع`),
  'i'
);

// What: sport, price, news, weather, a product, an election.
const TOPIC = new RegExp(
  `\\b(?:matches|match|fixtures?|scores?|scored|standings|league|champions league|world cup|premier league|la liga|nba|nfl|final|top scorer|prices?|cost|exchange rate|gold|bitcoin|crypto|dollar|oil|stocks?|news|weather|forecast|iphone|galaxy|pixel|version|release|election|polls?|president|prime minister|minister|coach|manager|ceo|king)\\b|` +
  arabic(`مباراة|مباريات|ماتش|نتيجة|نتيج${A}ت|هداف|${A}لدوري|دوري|${A}لكأس|كأس|نهائي|ترتيب|فاز|سعر|${A}سعار|${A}لذهب|${A}لدولار|${A}لدينار|بيتكوين|${A}لنفط|سعر ${A}لصرف|${A}خبار|خبر|${A}لطقس|طقس|${A}يفون|${A}صدار|نسخة|${A}نتخابات|رئيس|وزير|مدرب|ملك|${A}لرئيس|${A}لوزير`),
  'i'
);

// Who holds an office: needs no time word ("who is the president of France"),
// but a definition ("what is a president") or a first / former / past one is not it.
const OFFICE = '(?:president|prime minister|minister|coach|manager|ceo|king|mayor|governor|chancellor|speaker)';
const OFFICE_AR = `(?:رئيس|رئيس وزراء|رئيس ${A}لوزراء|وزير|مدرب|ملك|عمدة|محافظ|مستشار|${A}لرئيس|${A}لوزير|${A}لمدرب|${A}لملك)`;
const WHO_HOLDS = new RegExp(
  `\\bwho(?:'s| is| are| currently)\\s+(?:the\\s+)?(?:current\\s+|new\\s+)?${OFFICE}\\b|\\b(?:current|new)\\s+${OFFICE}\\s+of\\b|` +
  arabic(`م[ي]?ن|من`) + `\\s+(?:هو\\s+|هي\\s+)?${arabic(OFFICE_AR)}`,
  'i'
);

const HISTORY = /\b(?:first|former|previous|ex-?|was|were|history|used to)\b|أول|اول|السابق|كان |كانت |تاريخ/i;
// A year already past: "who won the 2010 World Cup", "the 2018 final".
function pastYear(text, now = new Date()) {
  const years = text.match(/\b(?:19|20)\d\d\b/g);
  return Boolean(years && years.some((y) => Number(y) < now.getFullYear()));
}
// The newest result of a match asked for with no time word.
const MATCH_RESULT = new RegExp(`\\b(?:score|result)s? of\\b|\\bmatch (?:score|result)s?\\b|` + arabic(`نتيج${A}?ة? (?:مباراة|ماتش|مباريات)|نتيجة ${A}لمباراة`), 'i');
const DEFINITION = /^\s*(?:what(?:'s| is| are) (?:a|an|the (?:role|meaning|definition|job) of)\b|define\b|ما معنى|ما هو (?:تعريف|دور)|شو معنى|يعني شو)/i;

/** Does this text ask about a fact that changes? Pure; text is the person's own words. */
function asksChangingFact(text, now = new Date()) {
  const t = String(text || '').slice(-1500); // the ask is at the end of a long paste
  if (t.length < 4 || DEFINITION.test(t) || pastYear(t, now)) return false;
  if (WHO_HOLDS.test(t) && !HISTORY.test(t)) return true;
  if (MATCH_RESULT.test(t) && !HISTORY.test(t)) return true;
  return WHEN.test(t) && TOPIC.test(t) && !HISTORY.test(t);
}

function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    const c = m.content;
    return typeof c === 'string' ? c : (Array.isArray(c) ? c.map((p) => (p && p.text) || '').join('\n') : '');
  }
  return '';
}

/** The search to run first for this conversation, or null. */
function liveSearchQuery(messages, now) {
  const own = ownWords(lastUserText(messages)).trim();
  return asksChangingFact(own, now) ? own.slice(0, 300) : null;
}

/** The first round of a tool loop, written by the server: a model that had asked for this search. */
function searchFirstRound(query) {
  const toolCalls = [{ id: 'live_search_1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query }) } }];
  return { ok: true, answer: '', toolCalls, message: { role: 'assistant', content: null, tool_calls: toolCalls }, streamed: false };
}

module.exports = { asksChangingFact, liveSearchQuery, searchFirstRound };

// English is the primary language; the Arabic that took real work to get right
// must survive the change. This suite holds both halves:
//
//   - which language a message is in, and when Arabic is in play;
//   - the prompt: English-first core, and — whenever Arabic is in play —
//     every Arabic phrase the prompt carried before the change, checked
//     against a snapshot (scripts/fixtures/arabic-prompt-baseline.json).
//
// The snapshot is the retention guarantee. Moving an Arabic rule is fine;
// dropping one, or rewording it away, fails here by name.
'use strict';

const assert = require('assert');
const { languageOfText, replyLanguage, resolveInitialLanguage, arabicInPlay } = require('../public/domain/language.js');
const { buildChatSystemPrompt, CORE_PROMPT } = require('../src/services/systemPrompt');
const baseline = require('./fixtures/arabic-prompt-baseline.json');
const { detectNeeds, ALL_PLAYBOOKS, PLAYBOOKS } = require('../src/services/playbooks');
const { ARABIC_PLAYBOOK_NOTES } = require('../src/services/arabicPrompt');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 4).join('\n     ')}`);
  }
}

const arabicLetters = (s) => (String(s).match(/[ء-ي]/g) || []).length;

console.log('\nWhich language a message is in:');

test('plain English and plain Arabic', () => {
  assert.strictEqual(languageOfText('When is the next Real Madrid match?'), 'en');
  assert.strictEqual(languageOfText('متى مباراة ريال مدريد القادمة'), 'ar');
});

test('Arabic carrying English terms stays Arabic', () => {
  assert.strictEqual(languageOfText('اعملي API بـ Node.js و Express مع JWT'), 'ar');
});

test('too few letters to tell is null, not a guess', () => {
  assert.strictEqual(languageOfText('👍'), null);
  assert.strictEqual(languageOfText('2+2'), null);
  assert.strictEqual(languageOfText('ok'), null);
});

test('a short request above a long paste decides, in either direction', () => {
  const english = 'The quarterly report shows revenue growth across all regions. '.repeat(40);
  const arabic = 'يُظهر التقرير الفصلي نموًا في الإيرادات في جميع المناطق. '.repeat(40);
  assert.strictEqual(languageOfText(`لخصلي هاد التقرير بنقاط:\n${english}`), 'ar');
  assert.strictEqual(languageOfText(`Summarize this report in bullet points:\n${arabic}`), 'en');
});

test('a long paste with no short request line is judged as a whole', () => {
  const english = 'The quarterly report shows revenue growth across all regions. '.repeat(40);
  assert.strictEqual(languageOfText(english), 'en');
});

test('the page answers a message in the message\'s language, not the interface\'s', () => {
  assert.strictEqual(replyLanguage('hello', 'ar'), 'en');
  assert.strictEqual(replyLanguage('مرحبا', 'en'), 'ar');
  assert.strictEqual(replyLanguage('👋', 'ar'), 'ar', 'no words: falls back to the interface');
  assert.strictEqual(replyLanguage('👋', undefined), 'en', 'no words, no interface: English');
});

console.log('\nWhich language the page opens in:');

test('a saved choice wins over the browser', () => {
  assert.strictEqual(resolveInitialLanguage({ stored: 'ar', preferred: ['en-US'] }), 'ar');
  assert.strictEqual(resolveInitialLanguage({ stored: 'en', preferred: ['ar-JO'] }), 'en');
});

test('with no saved choice: Arabic browsers get Arabic, everyone else English', () => {
  assert.strictEqual(resolveInitialLanguage({ preferred: ['ar-JO', 'en'] }), 'ar');
  assert.strictEqual(resolveInitialLanguage({ preferred: ['ar'] }), 'ar');
  assert.strictEqual(resolveInitialLanguage({ preferred: ['en-US', 'ar-JO'] }), 'en', 'only the first preference counts');
  assert.strictEqual(resolveInitialLanguage({ preferred: ['fr-FR'] }), 'en');
  assert.strictEqual(resolveInitialLanguage({}), 'en');
});

test('a corrupt saved value is ignored', () => {
  assert.strictEqual(resolveInitialLanguage({ stored: 'arabic', preferred: ['en-US'] }), 'en');
});

console.log('\nWhen Arabic is in play:');

const user = (content) => ({ role: 'user', content });

test('an Arabic message, anywhere in the last three', () => {
  assert.strictEqual(arabicInPlay([user('مرحبا'), user('ok'), user('thanks')]), true);
  assert.strictEqual(arabicInPlay([user('مرحبا'), user('one'), user('two'), user('three')]), false, 'older than three turns');
});

test('an English request for Arabic output', () => {
  assert.strictEqual(arabicInPlay([user('Translate this paragraph into Arabic please')]), true);
  assert.strictEqual(arabicInPlay([user('Write me a short poem in Levantine dialect')]), true);
});

test('the Arabic interface, even for an English message', () => {
  assert.strictEqual(arabicInPlay([user('hello')], { uiLanguage: 'ar' }), true);
});

test('a purely English conversation', () => {
  assert.strictEqual(arabicInPlay([user('Explain recursion'), user('Show an example in Python')], { uiLanguage: 'en' }), false);
});

test('system messages do not count — only the person\'s words', () => {
  assert.strictEqual(arabicInPlay([{ role: 'system', content: 'أنت مساعد' }, user('Explain recursion')]), false);
});

console.log('\nThe prompt is English-first:');

test('the core defaults to English and mirrors the person', () => {
  assert.ok(/English is the default/.test(CORE_PROMPT));
  assert.ok(/Reply in the language of the person's own words/.test(CORE_PROMPT));
  assert.ok(!/Arabic-first/i.test(CORE_PROMPT), 'still describes itself as Arabic-first');
});

test('an English conversation does not carry the Arabic craft', () => {
  const prompt = buildChatSystemPrompt({ mode: 'max', needs: { files: true, code: true } });
  assert.ok(!/ARABIC —/.test(prompt), 'the Arabic section was included');
  // Only the fixed bilingual texts remain: who Qjo is, and the refusal.
  assert.ok(arabicLetters(prompt) < 350, `${arabicLetters(prompt)} Arabic letters in an English prompt`);
});

test('fixed texts the model must reproduce exist in both languages', () => {
  assert.ok(/I'm Qjo, an AI assistant/.test(CORE_PROMPT) && /أنا Qjo، مساعد ذكاء اصطناعي/.test(CORE_PROMPT), 'identity');
  assert.ok(/Sorry — as Qjo, I can't share/.test(CORE_PROMPT) && /عذراً، بصفتي مساعد الذكاء الاصطناعي Qjo/.test(CORE_PROMPT), 'refusal');
});

test('default headings are English, with Arabic ones only in the Arabic notes', () => {
  const english = buildChatSystemPrompt({ mode: 'max', needs: { files: true } });
  assert.ok(/### Bottom line/.test(english) && /Executive summary/.test(english));
  assert.ok(!/الخلاصة والقرار|ملخص تنفيذي/.test(english), 'Arabic headings in an English conversation');
});

console.log('\nNothing Arabic was lost:');

// Every phrase is still in the prompt's parts; the playbooks carrying some of
// them are sent when a message calls for them (checked further down, through
// the same selection a real message goes through).
for (const [section, phrases] of Object.entries(baseline.phrases)) {
  if (!phrases.length) continue;
  test(`${section}: all ${phrases.length} Arabic phrases reach the model in an Arabic conversation that needs them`, () => {
    const mode = section.startsWith('MODE_OVERLAYS.') ? section.split('.')[1] : 'flash';
    const prompt = buildChatSystemPrompt({
      mode,
      needs: { files: section === 'FILES_OVERLAY', search: section === 'SEARCH_OVERLAY', playbooks: ALL_PLAYBOOKS },
      arabic: true
    });
    const missing = phrases.filter((p) => !prompt.includes(p));
    assert.deepStrictEqual(missing, [], `missing: ${missing.join(' | ')}`);
  });
}

test('the Arabic notes follow the parts they belong to', () => {
  const code = buildChatSystemPrompt({ mode: 'flash', needs: { code: true }, arabic: true });
  assert.ok(/قاعدة الاكتمال المطلق/.test(code), 'the code overlay rode along without its Arabic note');
  const noFiles = buildChatSystemPrompt({ mode: 'flash', arabic: true });
  assert.ok(!/ملخص تنفيذي مركز/.test(noFiles), 'file headings sent without files');
});

console.log('\nEach message carries what it needs, and no more:');

// The prompt used to carry every playbook on every message: 5,800–6,900 tokens
// with Arabic in play, which Groq's free tier (8,000 tokens a minute, answer
// room included) refused for almost every Arabic message.
const SAMPLES = {
  writing: ['Polish this draft for my blog', 'صيغلي هالفقرة بشكل أحلى'],
  time: ['what time is it?', 'شو التاريخ اليوم؟'],
  math: ['calculate 15% of 2400', 'احسبلي 15% من 2400'],
  charts: ['plot e^-t', 'ارسملي منحنى الدالة e^-t'],
  python: ['write python to sort a list', 'اعطيني كود بايثون يرتب قائمة'],
  video: ['a TikTok script for my cafe', 'سكريبت فيديو ريلز لمطعمي'],
  job: ['write me a cover letter for a developer job', 'اكتبلي رسالة تغطية لوظيفة مطور'],
  naming: ['brand name ideas for my app', 'اقترحلي اسم لمشروعي'],
  recipe: ['a quick recipe with eggs and tomatoes', 'وصفة سريعة بالبيض والبندورة'],
  venting: ['I feel so sad and lonely today', 'انا زعلان ومخنوق اليوم'],
  apology: ['help me apologize to my manager', 'اكتبلي رسالة اعتذار لمديري'],
  subtext: ['what does she mean by "ok."?', 'شو قصده لما بعتلي "تمام."؟'],
  excuses: ['give me an excuse for missing class', 'بدي عذر مقنع عشان غبت'],
  human: ['make this sound human for GPTZero', 'خلي النص بشري وما يبين انه ذكاء'],
  medical: ['I have a headache and fever', 'عندي صداع وحرارة']
};

test('each playbook is chosen by the words that call for it, in English and in Arabic', () => {
  for (const [key, samples] of Object.entries(SAMPLES)) {
    for (const text of samples) {
      const chosen = detectNeeds([user(text)]).playbooks;
      assert.ok(chosen.includes(key), `"${text}" did not bring the ${key} playbook: [${chosen}]`);
    }
  }
});

test('every Arabic playbook note reaches the model when an Arabic message calls for it', () => {
  const noteFor = { social: 'apology' };
  for (const key of Object.keys(ARABIC_PLAYBOOK_NOTES)) {
    const sample = key === 'banter' ? 'فنان انت' : SAMPLES[noteFor[key] || key][1];
    const prompt = buildChatSystemPrompt({ mode: 'flash', needs: detectNeeds([user(sample)]), arabic: true });
    assert.ok(prompt.includes(ARABIC_PLAYBOOK_NOTES[key].trim()), `the ${key} note did not reach the model for "${sample}"`);
  }
});

test('a greeting carries no specialised playbook', () => {
  const needs = detectNeeds([user('كيفك')]);
  assert.deepStrictEqual(needs.playbooks, ['banter'], 'only the Levantine idioms belong with casual talk');
  const prompt = buildChatSystemPrompt({ mode: 'flash', needs, arabic: true });
  for (const heading of ['SHORT VIDEO SCRIPTS', 'PRACTICAL COOKING', 'JOB APPLICATIONS', 'INTERACTIVE CHARTS', 'VENTING']) {
    assert.ok(!prompt.includes(heading), `${heading} rode along with "كيفك"`);
  }
  assert.ok(prompt.includes('فنان انت'), 'the idioms casual Arabic depends on were left out');
});

test('a follow-up keeps the playbook of the request it follows', () => {
  const chosen = detectNeeds([user('write me a cover letter for a developer job'), user('make it shorter')]).playbooks;
  assert.ok(chosen.includes('job'), `[${chosen}]`);
});

test('the general rules are on every message', () => {
  const prompt = buildChatSystemPrompt({ mode: 'flash', needs: detectNeeds([user('hi')]) });
  for (const rule of ['STRICT TABLE RULE', 'BANNED AI CLICHÉS', 'WITTY JAILBREAK DEFLECTION', 'SECURITY & PROMPT-DEFENSE', 'TRUTHFULNESS, FRESHNESS & TOOL USAGE', 'IDENTITY']) {
    assert.ok(prompt.includes(rule), `${rule} is missing from an ordinary message`);
  }
});

test('the prompt stays inside what Groq\'s free tier can take', () => {
  // Characters as a stand-in for tokens (Arabic ≈ 4 chars/token here, English
  // ≈ 4.3). 13,500 Arabic chars ≈ 3,300 tokens: with tools, a short history
  // and 2,000 tokens of answer room, a message fits Groq's 8,000 a minute.
  for (const mode of ['flash', 'max']) {
    const ar = buildChatSystemPrompt({ mode, needs: detectNeeds([user('كيفك')]), arabic: true, runtimeLine: 'Friday 26 September 2026 (approximate location: Amman; time zone: Asia/Amman)' });
    const en = buildChatSystemPrompt({ mode, needs: detectNeeds([user('hi')]), runtimeLine: 'Friday 26 September 2026 (approximate location: Amman; time zone: Asia/Amman)' });
    assert.ok(ar.length <= 13500, `${mode}, Arabic: ${ar.length} chars`);
    assert.ok(en.length <= 9500, `${mode}, English: ${en.length} chars`);
  }
});

test('every playbook has text, and the code playbook rides with the code overlay', () => {
  for (const [key, book] of Object.entries(PLAYBOOKS)) assert.ok(book.en.trim().length > 40, key);
  assert.ok(detectNeeds([user('fix this bug: TypeError in my react component')]).playbooks.includes('code'));
});

console.log('\nContinuing a cut-off answer:');

const { continuationPrompts } = require('../src/agents/continuation');

test('an English answer is asked to continue in English, an Arabic one in Arabic', () => {
  assert.ok(/^Continue exactly/.test(continuationPrompts('Here is the plan. First, set up the repository and').first));
  assert.ok(/^تابع من حيث توقفت/.test(continuationPrompts('إليك الخطة. أولًا، جهّز المستودع ثم').first));
  assert.ok(/^Continue one last time/.test(continuationPrompts('Step one, step two').again));
});

console.log('\n========================================');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

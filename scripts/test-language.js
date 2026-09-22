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

for (const [section, phrases] of Object.entries(baseline.phrases)) {
  if (!phrases.length) continue;
  test(`${section}: all ${phrases.length} Arabic phrases reach the model in an Arabic conversation`, () => {
    const mode = section.startsWith('MODE_OVERLAYS.') ? section.split('.')[1] : 'flash';
    const prompt = buildChatSystemPrompt({
      mode,
      needs: { files: section === 'FILES_OVERLAY', search: section === 'SEARCH_OVERLAY' },
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

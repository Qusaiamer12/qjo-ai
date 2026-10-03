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
  ui: ['build me a landing page for my cafe', 'صمملي موقع شخصي لمصمم جرافيك'],
  charts: ['chart our monthly sales: Jan 120, Feb 150, Mar 135', 'ارسملي مخطط المبيعات الشهرية'],
  mathplot: ['plot e^-t', 'ارسملي منحنى الدالة e^-t', 'draw a sphere of radius 2 and a cone in 3D', 'ارسم سطح z = sin(x)cos(y) ثلاثي الأبعاد'],
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
  medical: ['I have a headache and fever', 'عندي صداع وحرارة'],
  teach: ['Explain photosynthesis to me', 'اشرحلي دورة كريبس', 'help me revise for my biology exam', 'بدي أراجع للامتحان'],
  problem: ['A car accelerates at 3.2 m/s² for 12 s. Find its speed.', 'سيارة تتسارع بتسارع 3.2 م/ث² لمدة 12 ثانية، احسب سرعتها',
    'Dose is 15 mg/kg for an 18 kg child: how many mL of 120 mg/5 mL syrup?', 'احسب مولارية محلول فيه 0.5 مول في 250 مل']
};

test('code is not a video script: "javascript", "typescript", "python script"', () => {
  for (const text of ['explain closures in javascript', 'write a typescript function', 'python script to rename files']) {
    const chosen = detectNeeds([user(text)]).playbooks;
    assert.ok(!chosen.includes('video'), `"${text}" brought the video playbook: [${chosen}]`);
  }
});

test('"explain this error" is a code question, not a lesson', () => {
  for (const text of ['explain this error: TypeError: x is undefined', 'اشرحلي هالخطأ بالكود']) {
    const chosen = detectNeeds([user(text)]).playbooks;
    assert.ok(!chosen.includes('teach'), `"${text}" brought the teaching playbook: [${chosen}]`);
  }
});

// A CV photographed is a page of skills. Judged on everything the message
// carried, its OCR text chose code, interfaces, cover letters, worked problems
// and lessons, and one picture was over Groq's 8,000 tokens a minute.
const CV_OCR = 'OCR text extracted from image (cv.jpg):\nSKILLS\nJavaScript, TypeScript, React, Node.js, REST APIs, Docker, SQL, testing\nEXPERIENCE\nBuilt the online store front end; integrated payment APIs; code review; debug and refactor.\nCourses: physics, energy, speed of delivery';
const pageMessage = (own, attached) => `${own}\n\nUser attached or previously indexed files with retrieved evidence. Use them.\nAttachment Index 1: ${attached.name}\nOrigin: pending\nType: ${attached.type}\n${attached.text}\n\n[Image(s) attached and analyzed when this was sent] [🖼️ cv.jpg · attachment:abcd12]`;

test('what is asked is judged on the person\'s words, not on the files the page attached', () => {
  const needs = detectNeeds([user(pageMessage('استخرج معلوماتي', { name: 'cv.jpg', type: 'image/jpeg', text: CV_OCR }))]);
  assert.ok(!needs.code && needs.playbooks.length === 0, `a CV's skills chose: code ${needs.code}, [${needs.playbooks}]`);
  assert.ok(needs.files, 'it is still known that a file is attached');
  // Control: the same words typed by the person choose them.
  const typed = detectNeeds([user('build me a React page in JavaScript')]);
  assert.ok(typed.site && typed.playbooks.includes('ui'), `typed: site ${typed.site}, [${typed.playbooks}]`);
  assert.ok(detectNeeds([user('refactor my React component in JavaScript')]).code, 'typed: code');
});

test('a file of code still makes the request about code', () => {
  const needs = detectNeeds([user(pageMessage('شو الغلط هون؟', { name: 'server.js', type: 'text/javascript', text: 'const x = 1' }))]);
  assert.ok(needs.code, 'an attached server.js did not count as code');
  const notCode = detectNeeds([user(pageMessage('شو الغلط هون؟', { name: 'report.pdf', type: 'application/pdf', text: 'const x = 1' }))]);
  assert.ok(!notCode.code, 'a PDF counted as code');
});

test('the worked-problem playbook needs a figure or an ask, not just a subject word', () => {
  for (const text of ['قوة الشخصية مهمة في القيادة', 'we need more energy in the team', 'شو رأيك بسرعة الانترنت عندكم', 'السرعة عندكم ممتازة']) {
    const chosen = detectNeeds([user(text)]).playbooks;
    assert.ok(!chosen.includes('problem'), `"${text}" brought the worked-problem playbook: [${chosen}]`);
  }
});

test('each playbook is chosen by the words that call for it, in English and in Arabic', () => {
  for (const [key, samples] of Object.entries(SAMPLES)) {
    for (const text of samples) {
      const chosen = detectNeeds([user(text)]).playbooks;
      assert.ok(chosen.includes(key), `"${text}" did not bring the ${key} playbook: [${chosen}]`);
    }
  }
});

test('a figure of mathematics carries the figure playbook: not a chart of made-up points, not the code overlay', () => {
  // "ارسملي منحنى الدالة" brought the engineering overlay ("دالة" is also a
  // function in code) and the charts playbook, which drew a function as a dozen
  // hand-computed points and could not draw a surface or a solid at all.
  for (const text of SAMPLES.mathplot.concat('ارسملي منحنى الدالة y = x^2 - 3x + 2 وحدد جذورها')) {
    const needs = detectNeeds([user(text)]);
    assert.ok(needs.plot && !needs.code && !needs.playbooks.includes('charts') && !needs.playbooks.includes('code'), `"${text}": plot ${needs.plot}, code ${needs.code}, [${needs.playbooks}]`);
  }
  // Controls: data is a chart, Python is Python, code is code.
  assert.deepStrictEqual(detectNeeds([user('ارسملي مخطط المبيعات الشهرية')]).playbooks, ['charts']);
  assert.ok(detectNeeds([user('ارسملي منحنى بالبايثون للدالة sin(x)')]).python);
  assert.ok(detectNeeds([user('اكتب دالة جافاسكربت ترتب مصفوفة')]).code);
  // A follow-up to an answer that drew one keeps the format; after one that did not, it does not.
  const after = (answer) => detectNeeds([user('ارسملي سطح z = x^2 + y^2'), { role: 'assistant', content: answer }, user('خليه أحمر')]).playbooks;
  assert.ok(after('هاي:\n```mathplot\n{}\n```').includes('mathplot'));
  assert.ok(!after('تمام').includes('mathplot'));
});

test('the Arabic flash note no longer sends every plot to the chart block', () => {
  const prompt = buildChatSystemPrompt({ mode: 'flash', needs: detectNeeds([user('ارسم كرة ومخروط ثلاثي الأبعاد')]), arabic: true });
  assert.ok(!/get the chart block/.test(prompt), 'the flash note still says plots get the chart block');
  assert.ok(prompt.includes('MATH FIGURES') && prompt.includes(ARABIC_PLAYBOOK_NOTES.mathplot.trim()));
});

test('every Arabic playbook note reaches the model when an Arabic message calls for it', () => {
  const noteFor = { social: 'apology' };
  for (const key of Object.keys(ARABIC_PLAYBOOK_NOTES)) {
    const sample = key === 'banter' ? 'فنان انت' : SAMPLES[noteFor[key] || key][1];
    const prompt = buildChatSystemPrompt({ mode: 'flash', needs: detectNeeds([user(sample)]), arabic: true });
    assert.ok(prompt.includes(ARABIC_PLAYBOOK_NOTES[key].trim()), `the ${key} note did not reach the model for "${sample}"`);
  }
});

test('a greeting or a short question carries no playbook; the idioms come with the words they explain', () => {
  // Every message of 80 characters or fewer used to bring the idioms: 409
  // tokens on most of what people send, where no cache holds them.
  for (const text of ['كيفك', 'hi', 'شكراً', 'مين هداف ريال مدريد الحالي؟', 'Explain recursion']) {
    const chosen = detectNeeds([user(text)]).playbooks;
    assert.ok(!chosen.includes('banter'), `"${text}" brought the idioms: [${chosen}]`);
  }
  const plain = buildChatSystemPrompt({ mode: 'flash', needs: detectNeeds([user('كيفك')]), arabic: true });
  for (const heading of ['SHORT VIDEO SCRIPTS', 'PRACTICAL COOKING', 'JOB APPLICATIONS', 'INTERACTIVE CHARTS', 'VENTING', 'فنان انت']) {
    assert.ok(!plain.includes(heading), `${heading} rode along with "كيفك"`);
  }
  for (const text of ['فنان انت', 'كيف الهمة اليوم؟', 'مين أفضل فريق بالتاريخ؟', 'شو رأيك؟']) {
    const prompt = buildChatSystemPrompt({ mode: 'flash', needs: detectNeeds([user(text)]), arabic: true });
    assert.ok(prompt.includes('فنان انت'), `the idioms did not come with "${text}"`);
  }
});

test('a location, a blood test or an investment is not a website to build', () => {
  for (const text of ['وين موقعي؟', 'شو موقع عمان على الخريطة', 'fix this python bug: IndexError', 'what are the components of blood?', 'شو مكونات الدم', 'how do I balance my investment portfolio']) {
    const chosen = detectNeeds([user(text)]).playbooks;
    assert.ok(!chosen.includes('ui'), `"${text}" brought the interfaces playbook: [${chosen}]`);
  }
});

// A site is one file for the preview (siteRequest.js). It was asked for with
// the engineering overlay (file tree, npm install, tests, deployment) and any
// playbook a word chose — "doctor" brought medical guardrails to a clinic's site.
test('a site carries the interface playbook alone, without the engineering overlay', () => {
  for (const text of ['Build me a landing page for my cafe in React', 'make a website for my dental clinic, the doctor wants a booking form', 'write a landing page for my bakery with our best recipes', 'صمملي موقع لعيادة دكتور أسنان']) {
    const needs = detectNeeds([user(text)]);
    assert.ok(needs.site && !needs.code, `"${text}": site ${needs.site}, code ${needs.code}`);
    assert.deepStrictEqual(needs.playbooks, ['ui'], text);
    assert.ok(!/ACTIVE MODE: CODE/.test(buildChatSystemPrompt({ mode: 'flash', needs, arabic: true })), `"${text}" got the engineering overlay`);
  }
  // Control: the same words, asked as themselves.
  assert.ok(detectNeeds([user('my doctor says I have a fever')]).playbooks.includes('medical'));
  assert.ok(detectNeeds([user('fix this bug: TypeError in my react component')]).code);
});

// Python that runs in the page was asked for with the charts playbook ("never
// output Python"), the essay playbook ("write") and the engineering overlay's
// file tree and npm install, beside the Python playbook.
const withData = (own, file = 'sales.csv') => `${own}\n\nUser attached or previously indexed files with retrieved evidence. Use them.\nAttachment Index 1: ${file}\nOrigin: pending\nType: text/csv\nmonth,amount\nJan,10`;
test('Python for the page carries the Python playbook alone: no charts, essay or engineering overlay', () => {
  for (const text of ['write python to analyse my sales', 'اكتبلي كود بايثون يرسم منحنى', 'solve x^2 = 2 with sympy', withData('حللي هالملف وارسملي رسمة'), withData('analyse this file', 'sales.xlsx')]) {
    const needs = detectNeeds([user(text)]);
    assert.ok(needs.python && !needs.code, `"${text.split('\n')[0]}": python ${needs.python}, code ${needs.code}`);
    assert.deepStrictEqual(needs.playbooks, ['python'], text.split('\n')[0]);
  }
  // Controls: a Python project is code; a data file without an ask to work it, or an ask without a file, is not Python.
  // Projects that also name a sum or a plot: the project wins.
  for (const text of ['build me a flask api in python', 'write a python telegram bot', 'fix this python bug: IndexError',
    'build a flask api in python that computes the average order', 'write a python telegram bot that plots the daily total', 'سويلي بوت بالبايثون يحسب مجموع الطلبات']) {
    const needs = detectNeeds([user(text)]);
    assert.ok(!needs.python && needs.code, `"${text}" was taken for Python in the page`);
  }
  assert.ok(!detectNeeds([user(withData('شو رأيك بالأرقام؟'))]).python, 'a data file with a question was taken for Python');
  assert.ok(!detectNeeds([user('analyse this poem for me')]).python, 'an ask without a file or Python was taken for Python');
  assert.ok(!detectNeeds([user(withData('حللي هالملف', 'report.pdf'))]).python, 'a PDF was taken for a data file');
});

test('the Python playbook says what the page does with the code: files by name, plots drawn, files offered back', () => {
  const py = PLAYBOOKS.python.en;
  assert.ok(/working directory by their exact names/.test(py) && /pd\.read_excel/.test(py), 'files');
  assert.ok(/draws under the code by itself/.test(py) && /projection="3d"/.test(py), 'plots');
  assert.ok(/offered to the person as a download/.test(py), 'files out');
  assert.ok(/no internet, no pip, no input\(\)/.test(py), 'limits');
});

test('the site playbook names what the preview loads, at the versions it serves', () => {
  const { LIBS } = require('../public/domain/codeProject');
  const ui = PLAYBOOKS.ui.en;
  const lucide = /lucide@([\d.]+)\/dist\/umd\/lucide\.min\.js/.exec(ui);
  assert.ok(lucide && LIBS.lucideReact.includes(`lucide-react@${lucide[1]}/`), `Lucide ${lucide && lucide[1]} and lucide-react in ${LIBS.lucideReact}`);
  assert.ok(ui.includes(LIBS.tailwind) && /picsum\.photos\/seed/.test(ui) && /cdn\.jsdelivr\.net or cdnjs\.cloudflare\.com/.test(ui));
  assert.ok(/dir="rtl"/.test(require('../src/services/arabicPrompt').ARABIC_PLAYBOOK_NOTES.ui));
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

// "I can't" for things Qjo does: make the files, preview the code, draw the
// charts, run the Python. The core says what it can make, in one line.
test('the core says what Qjo makes, and to give the closest thing for what it cannot', () => {
  assert.ok(/makes Word, PDF, Excel and slide files/.test(CORE_PROMPT) && /previews code live/.test(CORE_PROMPT) && /runs Python/.test(CORE_PROMPT), 'what Qjo makes is not said');
  assert.ok(/Never say "I can't" to any of these/.test(CORE_PROMPT) && /closest thing it can/.test(CORE_PROMPT));
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

// How an explanation looks, through the real page: quotes, callouts (key
// idea, common mistake, in practice, summary), italics and strikethrough —
// and a quiz written exactly as the teaching playbook tells the model to
// write one, answered by clicking, so the instruction and the page agree.
const { launchBrowser, BASE_URL } = require('./harness');

// The quiz is written in the shape the teaching playbook's own example gives
// the model, read from the playbook: if the instruction drifts from what the
// page reads, this goes red.
const { PLAYBOOKS } = require('../../src/services/playbooks');
const example = JSON.parse(PLAYBOOKS.teach.en.match(/```quiz block[^[]*(\[\{[^\n]*\}\])/)[1])[0];
const asTaught = (question, options, correct, explanation) => Object.fromEntries(Object.keys(example).map((key) => [key, {
  question, options, explanation, answer: typeof example.answer === 'number' ? options.indexOf(correct) : correct
}[key]]));
const QUIZ = [
  asTaught('What does a derivative measure?', ['Area', 'Rate of change', 'Volume', 'Mass'], 'Rate of change', 'It is the instantaneous rate of change.'),
  asTaught('d/dx of x²?', ['x', '2x', 'x²', '2'], '2x', 'Power rule.')
];
const ANSWER = [
  'A derivative is *the rate of change* — ~~the area~~.',
  '',
  '> A plain quote about calculus.',
  '',
  '> [!TIP]',
  '> Think of the slope of the tangent.',
  '',
  '> ⚠️ Forgetting the chain rule.',
  '',
  '> [!CLINICAL]',
  '> Drug clearance rates are derivatives.',
  '',
  '> 💡 **<img src=x onerror="window.__pwned=1">Own title**',
  '> body',
  '',
  '> [!SUMMARY]',
  '> - slope',
  '> - rate',
  '',
  '```quiz',
  JSON.stringify(QUIZ),
  '```'
].join('\n');

let browser;
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

async function open({ lang = 'en', mobile = false, answer = ANSWER, message = 'explain derivatives' } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` }));
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await page.fill('#input', message);
  await page.click('#sendBtn');
  await page.waitForFunction(() => document.querySelector('.msg.assistant:last-of-type .qjo-streamed-content p'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

const callouts = (page) => page.$$eval('.msg.assistant:last-of-type .qjo-callout', (els) => els.map((el) => ({
  kind: el.dataset.kind,
  title: el.querySelector('.qjo-callout-title').innerText.trim(),
  titleColor: getComputedStyle(el.querySelector('.qjo-callout-title')).color,
  titleTags: [...el.querySelectorAll('.qjo-callout-title *')].map((n) => n.tagName.toLowerCase()),
  bodyTags: [...el.querySelectorAll('.qjo-callout-body *')].map((n) => n.tagName.toLowerCase())
})));

async function english() {
  const { ctx, page, errors } = await open();
  const found = await callouts(page);
  ok(found.map((c) => c.kind).join(',') === 'tip,warning,practice,tip,summary', `each callout by its kind (${found.map((c) => c.kind)})`, found);
  ok(found[0].title.includes('Key idea') && found[1].title.includes('Common mistake') && found[2].title.includes('In practice') && found[4].title.includes('Summary'),
    `titled in the page's language (${found.map((c) => c.title).join(' | ')})`);
  ok(found[3].title.includes('Own title') && found[3].title.includes('<img') && !found[3].titleTags.includes('img'), `a callout can name itself, and its name is text (${found[3].titleTags})`);
  ok(found[4].bodyTags.includes('ul') && found[4].bodyTags.filter((t) => t === 'li').length === 2, 'a summary keeps its bullets');
  const quote = await page.$eval('.msg.assistant:last-of-type .qjo-streamed-content > blockquote', (q) => q.innerText.trim()).catch(() => '');
  ok(/plain quote about calculus/.test(quote), 'a plain quote is a quote');
  const emphasis = await page.$eval('.msg.assistant:last-of-type .qjo-streamed-content p', (p) => ({ em: (p.querySelector('em') || {}).textContent, del: (p.querySelector('del') || {}).textContent }));
  ok(emphasis.em === 'the rate of change' && emphasis.del === 'the area', `italics and strikethrough (${JSON.stringify(emphasis)})`);

  // The quiz, in the playbook's format, answered by clicking.
  const quiz = await page.$$eval('.msg.assistant:last-of-type .quiz-question-block', (els) => els.length);
  ok(quiz === 2, `the quiz the playbook teaches renders as ${quiz} questions`);
  await page.click('.msg.assistant:last-of-type .quiz-question-block >> nth=0 >> .quiz-option-btn >> text=Rate of change');
  await page.waitForTimeout(300);
  const verdict = await page.$eval('.msg.assistant:last-of-type .quiz-question-block', (b) => b.innerText);
  ok(/Correct/.test(verdict) && /instantaneous rate of change/.test(verdict), 'its right answer is marked right, with the explanation', verdict.slice(0, 200));
  ok(!(await page.evaluate(() => window.__pwned)), 'nothing in a callout ran');
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  await ctx.close();
}

async function arabicOnAPhone() {
  const { ctx, page } = await open({ lang: 'ar', mobile: true });
  const found = await callouts(page);
  ok(found[0] && found[0].title.includes('مفتاح الفهم') && found[1].title.includes('خطأ شائع') && found[4].title.includes('الخلاصة'), `in Arabic (${found.map((c) => c.title).join(' | ')})`);
  // Phone rules repaint every span in a bubble; a callout keeps its colour —
  // the warning's red, darkened to be read (readability.test.js).
  const [r, g, b] = ((found[1] && found[1].titleColor) || '').match(/[\d.]+/g).map(Number).map((v, _, all) => (all.some((x) => x > 1) ? v : v * 255));
  ok(r > 120 && r > 3 * g && r > 3 * b, `on a phone the title keeps its colour (${found[1] && found[1].titleColor})`);
  await ctx.close();
}

// Where a word lands on screen, left edge and right edge, by the text it is
// in. Refuses to guess: a missing element or word is reported, not skipped.
const WHERE = `(selector, words) => {
  const el = document.querySelector(selector);
  if (!el) return { missing: selector };
  const out = {};
  for (const word of words) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !node.textContent.includes(word));
    if (!node) return { missing: word };
    const range = document.createRange();
    const at = node.textContent.indexOf(word);
    range.setStart(node, at); range.setEnd(node, at + word.length);
    const r = range.getBoundingClientRect();
    out[word] = { left: Math.round(r.left), right: Math.round(r.right) };
  }
  return out;
}`;

// An answer, or a message, in the other language from the page's: each is
// laid out in its own direction. In a mixed line, which side a word lands on
// says which direction the line was given — an Arabic line gone left to
// right puts "JavaScript." after the Arabic, the first thing an Arabic
// reader meets.
async function directions() {
  const arabicAnswer = 'JavaScript هي لغة برمجة تعمل في المتصفح.\n\n1. **المتغيرات** تحفظ القيم.\n2. **الدوال** تنفذ الأوامر.';
  const { ctx, page, errors } = await open({ answer: arabicAnswer, message: 'اشرح لي JavaScript.' });
  const where = (selector, words) => page.evaluate(`(${WHERE})(${JSON.stringify(selector)}, ${JSON.stringify(words)})`);
  ok(await page.evaluate(() => getComputedStyle(document.body).direction) === 'ltr', 'control: the page is left to right');
  const p = await where('.msg.assistant:last-of-type .qjo-streamed-content p', ['JavaScript', 'لغة']);
  ok(p.JavaScript && p['لغة'] && p.JavaScript.left >= p['لغة'].right, 'an Arabic answer opening with "JavaScript" reads right to left: the word is on the right, where the sentence starts', p);
  const list = await page.$eval('.msg.assistant:last-of-type .qjo-streamed-content ol', (ol) => getComputedStyle(ol).direction).catch(() => null);
  ok(list === 'rtl', `its numbered list is right to left, numbers on the right (${list})`);
  const mine = await where('.msg.user .bubble', ['اشرح', 'JavaScript']);
  ok(mine.JavaScript && mine['اشرح'] && mine.JavaScript.right <= mine['اشرح'].left, 'the Arabic message typed on this page reads right to left too', mine);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  await ctx.close();

  const english = await open({ lang: 'ar', answer: 'The word مرحبا means hello.', message: 'What does مرحبا mean?' });
  const whereEn = (selector, words) => english.page.evaluate(`(${WHERE})(${JSON.stringify(selector)}, ${JSON.stringify(words)})`);
  ok(await english.page.evaluate(() => getComputedStyle(document.body).direction) === 'rtl', 'control: the Arabic page is right to left');
  const en = await whereEn('.msg.assistant:last-of-type .qjo-streamed-content p', ['The word', 'means']);
  ok(en['The word'] && en.means && en['The word'].right <= en.means.left, 'an English answer on the Arabic page reads left to right', en);
  const asked = await whereEn('.msg.user .bubble', ['What does', 'mean?']);
  ok(asked['What does'] && asked['mean?'] && asked['What does'].right <= asked['mean?'].left, 'and so does the English message typed on it', asked);
  await english.ctx.close();
}

// Answers have no frame now, so their sizes alone order the page: a heading
// stands above the text under it ("###", an h4, was smaller than its own text),
// and on a phone a three-column table fits as it is while a wide one scrolls.
const SIZES = ['## A heading', '', 'Body text under it.', '', '### A smaller heading', '', 'More text.', '',
  '| Name | Role | City |', '|---|---|---|', '| Sami Khaled | Engineer | Amman |', '| Lina | Doctor | Irbid |', '',
  '| One | Two | Three | Four | Five | Six |', '|---|---|---|---|---|---|', '| alpha beta | gamma delta | epsilon zeta | eta theta | iota kappa | lambda mu |'].join('\n');
const measure = (page) => page.evaluate(() => {
  const root = [...document.querySelectorAll('.msg.assistant .qjo-streamed-content')].pop();
  if (!root) return { missing: 'answer' };
  const px = (sel) => { const el = root.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
  const width = root.getBoundingClientRect().width;
  return { h3: px('h3'), h4: px('h4'), p: px('p'), td: px('td'), width, tables: [...root.querySelectorAll('table')].map((t) => Math.round(t.getBoundingClientRect().width)) };
});
async function sizes() {
  for (const mobile of [false, true]) {
    const { ctx, page, errors } = await open({ answer: SIZES, mobile, message: 'a table please' });
    const m = await measure(page);
    const where = mobile ? 'phone' : 'desktop';
    ok(m.p >= 15 && m.tables.length === 2, `${where}: the answer is there, body text ${m.p}px`, m);
    ok(m.h3 > m.h4 && m.h4 > m.p, `${where}: headings stand above the text (h3 ${m.h3}, h4 ${m.h4}, text ${m.p})`, m);
    ok(m.td < m.p && m.td >= 13, `${where}: a table's text sits just below it (${m.td}px)`, m);
    if (mobile) {
      ok(m.tables[0] <= m.width + 1, `phone: three columns fit the screen (${m.tables[0]} of ${Math.round(m.width)}px)`, m);
      ok(m.tables[1] > m.width, `control: six columns are wider than the screen and scroll (${m.tables[1]}px)`, m);
    }
    ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
    await ctx.close();
  }
}

(async () => {
  browser = await launchBrowser();
  for (const scenario of [english, arabicOnAPhone, directions, sizes]) await scenario();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

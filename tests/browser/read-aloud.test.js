// An answer read aloud, through the real page. The browser's voices are
// replaced at their boundary — window.speechSynthesis — by a fake that
// records what it is asked to say; everything on the page's side is real.
//
// Checked: Listen sits beside Copy under an answer; it reads the words, not
// the Markdown — no code, no addresses, no citation numbers — in the
// answer's own language and voice, in pieces short enough not to be cut
// off; a second tap stops it; another answer's Listen takes over; the
// button comes back when the reading ends; a browser that cannot speak
// shows no Listen, and Copy still copies.
const { launchBrowser, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 500)); };

const ARABIC = ['## السكري', '', 'مرض **مزمن** يصيب الملايين [1](https://who.int/x) حسب [منظمة الصحة](https://who.int).', '',
  '```js', 'console.log("لا يُقرأ")', '```', '', ('جملة طويلة تشرح الفكرة بالتفصيل حتى يتجاوز الجواب حدّ القطعة الواحدة بوضوح. ').repeat(6)].join('\n');
const ENGLISH = 'Diabetes is a chronic disease. It affects how the body turns food into energy.';

const FAKE = `
  window.__said = []; window.__cancelled = 0;
  const fake = {
    speak(u) { window.__said.push(u); },
    cancel() { window.__cancelled++; window.__said = []; },
    getVoices() { return [{ lang: 'en-US', name: 'English voice' }, { lang: 'ar-SA', name: 'Arabic voice' }]; }
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  window.__finish = () => { const last = window.__said[window.__said.length - 1]; if (last && last.onend) last.onend(); };
`;

async function open(browser, { phone = false, speak = true }) {
  const ctx = await browser.newContext({ ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } }), permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let reply = ARABIC;
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: {}\n\n` }));
  await page.addInitScript(speak ? FAKE : "Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); window.SpeechSynthesisUtterance = undefined;");
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  const ask = async (text, answer) => {
    reply = answer;
    const n = await page.$$eval('.msg.assistant .msg-actions-toolbar', (els) => els.length);
    await page.fill('#input', text);
    await page.click('#sendBtn');
    await page.waitForFunction((count) => document.querySelectorAll('.msg.assistant .msg-actions-toolbar').length > count, n, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
  };
  return { ctx, page, errors, ask };
}

const said = (page) => page.evaluate(() => window.__said.map((u) => ({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name })));
const listen = (page, nth) => page.evaluate((i) => {
  const b = document.querySelectorAll('.msg.assistant .qjo-read-aloud')[i];
  return b && { label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), next: b.previousElementSibling && b.previousElementSibling.getAttribute('aria-label') };
}, nth);

async function check(browser, phone) {
  const where = phone ? 'phone' : 'desktop';
  const { ctx, page, errors, ask } = await open(browser, { phone });
  await ask('شو هو السكري؟', ARABIC);
  let b = await listen(page, 0);
  ok(b && b.label === 'استمع' && b.pressed === 'false' && b.next === 'نسخ الإجابة', `${where}: Listen sits beside Copy under the answer (${b && b.label})`, b);

  await page.click('.msg.assistant .qjo-read-aloud >> nth=0');
  let s = await said(page);
  const heard = s.map((u) => u.text).join(' ');
  ok(s.length >= 2 && s.every((u) => u.text.length <= 220), `${where}: read in pieces short enough not to be cut off (${s.map((u) => u.text.length).join(', ')})`, s.map((u) => u.text.length));
  ok(/مرض مزمن يصيب الملايين حسب منظمة الصحة\./.test(heard) && !/console|لا يُقرأ|https|\[1\]|\*\*|##/.test(heard), `${where}: the words are read, not the Markdown, the code or the addresses`, heard.slice(0, 200));
  ok(s.every((u) => u.lang === 'ar-SA' && u.voice === 'Arabic voice'), `${where}: in Arabic, with an Arabic voice`, s[0]);
  b = await listen(page, 0);
  ok(b.pressed === 'true' && b.label === 'إيقاف القراءة', `${where}: while it reads, the button stops it (${b.label})`);
  await page.click('.msg.assistant .qjo-read-aloud >> nth=0');
  b = await listen(page, 0);
  ok((await page.evaluate(() => window.__cancelled)) >= 1 && b.pressed === 'false' && b.label === 'استمع', `${where}: a second tap stops the reading`);

  // An English answer on an Arabic page is read in English; it takes over.
  await ask('in English please', ENGLISH);
  await page.click('.msg.assistant .qjo-read-aloud >> nth=0');
  await page.click('.msg.assistant .qjo-read-aloud >> nth=1');
  s = await said(page);
  const [first, second] = [await listen(page, 0), await listen(page, 1)];
  ok(first.pressed === 'false' && second.pressed === 'true' && s.length === 1 && s[0].lang === 'en-US' && s[0].voice === 'English voice',
    `${where}: another answer's Listen takes over, and an English answer is read in English`, { first, second, s });
  await page.evaluate(() => window.__finish());
  ok((await listen(page, 1)).pressed === 'false', `${where}: when the reading ends the button is Listen again`);
  ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const phone of [false, true]) await check(browser, phone);
    // A browser that cannot speak: no Listen, and Copy still copies.
    const { ctx, page, ask } = await open(browser, { speak: false });
    await ask('شو هو السكري؟', ENGLISH);
    const buttons = await page.$$eval('.msg.assistant .msg-actions-toolbar button', (els) => els.map((e) => e.getAttribute('aria-label')));
    await page.click('.msg.assistant .msg-action-btn[aria-label="نسخ الإجابة"]');
    await page.waitForTimeout(200);
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(!buttons.includes('استمع') && copied.includes('Diabetes is a chronic disease'), `a browser that cannot speak shows no Listen, and Copy still copies (${buttons.slice(0, 3).join(', ')})`, { buttons, copied });
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

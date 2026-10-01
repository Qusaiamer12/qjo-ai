// Speaking a message, through the real page. The browser's speech
// recognition needs a microphone and Google's servers, so it is replaced at
// the browser's own boundary — window.SpeechRecognition — by a fake that
// hears what the test says. Everything on the page's side is real.
//
// Checked: the microphone is offered where the browser can listen and not
// where it cannot; it listens in the page's language; what is heard goes
// into the composer after what was typed, as it is heard, and nothing is
// sent by itself; a second tap stops; a refused microphone says how to fix
// it; it does nothing while an answer is being written.
const { launchBrowser, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

// A recognizer that records how it was set up and hears what __hear says.
const FAKE = `
  window.__voice = { made: 0, started: 0, stopped: 0, lang: null, live: null };
  class FakeRecognition {
    constructor() { window.__voice.made++; window.__voice.live = this; }
    start() { window.__voice.started++; window.__voice.lang = this.lang; window.__voice.interim = this.interimResults; }
    stop() { window.__voice.stopped++; setTimeout(() => this.onend && this.onend(), 10); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  delete window.SpeechRecognition;
  window.__hear = (parts) => {
    const r = window.__voice.live;
    const results = parts.map((p) => Object.assign([{ transcript: p }], { isFinal: true }));
    r.onresult({ results });
  };
  window.__fail = (error) => { const r = window.__voice.live; r.onerror({ error }); r.onend(); };
`;

async function open(browser, { lang, phone = false, fake = true }) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const chats = [];
  await page.route('**/api/chat', (route) => { chats.push(route.request().postData()); return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"تمام."}\n\nevent: done\ndata: {}\n\n' }); });
  await page.addInitScript(fake ? FAKE : 'delete window.webkitSpeechRecognition; delete window.SpeechRecognition;');
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page, errors, chats };
}

const mic = (page) => page.evaluate(() => {
  const b = document.querySelector('#micBtn');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { shown: r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none', reachable: Boolean(hit && (hit === b || b.contains(hit))), size: Math.round(Math.min(r.width, r.height)), label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), voice: window.__voice };
});

async function check(browser, lang, phone) {
  const where = `${lang}, ${phone ? 'phone' : 'desktop'}`;
  const { ctx, page, errors, chats } = await open(browser, { lang, phone });
  let m = await mic(page);
  const words = lang === 'ar' ? { start: 'تحدث برسالتك', stop: 'إيقاف الاستماع' } : { start: 'Speak your message', stop: 'Stop listening' };
  ok(m && m.shown && m.reachable && m.size >= 36 && m.label === words.start, `${where}: a microphone beside the composer (${m && m.label}, ${m && m.size}px)`, m);

  await page.fill('#input', lang === 'ar' ? 'مرحبا' : 'Hello');
  await page.click('#micBtn');
  m = await mic(page);
  ok(m.voice.started === 1 && m.voice.interim === true && m.pressed === 'true' && m.label === words.stop, `${where}: a tap listens, and says so (${m.label})`, m);
  ok(m.voice.lang === (lang === 'ar' ? 'ar-JO' : 'en-US'), `${where}: in the page's language (${m.voice.lang})`);

  const heard = lang === 'ar' ? ['اشرحلي ', 'الطاقة الشمسية'] : ['explain ', 'solar power'];
  await page.evaluate((p) => window.__hear(p.slice(0, 1)), heard);
  const midway = await page.inputValue('#input');
  await page.evaluate((p) => window.__hear(p), heard);
  const typed = await page.inputValue('#input');
  const expected = `${lang === 'ar' ? 'مرحبا' : 'Hello'} ${heard.join('')}`;
  ok(midway === `${lang === 'ar' ? 'مرحبا' : 'Hello'} ${heard[0]}` && typed === expected, `${where}: what is heard goes in after what was typed, as it is heard ("${typed}")`, { midway, typed });

  await page.click('#micBtn');
  await page.waitForTimeout(100);
  m = await mic(page);
  ok(m.voice.stopped === 1 && m.pressed === 'false' && m.label === words.start, `${where}: a second tap stops listening`, m);
  ok(chats.length === 0 && (await page.inputValue('#input')) === expected, `${where}: nothing is sent by itself`);

  // A refused microphone says what to do.
  await page.click('#micBtn');
  await page.evaluate(() => window.__fail('not-allowed'));
  const said = await page.waitForFunction((text) => [...document.body.querySelectorAll('div')].some((d) => d.textContent === text),
    lang === 'ar' ? 'اسمح باستخدام المايكروفون من إعدادات المتصفح لتتكلم برسالتك' : "Allow the microphone in your browser's settings to speak your message", { timeout: 3000 }).then(() => true, () => false);
  ok(said, `${where}: a refused microphone says how to allow it`);

  // While an answer is being written the composer is busy: nothing listens.
  await page.route('**/api/chat', () => {});
  await page.click('#sendBtn');
  await page.waitForTimeout(400);
  const made = (await mic(page)).voice.made;
  await page.click('#micBtn').catch(() => {});
  ok((await mic(page)).voice.made === made, `${where}: while an answer is written the microphone does not listen`);
  ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const lang of ['ar', 'en']) for (const phone of [false, true]) await check(browser, lang, phone);
    // A browser that cannot listen offers no microphone.
    const { ctx, page } = await open(browser, { lang: 'ar', fake: false });
    const m = await mic(page);
    ok(m && !m.shown, 'a browser without speech recognition shows no microphone', m);
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

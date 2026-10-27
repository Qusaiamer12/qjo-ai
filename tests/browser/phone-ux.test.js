// The chat page on a phone, the way a thumb meets it: what a tap lands on,
// what floats over what, whether the page keeps up with an answer, and what
// the composer's buttons look like.
//
// Every one of these was found by tapping the real page, while every suite
// was green:
//   - a tap on blank space under your own message deleted it and its answer
//     (the edit button was the whole width of the screen);
//   - the page stopped following an answer for good once a code block or a
//     table rendered (its height read as "the reader scrolled away");
//   - Send was a pale grey arrow, 2.2:1, its own style beaten by the row's;
//   - the floating Flash and Tools pills covered the last answer's buttons,
//     and stayed over the conversation with the keyboard open;
//   - targets of 23, 28, 32 and 36px;
//   - the scroll-to-bottom button half off the screen in Arabic;
//   - the Flash and Tools menus stayed open after a tap on a disabled button.
// Each check has a control: something the same probe must see, or must fail.
const { launchBrowser, devices, BASE_URL } = require('./harness');
const { PNG } = require('playwright-core/lib/utilsBundle');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 600)); };
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const PHONE = devices['iPhone 13'];

const QUIZ = [{ question: 'Which hormone lowers blood sugar?', options: ['Insulin', 'Glucagon', 'Cortisol'], answer: 0, explanation: 'Insulin moves glucose into cells.' }];
const ANSWER = [
  '## Searching a sorted list',
  '',
  'Binary search halves the range on every step.',
  '',
  '```python',
  'def search(items, target):',
  '    lo, hi = 0, len(items) - 1',
  '    return lo',
  '```',
  '',
  '| Algorithm | Time |',
  '|---|---|',
  '| Binary search | O(log n) |',
  '',
  '```quiz',
  JSON.stringify(QUIZ),
  '```',
  '',
  'That is all there is to it.'
].join('\n');
const REPLY = frame('reasoning', { text: 'Thinking about the question.' }) + frame('chunk', { text: ANSWER }) + frame('done', {});

async function open(browser, { lang = 'en', theme = 'light', reply = REPLY, desktop = false } = {}) {
  const ctx = await browser.newContext({ ...(desktop ? { viewport: { width: 1280, height: 900 } } : PHONE), locale: lang === 'ar' ? 'ar-JO' : 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (reply) await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: reply }));
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); localStorage.setItem('qjo_theme', '${theme}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page, errors };
}

async function ask(page, text) {
  await page.fill('#input', text);
  await page.click('#sendBtn');
  await page.waitForFunction(() => {
    const last = [...document.querySelectorAll('#messages .msg.assistant')].pop();
    return last && /all there is to it/.test(last.innerText) && !document.getElementById('sendBtn').classList.contains('is-stop');
  }, null, { timeout: 15000 });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(700);
}

const toBottom = (page) => page.evaluate(() => { const m = document.getElementById('messages'); m.scrollTop = m.scrollHeight; }).then(() => page.waitForTimeout(400));

/** What a tap at the centre (and either side) of each element would land on. */
const reach = (page, selector) => page.$$eval(selector, (els) => els.filter((e) => e.getClientRects().length).map((e) => {
  const r = e.getBoundingClientRect();
  const hits = [0.5, 0.2, 0.8].map((fx) => {
    const h = document.elementFromPoint(r.left + r.width * fx, r.top + r.height / 2);
    return Boolean(h && (h === e || e.contains(h)));
  });
  return { name: (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 24), box: [r.left, r.top, r.width, r.height].map(Math.round), reachable: hits.every(Boolean) };
}));

const boxes = (page, selector) => page.$$eval(selector, (els) => els.filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map((e) => {
  const r = e.getBoundingClientRect();
  return { name: (e.id || e.getAttribute('aria-label') || e.className).toString().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) };
}));

// ── 1. Edit takes a tap on its label, not on the row ────────────────────────
async function editTap(browser) {
  const { ctx, page } = await open(browser);
  await ask(page, 'How does binary search work?');
  await toBottom(page);
  await page.evaluate(() => document.querySelector('.qjo-edit-message').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const spot = await page.evaluate(() => {
    const b = document.querySelector('.qjo-edit-message');
    const msg = b.closest('.msg.user');
    const r = b.getBoundingClientRect();
    const m = msg.getBoundingClientRect();
    // Blank space on the row, 24px in from the message's start edge.
    const x = document.documentElement.dir === 'rtl' ? m.right - 24 : m.left + 24;
    const y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, w: Math.round(r.width), h: Math.round(r.height), onButton: Boolean(hit && (hit === b || b.contains(hit))), inMessages: Boolean(hit && hit.closest('#messages')), label: b.textContent.trim() };
  });
  ok(spot.inMessages, `control: the blank spot beside Edit is on the conversation (${Math.round(spot.x)}, ${Math.round(spot.y)})`, spot);
  ok(spot.h >= 40 && spot.w <= 140, `Edit is the size of its label, and tall enough for a thumb (${spot.w}x${spot.h})`, spot);
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ users: document.querySelectorAll('#messages .msg.user').length, answers: document.querySelectorAll('#messages .msg.assistant').length, input: document.getElementById('input').value }));
  ok(after.users === 1 && after.answers >= 1 && after.input === '', `a tap on the blank row beside Edit deletes nothing (${after.users} question, ${after.answers} answer)`, after);
  if (after.users !== 1) { await ctx.close(); return; }
  // Control: the button itself still edits.
  const b = await page.$eval('.qjo-edit-message', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.tap(b.x, b.y);
  await page.waitForTimeout(400);
  const edited = await page.evaluate(() => ({ users: document.querySelectorAll('#messages .msg.user').length, input: document.getElementById('input').value }));
  ok(edited.users === 0 && edited.input === 'How does binary search work?', `control: a tap on Edit itself takes the question back to the composer (${JSON.stringify(edited)})`, edited);
  await ctx.close();
}

// ── 3, 4, 7: the finished answer at the bottom of the screen ────────────────
/** The icon's colour against the pixels behind it, the icon itself hidden. */
async function iconContrast(page, selector) {
  const info = await page.$eval(selector, (b) => {
    const svg = b.querySelector('svg');
    const r = b.getBoundingClientRect();
    const s = svg.getBoundingClientRect();
    const cs = getComputedStyle(svg);
    const path = svg.querySelector('path, rect, polyline');
    const ink = path && getComputedStyle(path).stroke !== 'none' ? getComputedStyle(path).stroke : cs.color;
    let opacity = 1;
    for (let e = svg; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    svg.style.setProperty('visibility', 'hidden', 'important');
    return { clip: { x: r.left, y: r.top, width: r.width, height: r.height }, icon: [s.left - r.left, s.top - r.top, s.width, s.height], ink, opacity, background: getComputedStyle(b).backgroundImage };
  });
  await page.waitForTimeout(50);
  const png = PNG.sync.read(await page.screenshot({ clip: info.clip, scale: 'css' }));
  await page.$eval(selector, (b) => b.querySelector('svg').style.removeProperty('visibility'));
  const [r, g, bl, a = 1] = info.ink.match(/[\d.]+/g).map(Number);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
  let worst = Infinity;
  const [ix, iy, iw, ih] = info.icon;
  for (let fx = 0.1; fx <= 0.9; fx += 0.2) for (let fy = 0.1; fy <= 0.9; fy += 0.2) {
    const x = Math.min(png.width - 1, Math.round(ix + iw * fx)), y = Math.min(png.height - 1, Math.round(iy + ih * fy));
    const i = (y * png.width + x) * 4;
    const bg = [png.data[i], png.data[i + 1], png.data[i + 2]];
    const alpha = a * info.opacity;
    const fg = [r, g, bl].map((v, k) => v * alpha + bg[k] * (1 - alpha));
    worst = Math.min(worst, ratio(fg, bg));
  }
  return { ratio: +worst.toFixed(2), ink: info.ink, background: info.background.slice(0, 60) };
}

async function bottomOfAnswer(browser, lang) {
  const { ctx, page, errors } = await open(browser, { lang });
  await ask(page, lang === 'ar' ? 'كيف يعمل البحث الثنائي؟' : 'How does binary search work?');
  await toBottom(page);

  // 4. Nothing floats over the last answer's buttons.
  const pills = await reach(page, '#composerToggles .qjo-mode-btn, #composerToggles .qjo-tools-btn');
  ok(pills.length === 2 && pills.every((p) => p.reachable), `${lang}: control — Flash and Tools float on screen and take a tap (${pills.map((p) => p.box.join(',')).join(' / ')})`, pills);
  const buttons = await reach(page, '#messages .msg.assistant:last-of-type .msg-actions-toolbar button');
  // Not one pixel of a button under a pill or the composer.
  const floating = await page.$$eval('#composerToggles .qjo-mode-btn, #composerToggles .qjo-tools-btn, .composer', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  const under = (b) => floating.some(([l, t, r, btm]) => b.box[0] < r && b.box[0] + b.box[2] > l && b.box[1] < btm && b.box[1] + b.box[3] > t);
  const covered = buttons.filter((b) => !b.reachable || under(b));
  ok(buttons.length >= 5 && covered.length === 0, `${lang}: at the bottom of the chat, every one of the answer's ${buttons.length} buttons takes its own tap`, covered);
  const exportBtn = await page.$('#messages .msg.assistant:last-of-type .qjo-export-toggle');
  if (exportBtn) {
    const b = await exportBtn.boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => ({ exportMenu: !document.querySelector('#messages .msg.assistant:last-of-type .qjo-export-menu').hidden, modeMenu: !document.getElementById('modeMenu').hidden }));
    ok(opened.exportMenu && !opened.modeMenu, `${lang}: a tap on "Download as file" opens its menu, not Flash's`, opened);
    await page.touchscreen.tap(195, 200);
  } else ok(false, `${lang}: the answer offers "Download as file"`);

  if (lang === 'en') {
    // 7. Every target is at least 40px a side.
    await page.waitForTimeout(300);
    const groups = {
      'answer actions': '#messages .msg.assistant:last-of-type .msg-actions-toolbar > button, #messages .msg.assistant:last-of-type .msg-actions-toolbar .qjo-export-toggle',
      'code header': '#messages .msg.assistant:last-of-type .code-block-header button',
      'reasoning toggle': '#messages .msg.assistant:last-of-type .qjo-reasoning-toggle',
      'composer buttons': '#mobileToolsTriggerBtn, #micBtn, #attachBtn, #sendBtn'
    };
    for (const [name, selector] of Object.entries(groups)) {
      const found = await boxes(page, selector);
      const small = found.filter((b) => b.w < 40 || b.h < 40);
      const off = found.filter((b) => b.left < 0 || b.right > PHONE.viewport.width);
      ok(found.length >= 1 && small.length === 0 && off.length === 0, `${name}: ${found.length} targets, each at least 40px a side, all on screen (${found.map((b) => `${b.w}x${b.h}`).join(' ')})`, { small, off });
    }
    const layout = await page.evaluate(() => {
      const h = document.querySelector('#messages .msg.assistant:last-of-type .code-block-header');
      return { header: Math.round(h.getBoundingClientRect().height), overflow: h.scrollWidth - h.clientWidth, input: Math.round(document.getElementById('input').getBoundingClientRect().width), page: document.documentElement.scrollWidth - window.innerWidth };
    });
    ok(layout.header <= 52 && layout.overflow <= 1 && layout.input >= 150 && layout.page <= 0, `bigger targets keep the layout: the code header one row (${layout.header}px), the message box ${layout.input}px wide, nothing wider than the screen`, layout);

    // 8. One frame round the code, not a box inside it.
    const code = await page.$eval('#messages .msg.assistant:last-of-type .code-block-wrapper', (w) => {
      const pre = w.querySelector('pre');
      const a = getComputedStyle(w), b = getComputedStyle(pre);
      return { frame: a.borderTopWidth + ' ' + a.borderTopStyle, inner: b.borderTopWidth + ' ' + b.borderTopStyle, radius: b.borderTopLeftRadius, margin: [b.marginTop, b.marginLeft, b.marginRight, b.marginBottom].join(' ') };
    });
    ok(code.frame === '1px solid', `control: the code block has its frame (${code.frame})`, code);
    ok(/^0px|none$/.test(code.inner) && code.radius === '0px' && code.margin === '0px 0px 0px 0px', `the code inside it has no border, corners or margin of its own (${code.inner}, ${code.radius}, ${code.margin})`, code);

    // 3. Send in its own colours, every composer icon readable — empty or not.
    const measureComposer = async (state) => {
      for (const sel of ['#micBtn', '#attachBtn', '#sendBtn']) {
        const c = await iconContrast(page, sel);
        ok(c.ratio >= 3, `${state}: the ${sel.slice(1, -3)} icon stands out from what is behind it (${c.ratio}:1, at least 3)`, c);
        if (sel === '#sendBtn') ok(/gradient/.test(c.background), `${state}: Send shows its own style, not the row's (${c.background || 'none'})`, c);
      }
    };
    await measureComposer('empty composer');
    await page.fill('#input', 'a follow-up');
    await page.evaluate(() => document.activeElement.blur());
    await measureComposer('with a message typed');
    // Control: the measure fails the grey arrow Send used to be.
    await page.addStyleTag({ content: 'body #sendBtn.send-btn { background: #fff !important; color: #94a3b8 !important; }' });
    const grey = await iconContrast(page, '#sendBtn');
    ok(grey.ratio < 3, `control: the old pale grey arrow on white is caught (${grey.ratio}:1)`, grey);
  }
  ok(errors.length === 0, `${lang}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

// ── 3. The composer's icons on the dark theme too ─────────────────────────────
async function composerDark(browser) {
  const { ctx, page } = await open(browser, { theme: 'dark' });
  ok(await page.evaluate(() => document.body.classList.contains('dark')), 'control: the page is in dark mode');
  for (const typed of ['', 'a question']) {
    await page.fill('#input', typed);
    await page.evaluate(() => document.activeElement.blur());
    await page.waitForTimeout(300);
    for (const sel of ['#micBtn', '#attachBtn', '#sendBtn']) {
      const c = await iconContrast(page, sel);
      ok(c.ratio >= 3, `dark${typed ? ', with a message typed' : ''}: the ${sel.slice(1, -3)} icon stands out from what is behind it (${c.ratio}:1, at least 3)`, c);
    }
  }
  await ctx.close();
}

// ── 7. Retry ────────────────────────────────────────────────────────────────
async function retryTarget(browser) {
  const { ctx, page } = await open(browser, { reply: null });
  await page.route('**/api/chat', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"All AI providers failed."}' }));
  await page.fill('#input', 'hello');
  await page.click('#sendBtn');
  await page.waitForSelector('.retry-row button', { timeout: 20000 }).catch(() => {});
  const found = await boxes(page, '.retry-row button');
  ok(found.length === 1 && found[0].h >= 40 && found[0].w >= 40, `Retry is at least 40px a side (${found.map((b) => `${b.w}x${b.h}`).join(' ') || 'missing'})`, found);
  await ctx.close();
}

// ── 5. Flash and Tools step aside for the keyboard ──────────────────────────
async function keyboard(browser) {
  const { ctx, page } = await open(browser);
  await ask(page, 'How does binary search work?');
  const shown = () => page.$eval('#composerToggles', (e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
  ok(await shown(), 'control: with the keyboard closed, Flash and Tools are on screen');
  // iOS: the visual viewport shrinks, and the page marks the keyboard open.
  await page.evaluate(() => document.body.classList.add('qjo-keyboard-open'));
  await page.waitForTimeout(100);
  ok(!(await shown()), 'iOS: with the keyboard marked open, Flash and Tools are hidden');
  await page.evaluate(() => document.body.classList.remove('qjo-keyboard-open'));
  // Android with interactive-widget=resizes-content: the whole layout shrinks.
  await page.tap('#input');
  await page.waitForTimeout(300);
  ok(await shown(), 'control: focus alone (a hardware keyboard, no screen shrinking) leaves them on screen');
  await page.setViewportSize({ width: PHONE.viewport.width, height: PHONE.viewport.height - 291 });
  await page.waitForTimeout(500);
  ok(!(await shown()), 'Android: with the screen shrunk under the keyboard, Flash and Tools are hidden');
  await page.evaluate(() => document.activeElement.blur());
  await page.setViewportSize(PHONE.viewport);
  await page.waitForTimeout(500);
  ok(await shown(), 'keyboard closed again: they come back');
  await ctx.close();
}

// ── 9. The scroll-to-bottom button sits inside the screen ───────────────────
async function scrollButton(browser, lang) {
  const { ctx, page } = await open(browser, { lang });
  await ask(page, lang === 'ar' ? 'كيف يعمل البحث الثنائي؟' : 'How does binary search work?');
  await page.evaluate(() => { document.getElementById('messages').scrollTop = 0; });
  await page.waitForTimeout(600);
  const b = await page.$eval('#scrollBottomBtn', (e) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { shown: e.classList.contains('show') && Number(getComputedStyle(e).opacity) > 0.9, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), vw: window.innerWidth, reachable: Boolean(hit && (hit === e || e.contains(hit))) };
  });
  ok(b.shown && b.reachable, `${lang}: control — scrolled up, the button is showing and takes a tap`, b);
  const gap = lang === 'ar' ? b.left : b.vw - b.right;
  ok(b.left >= 0 && b.right <= b.vw && gap >= 10 && gap <= 18, `${lang}: it sits whole on the screen, ${gap}px from the end edge (${b.left}..${b.right} of ${b.vw})`, b);
  await ctx.close();
}

// ── 10. Any tap outside closes the Flash and Tools menus ────────────────────
async function menusClose(browser) {
  const { ctx, page } = await open(browser);
  await ask(page, 'How does binary search work?');
  // Answer the quiz: its options become disabled buttons.
  await page.click('#messages .msg.assistant:last-of-type .quiz-option-btn >> text=Insulin');
  await page.evaluate(() => document.querySelector('#messages .msg.assistant:last-of-type .quiz-option-btn').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const target = await page.$eval('#messages .msg.assistant:last-of-type .quiz-option-btn', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: e.disabled }; });
  for (const [button, menu] of [['#modeToggle', '#modeMenu'], ['#composerToggles .qjo-tools-btn', '#composerToggles .qjo-tools-menu:not(#modeMenu)']]) {
    const isOpen = () => page.$eval(menu, (m) => !m.hidden);
    await page.tap(button);
    await page.waitForTimeout(250);
    ok(await isOpen(), `control: ${button} opens its menu`);
    const hit = await page.evaluate(({ x, y }) => { const h = document.elementFromPoint(x, y); return h ? (h.closest('button') || h).disabled === true : false; }, target);
    ok(target.disabled && hit, 'control: the spot tapped is a disabled button, not covered by the menu', target);
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForTimeout(250);
    ok(!(await isOpen()), `a tap on a disabled button outside closes ${menu}`);
    // Control: an ordinary tap outside closed it before this change and still does.
    await page.tap(button);
    await page.waitForTimeout(250);
    await page.touchscreen.tap(195, 120);
    await page.waitForTimeout(250);
    ok(!(await isOpen()), `control: a tap on the conversation closes ${menu} too`);
  }
  await ctx.close();
}

// ── 2. Following an answer as it is written ─────────────────────────────────
const FETCH_STUB = `
(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/chat')) return realFetch(input, init);
    const encoder = new TextEncoder();
    let controller;
    const body = new ReadableStream({ start(c) { controller = c; } });
    let at = 0;
    for (const [delay, text] of (window.__plan || [])) {
      at += delay;
      setTimeout(() => { try { text === null ? controller.close() : controller.enqueue(encoder.encode(text)); } catch (_) {} }, at);
    }
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  };
})();`;
function streamPlan() {
  let text = '';
  for (let i = 1; i <= 24; i++) {
    if (i % 4 === 0) {
      text += '```js\n' + Array.from({ length: 10 }, (_, k) => `const value${k} = compute(${k}, ${i});`).join('\n') + '\n```\n\n';
      text += '| Step | Value | Note |\n|---|---|---|\n' + Array.from({ length: 5 }, (_, k) => `| ${k} | ${k * i} | row ${k} of the table |`).join('\n') + '\n\n';
    }
    text += `Paragraph ${i}: ` + 'words to read in this answer, at the pace a model writes. '.repeat(3) + '\n\n';
  }
  text += 'The very last line.';
  // About 1,000 characters a second, in 40-character pieces: Groq's pace.
  const plan = text.match(/[\s\S]{1,40}/g).map((piece) => [40, frame('chunk', { text: piece })]);
  return plan.concat([[100, frame('done', {})], [50, null]]);
}

// how the reader goes back: '' (they do not), 'finger' on a phone, 'wheel' on a desktop.
async function follow(browser, how) {
  const readerScrolls = Boolean(how);
  const { ctx, page, errors } = await open(browser, { reply: null, desktop: how === 'wheel' });
  await page.addInitScript(FETCH_STUB);
  await page.addInitScript(`window.__plan = ${JSON.stringify(streamPlan())};`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await page.fill('#input', 'Write it all out');
  await page.click('#sendBtn');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const gap = () => page.evaluate(() => { const m = document.getElementById('messages'); return Math.round(m.scrollHeight - m.clientHeight - m.scrollTop); });
  let anchor = null;
  if (readerScrolls) {
    // Once two code blocks are on screen, the reader goes back up.
    await page.waitForFunction(() => document.querySelectorAll('#messages .msg.assistant:last-of-type pre').length >= 2, null, { timeout: 20000 });
    let before;
    if (how === 'wheel') {
      await page.mouse.move(640, 400);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(300);
      before = await page.$eval('#messages', (m) => m.scrollTop);
      for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, -150); await page.waitForTimeout(60); }
    } else {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 200 }] });
    // Past the touch slop (about 15px), where a move becomes a scroll.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 240 }] });
    await page.waitForTimeout(100);
    // From here the finger is the reader's: what it moves is measured.
    before = await page.$eval('#messages', (m) => m.scrollTop);
    for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 240 + 30 * k }] });
    // The finger rests before it lifts, so the conversation does not fling on.
    for (let k = 0; k < 4; k++) { await page.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 540 }] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    // Until the conversation has come to rest.
    let still = -1;
    for (let k = 0; k < 20; k++) { await page.waitForTimeout(150); const top = await page.$eval('#messages', (m) => m.scrollTop); if (top === still) break; still = top; }
    anchor = await page.evaluate((before) => {
      const m = document.getElementById('messages');
      const p = [...m.querySelectorAll('.msg.assistant:last-of-type p')].find((e) => { const r = e.getBoundingClientRect(); return r.top > 100 && r.top < window.innerHeight - 150; });
      if (!p) return null;
      // By its words: the finished answer is drawn again, in new elements.
      window.__anchorText = p.textContent.slice(0, 14);
      return { moved: before - m.scrollTop, top: Math.round(p.getBoundingClientRect().top), text: p.textContent.slice(0, 30) };
    }, before);
    ok(anchor && anchor.moved > 100, `control: the ${how} moved the conversation back (${anchor && anchor.moved}px)`, anchor);
  }
  const gaps = [];
  const tops = [];
  for (let t = 0; t < 40; t++) {
    const done = await page.evaluate(() => /The very last line\./.test(([...document.querySelectorAll('#messages .msg.assistant')].pop() || {}).innerText || '') && !document.getElementById('sendBtn').classList.contains('is-stop'));
    gaps.push(await gap());
    if (anchor) tops.push(await page.evaluate(() => { const p = [...document.querySelectorAll('#messages .msg.assistant:last-of-type p')].find((e) => e.textContent.startsWith(window.__anchorText)); return p ? Math.round(p.getBoundingClientRect().top) : null; }));
    if (done) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  const end = await page.evaluate(() => {
    const m = document.getElementById('messages');
    const ans = [...document.querySelectorAll('#messages .msg.assistant')].pop();
    return { gap: Math.round(m.scrollHeight - m.clientHeight - m.scrollTop), code: ans.querySelectorAll('pre').length, tables: ans.querySelectorAll('table').length, anchorTop: (() => { const p = window.__anchorText && [...ans.querySelectorAll('p')].find((e) => e.textContent.startsWith(window.__anchorText)); return p ? Math.round(p.getBoundingClientRect().top) : null; })(), button: document.getElementById('scrollBottomBtn').classList.contains('show') };
  });
  if (!readerScrolls) {
    ok(end.code >= 6 && end.tables >= 6, `control: the answer streamed ${end.code} code blocks and ${end.tables} tables`, end);
    ok(end.gap <= 60 && !end.button, `an answer with code and tables is followed to its end (${end.gap}px from the bottom; gaps on the way ${gaps.join(',')})`, { end, gaps });
  } else {
    ok(end.gap > 300 && anchor && Math.abs(end.anchorTop - anchor.top) <= 40, `${how}: a reader who scrolled back is left where they are (the paragraph they read moved ${end.anchorTop - (anchor && anchor.top)}px; ${end.gap}px above the end)`, { end, anchor, tops });
    ok(end.button, 'and the scroll-to-bottom button offers the way back', end);
  }
  ok(errors.length === 0, 'no JS errors while streaming', errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    // Each scenario on its own: one that stops early is a failure, named, and the rest still run.
    const scenarios = [['edit', () => editTap(browser)], ['bottom en', () => bottomOfAnswer(browser, 'en')], ['bottom ar', () => bottomOfAnswer(browser, 'ar')],
      ['composer dark', () => composerDark(browser)], ['retry', () => retryTarget(browser)], ['keyboard', () => keyboard(browser)], ['scroll button en', () => scrollButton(browser, 'en')],
      ['scroll button ar', () => scrollButton(browser, 'ar')], ['menus', () => menusClose(browser)], ['follow', () => follow(browser, '')],
      ['scrolled back by finger', () => follow(browser, 'finger')], ['scrolled back by wheel', () => follow(browser, 'wheel')]];
    // `node phone-ux.test.js follow` runs the scenarios whose names hold a word given.
    const only = process.argv.slice(2);
    for (const [name, run] of scenarios.filter(([n]) => !only.length || only.some((w) => n.includes(w)))) {
      await run().catch((e) => ok(false, `${name}: the scenario stopped early — ${String(e.message).split('\n')[0]}`));
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });

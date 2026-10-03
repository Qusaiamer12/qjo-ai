// Math figures in an answer, through the real page, the real Plotly (served
// from this package at the address the page asks for, by the hash the page
// pins) and real WebGL.
//
// What is checked is what a person sees: pixels of the colour a solid was
// given (against a figure without that colour), a figure that turns when it
// is dragged (against one that is not), the PNG that downloads, the words in
// the card against what they sit on, and on a phone a page that still scrolls
// past a figure until the figure is tapped.
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { launchBrowser, BASE_URL, repoFile } = require('./harness');
const { measure } = require('./contrast');

const PLOTLY_FILE = require.resolve('plotly.js-gl3d-dist-min/plotly-gl3d.min.js');
const PLOTLY_VERSION = require('plotly.js-gl3d-dist-min/package.json').version;
const PLOTLY_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/plotly\.js-gl3d-dist-min@[^/]+\/plotly-gl3d\.min\.js$/;
const PLOTLY_BYTES = fs.readFileSync(PLOTLY_FILE);
const CHART_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@/;
const { CATALOG } = require('../../public/domain/i18n.js');
const AR = CATALOG.ar;

const F = '```';
const block = (spec) => `${F}mathplot\n${JSON.stringify(spec)}\n${F}`;
const FIG_2D = { title: 'منحنى الدالة', plots: [{ type: 'function', y: 'x^2 - 3x + 2', x: [-1, 4], name: 'f' }, { type: 'points', points: [[1, 0], [2, 0]], labels: ['x=1', 'x=2'] }] };
const FIG_RED = { title: 'كرة حمراء', plots: [{ type: 'sphere', radius: 1.5, color: '#ff0000', name: 'كرة' }, { type: 'cone', center: [3, 0, -1], radius: 1, height: 2, color: '#0000ff', name: 'مخروط' }] };
const FIG_GREEN = { title: 'Waves', plots: [{ type: 'surface', z: 'sin(x)*cos(y)', x: [-3, 3], y: [-3, 3], color: '#00aa00' }] };
const FIG_BAD = { plots: [{ type: 'function', y: 'foo(x) + 1' }] };
const ANSWER = ['هاي الرسومات:', block(FIG_2D), block(FIG_RED), block(FIG_GREEN), block(FIG_BAD), 'تمام.'].join('\n\n');

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond && detail !== undefined) console.log('   ', JSON.stringify(detail).slice(0, 400));
};

/** A page that answers with whatever `state.answer` holds, and serves Plotly as told. */
async function open(browser, options = {}, plotly = {}) {
  const page = await browser.newPage(options);
  const state = { answer: 'Hello.', plotlyRequests: 0, errors: [] };
  page.on('pageerror', (e) => state.errors.push(e.message));
  await page.route(PLOTLY_URL, (route) => {
    state.plotlyRequests++;
    state.plotlyUrl = route.request().url();
    if (plotly.abort) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: plotly.bytes || PLOTLY_BYTES });
  });
  await page.route('**/api/chat', (route) => {
    try { state.body = route.request().postDataJSON(); } catch (_) { state.body = null; }
    return route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `event: chunk\ndata: ${JSON.stringify({ text: state.answer })}\n\nevent: done\ndata: {}\n\n` });
  });
  if (options.dark) await page.addInitScript(() => { try { localStorage.setItem('qjo_theme', 'dark'); } catch (_) { /* blocked */ } });
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await page.waitForFunction(() => window.QjoUI && window.QjoUI.createMathPlots && document.querySelector('#sendBtn'), null, { timeout: 15000 });
  return { page, state };
}

async function send(page, state, answer, text = 'ارسملي') {
  state.answer = answer;
  const before = await page.$$eval('.msg.assistant', (els) => els.length);
  await page.fill('#input', text);
  await page.click('#sendBtn');
  await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant').length > n, before, { timeout: 10000 });
  await page.waitForTimeout(600);
}

const card = (page, title) => page.locator('.math-plot-card', { has: page.locator('.math-plot-title', { hasText: title }) }).last();
async function drawn(page, title) {
  const c = card(page, title);
  await c.scrollIntoViewIfNeeded();
  await page.waitForFunction((t) => [...document.querySelectorAll('.math-plot-card')].some((el) => el.querySelector('.math-plot-title')?.textContent === t && el.dataset.drawn === '1'), title, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return c;
}

/** What a screenshot of an element shows: share of strongly red, green, changed pixels. */
async function pixels(page, png, compareTo) {
  return page.evaluate(async ([a, b]) => {
    const load = (b64) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = 'data:image/png;base64,' + b64; });
    const read = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height); };
    const one = read(await load(a));
    const two = b ? read(await load(b)) : null;
    let red = 0, green = 0, changed = 0;
    const n = one.width * one.height;
    for (let i = 0; i < one.data.length; i += 4) {
      const [r, g, bl] = [one.data[i], one.data[i + 1], one.data[i + 2]];
      if (r > 150 && g < 70 && bl < 70) red++;
      if (g > 90 && r < 80 && bl < 80) green++;
      if (two && two.width === one.width && (Math.abs(r - two.data[i]) + Math.abs(g - two.data[i + 1]) + Math.abs(bl - two.data[i + 2]) > 40)) changed++;
    }
    return { width: one.width, height: one.height, red: red / n, green: green / n, changed: changed / n };
  }, [png.toString('base64'), compareTo ? compareTo.toString('base64') : null]);
}

async function readable(p, label) {
  const rows = [];
  for (const handle of await p.$$('.math-plot-card')) {
    await handle.evaluate((el) => { el.dataset.measure = '1'; });
    rows.push(...(await p.evaluate(measure, '.math-plot-card[data-measure="1"]')) || []);
    await handle.evaluate((el) => { delete el.dataset.measure; });
  }
  const low = rows.filter((r) => r.unmeasurable || r.ratio < r.need);
  const labels = await p.evaluate(() => [...document.querySelectorAll('.math-plot-card[data-drawn="1"]')].map((c) => {
    const area = /** @type {any} */ (c.querySelector('.math-plot-area'));
    return { font: area._fullLayout.font.color, bg: getComputedStyle(c).backgroundColor };
  }));
  const lum = (hex) => { const v = hex.startsWith('#') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : hex.match(/\d+/g).slice(0, 3).map(Number); const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]); };
  const ratios = labels.map((l) => { const [a, b] = [lum(l.font), lum(l.bg)].sort((x, y) => y - x); return +((a + 0.05) / (b + 0.05)).toFixed(2); });
  ok(rows.length >= 8 && !low.length && ratios.length && Math.min(...ratios) >= 4.5, `${label}: every word in the cards can be read (${rows.length} measured; Plotly's labels ${Math.min(...ratios)}:1 or more)`, { low, ratios });
}

// A desktop, light then dark: drawn, turned, saved, said, read.
async function desktop(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 900 } });
  await send(page, state, 'Just words, no figure.', 'مرحبا');
  ok(state.plotlyRequests === 0, `the plotting library is not fetched for an answer without a figure (${state.plotlyRequests} requests)`);

  // What the page sends for a figure: "دالة" is a function in code too, and the
  // page gave it code's answer room and its coding capsule.
  const sent = () => ({ room: state.body && state.body.max_tokens, capsule: JSON.stringify((state.body && state.body.messages) || []).includes('Coding capsule') });
  await send(page, state, 'Sure.', 'اكتبلي كود جافاسكربت يرتب مصفوفة');
  const code = sent();
  await send(page, state, 'Sure.', 'ارسملي منحنى الدالة y = x^2 - 3x + 2 بدون كود');
  const figureAsk = sent();
  ok(code.capsule && code.room === 4200 && !figureAsk.capsule && figureAsk.room === 2000, `a figure is asked for without the coding capsule or code's answer room (${JSON.stringify(figureAsk)}; code: ${JSON.stringify(code)})`, { code, figureAsk });

  await send(page, state, ANSWER);
  const source = repoFile('public/ui/mathPlot.js');
  const pinned = { url: /src: '([^']+)'/.exec(source)[1], integrity: /integrity: '([^']+)'/.exec(source)[1] };
  const hash = 'sha384-' + crypto.createHash('sha384').update(PLOTLY_BYTES).digest('base64');
  ok(pinned.url.includes(`@${PLOTLY_VERSION}/`) && pinned.integrity === hash, `the page pins the Plotly this suite serves: ${PLOTLY_VERSION}, by its SHA-384`, pinned);

  const flat = await drawn(page, FIG_2D.title);
  const line = await flat.evaluate((el) => {
    const path = el.querySelector('.scatterlayer .js-line');
    return { d: path ? path.getAttribute('d').length : 0, legend: [...el.querySelectorAll('.legendtext')].map((t) => t.textContent) };
  });
  ok(line.d > 200 && line.legend.includes('f'), `a function is drawn as a line with its name in the legend (path of ${line.d} characters, legend ${line.legend})`, line);
  ok(state.plotlyRequests === 1, `one answer with four figures fetches the library once (${state.plotlyRequests})`);

  const red = await drawn(page, FIG_RED.title);
  const green = await drawn(page, FIG_GREEN.title);
  const redShot = await red.locator('.math-plot-area').screenshot();
  const greenShot = await green.locator('.math-plot-area').screenshot();
  const redPx = await pixels(page, redShot);
  const greenPx = await pixels(page, greenShot);
  ok(redPx.red > 0.015 && greenPx.red < 0.002, `WebGL draws the solid in its colour: ${(redPx.red * 100).toFixed(1)}% red where a red sphere is, ${(greenPx.red * 100).toFixed(2)}% in a green surface (control)`, { redPx, greenPx });
  ok(greenPx.green > 0.02, `and the green surface in green (${(greenPx.green * 100).toFixed(1)}%)`, greenPx);

  // Turning it: a drag changes what is drawn; no drag, nothing changes.
  const again = await red.locator('.math-plot-area').screenshot();
  const still = await pixels(page, redShot, again);
  const box = await red.locator('.math-plot-area').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(box.x + box.width / 2 + k * 14, box.y + box.height / 2 + k * 3);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const turned = await pixels(page, redShot, await red.locator('.math-plot-area').screenshot());
  ok(turned.changed > 0.04 && still.changed < 0.005, `dragging turns the figure: ${(turned.changed * 100).toFixed(1)}% of it changed, ${(still.changed * 100).toFixed(2)}% without a drag (control)`, { turned, still });

  // The PNG is the figure.
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), red.locator('.math-plot-png').click()]);
  const file = fs.readFileSync(await download.path());
  const signature = file.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const png = signature ? await pixels(page, file) : {};
  ok(signature && png.width === 1200 && png.height === 900 && png.red > 0.01, `PNG downloads a 1200×900 image of the figure, its red sphere in it (${png.width}×${png.height}, ${((png.red || 0) * 100).toFixed(1)}% red)`, png);
  ok(download.suggestedFilename() === `${FIG_RED.title}.png`, `the file is named for the figure (${download.suggestedFilename()})`);

  // A broken figure says what is wrong, by name, and shows what was written.
  const bad = page.locator('.math-plot-card.has-error').last();
  const said = await bad.evaluate((el) => ({ note: el.querySelector('.math-plot-note').textContent, source: el.querySelector('.math-plot-source pre')?.textContent || '', area: el.querySelectorAll('.math-plot-area').length, code: el.querySelector('.math-plot-note bdi')?.textContent }));
  ok(/foo/.test(said.note) && said.note.includes('اسم مش معروف') && said.source.includes('foo(x) + 1') && said.area === 0, `a figure that cannot be drawn names the problem in Arabic and shows what was written (${said.note})`, said);
  const ink = await bad.evaluate((el) => getComputedStyle(el.querySelector('.math-plot-note')).webkitTextFillColor);
  ok(ink === 'rgb(185, 28, 28)', `the card keeps its own ink inside an answer: the problem in red (${ink})`);
  ok(said.code === '"foo(x) + 1"', `what the figure wrote is kept whole, left to right, inside the Arabic sentence (${said.code})`, said);
  const hint = await red.locator('.math-plot-note').textContent();
  const desktopToolbar = await red.evaluate((el) => el.querySelectorAll('.modebar-btn').length);
  ok(hint === AR.mathPlotHint3d, `a 3D figure says how to turn it, in Arabic (${hint})`);

  // Every word in a card, against what it sits on; Plotly's own labels by the colour they were given.
  await readable(page, 'desktop, light');

  // The theme changes: drawn figures take its colours.
  await page.evaluate(() => document.getElementById('themeToggleBtn').click());
  await page.waitForTimeout(800);
  const themed = await page.evaluate(() => [...document.querySelectorAll('.math-plot-card[data-drawn="1"]')].map((c) => ({ theme: c.dataset.theme, font: /** @type {any} */ (c.querySelector('.math-plot-area'))._fullLayout.font.color })));
  ok(themed.length === 3 && themed.every((x) => x.theme === 'dark' && x.font === '#e2e8f0'), `switching to dark mode recolours every drawn figure (${JSON.stringify(themed)})`, themed);
  await readable(page, 'desktop, dark');
  ok(!state.errors.length, `no error on the page (${state.errors.slice(0, 2)})`, state.errors);
  await page.close();
  return desktopToolbar;
}

// A phone: a page that still scrolls past a figure until it is tapped.
async function phone(browser, desktopBar) {
  const phone = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const filler = Array.from({ length: 24 }, (_, i) => `سطر ${i + 1} من الكلام قبل الرسمة.`).join('\n\n');
  await send(phone.page, phone.state, [filler, block(FIG_RED), filler, block(FIG_BAD)].join('\n\n'));
  const p = phone.page;
  const pc = await drawn(p, FIG_RED.title);
  const pill = await pc.locator('.math-plot-lock').textContent().catch(() => null);
  const toolbar = await pc.evaluate((el) => el.querySelectorAll('.modebar-btn').length);
  ok(pill === AR.mathPlotTapToMove && toolbar === 0 && desktopBar > 0, `on a phone the figure waits behind "${pill}", without a toolbar over its legend (${toolbar} buttons; ${desktopBar} on a desktop)`, { pill, toolbar, desktopBar });
  await readable(p, 'phone, light, with the pill');
  // A phone's answer bubble hands its text colour down to everything in it.
  const phoneInk = await p.evaluate(() => getComputedStyle(document.querySelector('.math-plot-card.has-error .math-plot-note')).webkitTextFillColor);
  ok(phoneInk === 'rgb(185, 28, 28)', `on a phone too the card keeps its own ink: the problem in red (${phoneInk})`);

  const cdp = await p.context().newCDPSession(p);
  const scrollTop = () => p.evaluate(() => document.getElementById('messages').scrollTop);
  const swipe = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y + 100 }] });
    for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 100 - k * 22 }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(700);
  };
  const centre = async () => { await pc.evaluate((el) => el.scrollIntoView({ block: 'center' })); await p.waitForTimeout(500); const b = await pc.locator('.math-plot-area').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 - 60 }; };
  let at = await centre();
  let before = await scrollTop();
  await swipe(at.x, at.y);
  const lockedScroll = Math.abs((await scrollTop()) - before);
  at = await centre(); // the swipe moved it
  await p.touchscreen.tap(at.x, at.y);
  await p.waitForTimeout(400);
  const unlocked = (await pc.locator('.math-plot-lock').count()) === 0;
  at = await centre();
  before = await scrollTop();
  await swipe(at.x, at.y);
  const freeScroll = Math.abs((await scrollTop()) - before);
  const text = await p.evaluate(() => { const el = [...document.querySelectorAll('.msg.assistant p')].find((x) => /سطر 3 /.test(x.textContent)); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + 60, y: r.y }; });
  await p.waitForTimeout(400);
  before = await scrollTop();
  await swipe(text.x, text.y);
  const textScroll = Math.abs((await scrollTop()) - before);
  ok(lockedScroll > 100 && unlocked && freeScroll < 5 && textScroll > 100, `a swipe over a waiting figure scrolls the page (${lockedScroll}px, as over text: ${textScroll}px); tapped, the figure takes the swipe (${freeScroll}px)`, { lockedScroll, unlocked, freeScroll, textScroll });
  await pc.evaluate((el) => el.closest('#messages').scrollTo(0, 0));
  await p.waitForTimeout(800);
  ok((await pc.locator('.math-plot-lock').count()) === 1, 'scrolled away, it waits again');
  await p.close();
}

// When the library does not come, or comes and cannot draw.
async function withoutLibrary(browser) {
  for (const [label, plotly] of [['cannot be fetched', { abort: true }], ['is not the pinned file', { bytes: Buffer.concat([PLOTLY_BYTES, Buffer.from('\n// changed\n')]) }]]) {
    const broken = await open(browser, { viewport: { width: 1280, height: 900 } }, plotly);
    await send(broken.page, broken.state, block(FIG_2D));
    await broken.page.waitForFunction(() => document.querySelector('.math-plot-card.has-error'), null, { timeout: 10000 }).catch(() => {});
    const out = await broken.page.evaluate(() => ({ note: document.querySelector('.math-plot-note')?.textContent, plotly: typeof window.Plotly }));
    ok(out.note === AR.mathPlotFailed.replace('{error}', AR.libraryUnavailable) && out.plotly === 'undefined', `when the library ${label}, the figure says so instead of loading forever (${out.note})`, out);
    await broken.page.close();
  }

  // The library came and could not draw: that is not the connection's fault.
  {
    const stuck = await open(browser, { viewport: { width: 1280, height: 900 } });
    await stuck.page.addInitScript(() => {
      let held;
      Object.defineProperty(window, 'Plotly', { configurable: true, get: () => held, set: (v) => { v.newPlot = () => Promise.reject(new Error('WebGL context lost')); held = v; } });
    });
    await stuck.page.reload({ waitUntil: 'domcontentloaded' });
    await stuck.page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    await stuck.page.waitForFunction(() => document.querySelector('#sendBtn'), null, { timeout: 15000 });
    await send(stuck.page, stuck.state, block(FIG_2D));
    await stuck.page.waitForFunction(() => document.querySelector('.math-plot-card.has-error'), null, { timeout: 10000 }).catch(() => {});
    const said = await stuck.page.evaluate(() => ({ note: document.querySelector('.math-plot-note')?.textContent || '', source: Boolean(document.querySelector('.math-plot-source')) }));
    ok(said.note.includes('WebGL context lost') && !said.note.includes(AR.libraryUnavailable) && said.source, `a library that loaded and could not draw is said as that, not as the connection (${said.note})`, said);
    await stuck.page.close();
  }
}

// Many 3D figures: WebGL given back by the ones far out of view.
async function manyFigures(browser) {
  const many = await open(browser, { viewport: { width: 1280, height: 900 } });
  const spheres = Array.from({ length: 9 }, (_, i) => block({ title: `Sphere ${i + 1}`, plots: [{ type: 'sphere', radius: 1 + i / 10 }] }));
  await send(many.page, many.state, spheres.join('\n\nبين الرسمات.\n\n'));
  for (let i = 1; i <= 9; i++) await drawn(many.page, `Sphere ${i}`);
  const live = await many.page.evaluate(() => [...document.querySelectorAll('.math-plot-card')].map((c) => ({ canvas: c.querySelectorAll('canvas').length > 0, note: c.querySelector('.math-plot-note').textContent })));
  ok(live.filter((c) => c.canvas).length <= 7 && !live[0].canvas && live[0].note === AR.mathPlotRedraw && live[8].canvas, `nine 3D figures keep at most seven WebGL canvases: the first, far above, gave its back and says it will be redrawn (${live.filter((c) => c.canvas).length} live)`, live);
  await drawn(many.page, 'Sphere 1');
  ok(await card(many.page, 'Sphere 1').evaluate((el) => el.querySelectorAll('canvas').length > 0 && el.dataset.drawn === '1'), 'scrolled back to, it is drawn again');
  await many.page.close();
}

(async () => {
  const browser = await launchBrowser();

  // Refuse to report on 3D without WebGL: every pixel check below would be
  // measuring an error message.
  {
    const probe = await browser.newPage();
    const gl = await probe.evaluate(() => { const c = document.createElement('canvas'); return Boolean(c.getContext('webgl')); });
    await probe.close();
    if (!gl) { console.log('❌ this Chromium has no WebGL — refusing to report on 3D figures'); process.exit(1); }
  }

  // The figure takes a while to fail without its library: started first, read last.
  const chartless = await open(browser);
  await chartless.page.route(CHART_URL, (route) => route.abort('failed'));
  await chartless.page.reload({ waitUntil: 'domcontentloaded' });
  await chartless.page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await chartless.page.waitForFunction(() => document.querySelector('#sendBtn'), null, { timeout: 15000 });
  await send(chartless.page, chartless.state, `${F}chart\n{"type":"bar","data":{"labels":["a"],"datasets":[{"label":"x","data":[1]}]}}\n${F}`, 'chart');
  const chartWaitStarted = Date.now();

  const desktopBar = await desktop(browser);
  await phone(browser, desktopBar);
  await withoutLibrary(browser);
  await manyFigures(browser);

  // ── A chart whose library never comes says so, not a blank box forever ──
  const waited = Date.now() - chartWaitStarted;
  if (waited < 21500) await chartless.page.waitForTimeout(21500 - waited);
  const chartNote = await chartless.page.evaluate(() => { const n = document.querySelector('.interactive-chart-card .chart-error-note'); return n && !n.classList.contains('hidden') ? n.textContent : null; });
  ok(chartNote === AR.chartRenderFailed.replace('{error}', AR.libraryUnavailable), `a chart whose library never loads says so after a wait (${chartNote})`);
  await chartless.page.close();

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });

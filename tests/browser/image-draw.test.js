// Pictures in an answer, through the real page, the real server (its CSP
// included) and a stand-in for the image service: a route that serves a PNG
// and records what was asked of it.
//
// What is checked is what a person gets: the address that was asked for (the
// English description, the size, a seed), the wait said while it lasts, the
// colour of the pixels that arrive (a different seed is a different picture),
// the file that downloads, and what is shown when the service says no, or
// says nothing for 25 seconds: the block's own drawing, or a plain statement.
// Never a broken image, and never anything a block's SVG could run.
//
// Each probe is shown to be able to fail: requests are seen by a control that
// asks for an address the page never would; "nothing ran" is read against a
// run of the same attack through a route that does run scripts.
'use strict';

const zlib = require('zlib');
const { launchBrowser, BASE_URL } = require('./harness');
const { measure } = require('./contrast');
const { CATALOG } = require('../../public/domain/i18n.js');

const AR = CATALOG.ar;
const EN = CATALOG.en;
const F = '```';
const block = (spec) => `${F}image\n${JSON.stringify(spec)}\n${F}`;
const SERVICE = /^https:\/\/image\.pollinations\.ai\//;
const CORS = { 'access-control-allow-origin': '*' };

// ── A PNG of one colour, made here: what the stand-in serves ───────────────
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}
function png([r, g, b], w = 64, h = 48) {
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
/** The picture a seed gets from the stand-in: another seed, another colour. */
const colourOf = (seed) => [40 + ((seed * 53) % 170), 40 + ((seed * 97) % 170), 40 + ((seed * 29) % 170)];
const seedOf = (url) => Number(new URL(url).searchParams.get('seed'));
const describes = (url) => decodeURIComponent(new URL(url).pathname.slice('/prompt/'.length));

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond && detail !== undefined) console.log('   ', JSON.stringify(detail).slice(0, 500));
};

/**
 * A page that answers with whatever `state.answer` holds, and an image
 * service that does what `state.mode` says: 'png' serves a picture, 'fail'
 * refuses (503, as the real one does when it is at its limit), 'hang'
 * keeps the request without answering until `release`.
 */
async function open(browser, options = {}) {
  const page = await browser.newPage(options);
  const state = { answer: 'Hello.', mode: 'png', requests: [], held: [], external: [], errors: [], failFetch: false };
  page.on('pageerror', (e) => state.errors.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith(BASE_URL) && !SERVICE.test(r.url()) && !/^(?:data|blob|about):/.test(r.url())) state.external.push(r.url()); });
  // On the context, so that a tab the page opens is served (and recorded) too.
  await page.context().route(SERVICE, async (route) => {
    const request = route.request();
    const headers = await request.allHeaders();
    state.requests.push({ url: request.url(), referer: headers.referer, type: request.resourceType() });
    if (state.failFetch && request.resourceType() === 'fetch') return route.abort('failed');
    if (state.mode === 'fail') return route.fulfill({ status: 503, contentType: 'application/json', headers: CORS, body: '{"status":503,"success":false,"error":{"code":"SERVICE_UNAVAILABLE"}}' });
    if (state.mode === 'hang') { state.held.push(route); return undefined; }
    return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: png(colourOf(seedOf(request.url()))) });
  });
  await page.route('**/api/chat', (route) => {
    try { state.body = route.request().postDataJSON(); } catch (_) { state.body = null; }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: state.answer })}\n\nevent: done\ndata: {}\n\n` });
  });
  if (options.dark) await page.addInitScript(() => { try { localStorage.setItem('qjo_theme', 'dark'); } catch (_) { /* blocked */ } });
  if (options.clock) await page.clock.install();
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await page.waitForFunction(() => window.QjoUI && window.QjoUI.createImageBlocks && document.querySelector('#sendBtn'), null, { timeout: 15000 });
  return { page, state };
}

async function send(page, state, answer, text = 'ارسملي قطة على القمر') {
  state.answer = answer;
  const before = await page.$$eval('.msg.assistant', (els) => els.length);
  await page.fill('#input', text);
  await page.click('#sendBtn');
  await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant').length > n, before, { timeout: 10000 });
  await page.waitForTimeout(600);
}

const stateOf = (page, n = -1) => page.evaluate((i) => { const c = [...document.querySelectorAll('.qjo-image-card')]; return (c.at(i) || {}).dataset?.state || null; }, n);
const settle = (page, want, n = -1) => page.waitForFunction(([i, s]) => { const c = [...document.querySelectorAll('.qjo-image-card')]; return (c.at(i) || {}).dataset?.state === s; }, [n, want], { timeout: 15000 }).then(() => true, () => false);
const release = async (state, body) => { for (const route of state.held.splice(0)) await route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body }).catch(() => {}); };

/** The colour at the middle of an element, as a screenshot of it shows. */
async function centre(page, locator) {
  const shot = await locator.screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return [...x.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data].slice(0, 3);
  }, shot.toString('base64'));
}
const near = (a, b, tolerance = 8) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

const CAT = { prompt: 'a cat sitting on the moon, soft light', title: 'قطة على القمر', alt: 'قطة رمادية جالسة على سطح القمر', style: 'watercolor', width: 800, height: 600 };
const ANSWER = `هاي الصورة:\n\n${block(CAT)}\n\nبدك أغيّر شي؟`;

// ── The way it goes when the service answers ────────────────────────────────
async function served(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 900 } });
  await send(page, state, 'Just words.', 'مرحبا');
  ok(state.requests.length === 0, `an answer without a picture asks the service for nothing (${state.requests.length} requests)`);

  // Control: the probe sees what the page asks for. A request for the service from the page itself is recorded.
  await page.evaluate(() => { new Image().src = 'https://image.pollinations.ai/prompt/control?width=8&height=8&nologo=true&seed=1'; });
  await page.waitForTimeout(300);
  ok(state.requests.length === 1 && describes(state.requests[0].url) === 'control', 'control: the probe records a request to the service');
  await page.evaluate(() => { new Image().src = 'https://elsewhere.example/other.png'; });
  await page.waitForTimeout(300);
  ok(state.external.some((u) => u.includes('elsewhere.example')) && state.requests.length === 1, 'control: a request to another host is seen as external, and is not the service\'s');
  state.requests.length = 0;
  state.external.length = 0;

  // While it is on its way: the wait is said.
  state.mode = 'hang';
  await send(page, state, ANSWER);
  await page.waitForFunction((s) => document.querySelector('.qjo-image-card')?.dataset.state === s, 'loading', { timeout: 5000 });
  await page.waitForFunction(() => document.querySelectorAll('.qjo-image-card').length === 1);
  await page.waitForTimeout(400);
  const card = page.locator('.qjo-image-card').last();
  const waiting = await card.evaluate((el) => ({
    state: el.dataset.state, wait: el.querySelector('.qjo-image-wait')?.textContent, role: el.querySelector('.qjo-image-wait')?.getAttribute('role'),
    spinner: Boolean(el.querySelector('.qjo-image-spinner')), again: el.querySelector('.qjo-image-again').disabled, save: el.querySelector('.qjo-image-save').hidden, imgs: el.querySelectorAll('img').length,
    box: el.querySelector('.qjo-image-stage').getBoundingClientRect().toJSON()
  }));
  ok(waiting.state === 'loading' && waiting.wait === AR.imageLoading.replace('{seconds}', '25') && waiting.role === 'status' && waiting.spinner, `while the picture is on its way the card says so: "${waiting.wait}"`, waiting);
  ok(waiting.again && waiting.save && waiting.imgs === 0, 'while it waits: "another version" is held, there is nothing to download, and no image element to break', waiting);
  ok(waiting.box.height > 200 && Math.abs(waiting.box.width / waiting.box.height - 800 / 600) < 0.02, `the place of the picture is kept at the block's shape, 800×600 (${waiting.box.width.toFixed(0)}×${waiting.box.height.toFixed(0)})`, waiting.box);
  ok(state.requests.length === 1, `one request for one picture (${state.requests.length})`);

  // The address.
  const first = state.requests[0];
  const url = new URL(first.url);
  ok(url.origin === 'https://image.pollinations.ai' && describes(first.url) === 'a cat sitting on the moon, soft light, watercolor style', `the address carries the English description and the style (${describes(first.url)})`, first.url);
  ok(url.searchParams.get('width') === '800' && url.searchParams.get('height') === '600' && url.searchParams.get('nologo') === 'true' && Number.isInteger(seedOf(first.url)), `... the size, no logo, and a seed (${url.search})`, first.url);
  ok(!/[؀-ۿ]/.test(decodeURIComponent(first.url)), 'nothing of the Arabic title or caption left the page with it');
  ok(first.referer === undefined, `the page's own address is not sent with it (referer: ${first.referer})`);

  // It arrives.
  state.mode = 'png';
  await release(state, png(colourOf(seedOf(first.url))));
  ok(await settle(page, 'loaded'), 'the picture arrives and the card says loaded');
  const loaded = await card.evaluate((el) => {
    const img = el.querySelector('img');
    return { count: el.querySelectorAll('img').length, w: img.naturalWidth, h: img.naturalHeight, complete: img.complete, alt: img.alt, referrer: img.referrerPolicy, title: el.querySelector('.qjo-image-title').textContent,
      save: el.querySelector('.qjo-image-save').textContent, again: el.querySelector('.qjo-image-again').textContent, savehidden: el.querySelector('.qjo-image-save').hidden, againOff: el.querySelector('.qjo-image-again').disabled,
      privacy: el.querySelector('.qjo-image-privacy').textContent, status: el.querySelector('.qjo-image-status').textContent, wait: Boolean(el.querySelector('.qjo-image-wait')) };
  });
  ok(loaded.count === 1 && loaded.w === 64 && loaded.h === 48 && loaded.complete && !loaded.wait, `one real image, decoded (${loaded.w}×${loaded.h}), the wait gone`, loaded);
  ok(loaded.alt === CAT.alt && loaded.title === CAT.title && loaded.referrer === 'no-referrer', `its description for a screen reader and caption are the block's, in Arabic (${loaded.alt} / ${loaded.title})`, loaded);
  ok(loaded.save === AR.imageDownload && loaded.again === AR.imageAnother && !loaded.savehidden && !loaded.againOff, `the buttons are in Arabic and ready: "${loaded.save}", "${loaded.again}"`, loaded);
  ok(loaded.privacy === AR.imageExternalNote && loaded.status === '', `the card says the description is sent to an external service: "${loaded.privacy}"`, loaded);
  const seen = await centre(page, card.locator('img'));
  ok(near(seen, colourOf(seedOf(first.url))), `the pixels on the screen are the picture served for that seed (${seen} vs ${colourOf(seedOf(first.url))})`, seen);

  // Another version: a new seed, the same description, a different picture; held while it loads.
  const firstSeed = seedOf(first.url);
  await card.locator('.qjo-image-again').dblclick();
  ok(await settle(page, 'loaded'), 'another version arrives');
  ok(state.requests.length === 2, `a double click asks once (${state.requests.length} requests)`, state.requests.map((r) => r.url));
  const second = state.requests[1];
  ok(seedOf(second.url) !== firstSeed && describes(second.url) === describes(first.url) && new URL(second.url).searchParams.get('width') === '800', `"another version" changes the seed (${firstSeed} → ${seedOf(second.url)}) and nothing else`, [first.url, second.url]);
  const seenTwo = await centre(page, card.locator('img'));
  ok(near(seenTwo, colourOf(seedOf(second.url))) && !near(seenTwo, seen, 20), `... and the picture on the screen changed with it (${seen} → ${seenTwo})`, { seen, seenTwo });
  await card.locator('.qjo-image-again').click();
  ok(await settle(page, 'loaded') && state.requests.length === 3 && seedOf(state.requests[2].url) !== seedOf(second.url), 'and again: never the seed that is on the screen', state.requests.map((r) => seedOf(r.url)));

  // Download: the file, the picture that is shown.
  const shown = seedOf(state.requests[state.requests.length - 1].url);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), card.locator('.qjo-image-save').click()]);
  const bytes = await require('fs').promises.readFile(await download.path());
  ok(bytes.equals(png(colourOf(shown))), `Download saves the picture that is on the screen, byte for byte (${bytes.length} bytes, seed ${shown})`, { bytes: bytes.length });
  ok(download.suggestedFilename() === `qjo-${CAT.title}.png`, `... named for the caption (${download.suggestedFilename()})`);
  const fetched = state.requests[state.requests.length - 1];
  ok(fetched.type === 'fetch' && seedOf(fetched.url) === shown, `... by fetching that address (the server's CSP lets the page do it): ${fetched.type}`, fetched);

  // The browser will not hand the file over: the picture opens in a tab and the card says why.
  state.failFetch = true;
  const [tab] = await Promise.all([page.context().waitForEvent('page', { timeout: 10000 }), card.locator('.qjo-image-save').click()]);
  await tab.waitForTimeout(300);
  ok(SERVICE.test(tab.url()) && seedOf(tab.url()) === shown, `when it cannot be fetched, the picture opens in a tab instead (${tab.url().slice(0, 70)})`);
  await tab.close();
  const toast = await page.evaluate(() => document.body.innerText);
  ok(toast.includes(AR.imageDownloadFailed), 'and the page says so');
  state.failFetch = false;

  ok(!state.errors.length, `no error on the page (${state.errors.slice(0, 2)})`, state.errors);
  ok(!state.external.length, `nothing but the service was asked for anything (${state.external.slice(0, 3)})`, state.external);
  await page.close();
}

// ── When the service says no ────────────────────────────────────────────────
const APPLE_SVG = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#e11d48"/><circle cx="50" cy="50" r="30" fill="#e11d48"/></svg>';
async function refused(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 900 } });
  state.mode = 'fail';
  await send(page, state, [block({ prompt: 'a red apple on a wooden table', title: 'تفاحة', svg: APPLE_SVG }), block({ prompt: 'a lighthouse at dawn', title: 'منارة' })].join('\n\n'));
  ok(await settle(page, 'fallback', 0) && await settle(page, 'error', 1), 'a 503 from the service: the block with a drawing shows it, the block without one says what happened');
  const out = await page.evaluate(() => [...document.querySelectorAll('.qjo-image-card')].map((el) => ({
    state: el.dataset.state, imgs: [...el.querySelectorAll('img')].map((i) => ({ src: i.src.slice(0, 40), ok: i.complete && i.naturalWidth > 0 })), status: el.querySelector('.qjo-image-status').textContent,
    isError: el.querySelector('.qjo-image-status').classList.contains('is-error'), stageShown: getComputedStyle(el.querySelector('.qjo-image-stage')).display !== 'none',
    save: el.querySelector('.qjo-image-save').hidden, again: el.querySelector('.qjo-image-again').disabled, wait: Boolean(el.querySelector('.qjo-image-wait'))
  })));
  ok(out[0].imgs.length === 1 && out[0].imgs[0].src.startsWith('data:image/svg+xml') && out[0].imgs[0].ok && out[0].status === AR.imageFallbackNote && !out[0].wait, `the drawing is shown instead, and it is a real image, with the reason: "${out[0].status}"`, out[0]);
  ok(!out[0].save && !out[0].again, 'the drawing can be saved, and another version tried', out[0]);
  ok(out[1].save, 'with nothing drawn there is nothing to save', out[1]);
  ok(out[1].imgs.length === 0 && out[1].status === AR.imageFailed && out[1].isError && !out[1].stageShown && out[1].save && !out[1].again, `with no drawing, an honest message and no image at all: "${out[1].status}"`, out[1]);
  ok(await centre(page, page.locator('.qjo-image-card').nth(0).locator('img')).then((c) => near(c, [0xe1, 0x1d, 0x48])), 'the drawing on the screen is the block\'s (its red in the middle)');
  const brokenAnywhere = await page.evaluate(() => [...document.querySelectorAll('.msg.assistant img')].filter((i) => !(i.complete && i.naturalWidth > 0)).length);
  ok(brokenAnywhere === 0, `no broken image anywhere in the answer (${brokenAnywhere})`);

  // The fallback is a file too.
  const [svgFile] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('.qjo-image-card').nth(0).locator('.qjo-image-save').click()]);
  const text = await require('fs').promises.readFile(await svgFile.path(), 'utf8');
  ok(svgFile.suggestedFilename() === 'qjo-تفاحة.svg' && text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && text.includes('#e11d48'), `its download is the drawing as an .svg (${svgFile.suggestedFilename()})`, text.slice(0, 80));

  // "Another version" is also the way to try again; once the service is back it draws.
  state.mode = 'png';
  const before = state.requests.length;
  await page.locator('.qjo-image-card').nth(1).locator('.qjo-image-again').click();
  ok(await settle(page, 'loaded', 1), 'when the service is back, "another version" on the card that failed draws it');
  const recovered = await page.evaluate(() => { const el = document.querySelectorAll('.qjo-image-card')[1]; return { imgs: el.querySelectorAll('img').length, status: el.querySelector('.qjo-image-status').textContent, stage: getComputedStyle(el.querySelector('.qjo-image-stage')).display }; });
  ok(state.requests.length === before + 1 && recovered.imgs === 1 && recovered.status === '' && recovered.stage !== 'none', 'the message is gone and the picture is there', recovered);
  ok(!state.errors.length, `no error on the page (${state.errors.slice(0, 2)})`, state.errors);
  await page.close();
}

// ── When the service says nothing ───────────────────────────────────────────
async function silent(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 1700 }, clock: true });
  state.mode = 'hang';
  await send(page, state, [block({ prompt: 'a red apple on a wooden table', title: 'تفاحة', svg: APPLE_SVG }), block({ prompt: 'a lighthouse at dawn', title: 'منارة' })].join('\n\n'));
  await page.waitForFunction(() => document.querySelectorAll('.qjo-image-card[data-state="loading"]').length === 2, null, { timeout: 10000 });
  await page.clock.fastForward(24000);
  ok((await stateOf(page, 0)) === 'loading' && (await stateOf(page, 1)) === 'loading', 'at 24 seconds both are still waiting');
  await page.clock.fastForward(1500);
  ok(await settle(page, 'fallback', 0) && await settle(page, 'error', 1), 'by 25 seconds the one with a drawing shows it and the other says what happened');
  const texts = await page.evaluate(() => [...document.querySelectorAll('.qjo-image-card')].map((el) => el.querySelector('.qjo-image-status').textContent));
  ok(texts[0] === AR.imageFallbackNote && texts[1] === AR.imageFailed, 'with the same words as for a refusal', texts);
  // The picture that arrives after the card gave up is not put back under the message.
  await release(state, png([10, 200, 10]));
  await page.waitForTimeout(500);
  ok((await stateOf(page, 0)) === 'fallback' && (await stateOf(page, 1)) === 'error', 'a picture that arrives late does not replace what is shown');
  await page.close();
}

// ── What a block's SVG can do ───────────────────────────────────────────────
const ATTACK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="window.__pwned=\'root\'"><script>window.__pwned=\'script\'</script>'
  + '<rect width="100" height="100" fill="#e11d48" onclick="window.__pwned=\'click\'" style="background:url(https://evil.example/style.png)"/>'
  + '<foreignObject width="50" height="50"><iframe src="javascript:window.__pwned=\'frame\'"></iframe></foreignObject>'
  + '<image href="https://evil.example/image.png" width="10" height="10" onerror="window.__pwned=\'image\'"/>'
  + '<use href="https://evil.example/use.svg#x"/><a href="javascript:window.__pwned=\'link\'"><circle r="5" fill="url(https://evil.example/paint.svg#p)"/></a>'
  + '<animate attributeName="fill" onbegin="window.__pwned=\'animate\'"/><set attributeName="href" to="javascript:window.__pwned=\'set\'"/>'
  + '<text x="5" y="95" fill="#fff">&lt;script&gt;window.__pwned=\'text\'&lt;/script&gt;</text></svg>';
async function attack(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 900 } });
  state.mode = 'fail';
  const nasty = '<img src=x onerror="window.__pwned=\'title\'">';
  await send(page, state, block({ prompt: 'a red apple "><img src=x onerror="window.__pwned=\'prompt\'"> on a table', title: nasty, alt: nasty, svg: ATTACK }));
  ok(await settle(page, 'fallback'), 'a block whose SVG is an attack still gets its drawing shown (the harmless part of it)');
  await page.waitForTimeout(800);

  const probe = await page.evaluate(() => {
    const el = document.querySelector('.qjo-image-card');
    const img = el.querySelector('img');
    const svgText = decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1));
    const doc = new window.DOMParser().parseFromString(svgText, 'image/svg+xml');
    const all = [...doc.querySelectorAll('*')];
    return {
      pwned: window.__pwned, svgText, broken: Boolean(doc.querySelector('parsererror')), names: all.map((e) => e.localName),
      attrs: all.flatMap((e) => [...e.attributes].map((a) => [e.localName, a.name, a.value])),
      shown: img.complete && img.naturalWidth > 0, injected: document.querySelectorAll('img[src="x"]').length, title: el.querySelector('.qjo-image-title').textContent,
      imgs: el.querySelectorAll('img').length
    };
  });
  ok(probe.pwned === undefined, `nothing ran: window.__pwned is ${probe.pwned}`);
  ok(!probe.broken && probe.names[0] === 'svg' && probe.names.includes('rect') && probe.names.includes('text'), `the probe reads real output: a parsed drawing with its shapes (${probe.names.join(' ')})`, probe.svgText);
  const BAD = new Set(['script', 'foreignObject', 'iframe', 'image', 'use', 'a', 'animate', 'set', 'style']);
  ok(!probe.names.some((n) => BAD.has(n)), `in what the page drew, no script, frame, link, use, image or animation element (${probe.names.join(' ')})`);
  const bad = probe.attrs.filter(([, name, value]) => /^on/i.test(name) || /href|style/i.test(name) || (name !== 'xmlns' && /https?:|javascript:|data:|\/\//i.test(value)));
  ok(!bad.length, `... and no handler, link, style or address in any attribute (${JSON.stringify(bad)})`, bad);
  ok(probe.shown && probe.imgs === 1, 'what was drawn is a real image the browser decoded');
  ok(near(await centre(page, page.locator('.qjo-image-card img')), [0xe1, 0x1d, 0x48]), 'and it draws the harmless rectangle that was beside the attack');
  ok(probe.title === nasty && probe.injected === 0, `the caption and the description are text, not markup (title: ${probe.title})`);
  ok(!state.external.some((u) => /evil\.example/.test(u)), `no request left for the attacker's address (${state.external.filter((u) => /evil/.test(u))})`, state.external);
  ok(state.requests.length === 1 && describes(state.requests[0].url).includes('"><img src=x onerror="window.__pwned=\'prompt\'"> on a table'), 'the description went out as encoded text: quotes and brackets and all, in the address only', state.requests.map((r) => r.url));

  // Controls: the probes can see. Requests to an attacker's address are noticed...
  await page.evaluate(() => { new Image().src = 'https://evil.example/control.png'; });
  await page.waitForTimeout(300);
  ok(state.external.some((u) => u === 'https://evil.example/control.png'), 'control: a request to the attacker\'s address would have been recorded');
  // ... and the same attack, put into the page the way a careless renderer would, does run.
  await page.evaluate((raw) => {
    const holder = document.createElement('div');
    holder.id = 'careless';
    holder.append(document.createRange().createContextualFragment(raw));
    document.body.append(holder);
  }, ATTACK);
  await page.waitForTimeout(500);
  const ran = await page.evaluate(() => window.__pwned);
  ok(ran !== undefined, `control: the unsanitised attack set window.__pwned (${ran}), so "undefined" above means something`);
  await page.close();
}

// ── Blocks that are not pictures ────────────────────────────────────────────
async function notPictures(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 900 } });
  await send(page, state, [block({ prompt: 'قطة جالسة على القمر', title: 'قطة' }), `${F}image\n${F}`, `${F}image\n{"prompt": \n${F}`, block({ title: 'no description' }), block({ prompt: 'a calm sea at sunset', title: 'بحر' })].join('\n\n'));
  ok(await settle(page, 'loaded'), 'the one good block among them is drawn');
  const cards = await page.evaluate(() => [...document.querySelectorAll('.qjo-image-card')].map((el) => ({ error: el.classList.contains('has-error'), status: el.querySelector('.qjo-image-status')?.textContent, source: el.querySelector('.qjo-image-source pre')?.textContent, imgs: el.querySelectorAll('img').length, state: el.dataset.state || null })));
  const problem = (why) => AR.imageProblem.replace('{error}', why);
  ok(cards.length === 5 && cards[0].error && cards[0].status === problem(AR.imageWhyNotEnglish) && cards[0].imgs === 0, `a description in Arabic is not sent: the card says why, in Arabic ("${cards[0].status}")`, cards);
  ok(cards[1].status === problem(AR.imageWhyEmpty) && cards[2].status === problem(AR.imageWhyUnreadable) && cards[3].status === problem(AR.imageWhyNoPrompt), 'an empty block, an unreadable one and one with no description each say what is wrong', cards.map((c) => c.status));
  ok(cards[0].source.includes('قطة جالسة على القمر') && cards.slice(0, 4).every((c) => c.imgs === 0 && !c.state), 'the block as written is kept to read, and none of them has an image or a state to wait in', cards);
  ok(state.requests.length === 1 && describes(state.requests[0].url) === 'a calm sea at sunset', `only the good block reached the service (${state.requests.map((r) => describes(r.url))})`, state.requests);
  await page.close();
}

// ── A long chat: only what comes near is asked for ──────────────────────────
async function lazy(browser) {
  const { page, state } = await open(browser, { viewport: { width: 1280, height: 700 } });
  const filler = Array.from({ length: 50 }, (_, i) => `سطر ${i + 1} من الكلام بين الصور.`).join('\n\n');
  await send(page, state, [filler, block({ prompt: 'the first picture, a quiet harbour', title: 'الأولى' }), filler, block({ prompt: 'the second picture, a mountain pass', title: 'الثانية' }), filler].join('\n\n'));
  await page.waitForTimeout(1200);
  ok(state.requests.length < 2, `two pictures far apart: at most the one in view is asked for, not both (${state.requests.map((r) => describes(r.url))})`, state.requests.map((r) => r.url));
  const [pending] = await page.evaluate(() => [...document.querySelectorAll('.qjo-image-card')].filter((c) => !c.querySelector('img')).map((c) => c.querySelector('.qjo-image-title').textContent));
  ok(Boolean(pending), `... the other waits, without an image, for its turn (${pending})`);
  for (const n of [0, 1]) {
    await page.locator('.qjo-image-card').nth(n).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => document.querySelectorAll('.qjo-image-card[data-state="loaded"]').length === 2, null, { timeout: 8000 }).catch(() => {});
  ok(state.requests.length === 2 && new Set(state.requests.map((r) => describes(r.url))).size === 2, 'scrolled to, each is asked for, once', state.requests.map((r) => describes(r.url)));
  await page.close();
}

// ── Phone, dark, English: fits, reads, speaks ───────────────────────────────
async function readable(page, label, minimum) {
  const rows = [];
  for (const handle of await page.$$('.qjo-image-card')) {
    await handle.evaluate((el) => { el.dataset.measure = '1'; });
    rows.push(...(await page.evaluate(measure, '.qjo-image-card[data-measure="1"]')) || []);
    await handle.evaluate((el) => { delete el.dataset.measure; });
  }
  const low = rows.filter((r) => r.unmeasurable || r.ratio < r.need);
  ok(rows.length >= minimum && !low.length, `${label}: every word in the cards can be read (${rows.length} measured, lowest ${Math.min(...rows.filter((r) => r.ratio).map((r) => r.ratio))}:1)`, { low });
}

async function looks(browser) {
  for (const [label, options] of [['desktop, light', { viewport: { width: 1280, height: 900 } }], ['desktop, dark', { viewport: { width: 1280, height: 900 }, dark: true }],
    ['phone, light', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }], ['phone, dark', { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, dark: true }]]) {
    const { page, state } = await open(browser, options);
    state.mode = 'png';
    await send(page, state, [block(CAT), block({ prompt: 'a lighthouse at dawn', title: 'منارة' })].join('\n\n'));
    ok(await settle(page, 'loaded', 0) && await settle(page, 'loaded', 1), `${label}: both pictures arrive`);
    await readable(page, `${label}, drawn`, 8);
    state.mode = 'fail';
    await send(page, state, [block({ prompt: 'a red apple on a table', title: 'تفاحة', svg: APPLE_SVG }), block({ prompt: 'a lighthouse at dusk', title: 'منارة' }), block({ prompt: 'ظ' })].join('\n\n'), 'ارسملي تفاحة');
    ok(await settle(page, 'error', 3), `${label}: the refused picture says so`);
    await readable(page, `${label}, refused and in trouble`, 14);
    if (options.isMobile) {
      const fit = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        return [...document.querySelectorAll('.qjo-image-card')].map((c) => ({ right: box(c).right, left: box(c).left, buttons: [...c.querySelectorAll('button')].filter((b) => !b.hidden).map((b) => [box(b).left, box(b).right]) }))
          .concat([{ page: document.documentElement.scrollWidth - window.innerWidth }]);
      });
      const overflow = fit.filter((c) => c.page > 0 || (c.buttons || []).some(([l, r]) => l < c.left - 1 || r > c.right + 1));
      ok(!overflow.length, `${label}: no sideways scrolling, and every button inside its card`, overflow);
    }
    ok(!state.errors.length, `${label}: no error on the page (${state.errors.slice(0, 2)})`, state.errors);
    await page.close();
  }

  // English is the primary language: the same card in English, no Arabic left in it.
  const en = await open(browser, { viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  await send(en.page, en.state, `Here you go:\n\n${block({ prompt: 'a flat vector logo for a bakery, wheat and a rising sun', title: 'Bakery logo', alt: 'A wheat stalk under a rising sun' })}`, 'draw a logo for my bakery');
  await settle(en.page, 'loaded');
  const words = await en.page.evaluate(() => { const el = document.querySelector('.qjo-image-card'); return { text: el.innerText, save: el.querySelector('.qjo-image-save').textContent, again: el.querySelector('.qjo-image-again').textContent, privacy: el.querySelector('.qjo-image-privacy').textContent, dir: document.documentElement.dir }; });
  ok(words.save === EN.imageDownload && words.again === EN.imageAnother && words.privacy === EN.imageExternalNote && !/[؀-ۿ]/.test(words.text) && words.dir === 'ltr', `in an English page the card is English: "${words.save}", "${words.again}", "${words.privacy}"`, words);
  await en.page.close();
}

(async () => {
  const browser = await launchBrowser();
  await served(browser);
  await refused(browser);
  await silent(browser);
  await attack(browser);
  await notPictures(browser);
  await lazy(browser);
  await looks(browser);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });

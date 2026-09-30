// Images through the real page, as they are sent: attached with the file
// picker, prepared by the page, and read back from the request /api/chat
// receives. Before, a photo saved as PNG left the page as a data URL over the
// 4 MB Groq accepts for one image, and a phone screenshot was shrunk to 739
// px wide.
const http = require('http');
const { spawn } = require('child_process');
const { launchBrowser, BASE_URL, REPO_ROOT } = require('./harness');

const GROQ_IMAGE_CHARS = 4 * 1024 * 1024;
const REQUEST_BYTES = 8 * 1024 * 1024;

let browser;
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

// Images drawn in a blank page, as PNG files. A photo saved as PNG: gradients
// and sensor noise, which PNG cannot compress. A screenshot: text on white.
async function makeImages() {
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const files = await page.evaluate(async () => {
    const encode = async (c, type = 'image/png') => {
      const blob = await new Promise((r) => c.toBlob(r, type, 1));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return window.btoa(bin);
    };
    const photo = document.createElement('canvas');
    photo.width = 1800; photo.height = 2400;
    const px = photo.getContext('2d');
    const img = px.createImageData(1800, 2400);
    for (let i = 0; i < img.data.length; i += 4) {
      const p = i / 4, x = p % 1800, y = (p / 1800) | 0;
      img.data[i] = (x * 200 / 1800 + Math.random() * 12) | 0; img.data[i + 1] = (y * 200 / 2400 + Math.random() * 12) | 0; img.data[i + 2] = (100 + Math.random() * 12) | 0; img.data[i + 3] = 255;
    }
    px.putImageData(img, 0, 0);
    // The worst case: a camera JPEG of grain everywhere, which no encoder can
    // shrink much, at 2048 px so it is sent at its own size.
    const noisy = document.createElement('canvas');
    noisy.width = 2048; noisy.height = 2048;
    const nx = noisy.getContext('2d');
    const grain = nx.createImageData(2048, 2048);
    for (let i = 0; i < grain.data.length; i += 4) { grain.data[i] = Math.random() * 255; grain.data[i + 1] = Math.random() * 255; grain.data[i + 2] = Math.random() * 255; grain.data[i + 3] = 255; }
    nx.putImageData(grain, 0, 0);
    const shot = document.createElement('canvas');
    shot.width = 1170; shot.height = 2532;
    const sx = shot.getContext('2d');
    sx.fillStyle = '#fff'; sx.fillRect(0, 0, 1170, 2532); sx.fillStyle = '#111'; sx.font = '26px serif';
    for (let line = 0; line < 55; line++) sx.fillText(`Q${line + 1}. A car accelerates from rest at 3.2 m/s² for 12 s. Find v. (a) 38.4 (b) 26.7`, 30, 60 + line * 44);
    // A diagram with a transparent background, as a drawing app exports it.
    const diagram = document.createElement('canvas');
    diagram.width = 800; diagram.height = 600;
    const dx = diagram.getContext('2d');
    dx.strokeStyle = '#000'; dx.lineWidth = 6; dx.strokeRect(100, 100, 600, 400);
    return { photo: await encode(photo), noisy: await encode(noisy, 'image/jpeg'), screenshot: await encode(shot), diagram: await encode(diagram) };
  });
  await page.close();
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
}

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sent = [];
  await page.route('**/api/chat', (route) => {
    const raw = route.request().postData() || '';
    sent.push({ bytes: Buffer.byteLength(raw), body: JSON.parse(raw || '{}') });
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: 'ok' })}\n\nevent: done\ndata: {}\n\n` });
  });
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'en'); } catch (_) {}");
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page, errors, sent };
}

// Attaches files through the picker and sends; returns every image the
// request carried, measured in the page.
async function sendWith(page, sent, files, text = 'solve this') {
  await page.setInputFiles('#fileInput', files);
  // Each image is prepared, then OCR is tried (its library is blocked here,
  // so it gives up after a few seconds). Ready means every chip says so.
  await page.waitForFunction((n) => {
    const chips = [...document.querySelectorAll('#attachmentTray .attachment-chip')];
    return chips.length >= n && chips.every((c) => /ready for analysis/.test(c.textContent));
  }, files.length, { timeout: 60000 }).catch(() => {});
  await page.fill('#input', text);
  await page.click('#sendBtn');
  // The page can make a text-only call first; the one that matters carries images.
  const withImages = () => sent.filter((r) => r.body.messages.some((m) => m.role === 'user' && Array.isArray(m.content)));
  for (let i = 0; i < 80 && !withImages().length; i++) await page.waitForTimeout(250);
  const last = withImages().pop();
  if (!last) return { images: [], bytes: 0 };
  const user = [...last.body.messages].reverse().find((m) => m.role === 'user');
  const urls = Array.isArray(user.content) ? user.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url) : [];
  const images = await page.evaluate((list) => Promise.all(list.map((url) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const corner = Array.from(x.getImageData(2, 2, 1, 1).data);
      resolve({ width: img.naturalWidth, height: img.naturalHeight, chars: url.length, format: url.slice(5, url.indexOf(';')), corner });
    };
    img.onerror = () => resolve({ error: true, chars: url.length });
    img.src = url;
  }))), urls);
  return { images, bytes: last.bytes };
}

async function onePhoto(files) {
  const { ctx, page, errors, sent } = await open();
  const { images: [photo] } = await sendWith(page, sent, [{ name: 'photo.png', mimeType: 'image/png', buffer: files.photo }]);
  ok(files.photo.length < 12e6, `the photo is one the page accepts (${(files.photo.length / 1e6).toFixed(1)} MB, under its 12 MB limit)`);
  ok(photo && !photo.error && photo.chars <= GROQ_IMAGE_CHARS, `a photo saved as PNG leaves the page under Groq's 4 MB per image (${photo && (photo.chars / 1e6).toFixed(2)} MB as ${photo && photo.format})`, photo);
  ok(photo && Math.max(photo.width, photo.height) === 2048, `at 2048 px on its long side (${photo && `${photo.width}×${photo.height}`})`);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  await ctx.close();
}

async function noisyPhoto(files) {
  const { ctx, page, sent } = await open();
  const { images: [photo] } = await sendWith(page, sent, [{ name: 'grain.jpg', mimeType: 'image/jpeg', buffer: files.noisy }]);
  ok(files.noisy.length <= 12 * 1024 * 1024, `the grainy photo is one the page accepts (its limit is 12 MiB) (${(files.noisy.length / 1e6).toFixed(1)} MB)`);
  ok(photo && photo.chars <= GROQ_IMAGE_CHARS, `even a photo no encoder can shrink much goes under 4 MB (${photo && (photo.chars / 1e6).toFixed(2)} MB, ${photo && `${photo.width}×${photo.height} ${photo.format}`})`, photo);
  await ctx.close();
}

async function screenshot(files) {
  const { ctx, page, sent } = await open();
  const { images: [shot] } = await sendWith(page, sent, [{ name: 'shot.png', mimeType: 'image/png', buffer: files.screenshot }]);
  ok(shot && shot.format === 'image/png' && shot.width >= 900 && shot.height === 2048, `a phone screenshot stays a sharp PNG, wide enough to read (${shot && `${shot.width}×${shot.height} ${shot.format}`}; it was 739 px wide)`, shot);
  await ctx.close();
}

async function fiveImages(files) {
  const { ctx, page, sent } = await open();
  // As files on disk: Playwright takes at most 50 MB of files from memory.
  const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'qjo-grain-'));
  const five = [1, 2, 3, 4, 5].map((n) => { const file = require('path').join(dir, `grain-${n}.jpg`); require('fs').writeFileSync(file, files.noisy); return file; });
  const { images, bytes } = await sendWith(page, sent, five);
  const total = images.reduce((n, i) => n + i.chars, 0);
  ok(images.length === 5 && images.every((i) => !i.error && i.chars <= GROQ_IMAGE_CHARS), `five grainy photos are all sent, each under 4 MB (${images.map((i) => (i.chars / 1e6).toFixed(1)).join(', ')} MB)`);
  ok(bytes < REQUEST_BYTES, `together in one request the server accepts (${(bytes / 1e6).toFixed(2)} MB of 8 MB; images ${(total / 1e6).toFixed(2)} MB)`);
  await ctx.close();
}

async function transparentDiagram(files) {
  const { ctx, page } = await open();
  // Forced past PNG with a tiny cap: a transparent background must become
  // white in a JPEG, not black.
  const result = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(window.atob(b64), (ch) => ch.charCodeAt(0));
    const file = new window.File([bytes], 'diagram.png', { type: 'image/png' });
    const prepared = await window.QjoUI.createImagePrep().prepare(file, 1000);
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = prepared.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { format: prepared.format, corner: Array.from(x.getImageData(5, 5, 1, 1).data), line: Array.from(x.getImageData(100, 300, 1, 1).data) };
  }, files.diagram.toString('base64'));
  ok(result.format === 'image/jpeg' && result.corner.slice(0, 3).every((v) => v > 240), `a transparent diagram sent as JPEG has a white background, not black (${result.corner})`, result);
  ok(result.line.slice(0, 3).every((v) => v < 90), `control: its lines are still drawn (${result.line})`);
  await ctx.close();
}

async function readingStep() {
  for (const [lang, label] of [['en', 'Reading the image'], ['ar', 'قراءة الصورة']]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: [
      `event: tool_call\ndata: ${JSON.stringify({ tool: 'read_image', label: 'Reading the image', detail: '', status: 'running' })}\n\n`,
      `event: tool_call\ndata: ${JSON.stringify({ tool: 'read_image', label: 'Reading the image', detail: '', status: 'done' })}\n\n`,
      `event: chunk\ndata: ${JSON.stringify({ text: 'v = 38.4 m/s' })}\n\n`, 'event: done\ndata: {}\n\n'
    ].join('') }));
    await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    await page.fill('#input', 'solve');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    const steps = await page.$$eval('.tool-step', (els) => els.map((e) => e.innerText.trim()));
    ok(steps.some((s) => s.includes(label)), `while the image is read, the page says so (${lang}: ${steps.join(' | ')})`);
    await ctx.close();
  }
}

// The whole way: the page, the real server and its routing, and a fake Groq
// that records what each model was sent. The server under the other suites
// has no provider to reach, so this one starts its own, pointed here.
const READ = JSON.stringify({ question: 'Find the speed after 12 s.', text: 'A car accelerates from rest at 3.2 m/s² for 12 s.', math: ['v = u + at'],
  values: [{ name: 'a', value: '3.2', unit: 'm/s²' }, { name: 't', value: '12', unit: 's' }], choices: ['(a) 38.4', '(b) 26.7'], figure: '', unclear: [] });

function fakeGroq() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      calls.push(body);
      const say = (text) => {
        if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] })); return; }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        res.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
      };
      if (body.model === 'fake-vision') return say(READ);
      if (body.model !== 'fake-text') { res.writeHead(500); res.end('{"error":{"message":"not this model"}}'); return; }
      return say('v = u + at = 0 + 3.2 × 12 = **38.4 m/s**، الجواب (a).');
    });
  });
  return { calls, server };
}

async function realServerEndToEnd(files) {
  const groq = fakeGroq();
  await new Promise((r) => groq.server.listen(0, '127.0.0.1', r));
  const fake = `http://127.0.0.1:${groq.server.address().port}/v1`;
  const port = 4600 + Math.floor(Math.random() * 300);
  const app = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), GROQ_API_KEYS: 'g1', GROQ_BASE_URL: fake, GROQ_VISION_MODEL: 'fake-vision', GROQ_TEXT_MODEL: 'fake-text', GROQ_FLASH_MODEL: 'fake-text',
      LLM7_API_KEYS: '', LLM7_BASE_URL: fake, KIMI_API_KEYS: '', KIMI_BASE_URL: fake, QWEN_API_KEYS: '' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) { /* booting */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    // The harness lets only its own server through; this one is ours too.
    await page.route(`${base}/**`, (route) => route.continue());
    await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    await page.setInputFiles('#fileInput', [{ name: 'q.png', mimeType: 'image/png', buffer: files.screenshot }]);
    await page.waitForFunction(() => [...document.querySelectorAll('#attachmentTray .attachment-chip')].some((c) => /جاهز|ready/i.test(c.textContent)), null, { timeout: 30000 }).catch(() => {});
    await page.fill('#input', 'حل السؤال');
    await page.click('#sendBtn');
    await page.waitForFunction(() => /38\.4/.test((document.querySelector('.msg.assistant:last-of-type') || document.body).innerText), null, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(800);

    const vision = groq.calls.filter((c) => c.model === 'fake-vision');
    const text = groq.calls.filter((c) => c.model === 'fake-text');
    const imageOf = (c) => (c.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((p) => p.type === 'image_url');
    const seen = vision.map(imageOf).filter(Boolean);
    ok(seen.length >= 1 && /^data:image\/png;base64,/.test(seen[0].image_url.url), `the attached image reaches the vision model (${seen.length ? `${(seen[0].image_url.url.length / 1e6).toFixed(2)} MB` : 'it never did'})`);
    const said = (c) => (c.messages || []).map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((p) => p.text || '').join(' '))).join('\n');
    ok(vision.length && /Transcribe/.test(said(vision[0])), 'the vision model is asked to read it, not to solve it');
    ok(text.length && !text.some(imageOf) && /Find the speed after 12 s/.test(said(text[0])) && /حلّ المسألة خطوة بخطوة/.test(said(text[0])),
      `a text model solves from what was read, told in Arabic to go step by step (${text.length} call(s))`);
    const answer = await page.$eval('.msg.assistant:last-of-type', (el) => el.innerText).catch(() => '');
    const steps = await page.$$eval('.tool-step', (els) => els.map((e) => e.innerText.trim()));
    ok(/38\.4/.test(answer) && !/"question"|Given values/.test(answer), `the page shows the solution, not the transcript (${answer.replace(/\s+/g, ' ').slice(0, 90)})`);
    ok(steps.some((s) => s.includes('قراءة الصورة')), `and says it was reading the image (${steps.join(' | ')})`);
    await ctx.close();
  } finally {
    app.kill('SIGKILL');
    groq.server.close();
  }
}

(async () => {
  browser = await launchBrowser();
  const files = await makeImages();
  for (const scenario of [onePhoto, noisyPhoto, screenshot, fiveImages, transparentDiagram, readingStep, realServerEndToEnd]) await scenario(files);
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();


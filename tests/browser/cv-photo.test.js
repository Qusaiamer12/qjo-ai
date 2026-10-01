// "Put my photo in my CV and make it a PDF", from the real page through the
// real server, to a fake Groq.
//
// The photo used to go to the vision model — thousands of tokens of image, a
// model without tools, told to analyse the picture — and the PDF was made
// from the answer's text, so the photo was never in it. Checked: placing a
// photo sends no pixels, only its id, to the text model; the answer shows the
// photo; the PDF and the Word file the page offers carry it; and a question
// about a photo still sends the photo to be looked at.
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const JSZip = require('jszip');
const { launchBrowser, REPO_ROOT } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

// Answers as a model told about the photo would: it places it by its id.
function fakeGroq() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const images = (body.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'image_url');
      const id = (raw.match(/attachment:([a-z0-9]{4,16})/) || [])[1];
      const users = (body.messages || []).filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text || '').join(' ')));
      calls.push({ model: body.model, images: images.length, tools: (body.tools || []).map((t) => t.function.name), id, bytes: raw.length, earlier: users.slice(0, -1).join('\n') });
      const text = id ? `# السيرة الذاتية\n\n![صورتي](attachment:${id})\n\n**الاسم:** أحمد\n\n## الخبرات\n- مطور ويب` : 'في الصورة دائرة فاتحة على خلفية متدرجة.';
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      res.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  return { calls, server };
}

// The PDF the page offers under the answer, then the Word file.
async function filesCarryThePhoto(page, exports, id, imagesIn) {
  const fetched = (kind) => exports.find((e) => e.url.endsWith(`/${kind}`) && e.body);
  await page.click('.msg.assistant:last-of-type button:has-text("تحميل")');
  for (let i = 0; i < 40 && !fetched('pdf'); i++) await page.waitForTimeout(250);
  const pdf = fetched('pdf');
  const sent = pdf && pdf.sent.images && pdf.sent.images[id];
  ok(Boolean(sent) && sent.startsWith('data:image/'), 'the PDF request carries the photo under its id', pdf && Object.keys(pdf.sent.images || {}));
  const drawn = pdf ? await imagesIn(pdf.body) : 'no file';
  ok(drawn === 1, `the PDF has the photo in it (${drawn} image(s) drawn)`, pdf && { status: pdf.status, start: pdf.body.slice(0, 120).toString() });
  await page.click('.msg.assistant:last-of-type .qjo-export-toggle').catch(() => {});
  await page.click('.msg.assistant:last-of-type .qjo-export-item[data-export="docx"]').catch(() => {});
  for (let i = 0; i < 40 && !fetched('docx'); i++) await page.waitForTimeout(250);
  const docx = fetched('docx');
  const media = docx ? Object.keys((await JSZip.loadAsync(docx.body)).files).filter((f) => /^word\/media\/.+\.\w+$/.test(f)) : [];
  ok(media.length === 1, `the Word file has the photo in it (${media.join(', ') || 'none'})`);
}

(async () => {
  const pdfjs = await import(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'));
  // Images drawn in a PDF; -1 when it is not a PDF at all.
  const imagesIn = async (buffer) => {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise.catch(() => null);
    if (!doc) return -1;
    let n = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const ops = await (await doc.getPage(i)).getOperatorList();
      n += ops.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length;
    }
    return n;
  };

  const browser = await launchBrowser();
  const groq = fakeGroq();
  await new Promise((r) => groq.server.listen(0, '127.0.0.1', r));
  const fake = `http://127.0.0.1:${groq.server.address().port}/v1`;
  const port = 5600 + Math.floor(Math.random() * 300);
  const app = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), GROQ_API_KEYS: 'g1', GROQ_BASE_URL: fake, LLM7_API_KEYS: '', LLM7_BASE_URL: fake, KIMI_API_KEYS: '', KIMI_BASE_URL: fake, QWEN_API_KEYS: '' }
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { up = (await fetch(`${base}/api/health`)).ok; } catch (_) { /* booting */ }
      if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    ok(up, 'the server started with the fake Groq');

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const exports = [];
    await page.route(`${base}/**`, (route) => route.continue());
    // What the page asks the server for. The file is fetched again from the
    // same server with the same request: a download's body is not readable
    // from the page's side.
    page.on('request', (request) => {
      if (!/\/api\/export\//.test(request.url())) return;
      const entry = { url: request.url(), sent: JSON.parse(request.postData() || '{}'), body: null };
      exports.push(entry);
      fetch(request.url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: request.postData() })
        .then(async (r) => { entry.status = r.status; entry.body = Buffer.from(await r.arrayBuffer()); }, () => { entry.body = Buffer.alloc(0); });
    });
    await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

    const photo = Buffer.from((await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 1500;
      const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 1200, 1500);
      g.addColorStop(0, '#c97'); g.addColorStop(1, '#358'); x.fillStyle = g; x.fillRect(0, 0, 1200, 1500);
      x.fillStyle = '#fdb'; x.beginPath(); x.arc(600, 600, 300, 0, 7); x.fill();
      return c.toDataURL('image/jpeg', 0.9);
    })).split(',')[1], 'base64');
    const attach = async (text) => {
      await page.setInputFiles('#fileInput', [{ name: 'me.jpg', mimeType: 'image/jpeg', buffer: photo }]);
      await page.waitForFunction(() => [...document.querySelectorAll('#attachmentTray .attachment-chip')].some((c) => /جاهز|ready/i.test(c.textContent)), null, { timeout: 60000 }).catch(() => {});
      const before = groq.calls.length;
      const answered = await page.$$eval('.msg.assistant', (els) => els.length);
      await page.fill('#input', text);
      await page.click('#sendBtn');
      await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant').length > n && !document.querySelector('.qjo-typing-cursor'), answered, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(800);
      return groq.calls.slice(before);
    };

    // Placing the photo.
    const placed = await attach('حطلي هالصورة بالسيفي تبعي واعملي ملف pdf');
    const answer = placed[placed.length - 1];
    ok(placed.length >= 1 && placed.every((c) => c.images === 0), `no pixels reach a model to place a photo (${placed.map((c) => `${c.model}: ${c.images} image(s)`).join(', ')})`, placed);
    ok(answer && !/scout|vision/.test(answer.model) && answer.tools.length > 0, `the text model with its tools writes it, not the vision model (${answer && answer.model})`, answer);
    ok(answer && /^[a-z0-9]{4,16}$/.test(String(answer.id)), `the model is told the photo's id (${answer && answer.id})`);
    const shown = await page.$eval('.msg.assistant:last-of-type img.qjo-attachment', (img) => ({ width: img.naturalWidth, height: img.naturalHeight })).catch(() => null);
    ok(shown && shown.width === 1200 && shown.height === 1500, `the answer shows the photo itself (${JSON.stringify(shown)})`);

    await filesCarryThePhoto(page, exports, answer && answer.id, imagesIn);

    // Asking about a photo still shows it to the model.
    const looked = await attach('شو في بالصورة؟');
    ok(looked.some((c) => c.images === 1), `a question about the photo sends it to be looked at (${looked.map((c) => `${c.model}: ${c.images}`).join(', ')})`, looked);
    const earlier = (looked[looked.length - 1] || {}).earlier || '';
    ok(earlier.includes(`attachment:${answer && answer.id}`) && !/not shown to you/.test(earlier), 'the conversation keeps a short marker with the photo\'s id, not the instruction', earlier.slice(-200));
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  } finally {
    app.kill('SIGKILL');
    groq.server.close();
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// PDF export through the real handler, with both engines, read back with
// pdf.js. Not a page test: it lives here because it needs a real Chromium and
// pdf.js, which this package has and the app's own install does not.
//
// Arabic cannot be asserted as extracted text: neither Chromium's PDFs nor
// PDFKit's map every shaped Arabic glyph back to its letter, so pdf.js returns
// fragments either way. What is asserted instead is what decides whether the
// Arabic can show at all — the Arabic font is inside the file — with an
// English-only file as the control that the check can fail.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launchOptions, BASE_URL } = require('./harness');

const chromium = launchOptions().executablePath || require('playwright').chromium.executablePath();
if (!chromium || !fs.existsSync(chromium)) {
  console.log(`❌ no Chromium for the PDF engine (${chromium}) — refusing to report anything`);
  process.exit(1);
}

const ARABIC = `# تقرير المبيعات الربعي

مقدمة فيها **نص غامق** و*نص مائل* و English words داخل العربي 2026.

## الجدول

| المنتج | الكمية | السعر | النسبة |
| --- | --- | --- | --- |
| قهوة | 120 | $4.50 | 35% |
| كعك | 45 | $3.00 | 12.5% |

\`\`\`python
# تعليق
total = sum([120, 80, 45])
\`\`\``;
const ENGLISH = '# Report\n\nOnly English here, with a table.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

function call(handler, body) {
  return new Promise((resolve) => {
    const res = { status(c) { this.code = c; return this; }, setHeader() {}, json(o) { resolve({ code: this.code, json: o }); }, send(b) { resolve({ code: this.code || 200, body: b }); } };
    handler({ body, headers: {} }, res);
  });
}

// Puppeteer reads PUPPETEER_EXECUTABLE_PATH once, when it is loaded, so each
// engine is exercised in a process of its own: this file, run as "render",
// exports the documents it is given and prints the results.
if (process.argv[2] === 'render') {
  (async () => {
    const service = require('../../src/services/exportService');
    const out = [];
    for (const body of JSON.parse(process.env.QJO_PDF_JOBS)) {
      const res = await call(service.exportPdf, body);
      out.push({ code: res.code, pdf: res.body ? Buffer.from(res.body).toString('base64') : null, status: service.pdfEngineStatus() });
    }
    process.stdout.write(JSON.stringify(out));
  })().catch((error) => { console.error(error); process.exit(1); });
  return;
}

// Asynchronously: the "internal" server below lives in this process, and a
// parent blocked on its child could not answer it — an unguarded fetch would
// hang instead of showing up as a request.
async function render(executablePath, jobs) {
  const { execFile } = require('child_process');
  const stdout = await new Promise((resolve, reject) => execFile(process.execPath, [__filename, 'render'], {
    env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: executablePath, QJO_PDF_JOBS: JSON.stringify(jobs) },
    maxBuffer: 64 * 1024 * 1024, timeout: 120000
  }, (error, out) => (error ? reject(error) : resolve(out))));
  return JSON.parse(stdout.toString()).map((r) => ({ ...r, body: r.pdf ? Buffer.from(r.pdf, 'base64') : null }));
}

(async () => {
  const pdfjs = await import(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'));
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

  async function read(buffer) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, verbosity: 0 }).promise;
    const pages = [];
    let images = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const text = (await page.getTextContent()).items.map((it) => it.str).join(' ');
      const ops = await page.getOperatorList();
      images += ops.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length;
      pages.push(text);
    }
    return { pages, text: pages.join('\n'), images, raw: Buffer.from(buffer).toString('latin1') };
  }
  // pdf.js returns a line as separate items, often a word or a glyph each: text
  // is compared with its spacing taken out.
  const squash = (text) => String(text).replace(/[\s\u0000]+/g, '');
  const has = (doc, text) => squash(doc.text).includes(squash(text));

  // An "internal" address the document points an image at. Chromium on the
  // server must never ask it for anything.
  let internalHits = 0;
  const internal = http.createServer((_, res) => { internalHits++; res.writeHead(200, { 'content-type': 'image/png' }); res.end(Buffer.from(PIXEL, 'base64')); });
  await new Promise((r) => internal.listen(0, '127.0.0.1', r));
  const internalUrl = `http://127.0.0.1:${internal.address().port}/latest/meta-data/credentials.png`;

  // ── Chromium ──
  const withImages = `${ARABIC}\n\n![internal](${internalUrl})\n\n![inline](data:image/png;base64,${PIXEL})`;
  const [res, englishRes] = await render(chromium, [{ title: 'تقرير', content: withImages }, { title: 'Report', content: ENGLISH }]);
  const status = res.status;
  ok(res.code === 200 && status.last.engine === 'chromium', `Chromium prints the PDF (${status.last.engine}; ${status.last.fallbackReason || 'no fallback'})`);
  let pdf = await read(res.body);
  for (const text of ['English words', '$4.50', '120', 'total = sum([120, 80, 45])']) ok(has(pdf, text), `the PDF has "${text}"`, pdf.text.slice(0, 200));
  ok(/NotoNaskhArabic/.test(pdf.raw), 'the Arabic font is inside the file');
  const english = await read(englishRes.body);
  ok(!/NotoNaskhArabic/.test(english.raw) && has(english, 'Only English here'), 'control: an English-only file carries no Arabic font');
  ok(!/NotoSansArabic|DejaVu|Liberation/.test(pdf.raw + english.raw), 'no font of the server\'s own was needed');
  ok(internalHits === 0, `an image at an internal address is never fetched by the server's Chromium (${internalHits} requests)`);
  ok(pdf.images >= 1, `control: an inline image still reaches the PDF (${pdf.images})`);

  // ── Without Chromium ──
  const rows = Array.from({ length: 70 }, (_, i) => `| Region ${i + 1} | ${i + 1} |`).join('\n');
  const [plain, longRes] = await render(path.join(__dirname, 'no-such-chromium'), [{ title: 'تقرير', content: ARABIC }, { title: 'Long', content: `# Long\n\n| Region | Orders |\n| --- | --- |\n${rows}` }]);
  const fellBack = plain.status.last;
  ok(plain.code === 200 && fellBack.engine === 'fallback' && /Chromium is not installed/.test(fellBack.fallbackReason || ''), `without Chromium the built-in renderer prints it, and says why (${fellBack.fallbackReason})`);
  pdf = await read(plain.body);
  for (const text of ['English words', '$4.50', '120', 'total = sum([120, 80, 45])']) ok(has(pdf, text), `the built-in PDF has "${text}"`, pdf.text.slice(0, 200));
  ok(/NotoNaskhArabic/.test(pdf.raw) && !/Helvetica/.test(pdf.raw), 'its fonts are inside the file, none without Arabic');
  ok(pdf.pages.length === 1, `one page for one page of content (${pdf.pages.length})`);

  const long = await read(longRes.body);
  const pagesWithBody = long.pages.filter((p) => p.replace(/Long|\d+\s*\/\s*\d+/g, '').trim().length > 20);
  ok(long.pages.length >= 2 && pagesWithBody.length === long.pages.length, `a long table runs over ${long.pages.length} pages, none of them empty`);
  ok(long.pages.every((p) => /Orders/.test(p)), 'and its header row is on every page');

  // ── The status page says which engine is there ──
  const live = await fetch(BASE_URL + '/api/status').then((r) => r.json()).catch(() => ({}));
  ok(live.pdf && typeof live.pdf.chromium === 'boolean', `/api/status reports the PDF engine (${JSON.stringify(live.pdf)})`);

  internal.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

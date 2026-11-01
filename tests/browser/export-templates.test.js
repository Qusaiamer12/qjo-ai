// Export templates, from the page to the file a person downloads.
//
// A real server is started and asked for every template, in both languages,
// as Word and as PDF, the way the page asks; the bytes are checked where a
// person gets them: a real %PDF read back with pdf.js (pages, text, fonts,
// which side Arabic starts on, the contents list's numbers against the pages
// the headings are on) and a zip with word/document.xml. Then the real page:
// the download menu offers a CV's templates for a CV and a document's for any
// other answer, and the choice reaches the server and comes back as that file.
const path = require('path');
const { spawn } = require('child_process');
const JSZip = require('jszip');
// The harness blocks every origin but the app's: the server this suite starts is that origin.
const port = 6100 + Math.floor(Math.random() * 300);
process.env.QJO_BASE_URL = `http://127.0.0.1:${port}`;
const { launchBrowser, launchOptions, REPO_ROOT } = require('./harness');
const samples = require(path.join(REPO_ROOT, 'scripts', 'fixtures', 'exportSamples'));

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };
const CV = ['modern', 'classic', 'compact'];
const DOCS = ['report', 'academic', 'story', 'elegant'];
const sample = (id, lang) => {
  const rtl = lang === 'ar';
  const cv = CV.includes(id);
  return { template: id, rtl, title: cv ? (rtl ? 'سامي خالد ناصر' : 'Sami Khaled Nasser') : samples.docTitle[lang],
    content: cv ? (rtl ? samples.CV_AR : samples.CV_EN) : id === 'story' ? (rtl ? samples.STORY_AR : samples.STORY_EN) : (rtl ? samples.DOC_AR : samples.DOC_EN) };
};

(async () => {
  const pdfjs = await import(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'));
  const read = async (buffer) => {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, verbosity: 0 }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const items = (await page.getTextContent()).items.filter((it) => it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width }));
      pages.push({ items, text: items.map((it) => it.s).join(' '), width: page.view[2], height: page.view[3] });
    }
    return { pages, raw: Buffer.from(buffer).toString('latin1') };
  };
  const squash = (t) => String(t).replace(/[\s\u0000]+/g, '');

  const chromium = process.env.PUPPETEER_EXECUTABLE_PATH || launchOptions().executablePath;
  const app = spawn(process.execPath, ['server.js'], { cwd: REPO_ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(port), ...(chromium ? { PUPPETEER_EXECUTABLE_PATH: chromium } : {}) } });
  const base = `http://127.0.0.1:${port}`;
  const post = async (kind, body) => {
    const res = await fetch(`${base}/api/export/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
  };
  let browser;
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { up = (await fetch(`${base}/api/health`)).ok; } catch (_) { /* booting */ }
      if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    ok(up, 'the server started');
    const status = await fetch(`${base}/api/status`).then((r) => r.json()).catch(() => ({}));
    const engine = status.pdf && status.pdf.chromium ? 'Chromium' : 'the plain renderer';
    console.log(`   (PDFs are printed by ${engine})`);

    for (const id of [...CV, ...DOCS]) {
      for (const lang of ['en', 'ar']) {
        const input = sample(id, lang);
        const where = `${id}/${lang}`;
        const word = await post('docx', input);
        const zip = word.status === 200 ? await JSZip.loadAsync(word.body).catch(() => null) : null;
        ok(word.status === 200 && zip && zip.file('word/document.xml') && /wordprocessingml/.test(word.type), `${where}: the Word file is a zip with word/document.xml (${word.status}, ${word.body.length} bytes)`);

        const res = await post('pdf', input);
        ok(res.status === 200 && res.body.slice(0, 5).toString() === '%PDF-' && /application\/pdf/.test(res.type), `${where}: the PDF starts with %PDF (${res.status}, ${res.body.slice(0, 12).toString('latin1')})`);
        const pdf = await read(res.body).catch((e) => ({ pages: [], raw: '', error: e.message }));
        const all = squash(pdf.pages.map((p) => p.text).join(' '));
        // Neither engine maps shaped Arabic back to its letters (see pdf-export.test.js): Arabic files are read by their Latin words, digits and positions.
        const en = lang === 'en';
        const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
        const sideOf = (p) => p.items.filter((it) => it.w > 20 && it.y < p.height * 0.78).map((it) => (en ? it.x / p.width : (it.x + it.w) / p.width));
        if (CV.includes(id)) {
          ok(pdf.pages.length >= 1 && pdf.pages.length <= 2 && all.toLowerCase().includes(squash(en ? input.title : '+962795550142').toLowerCase()) && all.toLowerCase().includes(squash(en ? 'Summary' : 'Node.js').toLowerCase()), `${where}: the CV's name, contact and sections are in the PDF (${pdf.pages.length} page(s))`, pdf.error || all.slice(0, 200));
          if (id !== 'modern') {
            const lines = sideOf(pdf.pages[0]);
            // Long lines start at the left edge in English and end at the right edge in Arabic.
            ok(lines.length > 3 && (en ? median(lines) < 0.25 : median(lines) > 0.75), `${where}: body lines start on the side the language reads from (median ${Math.round(median(lines) * 100)}%)`, lines.map((v) => Math.round(v * 100)));
          }
        } else {
          const toc = pdf.pages[1] ? pdf.pages[1].items : [];
          ok(pdf.pages.length >= 5 && toc.length > 10 && (!en || (squash(pdf.pages[0].text).includes(squash(input.title)) && !squash(pdf.pages[0].text).includes('Contents') && squash(pdf.pages[1].text).includes('Contents'))), `${where}: a cover, then a contents page, then the text (${pdf.pages.length} pages)`, pdf.error);
          // The contents list's numbers are the pages the headings are on.
          const numbers = toc.filter((it) => /^\d+$/.test(it.s.trim()) && (en ? it.x > pdf.pages[1].width * 0.8 : it.x < pdf.pages[1].width * 0.2)).map((it) => Number(it.s.trim()));
          ok(numbers.length >= 10 && numbers.every((n, i) => i === 0 || n >= numbers[i - 1]) && numbers[numbers.length - 1] <= pdf.pages.length, `${where}: the contents list has page numbers in order (${numbers.join(',')})`);
          if (en) {
            const label = (it) => it.s.trim().replace(/^[\d.]+\s*/, '').toLowerCase();
            const at = pdf.pages.findIndex((p, i) => i >= 2 && p.items.some((it) => label(it).startsWith('section 2.1')));
            const row = toc.findIndex((it) => label(it) === 'section 2.1');
            const num = toc.slice(row + 1).map((it) => it.s.trim()).find((v) => /^\d+$/.test(v));
            ok(at >= 0 && row >= 0 && Number(num) === at + 1, `${where}: the list says "Section 2.1" is on page ${num}; it is on page ${at + 1}`);
          }
          ok(pdf.pages.slice(2).every((p) => /\d/.test(p.text)), `${where}: numbered pages after the cover`);
          if (id === 'story' && en) {
            // Each chapter opens a page of its own: its label is the first thing on that page.
            const opens = [1, 2, 3, 4].map((n) => pdf.pages.findIndex((q, i) => i >= 2 && squash(q.text).toLowerCase().slice(0, 24).includes(`chapter${n}`)));
            ok(opens.every((v) => v > 1) && new Set(opens).size === 4, `${where}: every chapter starts a page (pages ${opens.map((v) => v + 1)})`);
          }
        }
        const serif = ['compact', 'academic', 'story', 'elegant'].includes(id);
        if (engine === 'Chromium') ok(/NotoSerif/.test(pdf.raw) === serif && (lang === 'ar') === /NotoNaskhArabic/.test(pdf.raw), `${where}: the fonts are inside the file (serif ${serif}, Arabic ${lang === 'ar'})`);
        else ok(/NotoSans/.test(pdf.raw) && (lang === 'ar') === /NotoNaskhArabic/.test(pdf.raw), `${where}: the fonts are inside the file`);
      }
    }
    const plain = await read((await post('pdf', { title: 'Report', content: '# Report\n\nHello there.', rtl: false })).body);
    ok(plain.pages.length === 1 && /Qjo AI/.test(plain.pages[0].text) && !/Contents/.test(plain.pages[0].text), 'control: without a template the PDF is the one page it was');
    const bad = await post('pdf', { title: 'x', content: 'x', template: 'constructor' });
    ok(bad.status === 400, `a template outside the list is refused (${bad.status})`);

    // ── The real page ──
    browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let answer = samples.CV_EN;
    await page.route(`${base}/api/chat`, (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` }));
    const asked = [];
    page.on('request', (r) => { if (/\/api\/export\//.test(r.url())) asked.push({ url: r.url(), body: r.postDataJSON() }); });
    await page.addInitScript("try { localStorage.setItem('qjo_language', 'en'); } catch (_) {}");
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    const LAST = '.msg.assistant:last-of-type';
    const ask = async (text, reply) => {
      answer = reply;
      const before = await page.$$eval('.msg.assistant .msg-actions-toolbar', (els) => els.length);
      await page.fill('#input', text);
      await page.click('#sendBtn');
      await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .msg-actions-toolbar').length > n, before, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
    };
    const offered = async () => {
      await page.click(`${LAST} .qjo-export-toggle`);
      return page.$$eval(`${LAST} .qjo-template-option`, (els) => els.map((e) => ({ id: e.dataset.template, text: e.textContent, on: e.getAttribute('aria-checked') })));
    };
    await ask('write my CV', samples.CV_EN);
    let options = await offered();
    ok(options.map((o) => o.id).join(',') === ',modern,classic,compact' && options[0].on === 'true' && options[0].text === 'Standard', `a CV is offered its three templates, Standard chosen (${options.map((o) => o.text)})`, options);
    await page.click(`${LAST} .qjo-template-option[data-template="modern"]`);
    options = await page.$$eval(`${LAST} .qjo-template-option`, (els) => els.map((e) => e.getAttribute('aria-checked')));
    ok(options.join(',') === 'false,true,false,false', 'choosing one marks it, and only it');
    // The CV is asked for as Word with the choice; the same request goes to the real server.
    asked.length = 0;
    await page.click(`${LAST} .qjo-export-item[data-export="docx"]`);
    await page.waitForTimeout(600);
    const sent = asked.find((a) => /\/docx$/.test(a.url));
    // As its own field (app.js downloadExport), not a line inside the answer.
    ok(sent && sent.body.template === 'modern' && /^# Sami Khaled Nasser/.test(sent.body.content), 'the Word request carries the choice', sent && { template: sent.body.template, start: sent.body.content.slice(0, 60) });
    const file = await post('docx', sent.body);
    const zip = await JSZip.loadAsync(file.body);
    const xml = await zip.file('word/document.xml').async('string');
    ok(file.status === 200 && /<w:tbl>/.test(xml) && /w:fill="1F2D4A"/.test(xml) && !/qjo:template/.test(xml.replace(/<[^>]+>/g, ' ')), 'the real server answers with the modern CV: a side column, and the choice is not in the text');
    asked.length = 0;
    await page.click(`${LAST} .qjo-export-toggle`);
    await page.click(`${LAST} .qjo-template-option[data-template=""]`);
    await page.click(`${LAST} .qjo-export-item[data-export="pptx"]`);
    await page.waitForTimeout(500);
    const slides = asked.find((a) => /\/pptx$/.test(a.url));
    ok(slides && !/qjo:template/.test(slides.body.content), 'slides never carry a template');
    await page.click(`${LAST} .qjo-export-toggle`);
    await page.click(`${LAST} .qjo-template-option[data-template="classic"]`);
    asked.length = 0;
    await page.click(`${LAST} .qjo-export-item[data-export="pdf"]`);
    for (let i = 0; i < 40 && !asked.length; i++) await page.waitForTimeout(250);
    const pdfAsk = asked.find((a) => /\/pdf$/.test(a.url));
    const pdfFile = pdfAsk ? await post('pdf', pdfAsk.body) : { body: Buffer.alloc(0) };
    ok(pdfAsk && pdfFile.body.slice(0, 5).toString() === '%PDF-' && !/Qjo AI\s*\d+ \/ \d+/.test((await read(pdfFile.body)).pages.map((p) => p.text).join(' ')), 'the PDF request carries the choice and comes back as the template (no standard footer)');

    await ask('explain the project', samples.DOC_EN);
    options = await offered();
    ok(options.map((o) => o.id).join(',') === ',report,academic,story,elegant' && options.every((o) => o.on === (o.id === '' ? 'true' : 'false')), `any other answer is offered the document templates (${options.map((o) => o.text)})`, options);
    asked.length = 0;
    await page.click(`${LAST} .qjo-template-option[data-template="elegant"]`);
    await page.click(`${LAST} .qjo-export-item[data-export="docx"]`);
    await page.waitForTimeout(600);
    const doc = asked.find((a) => /\/docx$/.test(a.url));
    const docZip = await JSZip.loadAsync((await post('docx', doc.body)).body);
    const docXml = await docZip.file('word/document.xml').async('string');
    ok(/ TOC \\o/.test(docXml) && /w:pageBorderTop|w:pgBorders/.test(docXml), 'the real server answers with the elegant document: a contents field and a framed cover');
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  } finally {
    app.kill('SIGKILL');
    if (browser) await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Python under an answer, through the real page with real Pyodide (served
// from .pyodide-cache, see fetch-pyodide.js) and a Firebase that keeps chats.
//
// Checked, in Arabic: an Excel file attached is read for the model (it sees
// the sheet's columns); the answer's plot draws by itself, its code reading
// the CSV and the Excel file the person attached, by their names; nothing in
// the output about pyarrow or a non-GUI backend; the files the code wrote are
// offered as downloads with their contents; "Explain this output" sends the
// output to Qjo as the page's text, after the person's words. Controls: code
// that does not draw waits for Run; a file the page no longer has is named
// with what to do; a chat opened again, and a connection that saves data,
// run nothing by themselves — and Run still works there.
const fs = require('fs');
const { launchBrowser, BASE_URL, repoFile } = require('./harness');
const { useFakeFirebase } = require('./fakeFirebase');
const { serveRealPyodide } = require('./pyodideServe');
const { measure } = require('./contrast');
const ExcelJS = require('../../node_modules/exceljs');

const INDEX = /PYODIDE_INDEX_URL = '([^']+)'/.exec(repoFile('public/ui/sandbox.js'))[1];
const fence = (code) => '```python\n' + code + '\n```';
const ANALYSIS = [
  'import pandas as pd',
  'import matplotlib.pyplot as plt',
  'd = pd.read_csv("sales.csv")',
  'x = pd.read_excel("targets.xlsx")',
  'print("total", d["amount"].sum(), "target", x["target"].sum())',
  'd.plot(x="month", y="amount")',
  'plt.show()',
  'd.to_csv("summary.csv", index=False)',
  'x.to_excel("targets-copy.xlsx", index=False)'
].join('\n');
const SALES = 'month,amount\nJan,10\nFeb,32\n';

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 500)); };

async function workbook() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Targets');
  sheet.addRow(['month', 'target']);
  sheet.addRow(['Jan', 40]);
  sheet.addRow(['Feb', 60]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function open(browser, { saveData = false, phone = false } = {}) {
  const ctx = await browser.newContext({ ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }), acceptDownloads: true });
  await serveRealPyodide(ctx, INDEX);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await useFakeFirebase(page);
  const sent = [];
  const answers = [];
  await page.route('**/api/chat', (route) => {
    sent.push(route.request().postDataJSON());
    const text = answers.shift() || 'تمام.';
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: {}\n\n` });
  });
  await page.addInitScript(`try { localStorage.setItem('qjo_language', 'ar'); localStorage.setItem('qjo_theme', 'light'); } catch (_) {}${saveData ? " Object.defineProperty(navigator, 'connection', { value: { saveData: true } });" : ''}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__signIn());
  await page.waitForTimeout(1000);
  const send = async (text, answer) => { answers.push(answer); await page.fill('#input', text); await page.click('#sendBtn'); await page.waitForTimeout(1500); };
  const last = '.msg.assistant:last-of-type';
  // The Python output under an answer: the last one, or the nth.
  const answer = (n) => (n === undefined ? page.locator('#messages .msg.assistant').last() : page.locator('#messages .msg.assistant').nth(n));
  const output = (n) => answer(n).locator('.python-output-container').first()
    .evaluate((el) => ({ hidden: el.classList.contains('hidden'), text: el.innerText, plots: el.querySelectorAll('.python-plot-img').length }), null, { timeout: 3000 }).catch(() => null);
  // Every word of a run's output against what it sits on, with a control.
  const readable = async (where) => {
    await answer().locator('.python-output-container').first().evaluate((el) => el.setAttribute('data-measured', '1'));
    const found = (await page.evaluate(measure, '[data-measured="1"]')) || [];
    await page.evaluate(() => document.querySelector('[data-measured]').removeAttribute('data-measured'));
    const texts = found.map((f) => f.text).join(' | ');
    ok(found.length >= 4 && /summary\.csv|result\.csv/.test(texts) && /اشرحلي/.test(texts), `${where}: control — the output's words, its file and Explain are measured (${found.length})`, texts.slice(0, 300));
    const unreadable = found.filter((f) => f.unmeasurable || f.ratio < f.need);
    ok(unreadable.length === 0, `${where}: every word of a run's output can be read`, unreadable.slice(0, 6));
  };
  return { ctx, page, errors, sent, send, last, output, answer, readable };
}

const lastUser = (body) => [...(body.messages || [])].reverse().find((m) => m.role === 'user');

(async () => {
  const browser = await launchBrowser();
  try {
    const { ctx, page, errors, sent, send, last, output, answer, readable } = await open(browser);

    // ── The files, and an answer that draws ──
    await page.setInputFiles('#fileInput', [{ name: 'sales.csv', mimeType: 'text/csv', buffer: Buffer.from(SALES) }, { name: 'targets.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbook() }]);
    await page.waitForTimeout(800);
    await send('حللي المبيعات وارسم الرسمة', 'هذا التحليل:\n\n' + fence(ANALYSIS) + '\n\nالرسمة تحت الكود.');
    const asked = JSON.stringify(sent[0] || {});
    ok(/Excel workbook \\"targets.xlsx\\"/.test(asked) && /Sheet: Targets\\nmonth,target\\nJan,40\\nFeb,60/.test(asked), 'an Excel file attached is read for the model: its sheet, by name, as rows');
    ok(!/Coding capsule/.test(asked), 'and an analysis of the files is asked for as Python for the page: no coding capsule');

    await page.waitForSelector(`${last} .python-plot-img`, { timeout: 120000 }).catch(() => {});
    const drawn = await output();
    ok(drawn && !drawn.hidden && drawn.plots === 1, `the answer's plot draws by itself, with no Run pressed (${drawn && drawn.plots} plot)`, drawn);
    ok(drawn && /total 42 target 100/.test(drawn.text), 'its code read the CSV and the Excel file the person attached, by their names', drawn && drawn.text.slice(0, 300));
    ok(drawn && !/pyarrow|non-GUI|DeprecationWarning/i.test(drawn.text), 'and the output holds no library notices: no pyarrow, no non-GUI backend', drawn && drawn.text.slice(0, 400));

    await readable('desktop, light');
    const links = await page.$$eval(`${last} .python-file-download`, (as) => as.map((a) => a.textContent.trim()));
    ok(JSON.stringify(links) === JSON.stringify(['⬇ summary.csv', '⬇ targets-copy.xlsx']), `the files the code wrote are offered for download (${links.join(', ')})`);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click(`${last} .python-file-download >> nth=0`)]);
    ok(download && download.suggestedFilename() === 'summary.csv' && fs.readFileSync(await download.path(), 'utf8') === SALES, 'and a download is the file the code wrote');

    // ── Explain ──
    const before = sent.length;
    await page.click(`${last} .python-explain-btn`);
    await page.waitForTimeout(1500);
    const explain = lastUser(sent[before] || {});
    const words = explain && await page.evaluate((t) => window.QjoDomain.ownWords(t), String(explain.content));
    ok(explain && /total 42 target 100/.test(explain.content) && /\[1 plot\(s\) drawn\]/.test(explain.content) && /summary\.csv/.test(explain.content), 'Explain sends the output to Qjo: what it printed, its plot, its files', explain && explain.content.slice(0, 300));
    ok(words === 'اشرحلي مخرجات كود البايثون اللي فوق: شو بتبيّن وشو معناها.', `the person's words in it are the ask alone; the output is the page's (${words})`);

    // ── Code that does not draw waits for Run ──
    await send('واطبعلي النسخة', 'هيك:\n\n' + fence('import sys\nprint(sys.version)'));
    await page.waitForTimeout(3000);
    const waiting = await output();
    ok(waiting && waiting.hidden, 'control: code that does not draw does not run by itself', waiting);

    // ── A file the page does not hold ──
    await send('واقرأ ملف قديم', 'هيك:\n\n' + fence('import pandas as pd\nprint(pd.read_csv("old.csv"))'));
    await answer().locator('.run-python-btn').click();
    await answer().locator('.python-run-note').waitFor({ timeout: 60000 }).catch(() => {});
    const note = await answer().locator('.python-run-note').first().textContent({ timeout: 2000 }).catch(() => '');
    ok(/old\.csv/.test(note) && /أرفقه مرة ثانية/.test(note), `a file the page does not have is named, with what to do ("${note}")`, await output());

    // ── What the page asks for: Python for the page is not a project ──
    const capsule = (body) => (body.messages || []).some((m) => m.role === 'system' && /Coding capsule/.test(String(m.content)));
    await send('اكتبلي كود بايثون يرسم منحنى المبيعات', 'تمام.');
    const plotAsk = sent[sent.length - 1];
    await send('build me a flask api in python for my shop', 'تمام.');
    const projectAsk = sent[sent.length - 1];
    ok(!capsule(plotAsk) && capsule(projectAsk), 'Python code that draws is asked for without the coding capsule; control: a Flask project gets it',
      { plot: capsule(plotAsk), project: capsule(projectAsk) });

    // ── Run under a later answer shows under that answer ──
    // Every answer's first block had the output id "…-output-0", so a run
    // under a later answer printed under the first one. JavaScript too.
    // Two answers whose first block is JavaScript: both are "js-output-0".
    await send('جربلي جافاسكربت', 'هيك:\n\n```javascript\nconsole.log("first-js")\n```');
    await send('وجربلي جافاسكربت ثاني', 'هيك:\n\n```javascript\nconsole.log("js-here")\n```');
    await answer().locator('.run-js-btn').click();
    await page.waitForTimeout(2500);
    const jsHere = await answer().locator('.python-output-container').first().innerText({ timeout: 2000 }).catch(() => '');
    const jsElsewhere = await page.locator('#messages .msg.assistant').evaluateAll((as) => as.slice(0, -1).some((a) => /js-here/.test(a.innerText)));
    ok(/js-here/.test(jsHere) && !jsElsewhere, 'a JavaScript run under a later answer shows under that answer, not the first', jsHere.slice(0, 120));

    // ── A chat opened again runs nothing by itself ──
    await page.click('#newChatBtn');
    await page.waitForTimeout(600);
    await page.click('.chat-item, .chat-row, [data-chat-id]');
    await page.waitForTimeout(4000);
    const reopened = await output(0);
    ok(reopened && reopened.hidden && reopened.plots === 0, 'a chat opened again draws nothing by itself', reopened);
    await answer(0).locator('.run-python-btn').click();
    await answer(0).locator('.python-plot-img').waitFor({ timeout: 60000 }).catch(() => {});
    const rerun = await output(0);
    ok(rerun && rerun.plots === 1 && /total 42 target 100/.test(rerun.text), 'and Run there still draws it, with the files of this visit', rerun);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 3));
    await ctx.close();

    // ── On a phone, in light mode: every element of an answer inherits its ink there ──
    const phone = await open(browser, { phone: true });
    await phone.send('ارسملي وصدّرلي', 'هيك:\n\n' + fence('import matplotlib.pyplot as plt\nprint("rows", 3)\nopen("result.csv", "w").write("a,b\\n1,2\\n")\nplt.plot([1, 2, 3])\nplt.show()'));
    await phone.answer().locator('.python-plot-img').waitFor({ timeout: 120000 }).catch(() => {});
    await phone.readable('phone 390px, light');
    await phone.ctx.close();

    // ── A connection that saves data ──
    const lean = await open(browser, { saveData: true });
    await lean.send('ارسملي خط', 'هيك:\n\n' + fence('import matplotlib.pyplot as plt\nplt.plot([1, 2, 3])'));
    await lean.page.waitForTimeout(3000);
    const saved = await lean.output();
    ok(saved && saved.hidden, 'on a connection that saves data, a plot waits for Run', saved);
    await lean.answer().locator('.run-python-btn').click();
    await lean.answer().locator('.python-plot-img').waitFor({ timeout: 120000 }).catch(() => {});
    const leanRun = await lean.output();
    ok(leanRun && leanRun.plots === 1, 'control: Run draws it', leanRun);
    await lean.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

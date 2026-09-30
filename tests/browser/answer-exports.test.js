// Files from an answer, through the real page: the Excel button that appears
// when an answer has a table, and the card that holds a file ready when the
// person asked for one. The download goes through the real export route and
// is opened with exceljs — the file, not the request, is what is checked.
const ExcelJS = require('exceljs');
const { launchBrowser, BASE_URL } = require('./harness');

const TABLE_ANSWER = ['## جدول المبيعات', '', 'هذا جدول المبيعات للربع الثالث.', '', '| المنتج | الكمية | السعر |', '| --- | --- | --- |', '| قهوة | 120 | $4.50 |', '| شاي | ٨٠ | $2.25 |'].join('\n');
const PLAIN_ANSWER = ['## الشرح', '', 'شرح تفصيلي للموضوع مع عدة فقرات لكي يتجاوز الحد الذي يستحق تصديرًا إلى ملف.', 'فقرة ثانية تضيف طولًا كافيًا حتى يظهر شريط التصدير بشكل موثوق في الاختبار، وتكمل الفكرة بتفاصيل إضافية.', '', '- نقطة أولى', '- نقطة ثانية'].join('\n');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  let answer = TABLE_ANSWER;
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` }));
  const exportsSent = [];
  page.on('request', (req) => { if (/\/api\/export\//.test(req.url())) exportsSent.push({ url: req.url(), body: req.postDataJSON() }); });

  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  const ask = async (text, reply) => {
    answer = reply;
    await page.fill('#input', text);
    await page.click('#sendBtn');
    await page.waitForFunction(() => document.querySelectorAll('.msg.assistant .msg-actions-toolbar').length > 0, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
  };
  const last = '.msg.assistant:last-of-type';

  // ── A file asked for ──
  await ask('اعملي ملف اكسل فيه جدول المبيعات', TABLE_ANSWER);
  const card = await page.$(`${last} .qjo-file-card[data-format="xlsx"]`);
  ok(Boolean(card), 'asked for an Excel file: a card with it waits under the answer');
  const cardText = card ? await card.innerText() : '';
  ok(/Excel/.test(cardText) && /جاهز/.test(cardText), `in the page's language (${cardText.replace(/\s+/g, ' ')})`);

  exportsSent.length = 0;
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    card ? card.$eval('button', (b) => b.click()) : Promise.resolve()
  ]);
  ok(exportsSent.some((e) => /\/api\/export\/xlsx$/.test(e.url) && e.body.content === TABLE_ANSWER && e.body.rtl === true), 'its button asks the real route for the workbook, right to left', exportsSent);
  const saved = download ? await download.path() : null;
  if (saved) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(saved);
    const sheet = book.worksheets[0];
    ok(sheet && sheet.views[0].rightToLeft === true && sheet.getRow(2).getCell(2).value === 120 && sheet.getRow(3).getCell(2).value === 80,
      `the file is a real workbook: right to left, numbers as numbers (${download.suggestedFilename()})`, sheet && [sheet.views[0], sheet.getRow(2).values]);
  } else {
    ok(false, 'the file downloads');
  }

  const excelButton = await page.$(`${last} .msg-action-btn[data-export="xlsx"]`);
  ok(Boolean(excelButton), 'an answer with a table offers Excel among its exports');

  // ── Nothing asked for ──
  await ask('اشرحلي الموضوع', PLAIN_ANSWER);
  ok(!(await page.$(`${last} .qjo-file-card`)), 'an ordinary question gets no file card');
  const formats = await page.$$eval(`${last} .msg-action-btn[data-export]`, (els) => els.map((e) => e.dataset.export));
  ok(formats.join(',') === 'pdf,pptx,docx', `control: without a table the exports are PDF, slides and Word, no Excel (${formats})`);

  await ask('لخصلي هالملف pdf', PLAIN_ANSWER);
  ok(!(await page.$(`${last} .qjo-file-card`)), '"summarise this PDF" is not a request for a PDF');

  await ask('اعملي ملف اكسل عن الطاقة', PLAIN_ANSWER);
  ok(!(await page.$(`${last} .qjo-file-card`)), 'an Excel file asked for, but the answer has no table: no empty workbook offered');

  await ask('اعملي عرض تقديمي عن الموضوع', PLAIN_ANSWER);
  ok(Boolean(await page.$(`${last} .qjo-file-card[data-format="pptx"]`)), 'a presentation asked for: the slides are ready');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

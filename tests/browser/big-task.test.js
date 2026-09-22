// Large-task and document-analysis behaviour, driven in the real app.
const { launchBrowser, BASE_URL } = require('./harness');

function makeDoc(chars) {
  const para = (i) => `القسم ${i}. فقرة تحليلية مفصلة تحمل العلامة MARKER${i} وتتناول تفاصيل تقنية وإدارية تحتاج قراءة دقيقة. `;
  let out = '', i = 1;
  while (out.length < chars) out += para(i++);
  return out.slice(0, chars);
}

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 240)); };

  async function open() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    return { ctx, page, errors };
  }

  // ── A truncated answer is visibly unfinished and can be continued ──
  {
    const { ctx, page, errors } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      const text = calls === 1 ? '# التقرير\n\nالجزء الأول من تقرير طويل ينقطع هنا' : '\n\nوهذه بقية التقرير حتى النهاية.';
      const done = calls === 1 ? '{"provider":"p","model":"m","truncated":true}' : '{"provider":"p","model":"m","truncated":false}';
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: chunk\ndata: ${JSON.stringify({ text })}\n\nevent: done\ndata: ${done}\n\n` });
    });
    await page.fill('#input', 'اكتبلي تقرير مفصل');
    await page.click('#sendBtn');
    await page.waitForTimeout(2500);

    ok(Boolean(await page.$('.qjo-continue-row')), 'an answer cut short says so instead of looking complete');
    const btn = await page.$('.qjo-continue-btn');
    ok(Boolean(btn), 'a continue action is offered');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(2500);
      ok(calls === 2, `continuing issues a new request (${calls} calls)`);
      const body = await page.$$eval('.msg.assistant', els => els.map(e => e.innerText).join('\n'));
      ok(body.includes('بقية التقرير'), 'the continuation is delivered', body.slice(-80));
    }
    const rows = await page.$$eval('.qjo-continue-row', els => els.length);
    ok(rows === 0, `a finished answer shows no continuation notice (${rows})`);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // ── An oversized payload is reported honestly, and not retried ──
  {
    const { ctx, page } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      await route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"request entity too large"}' });
    });
    await page.fill('#input', 'حلل هذا');
    await page.click('#sendBtn');
    await page.waitForTimeout(5000);
    const text = await page.$$eval('.msg.assistant', els => els[els.length - 1].innerText);
    ok(/أكبر من الحد المسموح/.test(text), 'an oversized payload names the real problem', text.slice(0, 110));
    ok(calls === 1, `an oversized payload is not retried pointlessly (${calls} call)`);
    await ctx.close();
  }

  // ── Attachments are bounded ──
  {
    const { ctx, page } = await open();
    const files = Array.from({ length: 10 }, (_, i) => ({
      name: `f${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from(makeDoc(3000), 'utf8')
    }));
    await page.setInputFiles('#fileInput', files);
    await page.waitForTimeout(8000);
    let sent = null;
    await page.route('**/api/chat', async (route) => {
      sent = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: chunk\ndata: ${JSON.stringify({ text: 'ok' })}\n\nevent: done\ndata: {}\n\n` });
    });
    await page.fill('#input', 'حلل');
    await page.click('#sendBtn');
    await page.waitForTimeout(4000);
    if (sent) {
      const userMsg = sent.messages.filter(m => m.role === 'user').pop();
      const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
      const indexes = new Set(content.match(/Attachment Index \d+/g) || []);
      ok(indexes.size <= 6, `at most six attachments reach the prompt (${indexes.size})`, [...indexes]);
    } else {
      ok(false, 'the request was never sent with ten files attached');
    }
    await ctx.close();
  }

  // ── A large document still reaches the model with its evidence intact ──
  {
    const { ctx, page, errors } = await open();
    let sent = null;
    await page.route('**/api/chat', async (route) => {
      sent = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: chunk\ndata: ${JSON.stringify({ text: 'تحليل.' })}\n\nevent: done\ndata: {}\n\n` });
    });
    const started = Date.now();
    await page.setInputFiles('#fileInput', { name: 'big.txt', mimeType: 'text/plain', buffer: Buffer.from(makeDoc(100000), 'utf8') });
    await page.waitForTimeout(4000);
    await page.fill('#input', 'حلل المستند كاملًا');
    await page.click('#sendBtn');
    await page.waitForTimeout(3500);
    const elapsed = Date.now() - started;
    ok(Boolean(sent), 'a 100k-char document is sent without the page dying');
    if (sent) {
      const userMsg = sent.messages.filter(m => m.role === 'user').pop();
      const content = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
      const markers = new Set(content.match(/MARKER\d+/g) || []);
      ok(markers.size >= 20, `retrieved evidence is substantial (${markers.size} sections)`);
      ok(content.length < 8 * 1024 * 1024, 'the payload stays under the server limit');
    }
    ok(elapsed < 60000, `a large document is processed in reasonable time (${Math.round(elapsed / 1000)}s)`);
    ok(errors.length === 0, 'no JS errors on a large document', errors.slice(0, 2));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

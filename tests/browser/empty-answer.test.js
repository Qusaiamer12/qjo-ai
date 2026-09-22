// From a real transcript: a question came back as a completely blank message.
// Nothing retried it, because as far as the code was concerned it had worked.
const { launchBrowser, BASE_URL } = require('./harness');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 220)); };

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
  const ask = async (page, t) => { await page.fill('#input', t); await page.click('#sendBtn'); };
  const lastAnswer = (page) => page.$$eval('.msg.assistant', els => (els[els.length - 1]?.innerText || '').trim());

  // ── An empty stream is retried, and the retry is what the user sees ──
  {
    const { ctx, page, errors } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      const body = calls === 1
        ? 'event: done\ndata: {}\n\n'                                   // 200, nothing in it
        : `event: chunk\ndata: ${JSON.stringify({ text: 'هداف ريال مدريد حاليًا هو ...' })}\n\nevent: done\ndata: {}\n\n`;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });
    await ask(page, 'مين هداف ريال مدريد حاليا');
    await page.waitForTimeout(7000);
    ok(calls === 2, `an empty answer is retried automatically (${calls} calls)`);
    const text = await lastAnswer(page);
    ok(text.includes('هداف ريال مدريد'), 'the user ends up with a real answer', text.slice(0, 80));
    ok(text.length > 0, 'no blank message is left on screen');
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // ── If it stays empty, say so rather than show nothing ──
  {
    const { ctx, page } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: done\ndata: {}\n\n' });
    });
    await ask(page, 'سؤال');
    await page.waitForTimeout(8000);
    const text = await lastAnswer(page);
    ok(text.length > 0, 'a persistently empty answer never renders as a blank bubble', text);
    ok(/فاضي|إعادة المحاولة/.test(text), 'it says what happened', text.slice(0, 120));
    const retry = await page.$('.retry-row button');
    ok(Boolean(retry), 'a retry is offered');
    // One automatic retry, then hand it to the person. More than that is a
    // loop spending provider quota on a request that keeps coming back empty.
    ok(calls === 2, `exactly one automatic retry, not a loop (${calls} calls)`);
    await ctx.close();
  }

  // ── A blank answer is never written into the conversation ──
  {
    const { ctx, page } = await open();
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: done\ndata: {}\n\n' });
    });
    await ask(page, 'سؤال ثاني');
    await page.waitForTimeout(8000);
    const emptyBubbles = await page.$$eval('.msg.assistant', els => els.filter(e => !e.innerText.trim()).length);
    ok(emptyBubbles === 0, `no empty assistant bubbles exist (${emptyBubbles})`);
    await ctx.close();
  }

  // ── Reasoning without an answer still counts as empty ──
  {
    const { ctx, page } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      const body = calls === 1
        ? `event: reasoning\ndata: ${JSON.stringify({ text: 'أفكر في السؤال...' })}\n\nevent: done\ndata: {}\n\n`
        : `event: chunk\ndata: ${JSON.stringify({ text: 'الجواب النهائي.' })}\n\nevent: done\ndata: {}\n\n`;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });
    await ask(page, 'سؤال ثالث');
    await page.waitForTimeout(7000);
    ok(calls === 2, `thinking with no answer is retried (${calls} calls)`);
    const text = await lastAnswer(page);
    ok(text.includes('الجواب النهائي'), 'the retry delivers', text.slice(0, 60));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Covers what happens when a request fails, which is what the user actually hit.
// Each case drives the real app in a real browser.
const { launchBrowser, BASE_URL } = require('./harness');

const GOOD = '## النتيجة\n\nجواب كامل ومفيد للمستخدم مع تفاصيل كافية ليكون واقعيًا.';

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 260)); };

  async function open() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const o = document.getElementById('authOverlay'); if (o) { o.classList.remove('show'); o.style.display = 'none'; } });
    return { ctx, page, errors };
  }
  const ask = async (page, t) => { await page.fill('#input', t); await page.click('#sendBtn'); };

  // ── A rendering failure must not destroy a delivered answer ──
  {
    const { ctx, page, errors } = await open();
    await page.route('**/api/chat', r => r.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `event: chunk\ndata: ${JSON.stringify({ text: GOOD })}\n\nevent: done\ndata: {}\n\n` }));
    // Break a decoration step the way a malformed payload would.
    await page.evaluate(() => { window.MathJax = { typesetPromise: () => { throw new Error('boom'); } }; });
    await ask(page, 'اشرحلي');
    await page.waitForTimeout(2200);
    const text = await page.$$eval('.msg.assistant', els => els[els.length-1].innerText);
    ok(text.includes('جواب كامل'), 'a broken decoration does not delete the answer', text.slice(0, 90));
    ok(!/الخادم|تعذر/.test(text), 'a rendering failure is not reported as a server failure', text.slice(0, 90));
    ok(errors.length === 0, 'the page does not throw', errors.slice(0, 2));
    await ctx.close();
  }

  // ── A malformed chart payload must not take the answer with it ──
  {
    const { ctx, page } = await open();
    const withChart = GOOD + '\n\n```chart\n{"type":"bar"\n```';
    await page.route('**/api/chat', r => r.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `event: chunk\ndata: ${JSON.stringify({ text: withChart })}\n\nevent: done\ndata: {}\n\n` }));
    await ask(page, 'ارسملي مخطط');
    await page.waitForTimeout(2200);
    const text = await page.$$eval('.msg.assistant', els => els[els.length-1].innerText);
    ok(text.includes('جواب كامل'), 'a malformed chart does not delete the answer', text.slice(0, 90));
    await ctx.close();
  }

  // ── A cold start is retried once, without the user doing anything ──
  {
    const { ctx, page } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      if (calls === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"All AI providers failed."}' });
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: chunk\ndata: ${JSON.stringify({ text: GOOD })}\n\nevent: done\ndata: {}\n\n` });
    });
    await ask(page, 'اعمللي CV');
    await page.waitForTimeout(6000);
    ok(calls === 2, `a sleeping server is retried automatically (${calls} calls)`);
    const text = await page.$$eval('.msg.assistant', els => els[els.length-1].innerText);
    ok(text.includes('جواب كامل'), 'the user ends up with the answer, not an error', text.slice(0, 90));
    const users = await page.$$eval('.msg.user', els => els.map(e => e.innerText.trim()));
    ok(users.length === 1, `the question is asked once on screen (${users.length})`, users);
    await ctx.close();
  }

  // ── A persistent failure tells the truth and offers a working retry ──
  {
    const { ctx, page } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      if (calls <= 2) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"All AI providers failed."}' });
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `event: chunk\ndata: ${JSON.stringify({ text: GOOD })}\n\nevent: done\ndata: {}\n\n` });
    });
    await ask(page, 'اعمللي CV');
    await page.waitForTimeout(7000);
    const errText = await page.$$eval('.msg.assistant', els => els[els.length-1].innerText);
    ok(!/الخدمة جاهزة الآن/.test(errText), 'it no longer claims the service is ready', errText.slice(0, 120));
    ok(/السبب التقني/.test(errText), 'the real reason is shown so it can be diagnosed', errText.slice(0, 160));
    ok(/خدمات الذكاء/.test(errText) && !/نايم/.test(errText), 'every provider failing is not blamed on a sleeping server', errText.slice(0, 160));
    const retry = await page.$('.retry-row button');
    ok(Boolean(retry), 'a retry button is offered');

    // Pressing it must not ask the question twice.
    if (retry) {
      await retry.click();
      await page.waitForTimeout(2600);
      const users = await page.$$eval('.msg.user', els => els.map(e => e.innerText.trim()));
      ok(users.length === 1, `retry does not duplicate the question (${users.length} user bubbles)`, users);
      const last = await page.$$eval('.msg.assistant', els => els[els.length-1].innerText);
      ok(last.includes('جواب كامل'), 'retry actually delivers the answer', last.slice(0, 90));
      const sentErrors = await page.evaluate(() => (window.__lastBody?.messages || []).filter(m => m.role === 'assistant').length);
      ok(sentErrors === 0 || sentErrors === undefined, 'the error notice is not replayed to the model as context', sentErrors);
    }
    await ctx.close();
  }

  // ── A definite failure is NOT retried (no wasted generation) ──
  {
    const { ctx, page } = await open();
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls++;
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"AUTH_REQUIRED"}' });
    });
    await ask(page, 'مرحبا');
    await page.waitForTimeout(5000);
    ok(calls === 1, `an auth failure is not retried (${calls} call)`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

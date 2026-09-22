// "It decides to search, then it just stops." The page side of that report:
// the only limit on a streamed answer was a 180-second timer that was cleared
// as soon as response headers arrived — and the server sends those at once —
// so a stream that went silent left "searching…" on screen for good.
//
// /api/chat is replaced by a stream this suite controls, so the real page code
// meets real silences: nothing at all, half an answer then nothing, and a slow
// answer kept alive by the server's keep-alive comments.
const { launchBrowser, BASE_URL } = require('./harness');

const IDLE_MS = 1500;

// Replaces fetch for /api/chat only. window.__plan is a list of
// [delayMs, text] steps; text null closes the stream; anything not in the
// plan never arrives.
const FETCH_STUB = `
(() => {
  const realFetch = window.fetch.bind(window);
  window.__chatCalls = 0;
  window.__qjoStreamIdleMs = ${IDLE_MS};
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/chat')) return realFetch(input, init);
    window.__chatCalls++;
    const encoder = new TextEncoder();
    let controller;
    const body = new ReadableStream({ start(c) { controller = c; } });
    let at = 0;
    for (const [delay, text] of (window.__plan || [])) {
      at += delay;
      setTimeout(() => {
        try { text === null ? controller.close() : controller.enqueue(encoder.encode(text)); } catch (_) {}
      }, at);
    }
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  };
})();`;

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 240)); };

  async function open(plan) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(FETCH_STUB);
    await page.addInitScript(`window.__plan = ${JSON.stringify(plan)};`);
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    return { ctx, page, errors };
  }
  const ask = async (page, text) => { await page.fill('#input', text); await page.click('#sendBtn'); };
  const lastAssistant = (page) => page.$$eval('.msg.assistant', (els) => {
    const el = els[els.length - 1];
    if (!el) return null;
    return {
      text: (el.innerText || '').trim(),
      error: el.classList.contains('error') || Boolean(el.querySelector('.error')),
      continueRow: Boolean(el.querySelector('.qjo-continue-row'))
    };
  });

  // ── Nothing ever arrives ──
  {
    const { ctx, page, errors } = await open([[0, ': padding\n\n']]);
    await ask(page, 'مين هداف ريال مدريد هذا الموسم؟');
    await page.waitForTimeout(IDLE_MS * 2 + 1800 + 2500);
    const calls = await page.evaluate(() => window.__chatCalls);
    const last = await lastAssistant(page);
    ok(calls === 2, `a silent connection is retried once, automatically (${calls} requests)`);
    ok(last && /انقطع/.test(last.text), 'then the person is told the connection dropped', last);
    ok(Boolean(await page.$('.retry-row button')), 'and offered a retry');
    ok(!(await page.$('.tool-step.is-running')), 'nothing is left spinning');
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // ── Half an answer, then nothing ──
  {
    const { ctx, page, errors } = await open([[0, frame('chunk', { text: 'مبابي هو هداف الفريق هذا الموسم، ' })]]);
    await ask(page, 'مين هداف ريال مدريد؟');
    await page.waitForTimeout(IDLE_MS + 2500);
    const calls = await page.evaluate(() => window.__chatCalls);
    const last = await lastAssistant(page);
    ok(last && last.text.includes('مبابي هو هداف الفريق'), 'what arrived stays on screen', last);
    ok(last && !last.error, 'it is not replaced by an error', last);
    ok(last && last.continueRow, 'and it is offered as cut short, with a way to continue', last);
    ok(calls === 1, `no second generation is spent re-asking (${calls} requests)`);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // ── A slow answer kept alive by keep-alive comments ──
  {
    const plan = [];
    for (let i = 0; i < 8; i++) plan.push([500, ': keep-alive\n\n']);
    plan.push([200, frame('chunk', { text: 'الإجابة وصلت بعد انتظار طويل.' })], [50, frame('done', {})], [50, null]);
    const { ctx, page } = await open(plan);
    await ask(page, 'سؤال يحتاج وقت');
    await page.waitForTimeout(4000 + 2000);
    const last = await lastAssistant(page);
    ok(last && last.text.includes('الإجابة وصلت بعد انتظار طويل'), `4s of keep-alives past a ${IDLE_MS}ms limit is not a stall`, last);
    ok(last && !last.continueRow && !last.error, 'and the answer is treated as complete', last);
    ok(await page.evaluate(() => window.__chatCalls) === 1, 'without a retry');
    await ctx.close();
  }

  // ── A search in progress is visible as one ──
  {
    const running = frame('tool_call', { tool: 'web_search', label: 'Web search', detail: 'هداف ريال مدريد', status: 'running' });
    const done = frame('tool_call', { tool: 'web_search', label: 'Web search', detail: 'هداف ريال مدريد', status: 'done' });
    const { ctx, page } = await open([
      [0, running], [1000, ''], [300, done],
      [100, frame('chunk', { text: 'مبابي [1](https://example.com/a)' })], [50, frame('done', {})], [50, null]
    ]);
    await ask(page, 'مين هداف ريال مدريد؟');
    await page.waitForTimeout(600);
    const during = await page.$$eval('.tool-step', (els) => els.map((e) => ({ text: e.innerText.trim(), running: e.classList.contains('is-running'), spinner: Boolean(e.querySelector('.tool-spinner')) })));
    ok(during.length === 1 && during[0].running && during[0].spinner, 'while the search runs, a step says so, with a spinner', during);
    ok(during[0] && /بحث في الويب/.test(during[0].text) && during[0].text.includes('هداف ريال مدريد'), 'naming what is being searched, in the page language', during[0]);
    await page.waitForTimeout(2000);
    const after = await page.$$eval('.tool-step', (els) => els.map((e) => ({ running: e.classList.contains('is-running'), check: Boolean(e.querySelector('.tool-check')) })));
    ok(after.length === 1 && !after[0].running && after[0].check, 'when it finishes the same step is ticked, not duplicated', after);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

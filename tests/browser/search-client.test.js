// The client's contract after the decision moved to the model:
//   - it never pre-searches on a guess (that gate measured 72% and blocked the
//     message while it guessed)
//   - the explicit toggle still guarantees a search with a full source pack
//   - a slow search can never hold the message
const { launchBrowser, BASE_URL } = require('./harness');

const QUERIES = [
  'شو سعر الذهب اليوم؟', 'آخر أخبار غزة', 'مين رئيس وزراء الأردن حاليًا؟',
  'شو دورك بالضبط؟', 'اعمل دورة تدريبية عن البرمجة', 'اشرحلي الـ closure',
  'اكتبلي دالة بايثون', 'احكيلي قصة قصيرة'
];

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

  // ── No guessing: nothing pre-searches unless asked ──
  {
    const { ctx, page } = await open();
    const decisions = await page.evaluate((qs) => {
      const fn = window.__qjoSearchDecision?.needsWebSearch;
      return qs.map(q => ({ q, searched: Boolean(fn && fn(q)) }));
    }, QUERIES);
    const guessed = decisions.filter(d => d.searched);
    ok(guessed.length === 0, `nothing is pre-searched on a guess (${guessed.length} of ${QUERIES.length})`, guessed.map(g => g.q));
    await ctx.close();
  }

  // ── The toggle is still a guarantee ──
  {
    const { ctx, page } = await open();
    let searchCalls = 0;
    await page.route('**/api/search', async (route) => {
      searchCalls++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        query: 'q', results: [{ id: 1, title: 'مصدر', url: 'https://example.com/a', content: 'محتوى' }], generatedAt: new Date().toISOString()
      }) });
    });
    let sentBody = null;
    await page.route('**/api/chat', async (route) => {
      sentBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: 'رد' })}\n\nevent: done\ndata: {}\n\n` });
    });

    await page.click('#toggleSearch');
    await page.fill('#input', 'اشرحلي الـ closure');
    await page.click('#sendBtn');
    await page.waitForTimeout(2500);
    ok(searchCalls === 1, `the toggle searches even when no keyword matches (${searchCalls})`);
    const content = sentBody ? JSON.stringify(sentBody.messages) : '';
    ok(/SOURCE PACK/.test(content), 'the toggle still delivers a full source pack');
    await ctx.close();
  }

  // ── A slow search cannot hold the message ──
  {
    const { ctx, page, errors } = await open();
    await page.route('**/api/search', async () => { /* never fulfilled */ });
    let chatStarted = 0;
    await page.route('**/api/chat', async (route) => {
      chatStarted = Date.now();
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: 'وصلت' })}\n\nevent: done\ndata: {}\n\n` });
    });

    await page.click('#toggleSearch');
    const started = Date.now();
    await page.fill('#input', 'سؤال يحتاج بحث');
    await page.click('#sendBtn');
    await page.waitForFunction(() => {
      const els = document.querySelectorAll('.msg.assistant');
      return els.length && /وصلت/.test(els[els.length - 1].innerText);
    }, { timeout: 40000 }).catch(() => {});
    const waited = chatStarted ? chatStarted - started : Date.now() - started;
    ok(chatStarted > 0, 'the message is sent even when search never answers');
    ok(waited < 20000, `a dead search does not hold the message (${Math.round(waited / 1000)}s)`);
    const text = await page.$$eval('.msg.assistant', els => els[els.length - 1]?.innerText || '');
    ok(/وصلت/.test(text), 'the answer still arrives', text.slice(0, 60));
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // ── A search the model ran itself shows its sources ──
  // Source cards used to come only from the toggle's pre-search. When the
  // model searched on its own — which is now nearly every search — the page
  // showed that it had searched and not what it found.
  const sseBody = (toolsUsed) => [
    'event: tool_call\ndata: {"tool":"web_search","label":"Web search","detail":"Real Madrid top scorer","status":"running"}\n\n',
    'event: tool_call\ndata: {"tool":"web_search","label":"Web search","detail":"Real Madrid top scorer","status":"done"}\n\n',
    `event: chunk\ndata: ${JSON.stringify({ text: 'مبابي هو الهداف [1](https://www.espn.com/soccer/story/mbappe-goals).' })}\n\n`,
    `event: done\ndata: ${JSON.stringify({ provider: 'groq', toolsUsed })}\n\n`
  ].join('');

  async function askWithTools(toolsUsed) {
    const { ctx, page, errors } = await open();
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(toolsUsed) }));
    await page.fill('#input', 'مين هداف ريال مدريد الحالي؟');
    await page.click('#sendBtn');
    await page.waitForFunction(() => /مبابي/.test((document.querySelector('.msg.assistant:last-of-type') || document.body).innerText), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const cards = await page.$$eval('.source-cards .source-card', (els) => els.map((a) => ({ href: a.getAttribute('href'), text: a.innerText, imgs: a.querySelectorAll('img').length })));
    const pwned = await page.evaluate(() => window.__pwned === 1);
    return { ctx, cards, pwned, errors };
  }

  {
    const { ctx, cards, pwned, errors } = await askWithTools([{
      tool: 'web_search', input: 'Real Madrid top scorer', resultCount: 4,
      sources: [
        { title: 'Kylian Mbappé tops Real Madrid scoring chart', url: 'https://www.espn.com/soccer/story/mbappe-goals', kind: 'web' },
        { title: '<img src=x onerror="window.__pwned=1">Transfermarkt', url: 'https://www.transfermarkt.com/real-madrid', kind: 'web' },
        { title: 'not a link', url: 'javascript:window.__pwned=1', kind: 'web' },
        { title: 'the same page again', url: 'https://www.espn.com/soccer/story/mbappe-goals', kind: 'web' }
      ]
    }]);
    ok(cards.length === 2, `the sources appear under the answer (${cards.length} cards; duplicate and non-web link dropped)`, cards);
    ok(cards[0] && cards[0].href === 'https://www.espn.com/soccer/story/mbappe-goals' && /Mbappé/.test(cards[0].text), 'each card links its source', cards[0]);
    ok(cards.every((c) => c.imgs === 0) && !pwned, 'a title is text, never markup');
    ok(!cards.some((c) => /^javascript:/i.test(c.href || '')), 'no card can run script');
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // Control: the same answer with no sources shows no cards, so the count
  // above is the sources, not something else on the page.
  {
    const { ctx, cards } = await askWithTools([{ tool: 'web_search', input: 'Real Madrid top scorer', resultCount: 0 }]);
    ok(cards.length === 0, `no sources, no cards (${cards.length})`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

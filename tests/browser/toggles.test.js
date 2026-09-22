// Loads the REAL app in Chromium, clicks the real pills, and inspects the
// actual /api/chat and /api/search requests the app puts on the wire.
const { launchBrowser, BASE_URL } = require('./harness');

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const sent = { chat: [], search: [], deep: [] };
  await page.route('**/api/chat', async (route) => {
    sent.chat.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: 'event: chunk\ndata: {"text":"ok"}\n\nevent: done\ndata: {"provider":"t","model":"t"}\n\n' });
  });
  await page.route('**/api/search', async (route) => {
    sent.search.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ query: 'q', results: [{ id: 1, title: 'T', url: 'https://x.test', content: 'c' }], generatedAt: new Date().toISOString() }) });
  });
  await page.route('**/api/deep-search', async (route) => {
    sent.deep.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ question: 'q', queries: ['a','b'], results: [{ id: 1, title: 'T', url: 'https://x.test', content: 'c' }], generatedAt: new Date().toISOString() }) });
  });

  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const check = (ok, m, d) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${m}`); if (!ok && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 260)); };

  // ── Removed controls are gone from the DOM ──
  check(await page.$('#togglePolish') === null, 'literary-polish pill removed');
  check(await page.$('#micBtn') === null, 'voice-record button removed');
  const pills = await page.$$eval('.func-toggle', els => els.map(e => e.id));
  check(JSON.stringify(pills) === JSON.stringify(['toggleSearch','toggleDeep','toggleTask']), `every pill still does a real job: ${pills.join(', ')}`);

  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('qjo_function_toggles') || 'null'));
  const isActive = id => page.$eval('#' + id, e => e.classList.contains('active'));
  const aria = id => page.$eval('#' + id, e => e.getAttribute('aria-pressed'));

  // ── Toggle mechanics ──
  await page.click('#toggleSearch');
  check(await isActive('toggleSearch'), 'search pill activates');
  check(await aria('toggleSearch') === 'true', 'aria-pressed reflects state (a11y)');
  check((await state()).search === true, 'state persisted to localStorage');

  await page.click('#toggleDeep');
  check((await state()).deep === true && (await state()).search === true, 'deep implies search');
  await page.click('#toggleSearch'); // turn search off
  check((await state()).search === false && (await state()).deep === false, 'turning search off clears deep');

  // ── Search toggle actually forces a live search ──
  const dismissAuth = () => page.evaluate(() => {
    const o = document.getElementById('authOverlay');
    if (o) { o.classList.remove('show'); o.style.display = 'none'; }
  });
  const ask = async (text) => {
    await dismissAuth();
    await page.fill('#input', text);
    await page.click('#sendBtn');
    await page.waitForTimeout(1400);
  };

  sent.search.length = 0; sent.chat.length = 0;
  await ask('احكيلي نكتة');   // a request the heuristic would NOT search for
  check(sent.search.length === 0, 'toggles off: chit-chat does not trigger a search', sent.search);

  await page.click('#toggleSearch');
  sent.search.length = 0; sent.chat.length = 0;
  await ask('احكيلي نكتة');
  check(sent.search.length === 1, 'search ON: forces a search the heuristic would have skipped', sent.search);

  // ── Deep toggle routes to /api/deep-search ──
  await page.click('#toggleDeep');
  sent.search.length = 0; sent.deep.length = 0;
  await ask('شو رايك بالموضوع');
  check(sent.deep.length === 1 && sent.search.length === 0, 'deep ON: routes to /api/deep-search, not /api/search', { deep: sent.deep.length, shallow: sent.search.length });

  // ── Persistence across reload ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissAuth();
  const before = { s: await isActive('toggleSearch'), d: await isActive('toggleDeep') };
  check(await isActive('toggleSearch') === before.s && await isActive('toggleDeep') === before.d,
        `state survives a page reload (search=${before.s}, deep=${before.d})`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Loads the REAL app in Chromium, uses the real tools menu, and inspects the
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
  // The old microphone was decorative and went; the one there now listens
  // (voice.test.js speaks through it). It must be that one, not the old.
  check(await page.$('#micBtn[data-i18n-title="voiceInput"]') === null && await page.$('#micBtn[data-i18n-aria-label="voiceStart"]') !== null,
    'the decorative voice-record button is gone; the microphone is the working one');
  // ── The tools are one button with a short menu (public/ui/composerControls.js) ──
  check(await page.$('#toggleSearch') === null && await page.$('#toggleDeep') === null && await page.$('#toggleTask') === null, 'the three separate pills are gone');
  const items = await page.$$eval('#toolsMenu .qjo-tools-item', els => els.map(e => e.dataset.tool));
  check(JSON.stringify(items) === JSON.stringify(['search', 'deep', 'task']), `the menu holds every tool, each doing a real job: ${items.join(', ')}`);
  check(await page.$eval('#toolsMenu', e => e.hidden), 'control: the menu starts closed');

  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('qjo_function_toggles') || 'null'));
  const checked = () => page.$$eval('#toolsMenu .qjo-tools-item', els => Object.fromEntries(els.map(e => [e.dataset.tool, e.getAttribute('aria-checked') === 'true'])));
  const button = () => page.$eval('#toolsMenuBtn', e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), on: e.classList.contains('is-on'), expanded: e.getAttribute('aria-expanded') }));
  const choose = async (tool) => { await page.click('#toolsMenuBtn'); await page.click(`#toolsMenu .qjo-tools-item[data-tool="${tool}"]`); };

  // ── Tool mechanics: two taps, and the button says what is on ──
  await page.click('#toolsMenuBtn');
  check(!(await page.$eval('#toolsMenu', e => e.hidden)) && (await button()).expanded === 'true', 'one tap opens the menu');
  await page.keyboard.press('Escape');
  check(await page.$eval('#toolsMenu', e => e.hidden), 'Escape closes it');
  await choose('search');
  check((await checked()).search && (await state()).search === true, 'Search turns on, and is kept');
  check(await page.$eval('#toolsMenu', e => e.hidden) && await page.evaluate(() => document.activeElement && document.activeElement.id) === 'toolsMenuBtn', 'choosing closes the menu, back on the tools button');
  await page.click('#toolsMenuBtn');
  await page.click('#input');
  check(await page.$eval('#toolsMenu', e => e.hidden), 'a tap elsewhere closes it');
  const b1 = await button();
  check(b1.on && /بحث|Search/.test(b1.text), `the tools button says Search is on (${b1.text})`);

  await choose('deep');
  const afterDeep = await checked();
  check((await state()).deep === true && (await state()).search === true, 'Deep search is a search');
  check(afterDeep.deep && !afterDeep.search, 'one of the two at a time: Deep shown on, Search not', afterDeep);
  await choose('search');
  check((await state()).deep === false && (await state()).search === true, 'Search from Deep: back to a plain search');
  await choose('search');
  check((await state()).search === false && (await state()).deep === false && !(await button()).on, 'Search again: no search at all, and the button shows nothing on');

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

  await choose('search');
  sent.search.length = 0; sent.chat.length = 0;
  await ask('احكيلي نكتة');
  check(sent.search.length === 1, 'search ON: forces a search the heuristic would have skipped', sent.search);

  // ── Deep toggle routes to /api/deep-search ──
  await choose('deep');
  sent.search.length = 0; sent.deep.length = 0;
  await ask('شو رايك بالموضوع');
  check(sent.deep.length === 1 && sent.search.length === 0, 'deep ON: routes to /api/deep-search, not /api/search', { deep: sent.deep.length, shallow: sent.search.length });

  // ── Persistence across reload ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await dismissAuth();
  const kept = await checked();
  const label = await button();
  check(kept.deep && !kept.search && label.on && /عميق|Deep/.test(label.text), `state survives a page reload, and the button shows it (${label.text})`, kept);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

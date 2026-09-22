// A module that fails to load must never leave the page dead and silent.
const { launchBrowser, BASE_URL } = require('./harness');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 220)); };

  // ── A clean load is untouched ──
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    ok(await page.evaluate(() => window.__qjoBootOk === true), 'a normal load passes the boot check');
    ok(!(await page.$('.qjo-load-failure')), 'no failure notice on a normal load');
    ok(errors.length === 0, 'no page errors on a normal load', errors.slice(0, 2));
    await ctx.close();
  }

  // ── Every module, dropped permanently ──
  for (const blocked of ['/domain/markdown.js', '/domain/requestFailure.js', '/domain/streamProtocol.js', '/ui/streamingView.js']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let navigations = 0;
    page.on('framenavigated', f => { if (f === page.mainFrame()) navigations++; });
    await page.route('**' + blocked + '*', r => r.abort('failed'));
    await page.goto(BASE_URL + '/', { waitUntil: 'commit', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4500);

    const notice = await page.$eval('.qjo-load-failure', e => e.innerText).catch(() => null);
    ok(Boolean(notice), `${blocked} missing → the person is told`, notice);
    ok(navigations <= 2, `${blocked} missing → one retry, not a reload loop (${navigations} navigations in 4.5s${navigations > 2 ? ' — RELOAD LOOP' : ''})`);
    const hasButton = await page.$('.qjo-load-failure button');
    ok(Boolean(hasButton), `${blocked} missing → a way to retry is offered`);
    await ctx.close();
  }

  // ── A dropped request that recovers on reload heals itself ──
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let attempts = 0;
    await page.route('**/domain/markdown.js*', (route) => {
      attempts++;
      // Fails the first time only, the way a flaky connection does.
      if (attempts === 1) return route.abort('failed');
      return route.continue();
    });
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    ok(attempts >= 2, `the missing module was re-requested (${attempts} attempts)`);
    ok(await page.evaluate(() => window.__qjoBootOk === true), 'a transient failure heals itself with one reload');
    ok(!(await page.$('.qjo-load-failure')), 'no notice once it healed');
    const composer = await page.$('#input');
    ok(Boolean(composer), 'the app is usable after healing');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

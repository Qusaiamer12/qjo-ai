// Covers the two defects reported from real use: streamed words glued together,
// and being thrown back to the login screen seconds after signing in.
const { launchBrowser, devices, BASE_URL } = require('./harness');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 240)); };

  // ── Streaming must not eat the spaces between chunks ──
  {
    const page = await (await browser.newContext()).newPage();
    // Tokens carry their own leading space, exactly how providers stream.
    const TOKENS = ['أهلاً', ' يا', ' قلبي', '!', ' كيفك', ' اليوم', '؟', ' 🌟'];
    const EXPECTED = TOKENS.join('');
    await page.route('**/api/chat', async (route) => {
      let body = '';
      for (const t of TOKENS) body += `event: chunk\ndata: ${JSON.stringify({ text: t })}\n\n`;
      body += 'event: done\ndata: {}\n\n';
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { const o = document.getElementById('authOverlay'); if (o) { o.classList.remove('show'); o.style.display = 'none'; } });
    await page.fill('#input', 'شو يا قلبي');
    await page.click('#sendBtn');
    await page.waitForTimeout(2000);

    const rendered = (await page.$eval('.msg.assistant .qjo-streamed-content', e => e.innerText)).trim();
    ok(rendered === EXPECTED.trim(), `streamed text keeps its spaces`, { got: rendered, want: EXPECTED.trim() });
    ok(!/أهلاًيا|قلبي!كيفك/.test(rendered), 'words are not glued together', rendered);

    // A long multi-sentence answer, split at awkward points.
    const LONG = 'هذا شرح تفصيلي. '.repeat(6) + 'وينتهي هنا.';
    const chunks = LONG.match(/.{1,7}/gs);
    await page.route('**/api/chat', async (route) => {
      let body = '';
      for (const c of chunks) body += `event: chunk\ndata: ${JSON.stringify({ text: c })}\n\n`;
      body += 'event: done\ndata: {}\n\n';
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });
    await page.fill('#input', 'اشرحلي');
    await page.click('#sendBtn');
    await page.waitForTimeout(2200);
    const long = (await page.$$eval('.msg.assistant .qjo-streamed-content', els => els[els.length - 1].innerText)).trim();
    ok(long === LONG.trim(), 'an answer split mid-word reassembles exactly', { got: long.slice(0, 70), want: LONG.trim().slice(0, 70) });
  }

  // ── A transient null must not eject a signed-in user ──
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);

    const timing = await page.evaluate(() => {
      const src = document.querySelector('script[src*="app.js"]');
      return fetch(src ? src.src : '/app.js').then(r => r.text()).then(t => ({
        coldDelay: (t.match(/AUTH_NULL_DELAY_COLD_MS\s*=\s*(\d+)/) || [])[1],
        warmDelay: (t.match(/AUTH_NULL_DELAY_AFTER_SIGNIN_MS\s*=\s*(\d+)/) || [])[1],
        tracksSession: /hasAuthenticatedThisSession\s*=\s*true/.test(t),
        persistenceLadder: /Persistence\.NONE/.test(t),
        oldShortTimer: /inAuthGrace\(\)\s*\?\s*2500\s*:\s*350/.test(t)
      }));
    });
    ok(!timing.oldShortTimer, 'the 350ms eject timer is gone');
    ok(Number(timing.warmDelay) >= 8000, `a signed-in session gets a long grace (${timing.warmDelay}ms)`);
    ok(Number(timing.coldDelay) >= 1000, `a cold page still waits before ejecting (${timing.coldDelay}ms)`);
    ok(timing.tracksSession, 'the page remembers it has had a real user');
    ok(timing.persistenceLadder, 'persistence degrades instead of failing the sign-in');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

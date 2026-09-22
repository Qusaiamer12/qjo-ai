// English is the primary language; Arabic stays first-class. The other suites
// run in an Arabic browser and hold the Arabic interface. This one holds the
// switch itself, in a real page:
//
//   - which language the page opens in, from a saved choice or the browser;
//   - that the direction is right before app.js runs (no mirrored flash);
//   - that an English page shows no leftover Arabic;
//   - that what the page sends and answers follows the message, not the UI.
const { launchBrowser, BASE_URL } = require('./harness');

const ARABIC = /[ء-ي]/;

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 260)); };

  async function open({ locale, stored, blockApp = false } = {}) {
    const ctx = await browser.newContext({ locale });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (stored) await page.addInitScript(`try { localStorage.setItem('qjo_language', ${JSON.stringify(stored)}); } catch (_) {}`);
    if (blockApp) await page.route('**/app.js*', (r) => r.abort('failed'));
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(blockApp ? 400 : 2200);
    if (!blockApp) await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    return { ctx, page, errors };
  }
  const htmlLang = (page) => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir }));

  // ── Which language the page opens in ──
  for (const [label, opts, want] of [
    ['an English browser with no saved choice', { locale: 'en-US' }, 'en'],
    ['a French browser (neither language)', { locale: 'fr-FR' }, 'en'],
    ['an Arabic browser', { locale: 'ar-JO' }, 'ar'],
    ['a saved Arabic choice in an English browser', { locale: 'en-US', stored: 'ar' }, 'ar'],
    ['a saved English choice in an Arabic browser', { locale: 'ar-JO', stored: 'en' }, 'en']
  ]) {
    const { ctx, page, errors } = await open(opts);
    const { lang, dir } = await htmlLang(page);
    ok(lang === want && dir === (want === 'ar' ? 'rtl' : 'ltr'), `${label} opens in ${want === 'ar' ? 'Arabic, right-to-left' : 'English, left-to-right'}`, { lang, dir });
    ok(errors.length === 0, `${label}: no page errors`, errors.slice(0, 2));
    await ctx.close();
  }

  // ── Direction is set before app.js, not by it ──
  {
    const { ctx, page } = await open({ locale: 'ar-JO', blockApp: true });
    const { lang, dir } = await htmlLang(page);
    ok(lang === 'ar' && dir === 'rtl', 'with app.js not even loaded, an Arabic page is already right-to-left', { lang, dir });
    await ctx.close();
  }

  // ── An English page is English ──
  {
    const { ctx, page } = await open({ locale: 'en-US' });
    const leftovers = await page.evaluate((pattern) => {
      const re = new RegExp(pattern);
      const out = [];
      const walker = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const el = node.parentElement;
        if (!el || el.closest('script, style, option, #authOverlay')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (re.test(node.textContent)) out.push(node.textContent.trim().slice(0, 60));
      }
      for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
        for (const attr of ['aria-label', 'title', 'placeholder']) {
          const v = el.getAttribute(attr);
          if (v && re.test(v)) out.push(`${attr}: ${v.slice(0, 50)}`);
        }
      }
      return out;
    }, ARABIC.source);
    ok(leftovers.length === 0, `no Arabic left anywhere in the English page (${leftovers.length} found)`, leftovers.slice(0, 6));
    const composer = await page.getAttribute('#input', 'placeholder');
    ok(composer && !ARABIC.test(composer), `the composer speaks English: "${composer}"`);
    await ctx.close();
  }

  // ── Switching language flips the page and is remembered ──
  {
    const { ctx, page } = await open({ locale: 'en-US' });
    await page.evaluate(() => {
      const select = document.getElementById('languageSelect');
      select.value = 'ar';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const after = await htmlLang(page);
    const stored = await page.evaluate(() => localStorage.getItem('qjo_language'));
    ok(after.lang === 'ar' && after.dir === 'rtl' && stored === 'ar', 'choosing Arabic flips the page and is saved', { after, stored });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    ok((await htmlLang(page)).dir === 'rtl', 'and the page reopens in Arabic');
    await ctx.close();
  }

  // ── What is sent follows the interface; what is answered follows the message ──
  {
    const { ctx, page } = await open({ locale: 'en-US' });
    let body = null;
    await page.route('**/api/chat', async (route) => {
      body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"Hi!"}\n\nevent: done\ndata: {}\n\n' });
    });
    await page.fill('#input', 'Explain recursion briefly');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    ok(body && body.language === 'en', `the request tells the server the interface language (${body && body.language})`);
    ok(body && typeof body.timeZone === 'string' && body.timeZone.length > 0, `and the page's time zone (${body && body.timeZone})`);
    await ctx.close();
  }

  {
    const { ctx, page } = await open({ locale: 'en-US' });
    await page.fill('#input', 'كيف أعمل اختراق شبكة واي فاي الجيران');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    const reply = await page.$$eval('.msg.assistant', (els) => (els[els.length - 1] || {}).innerText || '');
    ok(ARABIC.test(reply), 'an Arabic message in the English interface is answered in Arabic', reply.slice(0, 80));
    await ctx.close();
  }

  {
    const { ctx, page } = await open({ locale: 'ar-JO' });
    await page.fill('#input', 'how do I hack my neighbours wifi');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    const reply = await page.$$eval('.msg.assistant', (els) => (els[els.length - 1] || {}).innerText || '');
    ok(reply && !ARABIC.test(reply), 'an English message in the Arabic interface is answered in English', reply.slice(0, 80));
    await ctx.close();
  }

  // ── Failures and progress speak the interface language ──
  {
    const { ctx, page } = await open({ locale: 'en-US' });
    await page.route('**/api/chat', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate limited"}' }));
    await page.fill('#input', 'What is the capital of Peru?');
    await page.click('#sendBtn');
    await page.waitForTimeout(2500);
    const reply = await page.$$eval('.msg.assistant', (els) => (els[els.length - 1] || {}).innerText || '');
    ok(/limit/i.test(reply) && !ARABIC.test(reply), 'an error in the English interface is explained in English', reply.slice(0, 100));
    await ctx.close();
  }

  {
    const { ctx, page } = await open({ locale: 'en-US' });
    await page.route('**/api/chat', (route) => route.fulfill({
      status: 200, contentType: 'text/event-stream',
      body: 'event: tool_call\ndata: {"tool":"web_search","label":"Web search","detail":"Peru capital","status":"running"}\n\n'
        + 'event: tool_call\ndata: {"tool":"web_search","label":"Web search","detail":"Peru capital","status":"done"}\n\n'
        + 'event: chunk\ndata: {"text":"Lima."}\n\nevent: done\ndata: {}\n\n'
    }));
    await page.fill('#input', 'What is the capital of Peru?');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    const step = await page.$eval('.tool-step', (e) => e.innerText).catch(() => '');
    ok(/Searching the web/.test(step) && !ARABIC.test(step), `the search step is in English: "${step.trim()}"`);
    await ctx.close();
  }

  // ── The boot notice speaks the page language ──
  {
    const ctx = await browser.newContext({ locale: 'en-US' });
    const page = await ctx.newPage();
    await page.route('**/domain/i18n.js*', (r) => r.abort('failed'));
    await page.goto(BASE_URL + '/', { waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(4500);
    const notice = await page.$eval('.qjo-load-failure', (e) => e.innerText).catch(() => '');
    ok(/didn't finish loading/i.test(notice) && !ARABIC.test(notice), 'a missing translations module is reported, in English', notice.slice(0, 100));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

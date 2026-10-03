// A site from an answer, outside the answer: in a tab of its own, and as the
// index.html file it is — through the real page, with the libraries the site
// uses served from this package.
//
// Checked: the buttons under the preview and in the studio, named in the
// page's language; the tab shows the site in a frame sandboxed without
// same-origin, titled as the site is, its links and other pages working, and
// a reload keeps it; the downloaded file is the site with its styles and
// scripts in it and without the preview's guard, and it runs as a file;
// what is downloaded from the studio is what was edited there. And the tab
// listens only to the app that opened it: opened by itself, or sent a page
// by anything else, it shows nothing — against a control where the same
// message from the app is shown.
const fs = require('fs');
const path = require('path');
const { launchBrowser, BASE_URL } = require('./harness');
const { serveSiteAssets } = require('./siteQuality');

const SITE = fs.readFileSync(path.join(__dirname, 'fixtures', 'site-cafe.html'), 'utf8');
const ABOUT = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>من نحن</title></head><body><h1>صفحة من نحن</h1><a id="back" href="index.html">الرئيسية</a></body></html>';
const SITE_WITH_PAGE = SITE.replace('<a href="#home" class="font-semibold', '<a id="to-about" href="about.html" class="font-semibold');
const ANSWER = 'هذا موقع المقهى:\n\n```html\n' + SITE_WITH_PAGE + '\n```\n\n```html:about.html\n' + ABOUT + '\n```\n\nفيه قائمة وحجز ووضع ليلي.';
const GUARD_MARK = 'qjo-preview-note';

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

// The page as a file: its name, what is in it, and that it runs as one.
async function downloaded(ctx, page) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.preview-download-btn')]);
  const file = download ? fs.readFileSync(await download.path(), 'utf8') : '';
  ok(download && download.suggestedFilename() === 'index.html', `the file is index.html (${download && download.suggestedFilename()})`);
  ok(file.includes('مقهى الياسمين') && file.includes('https://cdn.tailwindcss.com') && file.includes('lucide.createIcons') && !file.includes(GUARD_MARK), 'it is the site, its scripts in it, without the preview\'s guard');
  const opened = await ctx.newPage();
  const fileErrors = [];
  opened.on('pageerror', (e) => fileErrors.push(e.message));
  // Saved under its name: a file without .html is shown as text.
  const saved = path.join(require('os').tmpdir(), `qjo-${process.pid}-index.html`);
  await download.saveAs(saved);
  await opened.goto('file://' + saved);
  await opened.waitForTimeout(1200);
  const asFile = { h1: await opened.$eval('h1', (h) => h.textContent).catch(() => ''), icons: await opened.$$eval('svg.lucide', (s) => s.length), errors: fileErrors };
  ok(asFile.h1 === 'فنجانك الأحلى بجبل عمّان' && asFile.icons > 0 && fileErrors.length === 0, 'opened as a file, it runs', asFile);
  await opened.close();
  fs.rmSync(saved, { force: true });
}

// The page in a tab of its own.
async function tabOfItsOwn(ctx, page) {
  const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.click('.preview-tab-btn')]);
  ok(Boolean(tab), 'open in a tab opens one');
  if (tab) {
    const tabErrors = [];
    tab.on('pageerror', (e) => tabErrors.push(e.message));
    await tab.waitForLoadState('domcontentloaded');
    await tab.waitForSelector('iframe.qjo-tab-frame', { timeout: 5000 }).catch(() => null);
    await tab.waitForTimeout(1500);
    const frameEl = await tab.$('iframe.qjo-tab-frame');
    const sandbox = frameEl ? (await frameEl.getAttribute('sandbox')).split(/\s+/) : [];
    ok(new URL(tab.url()).pathname === '/preview.html' && sandbox.includes('allow-scripts') && !sandbox.includes('allow-same-origin'), `at /preview.html, the site in a frame sandboxed without same-origin (${sandbox.join(' ')})`);
    ok(await tab.title() === 'مقهى الياسمين — قهوة مختصة في جبل عمّان', `the tab is titled as the site is (${await tab.title()})`);
    const site = frameEl && await frameEl.contentFrame();
    const reach = site && await site.evaluate(() => { let p = 'blocked'; try { p = window.parent.document ? 'READ' : 'none'; } catch (_) { /* expected */ } return { origin: window.origin, parent: p }; });
    ok(reach && reach.origin === 'null' && reach.parent === 'blocked', 'the site cannot reach the tab or the app', reach);
    if (site) {
      await site.click('header a[href="#about"]');
      await tab.waitForTimeout(1200);
      const at = await site.evaluate(() => ({ top: document.getElementById('about').getBoundingClientRect().top, y: window.scrollY }));
      ok(site.url() === 'about:srcdoc' && at.y > 500 && Math.abs(at.top) < 160, 'a section link scrolls to its section, and the tab stays the site', { url: site.url(), ...at });
      await site.click('#to-about');
      await tab.waitForTimeout(1200);
      const other = await (await tab.$('iframe.qjo-tab-frame')).contentFrame();
      ok(/صفحة من نحن/.test(await other.evaluate(() => document.body.innerText)) && await tab.title() === 'من نحن', 'a link to another page of the answer shows it, here');
    }
    await tab.reload({ waitUntil: 'domcontentloaded' });
    await tab.waitForTimeout(1500);
    const again = await tab.$('iframe.qjo-tab-frame');
    // The page it was on, not the one the app first sent: the app, asked again, would send that.
    ok(again && /صفحة من نحن/.test(await (await again.contentFrame()).evaluate(() => document.body.innerText)), 'a reload keeps the page it was showing');
    ok(tabErrors.length === 0, 'no errors in the tab', tabErrors.slice(0, 2));
    await tab.close();
  }
}

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  await serveSiteAssets(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sent = [];
  await page.route('**/api/chat', (route) => {
    sent.push(route.request().postDataJSON());
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: ANSWER })}\n\nevent: done\ndata: {}\n\n` });
  });
  // What the page asked for: its answer room, and whether it sent its coding capsule.
  const asked = (body) => ({ room: body && body.max_tokens, capsule: Boolean(body && (body.messages || []).some((m) => m.role === 'system' && /Coding capsule/.test(String(m.content)))) });
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");

  try {
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    await page.fill('#input', 'صمملي موقع لمقهى');
    await page.click('#sendBtn');
    await page.waitForSelector('.live-preview-tab-btn', { timeout: 8000 });
    await page.click('.live-preview-tab-btn');
    await page.waitForTimeout(1500);

    const site = asked(sent[0]);
    ok(site.room === 7000 && !site.capsule, `a site is asked for with all the room there is, and no coding capsule (${JSON.stringify(site)})`);
    const inline = await (await page.$('.live-preview-iframe')).contentFrame();
    ok(/مقهى الياسمين/.test(await inline.evaluate(() => document.title)) && await inline.$$eval('svg.lucide', (s) => s.length) > 0, 'control: the preview runs the site — Tailwind and its icons drawn');

    const labels = await page.$$eval('.preview-toolbar .preview-tab-btn, .preview-toolbar .preview-download-btn', (bs) => bs.map((b) => b.getAttribute('aria-label')));
    ok(labels.join(' | ') === 'افتح بتاب جديد | تحميل index.html | افتح بتاب جديد | تحميل about.html', `under each page's preview: open in a tab, download it by its name — in Arabic (${labels.join(' | ')})`);

    await downloaded(ctx, page);
    await tabOfItsOwn(ctx, page);

    // ── The tab listens only to the app that opened it ──
    const alone = await ctx.newPage();
    await alone.goto(BASE_URL + '/preview.html', { waitUntil: 'domcontentloaded' });
    await alone.evaluate((answer) => {
      const html = /```html\n([\s\S]*?)\n```/.exec(answer)[1];
      window.postMessage({ qjoPreviewTab: 'show', project: { kind: 'html', files: [{ name: 'index.html', lang: 'html', role: 'main', code: html }] }, blocks: [], strings: {} }, '*');
    }, ANSWER);
    await alone.waitForTimeout(2000);
    ok(!(await alone.$('iframe.qjo-tab-frame')) && await alone.isVisible('#qjo-tab-wait'), 'opened by itself and sent a page by anything but the app, it shows nothing — and says where a preview comes from');
    await alone.close();

    // ── The studio ──
    await page.click('.preview-expand-btn');
    await page.waitForSelector('.qjo-canvas:not([hidden])', { timeout: 5000 });
    const studio = await page.$$eval('.qjo-canvas-tab-open, .qjo-canvas-download', (bs) => bs.map((b) => b.getAttribute('aria-label')));
    ok(studio.join(' | ') === 'افتح بتاب جديد | تحميل index.html', `the studio has both, in Arabic (${studio.join(' | ')})`);
    // A link to another page of the answer, in the studio: the download is that page's file.
    await (await (await page.$('.qjo-canvas-frame')).contentFrame()).click('#to-about');
    await page.waitForTimeout(1200);
    const renamed = await page.$eval('.qjo-canvas-download', (b) => b.getAttribute('aria-label'));
    const [aboutFile] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.qjo-canvas-download')]);
    ok(renamed === 'تحميل about.html' && aboutFile && aboutFile.suggestedFilename() === 'about.html', `after a link to another page, the studio downloads that page (${renamed}, ${aboutFile && aboutFile.suggestedFilename()})`);
    await page.keyboard.press('Escape');
    await page.click('.preview-expand-btn');
    await page.waitForSelector('.qjo-canvas:not([hidden])', { timeout: 5000 });
    await page.click('.qjo-canvas-tab[data-view="code"]');
    await page.fill('.qjo-canvas-editor', SITE_WITH_PAGE.replace('فنجانك الأحلى بجبل عمّان', 'نسخة معدّلة من الاستوديو'));
    const [edited] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.qjo-canvas-download')]);
    const editedText = edited ? fs.readFileSync(await edited.path(), 'utf8') : '';
    ok(editedText.includes('نسخة معدّلة من الاستوديو') && !editedText.includes('فنجانك الأحلى بجبل عمّان'), 'the studio downloads what was edited there');

    // A browser that blocks the tab: said, not silent.
    await page.evaluate(() => { window.open = () => null; });
    await page.click('.qjo-canvas-tab-open');
    await page.waitForTimeout(400);
    const toast = await page.evaluate(() => document.body.innerText);
    ok(/المتصفح منع فتح تاب جديد/.test(toast), 'a blocked tab is said so');
    await page.keyboard.press('Escape');

    // A change asked of the page is a site too; a bug in someone's own component is code.
    await page.fill('#input', 'خليه أغمق وزيد قسم للحجز');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    const change = asked(sent[sent.length - 1]);
    ok(sent.length === 2 && change.room === 7000 && !change.capsule, `a change to the page is asked for as a site (${JSON.stringify(change)})`);
    await page.click('#newChatBtn');
    await page.waitForTimeout(500);
    await page.fill('#input', 'Fix this bug: TypeError in my React component');
    await page.click('#sendBtn');
    await page.waitForTimeout(1500);
    const code = asked(sent[sent.length - 1]);
    ok(sent.length === 3 && code.room === 4200 && code.capsule, `control: a bug in a component is asked for as code — its budget and the coding capsule (${JSON.stringify(code)})`);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

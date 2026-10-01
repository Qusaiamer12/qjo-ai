// What Qjo offers before anything is asked, through the real page, on a
// desktop and a phone, in Arabic and English.
//
// The starters were eight developer groups (UI components, themes, landing
// pages…), and a phone showed none of them: a headline on an empty screen,
// the groups behind the tools button. Checked: the groups lead to what Qjo
// does — files, study, research, code, photos, charts, writing, plans — a
// phone shows them on its welcome screen without scrolling the page
// sideways, a starter goes into the composer as written, one that needs a
// file of yours opens the file picker, and a file starter, sent, ends with
// that file ready under the answer.
const { launchBrowser, BASE_URL } = require('./harness');

const GROUPS = ['files', 'study', 'research', 'code', 'images', 'charts', 'write', 'plan'];
const LABELS = {
  ar: ['ملفات وورد وPDF', 'ادرس وافهم', 'ابحث بمصادر', 'برمجة ومعاينة', 'اسأل عن صورة', 'جداول ورسوم', 'كتابة', 'خطط ونظّم'],
  en: ['Word & PDF files', 'Study', 'Research with sources', 'Code & preview', 'Ask about a photo', 'Tables & charts', 'Writing', 'Plan']
};
const CV = ['# السيرة الذاتية', '', '**الاسم:** أحمد', '', '## الخبرات', '- مطور ويب في شركة تقنية منذ 2020', '- بناء واجهات React وخدمات Node.js', '', '## المهارات', '- JavaScript', '- Python'].join('\n');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

// phone: its screen, or null for a desktop.
async function open(browser, lang, phone) {
  const ctx = await browser.newContext(phone ? { viewport: phone, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: CV })}\n\nevent: done\ndata: {}\n\n` }));
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page, errors };
}

// The groups a person can see and reach: on a desktop the row under the
// composer, on a phone the welcome screen's.
const groupsSeen = (page, phone) => page.evaluate((onPhone) => {
  const host = document.querySelector(onPhone ? '#welcomeStarters' : '#quickCommandCats');
  if (!host) return null;
  const buttons = [...host.querySelectorAll('button')];
  // Above the composer, which a phone fixes to the bottom of the screen.
  // (On a desktop the groups are part of the composer.)
  const floor = Math.min(window.innerHeight, ...(onPhone ? [...document.querySelectorAll('.composer-wrap')].filter((c) => c.getClientRects().length).map((c) => c.getBoundingClientRect().top) : []));
  const inView = (b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= floor; };
  return {
    groups: buttons.map((b) => b.dataset.cat),
    labels: buttons.map((b) => b.innerText.trim()),
    shown: buttons.length > 0 && buttons.every((b) => b.getClientRects().length > 0 && inView(b)),
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    subtitle: (() => { const p = document.querySelector('#welcomeText'); const r = p && p.getBoundingClientRect(); return Boolean(r && r.height > 0 && Number(getComputedStyle(p).opacity) > 0.5); })()
  };
}, phone);

async function check(browser, lang, phone) {
  const where = `${lang}, ${phone ? `phone ${phone.width}x${phone.height}` : 'desktop'}`;
  const { ctx, page, errors } = await open(browser, lang, phone);
  const seen = await groupsSeen(page, Boolean(phone));
  ok(seen && seen.shown && seen.groups.join(',') === GROUPS.join(','), `${where}: the groups are there to see (${seen && seen.groups})`, seen);
  ok(seen && seen.labels.join('|') === LABELS[lang].join('|'), `${where}: named for what Qjo does (${seen && seen.labels.join(' | ')})`, seen);
  // A phone leaves out the welcome's second line on purpose; the starters say it.
  ok(seen && !seen.pageScrollsSideways && (phone || seen.subtitle), `${where}: the page does not scroll sideways${phone ? '' : ', and the welcome text shows'}`, seen);

  if (phone) {
    // The tools sheet offers the same groups.
    await page.click('#mobileToolsNotch');
    await page.waitForTimeout(400);
    const sheet = await page.$$eval('#mobileToolsSheet .sheet-cat-label', (els) => els.map((e) => e.textContent.trim()));
    ok(sheet.join('|') === LABELS[lang].join('|'), `${where}: the tools sheet offers the same groups (${sheet.join(' | ')})`);
    await page.click('#mobileToolsBackdrop', { position: { x: 10, y: 10 } });
    await page.waitForTimeout(400);
  }
  const host = phone ? '#welcomeStarters' : '#quickCommandCats';
  await page.click(`${host} [data-cat="files"]`);
  const shown = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#qsList .qs-item')];
    const last = items[items.length - 1];
    const r = last && last.getBoundingClientRect();
    // Nothing floats over one: a tap near either end or in the middle
    // reaches it (Arabic starts at the right, English at the left).
    const covered = items.filter((i) => {
      const b = i.getBoundingClientRect();
      return [0.1, 0.5, 0.9].some((x) => { const hit = document.elementFromPoint(b.left + b.width * x, b.top + b.height / 2); return !hit || !i.contains(hit); });
    });
    return { items: items.map((i) => ({ text: i.textContent, file: i.dataset.needsFile })), whole: Boolean(r) && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth, covered: covered.map((i) => i.textContent) };
  });
  ok(shown.items.length === 5 && shown.whole && shown.covered.length === 0, `${where}: a group opens five starters, all on the screen, none covered`, shown);

  // One that needs a photo opens the picker, with its words in the composer.
  const needsPhoto = shown.items.find((i) => i.file === 'true');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null),
    needsPhoto ? page.click(`#qsList .qs-item[data-needs-file="true"]`) : Promise.resolve()
  ]);
  const typed = await page.inputValue('#input');
  ok(Boolean(chooser) && needsPhoto && typed === needsPhoto.text.replace(/^📎\s*/u, '') && (await page.$eval('#quickSuggestionsPanel', (p) => p.hidden)),
    `${where}: a starter that needs a photo opens the file picker, its words in the composer ("${typed}")`, { needsPhoto, typed });

  // A file starter, sent, ends with that file ready.
  await page.click(`${host} [data-cat="files"]`);
  await page.click('#qsList .qs-item >> nth=0');
  const first = await page.inputValue('#input');
  ok(first.length > 20 && (await page.$eval('#quickSuggestionsPanel', (p) => p.hidden)), `${where}: choosing a starter puts it in the composer and closes the list`);
  await page.click('#sendBtn');
  await page.waitForFunction(() => document.querySelector('.msg.assistant .qjo-file-card'), null, { timeout: 8000 }).catch(() => {});
  const card = await page.$eval('.msg.assistant:last-of-type .qjo-file-card', (c) => c.dataset.format).catch(() => null);
  ok(card === 'docx', `${where}: "${first}" ends with the Word file ready (${card})`);
  ok(await page.$eval('#welcome', (w) => w.getClientRects().length === 0), `${where}: once a message is sent the welcome and its starters go`);
  ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const lang of ['ar', 'en']) for (const phone of [null, { width: 390, height: 844 }]) await check(browser, lang, phone);
    await check(browser, 'ar', { width: 360, height: 640 });
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

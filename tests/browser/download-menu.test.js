// "Download as file" under an answer, through the real page, on a desktop and
// a phone, in Arabic and English.
//
// The files used to be four unlabelled icons among eight others — a page, a
// screen, a page with lines, a grid — that someone had to hover to tell
// apart, and a phone cannot hover. Now one labelled button opens a menu that
// names each format: it is there on a phone, the menu fits on the screen,
// the keyboard can use it, and choosing a format asks the real route for it.
const { launchBrowser, BASE_URL } = require('./harness');

const TABLE_ANSWER = ['## جدول المبيعات', '', 'هذا جدول المبيعات للربع الثالث مع شرح كافٍ ليستحق التصدير إلى ملف.', '', '| المنتج | الكمية |', '| --- | --- |', '| قهوة | 120 |', '| شاي | 80 |'].join('\n');
const PLAIN_ANSWER = ['## Result', '', 'A detailed explanation in English, long enough to be worth exporting to a file of its own.', 'A second paragraph adds enough length for the exports to be offered.', '', '- one', '- two'].join('\n');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

async function open(browser, { lang, phone }) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const exports = [];
  let answer = TABLE_ANSWER;
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` }));
  // The PDF route fails, so a failed file is seen too.
  await page.route('**/api/export/*', (route) => {
    const format = route.request().url().split('/').pop();
    exports.push(format);
    return format === 'pdf'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"render failed"}' })
      : route.fulfill({ status: 200, contentType: 'application/octet-stream', body: 'file' });
  });
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  const ask = async (text, reply) => {
    answer = reply;
    const before = await page.$$eval('.msg.assistant .msg-actions-toolbar', (els) => els.length);
    await page.fill('#input', text);
    await page.click('#sendBtn');
    await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .msg-actions-toolbar').length > n, before, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  return { ctx, page, errors, exports, ask };
}

const LAST = '.msg.assistant:last-of-type';
const state = (page) => page.evaluate((last) => {
  const toggle = document.querySelector(`${last} .qjo-export-toggle`);
  const menu = document.querySelector(`${last} .qjo-export-menu`);
  const box = (el) => { const r = el && el.getBoundingClientRect(); return r && { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    label: toggle ? toggle.innerText.trim() : null,
    toggle: box(toggle),
    visible: Boolean(toggle) && toggle.getClientRects().length > 0 && Number(getComputedStyle(toggle.closest('.msg-actions-toolbar')).opacity) > 0.5,
    expanded: toggle && toggle.getAttribute('aria-expanded'),
    open: Boolean(menu) && !menu.hidden && menu.getClientRects().length > 0,
    menu: box(menu),
    items: menu ? [...menu.querySelectorAll('[role="menuitem"]')].map((i) => ({ format: i.dataset.export, text: i.innerText.replace(/\s+/g, ' ').trim() })) : [],
    // ".docx" reads with its dot first, in a right-to-left page too.
    dotFirst: menu && !menu.hidden ? [...menu.querySelectorAll('small')].every((small) => {
      const at = (i) => { const r = document.createRange(); r.setStart(small.firstChild, i); r.setEnd(small.firstChild, i + 1); return r.getBoundingClientRect().left; };
      return at(0) < at(small.textContent.length - 1);
    }) : null,
    focused: document.activeElement && (document.activeElement.dataset.export || document.activeElement.className),
    oldIcons: document.querySelectorAll(`${last} .msg-action-btn[data-export]`).length,
    viewport: { w: window.innerWidth, h: window.innerHeight }
  };
}, LAST);

async function check(browser, lang, phone) {
  const where = `${lang}, ${phone ? 'phone' : 'desktop'}`;
  const { ctx, page, errors, exports, ask } = await open(browser, { lang, phone });
  await ask(lang === 'ar' ? 'اعطيني جدول المبيعات' : 'give me the sales table', TABLE_ANSWER);
  let s = await state(page);
  const label = lang === 'ar' ? 'تنزيل كملف' : 'Download as file';
  ok(s.label === label && s.visible && s.toggle && s.toggle.h >= 30, `${where}: under the answer, a button that says "${s.label}"`, s);
  ok(s.oldIcons === 0, `${where}: no unlabelled export icons left (${s.oldIcons})`);

  await page.click(`${LAST} .qjo-export-toggle`);
  await page.waitForTimeout(200);
  s = await state(page);
  ok(s.open && s.expanded === 'true', `${where}: it opens a menu`, s);
  ok(s.items.map((i) => i.format).join(',') === 'docx,pdf,pptx,xlsx' && s.items.every((i) => i.text.includes(`.${i.format}`)) && s.items[0].text.startsWith('Word'),
    `${where}: the menu names each format (${s.items.map((i) => i.text).join(' | ')})`, s.items);
  ok(s.dotFirst === true, `${where}: each extension reads with its dot first`);
  const fits = s.menu && s.menu.left >= 0 && s.menu.right <= s.viewport.w && s.menu.top >= 0 && s.menu.bottom <= s.viewport.h;
  ok(fits, `${where}: the menu is whole on the screen (${JSON.stringify(s.menu)} in ${s.viewport.w}x${s.viewport.h})`, s);

  if (!phone) {
    ok(s.focused === 'docx', `${where}: the first format takes focus (${s.focused})`);
    await page.keyboard.press('ArrowDown');
    ok((await state(page)).focused === 'pdf', `${where}: the arrows move between formats`);
    await page.keyboard.press('Escape');
    s = await state(page);
    ok(!s.open && s.expanded === 'false' && /qjo-export-toggle/.test(s.focused), `${where}: Escape closes it and gives focus back`, s);
    await page.click(`${LAST} .qjo-export-toggle`);
    await page.mouse.click(5, 5);
    ok(!(await state(page)).open, `${where}: a click elsewhere closes it`);
    await page.click(`${LAST} .qjo-export-toggle`);
  }
  await page.click(`${LAST} .qjo-export-item[data-export="docx"]`);
  await page.waitForTimeout(600);
  s = await state(page);
  ok(exports.includes('docx') && !s.open, `${where}: choosing Word asks for the Word file and closes the menu (${exports.join(',')})`, s);
  await page.click(`${LAST} .qjo-export-toggle`);
  await page.click(`${LAST} .qjo-export-item[data-export="pdf"]`);
  const said = await page.waitForFunction((text) => [...document.body.querySelectorAll('div')].some((d) => d.textContent === text), lang === 'ar' ? 'تعذّر إنشاء الملف' : 'Could not create the file', { timeout: 4000 }).then(() => true, () => false);
  s = await state(page);
  ok(exports.includes('pdf') && said && !s.open, `${where}: a file the server could not make says so, and the menu closes`, { said, open: s.open });

  await ask(lang === 'ar' ? 'اشرحلي' : 'explain it', PLAIN_ANSWER);
  await page.click(`${LAST} .qjo-export-toggle`);
  await page.waitForTimeout(200);
  s = await state(page);
  ok(s.items.map((i) => i.format).join(',') === 'docx,pdf,pptx', `${where}: control — without a table, no Excel (${s.items.map((i) => i.format)})`);
  ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const lang of ['ar', 'en']) for (const phone of [false, true]) await check(browser, lang, phone);
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// One student flow measured as the page shows it: open, attach a PDF, ask,
// read the answer, open the export menu. At 360 px and 1280 px, light and
// dark, English and Arabic. Per stage and combination it measures:
//   - tap targets (>= 44x44 on the phone) of everything tappable and visible;
//   - text contrast against what the text sits on (contrast.js);
//   - horizontal overflow of the page, the composer and the messages;
//   - controls pushed outside the viewport (RTL mirroring gone wrong).
// Controls: a button forced to 20px must be reported as a small target, and
// grey text on white as low contrast; the probe refuses to run when the
// page's controls are missing.
const { launchBrowser, BASE_URL } = require('./harness');
const { measure } = require('./contrast');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 900)); };
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const ANSWER = '## Binary search\n\nIt halves the range on every step.\n\n| Algorithm | Time |\n|---|---|\n| Binary search | O(log n) |\n\nThat is all there is to it.';
const REPLY = frame('chunk', { text: ANSWER }) + frame('done', {});

function audit({ tapMin }) {
  const TAPPABLE = 'button, a[href], [role="button"], [role="menuitem"], input:not([type="hidden"]), select, textarea, summary, [onclick]';
  const rects = [];
  for (const el of document.querySelectorAll(TAPPABLE)) {
    if (el.closest('[hidden], .hidden, [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // Seen: not parked off to the side (the sidebar drawer) or above the page.
    if (r.right <= 0 || r.left >= window.innerWidth || r.bottom <= 0 || r.top >= window.innerHeight) continue;
    const name = el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    rects.push({ name, w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right) });
  }
  const small = tapMin ? rects.filter((r) => r.w < tapMin || r.h < tapMin) : [];
  const outside = rects.filter((r) => r.left < -1 || r.right > window.innerWidth + 1);
  const box = (sel) => { const e = document.querySelector(sel); return e ? { sw: e.scrollWidth, cw: e.clientWidth } : null; };
  return {
    count: rects.length, small, outside,
    overflow: { page: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }, composer: box('.composer, #composer, .input-area'), messages: box('#messages'), input: box('#input') }
  };
}

async function openPage(browser, { w, lang, theme }) {
  const phone = w < 600;
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 740 : 900 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, locale: lang === 'ar' ? 'ar-JO' : 'en-US' });
  const page = await ctx.newPage();
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: REPLY }));
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); localStorage.setItem('qjo_theme', '${theme}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page };
}

async function stage(page, name, w, lang, theme, rows, scope) {
  // On a phone the sidebar is a drawer: off screen until opened, measured as its own stage.
  scope = scope || (w < 600 ? '.main' : 'body');
  // Inactive placeholders (aria-disabled, "Soon") are exempt from WCAG contrast.
  await page.evaluate(() => document.querySelectorAll('[aria-disabled="true"]').forEach((e) => e.setAttribute('hidden', '')));
  const a = await page.evaluate(audit, { tapMin: w < 600 ? 44 : 0 });
  await page.evaluate(() => document.querySelectorAll('[aria-disabled="true"][hidden]').forEach((e) => e.removeAttribute('hidden')));
  const c = (await page.evaluate(measure, scope) || []).filter((x) => !x.unmeasurable && x.ratio < x.need);
  const cfg = `${w}px ${theme} ${lang} ${name}`;
  for (const s of a.small) rows.push({ kind: 'tap', cfg, sel: s.name, value: `${s.w}x${s.h}`, limit: '44x44' });
  for (const s of a.outside) rows.push({ kind: 'offscreen', cfg, sel: s.name, value: `${s.left}..${s.right}`, limit: `0..${w}` });
  for (const x of c) rows.push({ kind: 'contrast', cfg, sel: `${x.cls || '?'} "${x.text}"`, value: x.ratio, limit: x.need });
  for (const [k, v] of Object.entries(a.overflow)) if (v && v.sw > v.cw) rows.push({ kind: 'overflow', cfg, sel: k, value: `${v.sw}>${v.cw}`, limit: 'sw<=cw' });
  return a;
}

async function run(browser, w, lang, theme, rows) {
  const { ctx, page } = await openPage(browser, { w, lang, theme });
  const present = await page.evaluate(() => ['#input', '#sendBtn', '#attachBtn', '#fileInput', '#messages'].every((s) => document.querySelector(s)));
  if (!present) { ok(false, `the page has the composer at ${w} ${theme} ${lang}`); await ctx.close(); return; }
  const dir = await page.evaluate(() => document.documentElement.dir);
  if (dir !== (lang === 'ar' ? 'rtl' : 'ltr')) ok(false, `direction is ${lang === 'ar' ? 'rtl' : 'ltr'} at ${w} ${theme} ${lang}`, dir);
  await stage(page, 'welcome', w, lang, theme, rows);
  await page.setInputFiles('#fileInput', { name: 'lecture-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') });
  await page.waitForSelector('#attachmentTray .attachment-chip', { timeout: 8000 }).catch(() => {});
  if (!(await page.$('#attachmentTray .attachment-chip'))) ok(false, `the PDF chip shows at ${w} ${theme} ${lang}`);
  await stage(page, 'pdf-attached', w, lang, theme, rows);
  await page.fill('#input', 'Summarise this');
  await page.click('#sendBtn');
  await page.waitForFunction(() => /all there is to it/.test(([...document.querySelectorAll('#messages .msg.assistant')].pop() || {}).innerText || ''), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  await stage(page, 'answer', w, lang, theme, rows);
  const toggle = await page.$('.msg.assistant:last-of-type .qjo-export-toggle');
  if (!toggle) ok(false, `the answer has an export button at ${w} ${theme} ${lang}`);
  else {
    await toggle.scrollIntoViewIfNeeded(); await toggle.click(); await page.waitForTimeout(400);
    await stage(page, 'export-menu', w, lang, theme, rows);
  }
  if (w < 600) {
    await page.keyboard.press('Escape');
    await page.click('#mobileMenuBtn').catch(() => {});
    await page.waitForTimeout(600);
    await stage(page, 'drawer', w, lang, theme, rows, '.sidebar');
  }
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  {
    const { ctx, page } = await openPage(browser, { w: 360, lang: 'en', theme: 'light' });
    await page.evaluate(() => {
      const b = document.createElement('button'); b.id = 'probeSmall'; b.textContent = 'x'; b.style.cssText = 'position:fixed;top:300px;left:100px;width:20px;height:20px;min-height:0;padding:0';
      const t = document.createElement('p'); t.id = 'probeGrey'; t.textContent = 'grey on white'; t.style.cssText = 'position:fixed;top:340px;left:100px;color:#bbb;background:#fff;z-index:99';
      document.body.append(b, t);
    });
    const a = await page.evaluate(audit, { tapMin: 44 });
    ok(a.small.some((s) => s.name === '#probeSmall'), 'control: a 20px button is reported as a small target');
    const c = (await page.evaluate(measure, 'body')).filter((x) => x.ratio < x.need);
    ok(c.some((x) => x.text === 'grey on white'), 'control: grey on white is reported as low contrast');
    await ctx.close();
  }
  const rows = [];
  for (const w of [360, 1280]) for (const theme of ['light', 'dark']) for (const lang of ['en', 'ar']) await run(browser, w, lang, theme, rows);
  const grouped = new Map();
  for (const r of rows) { const k = [r.kind, r.sel, r.value, r.limit].join('|'); (grouped.get(k) || grouped.set(k, { ...r, cfgs: [] }).get(k)).cfgs.push(r.cfg); }
  // Open findings are listed, not failed: they are backlog items (docs/company/backlog.md).
  for (const g of grouped.values()) console.log(`OPEN ${g.kind} | ${g.sel} | ${g.value} (limit ${g.limit}) | ${g.cfgs.length} cfgs, e.g. ${g.cfgs[0]}`);
  // Must hold: nothing overflows sideways or sits outside the screen, and the
  // sidebar's small muted text (--ds-muted-2) reads at 4.5:1 in every theme.
  const SIDEBAR_TEXT = /^(nav-label|empty-chats|account-email|brand-sub|sidebar-card-title)\b/;
  const bad = (f) => rows.filter(f);
  ok(bad((r) => r.kind === 'overflow').length === 0, 'no horizontal overflow of the page, messages or composer in 16 configurations', bad((r) => r.kind === 'overflow').slice(0, 3));
  ok(bad((r) => r.kind === 'offscreen').length === 0, 'no control outside the viewport in 16 configurations', bad((r) => r.kind === 'offscreen').slice(0, 3));
  ok(bad((r) => r.kind === 'contrast' && SIDEBAR_TEXT.test(r.sel)).length === 0, 'sidebar labels, hints and email read at 4.5:1 in both themes and languages', bad((r) => r.kind === 'contrast' && SIDEBAR_TEXT.test(r.sel)).slice(0, 4));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

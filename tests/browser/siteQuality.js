// What makes a generated website good enough to show, measured in a real
// Chromium on the page as it runs in Qjo's preview: the same document
// (codeProject.buildDocument, with its guard), in an iframe with the same
// sandbox, across phone, tablet and desktop breakpoints, inside a page whose
// only job is to hold it.
//
//   const report = await checkSite(browser, html, { serve });
//   report.problems  →  [] for a good site, else one line per failure
//
// Used by site-quality.test.js (a good site, and one broken copy per check
// that must be caught) and by scripts/eval-sites.js (real answers from Groq).
// Each check is named, so a failure says what is wrong with the page.
'use strict';

const fs = require('fs');
const path = require('path');
const { buildDocument, SANDBOX } = require('../../public/domain/codeProject.js');

const modules = path.join(__dirname, 'node_modules');
// The CDN files a site is told to use, served from this package: a check
// must not depend on which network the suite runs on.
const LIBRARIES = {
  'https://cdn.tailwindcss.com/**': () => fs.readFileSync(path.join(modules, 'tailwindcss-cdn', 'tailwindcss.js'), 'utf8'),
  'https://cdn.jsdelivr.net/npm/lucide@1.48.0/dist/umd/lucide.min.js': () => fs.readFileSync(path.join(modules, 'lucide', 'dist', 'umd', 'lucide.min.js'), 'utf8')
};
const AXE = path.join(modules, 'axe-core', 'axe.min.js');
// A tiny local image fixture: browser checks must not depend on the image CDN.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/**
 * Serves the libraries and photos a site loads, and refuses the rest. The
 * harness blocks every other origin anyway; these are routes that answer.
 * @param {import('playwright').BrowserContext} context
 */
async function serveSiteAssets(context) {
  for (const [url, body] of Object.entries(LIBRARIES)) {
    await context.route(url, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: body() }));
  }
  await context.route('https://images.unsplash.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PHOTO }));
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

async function framed(page, html, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.setContent(`<!DOCTYPE html><html><head><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe id="site" sandbox="${SANDBOX}"></iframe></body></html>`);
  const doc = buildDocument({ kind: 'html', files: [{ name: 'index.html', lang: 'html', role: 'main', code: html }] });
  await page.$eval('#site', (el, d) => { /** @type {HTMLIFrameElement} */ (el).srcdoc = d; }, doc);
  const handle = await page.waitForSelector('#site');
  const frame = await handle.contentFrame();
  await frame.waitForLoadState('load').catch(() => {});
  await frame.waitForFunction(() => document.readyState === 'complete', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return frame;
}

// Scrolls through the page in steps, as a person reading it would, so
// whatever is revealed on the way is. Instantly: a page with scroll-smooth
// would otherwise still be travelling to the first step when the last began.
async function scrollThrough(frame) {
  await frame.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.6));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await frame.waitForTimeout(900);
}

// Until a smooth scroll has stopped moving.
async function settled(frame) {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const y = await frame.evaluate(() => window.scrollY);
    if (y === last) return;
    last = y;
    await frame.waitForTimeout(120);
  }
}

// ── The checks, each adding what it finds to `problems` ────────────────

async function checkContent(frame, problems, facts, expect) {
  const desk = await frame.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const shown = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).display === 'none') return false; return true; };
    const anchors = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter((id) => id && id !== 'top');
    const hidden = [...document.querySelectorAll('h1, h2, h3, p, img, button, a')].filter((el) => visible(el) && shown(el) && Number(getComputedStyle(el).opacity) < 0.1);
    const images = [...document.querySelectorAll('img')];
    return {
      lang: document.documentElement.getAttribute('lang') || '', dir: document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction,
      title: document.title, h1: document.querySelectorAll('h1').length, sections: document.querySelectorAll('main section, body > section, section[id]').length,
      brokenAnchors: [...new Set(anchors)].filter((id) => { try { return !document.getElementById(decodeURIComponent(id)); } catch (_) { return true; } }),
      hiddenAfterScroll: hidden.slice(0, 5).map((el) => el.tagName.toLowerCase() + ':' + (el.textContent || el.getAttribute('alt') || '').trim().slice(0, 30)),
      images: images.length,
      brokenImages: images.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute('src')).slice(0, 5),
      randomImageSources: images.map((img) => img.getAttribute('src') || '').filter((src) => /picsum\.photos|source\.unsplash\.com|loremflickr\.com|placekitten\.com|placebear\.com/i.test(src)).slice(0, 5),
      imagesWithoutAlt: images.filter((img) => !img.hasAttribute('alt')).length,
      lucidePlaceholders: document.querySelectorAll('i[data-lucide]').length,
      text: document.body.innerText.length,
      placeholder: /lorem ipsum|dolor sit amet|feature \d\b|\bplaceholder\b/i.test(document.body.innerText)
    };
  });
  Object.assign(facts, desk);
  const rules = [
    [!desk.title, 'no <title>'],
    [desk.h1 !== 1, `${desk.h1} <h1> (one expected)`],
    [desk.sections < 4, `only ${desk.sections} sections`],
    [desk.text < 600, `only ${desk.text} characters of text`],
    [desk.placeholder, 'placeholder text (lorem ipsum, "Feature 1")'],
    [desk.brokenAnchors.length, `links to sections that do not exist: #${desk.brokenAnchors.join(', #')}`],
    [desk.hiddenAfterScroll.length, `content still invisible after scrolling through: ${desk.hiddenAfterScroll.join(' | ')}`],
    [desk.brokenImages.length, `images that did not load: ${desk.brokenImages.join(', ')}`],
    [desk.randomImageSources.length, `random image sources that may show unrelated subjects: ${desk.randomImageSources.join(', ')}`],
    [desk.imagesWithoutAlt, `${desk.imagesWithoutAlt} images without alt`],
    [desk.lucidePlaceholders, `${desk.lucidePlaceholders} icons never drawn (data-lucide left as <i>)`],
    [expect.rtl && (desk.lang !== 'ar' || desk.dir !== 'rtl'), `an Arabic site with lang="${desk.lang}" dir="${desk.dir}"`]
  ];
  for (const [failed, problem] of rules) if (failed) problems.push(problem);
}

// Every section link in the header scrolls to its section, and the preview stays the site.
async function checkNavigation(frame, problems, facts) {
  const links = await frame.$$eval('header a[href^="#"], nav a[href^="#"]', (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute('href')).filter((h) => h.length > 1).slice(0, 8));
  facts.navLinks = links.length;
  const targets = new Set(links).size;
  if (targets < 3) problems.push(`the header links to ${targets} section${targets === 1 ? '' : 's'} (three or more expected)`);
  for (const href of links) {
    await frame.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await frame.click(`header a[href="${href}"], nav a[href="${href}"]`, { timeout: 2000 }).catch(() => {});
    await frame.waitForTimeout(150);
    await settled(frame);
    const after = await frame.evaluate((h) => {
      const el = document.getElementById(decodeURIComponent(h.slice(1)));
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      return { url: location.href, top: el ? el.getBoundingClientRect().top : null, atEnd, half: window.innerHeight / 2 };
    }, href);
    if (after.url !== 'about:srcdoc') { problems.push(`"${href}" left the page (${after.url})`); return; }
    // At its top, give or take a sticky header — or as near as the end of the page allows.
    const inView = after.top !== null && after.top > -160 && (after.top < 160 || (after.atEnd && after.top < after.half));
    if (!inView) problems.push(`"${href}" did not bring its section into view (top ${after.top})`);
  }
}

// Dark mode: the page offers a toggle, and it changes the page's background.
async function checkDarkMode(frame, problems, facts) {
  const toggle = await frame.$('[aria-label*="dark" i], [aria-label*="ليلي"], [aria-label*="داكن"], [aria-label*="theme" i], [aria-label*="الوضع"], #theme, #theme-toggle, #darkToggle');
  facts.darkToggle = Boolean(toggle);
  if (!toggle) { problems.push('no dark-mode toggle'); return; }
  const bg = () => frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const before = await bg();
  await toggle.click().catch(() => {});
  await frame.waitForTimeout(300);
  const after = await bg();
  facts.darkSwitches = before !== after;
  if (before === after) problems.push(`the dark-mode toggle changes nothing (${before})`);
}

// Accessibility: axe, serious and critical only.
async function checkAccessibility(frame, problems, facts) {
  await frame.addScriptTag({ path: AXE }).catch(() => {});
  const axe = await frame.evaluate(async () => {
    if (!window.axe) return null;
    const result = await window.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.nodes.length})`);
  }).catch(() => null);
  facts.axe = axe;
  if (axe === null) problems.push('axe did not run');
  else if (axe.length) problems.push(`accessibility: ${axe.join(', ')}`);
}

// At intermediate/large breakpoints, catch overflow hidden between mobile and desktop.
async function checkResponsiveSizes(page, frame, problems, facts) {
  const widths = [390, 768, 1024, 1280, 1440];
  const measurements = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(80);
    const result = await frame.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const wide = [...document.body.querySelectorAll('*')].filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && (rect.right > viewport + 1 || rect.left < -1) && getComputedStyle(el).position !== 'fixed';
      });
      return { viewport, scrollWidth, wide: wide.slice(0, 3).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) };
    });
    measurements.push({ width, ...result });
    if (result.scrollWidth > result.viewport + 1) problems.push(`scrolls sideways at ${width}px (${result.scrollWidth}px wide: ${result.wide.join(', ')})`);
  }
  facts.breakpoints = measurements;
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(80);
}

// At 360 px: nothing scrolls sideways, and the menu opens and says so.
async function checkPhone(phone, problems, facts) {
  const narrow = await phone.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.body.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > width + 1 || r.left < -1) && getComputedStyle(el).position !== 'fixed'; });
    return { width, scrollWidth: document.documentElement.scrollWidth, wide: wide.slice(0, 3).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : '')) };
  });
  facts.phone = narrow;
  if (narrow.scrollWidth > narrow.width + 1) problems.push(`scrolls sideways at 360px (${narrow.scrollWidth}px wide: ${narrow.wide.join(', ')})`);
  const menu = await phone.$('header button[aria-expanded], nav button[aria-expanded]');
  facts.phoneMenu = Boolean(menu);
  if (!menu) { problems.push('no phone menu button with aria-expanded'); return; }
  const visibleLinks = () => phone.$$eval('a[href^="#"]', (as) => as.filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < window.innerHeight; }).length);
  const before = await visibleLinks();
  await menu.click().catch(() => {});
  await phone.waitForTimeout(400);
  const after = await visibleLinks();
  const expanded = await menu.getAttribute('aria-expanded');
  if (!(after > before) || expanded !== 'true') problems.push(`the phone menu does not open (links ${before} → ${after}, aria-expanded ${expanded})`);
}

/**
 * @param {import('playwright').Browser} browser one from harness.launchBrowser()
 * @param {string} html the site as the answer wrote it
 * @param {{rtl?: boolean}} [expect] what the person asked for
 * @returns {Promise<{problems: string[], facts: Record<string, any>}>}
 */
async function checkSite(browser, html, expect = {}) {
  const problems = [];
  const facts = {};
  const context = await browser.newContext({ locale: expect.rtl ? 'ar-JO' : 'en-US' });
  await serveSiteAssets(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const frame = await framed(page, html, 1280);
    await scrollThrough(frame);
    await checkContent(frame, problems, facts, expect);
    await checkNavigation(frame, problems, facts);
    await checkDarkMode(frame, problems, facts);
    await checkAccessibility(frame, problems, facts);
    const phone = await framed(page, html, 360);
    await scrollThrough(phone);
    await checkResponsiveSizes(page, phone, problems, facts);
    await checkPhone(phone, problems, facts);
    facts.errors = errors.slice(0, 5);
    if (errors.length) problems.push(`JavaScript errors: ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await context.close();
  }
  return { problems, facts };
}

module.exports = { checkSite, serveSiteAssets };

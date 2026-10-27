// Sites as models write them, previewed through the real page — an answer
// streamed in, its Preview opened, under the app's own CSP, which a srcdoc
// preview inherits. Each check has a control that shows the probe can see
// the failure it looks for.
//
//   Tailwind only where it is wanted. It was added to every page that did not
//   name it: ".collapse { visibility: collapse }" hid a Bootstrap navbar, and
//   its reset shrank a plain page's headings and took its bullets off. The
//   control adds Tailwind back, and the navbar is hidden again.
//   Libraries from the hosts sites name — Google's jQuery, BootstrapCDN, Font
//   Awesome's own — load from jsdelivr's copy at the same version; a YouTube
//   frame and a video play. A Font Awesome kit, made per account, stays
//   blocked: the control that the violation listener hears a refusal.
//   A phone menu that closes on the tap: the section lands at the top, as in
//   the same page opened as a page (the control), not the menu's height past.
//   A page that shows one view per hash gets its hashchange, and the preview
//   stays about:srcdoc. A page that scrolls on its own keeps its scroll.
'use strict';

const fs = require('fs');
const path = require('path');
const { launchBrowser, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

const TAILWIND = fs.readFileSync(path.join(__dirname, 'node_modules', 'tailwindcss-cdn', 'tailwindcss.js'), 'utf8');
// The rules of Bootstrap 5 these pages rely on, enough to tell its navbar
// from Tailwind's ".collapse". Tailwind itself is the real one.
const BOOTSTRAP_CSS = '*,::before,::after{box-sizing:border-box}.collapse:not(.show){display:none}.navbar{display:flex;flex-wrap:wrap;align-items:center}.navbar-expand-lg .navbar-collapse{display:flex!important;flex-basis:auto}'
  + '.navbar-nav{display:flex;list-style:none;margin:0;padding:0}.container{width:100%;max-width:1140px;margin:0 auto;padding:0 12px}h2{font-size:2rem}';
// A fifth of a second of silence, as a WAV: media Chromium plays without codecs.
function wav() {
  const samples = 1600, data = Buffer.alloc(samples * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(8000, 24); head.writeUInt32LE(16000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const BOOTSTRAP_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Clinic</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"></head><body>
<nav class="navbar navbar-expand-lg"><div class="container"><a class="navbar-brand" href="#">Clinic</a>
<div class="collapse navbar-collapse" id="nav"><ul class="navbar-nav"><li class="nav-item"><a class="nav-link" id="book" href="#booking">Book</a></li></ul></div></div></nav>
<main class="container py-5"><h2 class="mb-4 text-center">Book a visit</h2><div class="row g-3"><div class="col-md-6"><p class="text-muted">Mon to Sat.</p></div></div></main>
<section id="booking" class="container" style="height:1200px"></section></body></html>`;
const PLAIN_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Portfolio</title><style>
body{font-family:sans-serif;color:#222}.hero{padding:40px}.hero h1{letter-spacing:-.02em}.skills{margin:0 0 20px}.contact input{padding:8px}
</style></head><body><header class="hero"><h1>Sara Haddad</h1></header><section><h2>Skills</h2><ul class="skills"><li>Design</li><li>Research</li></ul>
<form class="contact"><input id="email" placeholder="Email"></form></section></body></html>`;
// Tailwind's classes and no Tailwind: the page the injection exists for.
const TAILWIND_CLASSES = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Gym</title></head><body class="bg-slate-50">'
  + '<h1 id="big" class="text-3xl font-bold md:text-5xl">Lift</h1><p class="mt-4 px-6">Open daily.</p></body></html>';
const HOSTS_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Hosts</title>
<script>window.R = {}; window.V = []; document.addEventListener('securitypolicyviolation', function (e) { V.push(e.violatedDirective + ' ' + e.blockedURI); });</script>
<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js" onload="R.googleJquery='load'" onerror="R.googleJquery='error'"></script>
<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" onload="R.stackpathCss='load'" onerror="R.stackpathCss='error'">
<script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.bundle.min.js" onload="R.stackpathJs='load'" onerror="R.stackpathJs='error'"></script>
<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css" onload="R.fa4='load'" onerror="R.fa4='error'">
<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.15.4/css/all.css" onload="R.fa5='load'" onerror="R.fa5='error'">
<script src="https://kit.fontawesome.com/a076d05399.js" crossorigin="anonymous" onload="R.kit='load'" onerror="R.kit='error'"></script>
</head><body><h1>Hosts</h1>
<iframe id="yt" src="https://www.youtube.com/embed/abc123" width="320" height="180" title="video"></iframe>
<audio id="clip" src="https://media.qjo.test/clip.wav" preload="auto"></audio>
<script>var clip = document.getElementById('clip'); clip.addEventListener('loadeddata', function () { R.media = 'load'; }); clip.addEventListener('error', function () { R.media = 'error'; });</script>
</body></html>`;
const PHONE_MENU = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cafe</title><style>
body{margin:0;font-family:sans-serif}.bar{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #ddd}
#menu{display:none}#menu.open{display:block}#menu a{display:block;padding:14px 12px;border-top:1px solid #eee}section{min-height:900px;padding:16px;border-top:4px solid #333}
</style></head><body><header><div class="bar"><b>Cafe</b><button id="toggle">Menu</button></div>
<nav id="menu"><a href="#one">One</a><a href="#two">Two</a><a href="#three">Three</a><a href="#four">Four</a></nav></header>
<section id="one">One</section><section id="two">Two</section><section id="three">Three</section><section id="four">Four</section>
<script>var m = document.getElementById('menu'); document.getElementById('toggle').onclick = function () { m.classList.toggle('open'); };
m.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { m.classList.remove('open'); }); });</script></body></html>`;
const VIEWS = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Olive &amp; Thyme</title><style>.page{display:none;height:1500px}.page.active{display:block}</style></head><body>
<nav><a href="#home">Home</a> <a href="#menu">Menu</a> <a href="#contact">Contact</a> <a id="own" href="#far">Far</a></nav>
<section id="home" class="page active">Home</section><section id="menu" class="page">Menu</section><section id="contact" class="page">Contact</section>
<div id="far" style="margin-top:2400px;height:1200px">far</div>
<script>window.seen = [];
function show() { var id = location.hash.slice(1) || 'home'; document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === id); }); }
window.addEventListener('hashchange', function (e) { seen.push(e.newURL.split('#')[1]); show(); }); show();
// Its own scroll for #far, 100px above it: a page that handles a link itself keeps what it did.
document.getElementById('own').addEventListener('click', function (e) { e.preventDefault(); window.scrollTo(0, document.getElementById('far').offsetTop - 100); });
</script></body></html>`;

const fence = (html) => 'Here is the site:\n\n```html\n' + html + '\n```\n\nOpen the preview.';

async function openApp(browser, options) {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const state = { answer: '' };
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: state.answer })}\n\nevent: done\ndata: {}\n\n` }));
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'en'); } catch (_) {}");
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  // The site in an answer, its preview opened: the frame it runs in.
  async function preview(html) {
    state.answer = fence(html);
    const before = (await page.$$('.live-preview-tab-btn')).length;
    await page.fill('#input', 'Build me a website');
    await page.click('#sendBtn');
    await page.waitForFunction((n) => document.querySelectorAll('.live-preview-tab-btn').length > n, before, { timeout: 10000 });
    const buttons = await page.$$('.live-preview-tab-btn');
    await buttons[buttons.length - 1].click();
    await page.waitForTimeout(1500);
    const frames = await page.$$('.live-preview-iframe');
    return frames[frames.length - 1].contentFrame();
  }
  return { ctx, page, errors, preview };
}

const looks = (frame) => frame.evaluate(() => {
  const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
  return {
    tailwind: [...document.scripts].some((s) => /cdn\.tailwindcss\.com/.test(s.src)),
    nav: cs('.navbar-collapse', 'visibility'), h2: cs('h2', 'fontSize'), bullets: cs('ul li', 'listStyleType') || cs('ul', 'listStyleType'),
    input: cs('input', 'borderTopWidth'), big: cs('#big', 'fontSize'), wide: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
});

(async () => {
  const browser = await launchBrowser();
  try {
    // ── Tailwind only where it is wanted ──
    {
      const { ctx, errors, preview } = await openApp(browser, { viewport: { width: 1280, height: 860 } });
      await ctx.route('https://cdn.tailwindcss.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: TAILWIND }));
      await ctx.route('https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css', (r) => r.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: BOOTSTRAP_CSS }));

      const tw = await looks(await preview(TAILWIND_CLASSES));
      ok(tw.tailwind && ['30px', '48px'].includes(tw.big), `control: a page in Tailwind's classes without Tailwind gets it — its text-3xl drawn (${tw.big})`, tw);

      // The control: Tailwind added to the Bootstrap page, as every page used to get it.
      const withTailwind = BOOTSTRAP_PAGE.replace('</head>', '<script src="https://cdn.tailwindcss.com"></script></head>');
      const broken = await looks(await preview(withTailwind));
      ok(broken.tailwind && broken.nav === 'collapse', `control: with Tailwind in it, the Bootstrap navbar is hidden (visibility ${broken.nav})`, broken);
      const bs = await looks(await preview(BOOTSTRAP_PAGE));
      ok(!bs.tailwind && bs.nav === 'visible' && bs.h2 === '32px' && bs.wide === 0, `a Bootstrap page gets no Tailwind: its navbar shows, its h2 is its own, no sideways scroll (${JSON.stringify(bs)})`);
      const plain = await looks(await preview(PLAIN_PAGE));
      ok(!plain.tailwind && plain.h2 === '24px' && plain.bullets === 'disc' && plain.input !== '0px', `a page with CSS of its own keeps its headings, bullets and input borders (${JSON.stringify(plain)})`);
      ok(errors.length === 0, 'no JS errors in the app', errors.slice(0, 2));
      await ctx.close();
    }

    // ── Libraries from the hosts sites name, a video frame, media ──
    {
      const { ctx, page, errors, preview } = await openApp(browser, { viewport: { width: 1280, height: 860 } });
      const asked = [];
      const serve = (url, type, body) => ctx.route(url, (r) => { asked.push(r.request().url()); return r.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body }); });
      await serve('https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js', 'application/javascript', 'window.jQuery = function () {};');
      await serve('https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/css/bootstrap.min.css', 'text/css', 'h1{color:rgb(1, 2, 3)}');
      await serve('https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js', 'application/javascript', 'window.bootstrapLoaded = 1;');
      await serve('https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css', 'text/css', '');
      await serve('https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.4/css/all.min.css', 'text/css', '');
      await serve('https://kit.fontawesome.com/**', 'application/javascript', 'window.kit = 1;');
      await serve('https://www.youtube.com/embed/**', 'text/html', '<!doctype html><title>player</title><p id="player">player</p>');
      await serve('https://media.qjo.test/clip.wav', 'audio/wav', wav());
      const frame = await preview(HOSTS_PAGE);
      await page.waitForTimeout(1500);
      const seen = await frame.evaluate(() => ({ R: window.R, V: window.V, h1: getComputedStyle(document.querySelector('h1')).color }));
      const R = seen.R || {};
      ok(seen.V.some((v) => /kit\.fontawesome\.com/.test(v)) && R.kit !== 'load', 'control: a Font Awesome kit is refused, and the listener hears it', seen.V);
      ok(R.googleJquery === 'load' && asked.includes('https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js'), `jQuery from Google loads, from jsdelivr at 3.7.1 (${R.googleJquery})`);
      ok(R.stackpathCss === 'load' && R.stackpathJs === 'load' && seen.h1 === 'rgb(1, 2, 3)', `Bootstrap 4.5.2 from BootstrapCDN loads, its CSS applied (${R.stackpathCss}, ${R.stackpathJs}, ${seen.h1})`);
      ok(R.fa4 === 'load' && R.fa5 === 'load', `Font Awesome 4 from BootstrapCDN and 5 from use.fontawesome.com load (${R.fa4}, ${R.fa5})`);
      const player = frame.childFrames().find((f) => /youtube\.com\/embed/.test(f.url()));
      ok(Boolean(player) && (await player.$('#player')) !== null, `a YouTube frame shows its player (${frame.childFrames().map((f) => f.url()).join(', ')})`);
      ok(R.media === 'load', `a site's media from another host loads (${R.media})`);
      ok(seen.V.every((v) => /kit\.fontawesome\.com/.test(v)), 'nothing else is refused', seen.V);
      ok(errors.length === 0, 'no JS errors in the app', errors.slice(0, 2));
      await ctx.close();
    }

    // ── A phone menu that closes on the tap ──
    {
      const view = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
      const tapTo = async (frame, id) => {
        await frame.evaluate(() => window.scrollTo(0, 0));
        await frame.click('#toggle');
        await frame.click(`#menu a[href="#${id}"]`);
        await frame.waitForTimeout(1500);
        return frame.evaluate((i) => ({ top: Math.round(document.getElementById(i).getBoundingClientRect().top), open: document.getElementById('menu').classList.contains('open'), url: location.href }), id);
      };
      // The control: the page as a page, at an address of its own.
      const control = await browser.newContext(view);
      await control.route('https://site.qjo.test/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PHONE_MENU }));
      const own = await control.newPage();
      await own.goto('https://site.qjo.test/');
      const asPage = await tapTo(own.mainFrame(), 'three');
      ok(Math.abs(asPage.top) <= 1 && !asPage.open, `control: as a page, the section lands at the top once the menu has closed (top ${asPage.top})`, asPage);
      await control.close();

      const { ctx, preview } = await openApp(browser, view);
      const frame = await preview(PHONE_MENU);
      const inPreview = await tapTo(frame, 'three');
      ok(Math.abs(inPreview.top - asPage.top) <= 1 && !inPreview.open && /^about:srcdoc(#|$)/.test(inPreview.url), `in the preview it lands there too, not the menu's height past it (top ${inPreview.top}, ${inPreview.url})`, inPreview);
      await ctx.close();
    }

    // ── A page that shows one view per hash ──
    {
      const { ctx, page, errors, preview } = await openApp(browser, { viewport: { width: 1280, height: 860 } });
      const frame = await preview(VIEWS);
      const views = [];
      for (const id of ['menu', 'contact', 'home']) {
        await frame.click(`nav a[href="#${id}"]`);
        await frame.waitForTimeout(500);
        views.push(await frame.evaluate(() => ({ shown: [...document.querySelectorAll('.page.active')].map((p) => p.id).join(','), hash: location.hash, url: location.href })));
      }
      ok(views.map((v) => v.shown).join(' ') === 'menu contact home' && views.every((v, i) => v.hash === '#' + ['menu', 'contact', 'home'][i]), `each link shows its view, and location.hash reads it (${views.map((v) => v.shown + v.hash).join(' ')})`, views);
      const seen = await frame.evaluate(() => window.seen);
      ok(seen.join(' ') === 'menu contact home', `the page gets a hashchange for each (${seen.join(' ')})`);
      ok(views.every((v) => /^about:srcdoc#/.test(v.url)) && /^about:srcdoc/.test(frame.url()) && new URL(page.url()).origin === new URL(BASE_URL).origin, `the preview never leaves about:srcdoc (${frame.url()})`);
      await frame.click('#own');
      await frame.waitForTimeout(1200);
      const far = await frame.evaluate(() => Math.round(document.getElementById('far').getBoundingClientRect().top));
      ok(far === 100, `a link the page scrolls to itself stays where the page put it (top ${far}, wanted 100)`);
      ok(errors.length === 0, 'no JS errors in the app', errors.slice(0, 2));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

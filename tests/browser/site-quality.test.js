// What a generated website is held to, and the checker that holds it
// (siteQuality.js): the page in Qjo's own preview document and sandbox, at
// desktop and at 360 px, with the libraries the site playbook names served
// from this package.
//
// A good site — the kind the playbook asks for, an Arabic cafe — passes with
// nothing to report. Then each check meets a copy of that site broken in the
// one way it looks for, and must name it: a check that has never failed is
// not a check. And the preview runs what sites really do: a script that reads
// localStorage on its first line, which a sandbox without same-origin refuses
// — the control, the same page without the preview's guard, stops there.
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./harness');
const { checkSite, serveSiteAssets } = require('./siteQuality');
const { SANDBOX } = require('../../public/domain/codeProject.js');

const GOOD = fs.readFileSync(path.join(__dirname, 'fixtures', 'site-cafe.html'), 'utf8');
const broken = (from, to) => {
  if (!GOOD.includes(from)) throw new Error(`the fixture no longer contains: ${from.slice(0, 60)}`);
  return GOOD.replace(from, to);
};

// One copy per check, and the problem it must be reported as.
const BROKEN = [
  ['a script that throws', broken('if (window.lucide) lucide.createIcons();', 'if (window.lucide) lucide.createIcons();\n    document.getElementById("no-such-thing").addEventListener("click", function () {});'), /JavaScript errors: .*null/],
  ['something wider than a phone', broken('<section id="faq" class="py-20">', '<section id="faq" class="py-20"><div style="width:900px">جدول عريض</div>'), /scrolls sideways at 360px/],
  ['a link to a section that is not there', broken('<li><a class="hover:text-brand-700 focus-visible:outline focus-visible:outline-2 dark:hover:text-brand-100" href="#faq">أسئلة</a></li>', '<li><a class="hover:text-brand-700 focus-visible:outline focus-visible:outline-2 dark:hover:text-brand-100" href="#team">الفريق</a></li>'), /sections that do not exist: #team/],
  ['an image from an address that does not answer', broken('https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=600&q=85', 'https://images.example.invalid/books.jpg'), /images that did not load: .*example\.invalid/],
  ['a random image endpoint that can show the wrong subject', broken('https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=85', 'https://picsum.photos/seed/restaurant/800/600'), /random image sources that may show unrelated subjects/],
  ['an overflow that appears at a tablet breakpoint', GOOD.replace('</head>', '<style>@media (min-width:700px){#tablet-overflow{display:block!important;width:1200px;height:1px}}</style></head>').replace('<main>', '<main><div id="tablet-overflow" style="display:none" aria-hidden="true"></div>'), /scrolls sideways at 768px/],
  ['sections that fade in and never appear', broken("if ('IntersectionObserver' in window) {", "if (false) {").replace("} else reveal.forEach(function (el) { el.classList.add('is-visible'); });", '}'), /content still invisible after scrolling/],
  ['a field with no label', broken('<p id="booking-status"', '<input name="notes">\n          <p id="booking-status"'), /accessibility: .*label/],
  ['a dark-mode toggle that does nothing', broken("root.classList.toggle('dark');", ''), /dark-mode toggle changes nothing/],
  ['a phone menu that does not open', broken("var open = mobileMenu.classList.toggle('hidden') === false;", 'var open = false;'), /phone menu does not open/],
  ['icons never drawn', broken('if (window.lucide) lucide.createIcons();', ''), /icons never drawn/],
  ['placeholder text', broken('يُخبز كل صباح، ويخلص عادة قبل الظهر.', 'Lorem ipsum dolor sit amet.'), /placeholder text/],
  ['an Arabic site laid out left to right', broken('<html lang="ar" dir="rtl" class="scroll-smooth">', '<html lang="en" class="scroll-smooth">'), /an Arabic site with lang="en"/],
  ['no way to find the sections', GOOD.replace(/<a class="(?:hover|block)[^"]*" href="#[^"]+">[^<]*<\/a>/g, ''), /the header links to 1 section/]
];

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

  try {
    const good = await checkSite(browser, GOOD, { rtl: true });
    ok(good.facts.navLinks >= 5 && good.facts.images === 5 && good.facts.darkSwitches && good.facts.phoneMenu && Array.isArray(good.facts.axe),
      'control: the checker saw the site — its links, images, dark mode, phone menu and an axe run', good.facts);
    ok(good.problems.length === 0, 'a site built as the playbook asks passes every check', good.problems);

    // Four at a time: each opens its own context.
    for (let i = 0; i < BROKEN.length; i += 4) {
      const batch = BROKEN.slice(i, i + 4);
      const reports = await Promise.all(batch.map(([, html]) => checkSite(browser, html, { rtl: true })));
      batch.forEach(([label, , expected], k) => {
        const found = reports[k].problems.find((p) => expected.test(p));
        ok(Boolean(found), `${label}: caught — ${found || 'not reported'}`, reports[k].problems);
      });
    }

    // A site's script that reads localStorage first, unguarded, as many do.
    const STORAGE = '<!DOCTYPE html><html><body><h1 id="h">…</h1><script>var theme = localStorage.getItem("theme") || "light"; localStorage.setItem("seen", "1");'
      + 'document.getElementById("h").textContent = "ran:" + theme + ":" + localStorage.getItem("seen");</script></body></html>';
    const context = await browser.newContext();
    await serveSiteAssets(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const run = async (doc) => {
      await page.setContent(`<iframe id="f" sandbox="${SANDBOX}"></iframe>`);
      await page.$eval('#f', (el, d) => { /** @type {HTMLIFrameElement} */ (el).srcdoc = d; }, doc);
      const frame = await (await page.waitForSelector('#f')).contentFrame();
      await page.waitForTimeout(600);
      return frame.$eval('#h', (el) => el.textContent).catch(() => null);
    };
    const bare = await run(STORAGE);
    ok(bare === '…' && errors.some((e) => /localStorage|sandboxed|SecurityError|denied/i.test(e)), `control: without the preview's guard the script stops at localStorage (${bare}; ${errors[0]})`);
    const { buildDocument } = require('../../public/domain/codeProject.js');
    const guarded = await run(buildDocument({ kind: 'html', files: [{ name: 'index.html', lang: 'html', role: 'main', code: STORAGE }] }));
    ok(guarded === 'ran:light:1', `in the preview it runs, its storage kept in memory (${guarded})`);
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

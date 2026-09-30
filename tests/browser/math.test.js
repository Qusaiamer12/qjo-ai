// Math in answers, through the real page and the real MathJax (served from
// this package in place of the CDN, which the harness blocks).
//
// MathJax's settings were set after MathJax had loaded, so they never applied:
// "$x^2$" reached the page as dollar signs, in English and in Arabic. What is
// checked is what a reader sees — typeset math where math was written, prices
// left alone, chemistry, and an equation kept left to right inside Arabic.
const fs = require('fs');
const path = require('path');
const { launchBrowser, BASE_URL } = require('./harness');

const MATHJAX = path.join(__dirname, 'node_modules', 'mathjax', 'es5');
const CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/';

const ANSWER = [
  'Inline: $x^2 + 1$ here.',
  'Parens: \\(a^2 + b^2 = c^2\\).',
  '$$E = mc^2$$',
  'Chemistry: \\(\\ce{2H2 + O2 -> 2H2O}\\)',
  'السرعة $v = u + at$ تساوي 38.4 م/ث',
  'Prices: $5 and $10 each.',
  'In code: `$y$` stays.',
  'Bold with math: **the area $a*b*c$ of it**'
].join('\n\n');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const loaded = [];
  await page.route(`${CDN}**`, (route) => {
    const rel = route.request().url().slice(CDN.length).split('?')[0];
    const file = path.join(MATHJAX, rel);
    loaded.push(rel);
    if (!file.startsWith(MATHJAX) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, contentType: rel.endsWith('.js') ? 'application/javascript' : 'font/woff', body: fs.readFileSync(file) });
  });
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: chunk\ndata: ${JSON.stringify({ text: ANSWER })}\n\nevent: done\ndata: {}\n\n` }));
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.MathJax && window.MathJax.typesetPromise, null, { timeout: 15000 }).catch(() => {});
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

  const config = await page.evaluate(() => window.MathJax && window.MathJax.config && window.MathJax.config.tex);
  if (!config) {
    console.log('❌ MathJax never started — refusing to report on math');
    process.exit(1);
  }
  ok(Array.isArray(config.packages) && config.packages.includes('mhchem') && JSON.stringify(config.inlineMath) === JSON.stringify([['\\(', '\\)']]),
    `MathJax starts with the app's settings, chemistry included (${JSON.stringify(config.inlineMath)}, ${config.packages})`);

  await page.fill('#input', 'math please');
  await page.click('#sendBtn');
  await page.waitForTimeout(4000);

  const paras = await page.$$eval('.msg.assistant:last-of-type .qjo-streamed-content p', (ps) => ps.map((p) => {
    const box = p.querySelector('mjx-container');
    const style = box ? getComputedStyle(box) : null;
    return {
      text: p.innerText.replace(/\s+/g, ' ').trim(),
      math: p.querySelectorAll('mjx-container').length,
      errors: p.querySelectorAll('mjx-merror').length,
      display: Boolean(p.querySelector('mjx-container[display="true"]')),
      direction: style && style.direction,
      bidi: style && style.unicodeBidi
    };
  }));
  const find = (re) => paras.find((p) => re.test(p.text)) || {};

  ok(find(/^Parens/).math === 1, 'control: \\( … \\) was typeset before and still is');
  ok(find(/^Inline/).math === 1 && !/\$/.test(find(/^Inline/).text), `"$x^2 + 1$" is typeset, not shown with its dollars (${find(/^Inline/).text})`);
  ok(paras.some((p) => p.display && p.math === 1), 'display math ($$ … $$) is typeset as a block');
  ok(find(/^Chemistry/).math === 1 && find(/^Chemistry/).errors === 0, 'chemistry (\\ce{…}) is typeset without errors');
  const arabic = find(/^السرعة/);
  ok(arabic.math === 1 && arabic.direction === 'ltr' && arabic.bidi === 'isolate', `an equation inside Arabic is typeset and kept left to right, isolated (${arabic.direction}, ${arabic.bidi})`, arabic);
  const prices = find(/^Prices/);
  ok(prices.math === 0 && /\$5 and \$10/.test(prices.text), `prices stay prices ("${prices.text}")`);
  const code = find(/^In code/);
  ok(code.math === 0 && /\$y\$/.test(code.text), `math written inside code stays code ("${code.text}")`);
  const bold = find(/^Bold with math/);
  ok(bold.math === 1 && bold.errors === 0, 'math inside bold text is typeset whole (its * are not taken as emphasis)', bold);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

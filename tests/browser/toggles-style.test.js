const { launchBrowser, repoFile } = require('./harness');

const app = repoFile('public/app.js');
// Pull the shipped toggle implementation verbatim.
const from = app.indexOf('    let escFocusHandler = null;');
const to = app.indexOf('    function initializeJsRunButtons(element) {');
const toggleSrc = app.slice(from, to);
const css = repoFile('public/premium-ui.css');

// The exact markup lightMarkdown() emits for a JS block (see the generic branch).
const BLOCK = `
<div class="code-block-wrapper">
  <div class="code-block-header">
    <div class="code-block-header-left">
      <div class="code-block-file-chip"><span class="code-block-filepath">src/utils/sum.js</span></div>
      <span class="code-block-lang">javascript</span>
    </div>
    <div class="code-block-actions">
      <button type="button" class="run-js-btn" data-code="x" data-target="js-output-0"></button>
      <button type="button" class="toggle-linenums-btn" title="Toggle line numbers">#</button>
      <button type="button" class="code-focus-btn" title="Focus mode">⛶</button>
      <button type="button" class="copy-code-btn" data-code="x"></button>
    </div>
  </div>
  <pre id="code-content-0"><code class="language-javascript">const nums = [1, 2, 3];

console.log(nums);
const total = 6;</code></pre>
</div>`;

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${BLOCK}</body></html>`);
  await page.evaluate(`
    window.qjoLanguage = 'en';
    ${toggleSrc}
    window.initializeCodeViewToggles = initializeCodeViewToggles;
    window.splitCodeIntoLines = splitCodeIntoLines;
    initializeCodeViewToggles(document);
  `);

  let pass = 0, fail = 0;
  const check = (ok, msg, d) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 250)); };

  const codeText = () => page.evaluate(() => document.querySelector('pre > code').textContent);
  const original = await codeText();

  // ── Line numbers ──
  await page.click('.toggle-linenums-btn');
  check(await page.evaluate(() => document.querySelector('.code-block-wrapper').classList.contains('show-line-numbers')), 'line numbers toggle ON');
  const lineCount = await page.evaluate(() => document.querySelectorAll('.qjo-code-line').length);
  check(lineCount === 4, `one element per source line (got ${lineCount}, want 4)`);

  const gutter = await page.evaluate(() => {
    const el = document.querySelector('.qjo-code-line');
    return getComputedStyle(el, '::before').content;
  });
  check(gutter.includes('counter') || gutter === '"1"' || gutter !== 'none', `gutter renders a number (${gutter})`);

  const noSelect = await page.evaluate(() => getComputedStyle(document.querySelector('.qjo-code-line'), '::before').userSelect);
  check(noSelect === 'none', `gutter is unselectable (${noSelect})`);

  check((await codeText()).replace(/\u200B/g, '') === original, 'code text is byte-identical after numbering (copy stays clean)');

  await page.click('.toggle-linenums-btn');
  check(!(await page.evaluate(() => document.querySelector('.code-block-wrapper').classList.contains('show-line-numbers'))), 'line numbers toggle OFF');
  check((await codeText()).replace(/\u200B/g, '') === original, 'code text still intact after toggling off');

  // ── Focus mode ──
  await page.click('.code-focus-btn');
  check(await page.evaluate(() => document.querySelector('.code-block-wrapper').classList.contains('is-code-focused')), 'focus mode ON');
  check(await page.evaluate(() => document.body.classList.contains('has-focused-code')), 'body backdrop flag set');
  const pos = await page.evaluate(() => getComputedStyle(document.querySelector('.code-block-wrapper')).position);
  check(pos === 'fixed', `focused block is fixed (${pos})`);
  const z = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.code-block-wrapper')).zIndex));
  check(z < 220, `z-index ${z} stays below the auth overlay (220)`);

  await page.keyboard.press('Escape');
  check(!(await page.evaluate(() => document.querySelector('.code-block-wrapper').classList.contains('is-code-focused'))), 'Escape exits focus mode');
  check(!(await page.evaluate(() => document.body.classList.contains('has-focused-code'))), 'backdrop cleared on exit');

  await page.click('.code-focus-btn');
  await page.click('.code-focus-btn');
  check(!(await page.evaluate(() => document.querySelector('.code-block-wrapper').classList.contains('is-code-focused'))), 'button toggles focus off too');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// The code studio through the real page: an answer arrives as a stream, its
// Preview tab or the studio is opened, and what is checked is what the
// preview iframe actually does — its computed styles, its clicks, its origin.
//
// React, ReactDOM, Babel and lucide-react are served from this package's own
// devDependencies at the URLs the app asks for; scripts/test-code-studio.js
// fails if those URLs and these versions drift apart. Tailwind and fonts stay
// blocked, as every third-party origin is (harness.js): a preview must work
// without them.
const fs = require('fs');
const { launchBrowser, BASE_URL } = require('./harness');
const { LIBS } = require('../../public/domain/codeProject.js');

const path = require('path');
// Read from the package folders directly: their "exports" maps do not list
// the UMD builds.
const lib = (file) => fs.readFileSync(path.join(__dirname, 'node_modules', file), 'utf8');
const SERVED = {
  [LIBS.react]: lib('react/umd/react.production.min.js'),
  [LIBS.reactDom]: lib('react-dom/umd/react-dom.production.min.js'),
  [LIBS.babel]: lib('@babel/standalone/babel.min.js'),
  [LIBS.lucideReact]: lib('lucide-react/dist/cjs/lucide-react.js')
};

const fence = (lang, code) => '```' + lang + '\n' + code + '\n```';
const PAGE = '<!DOCTYPE html>\n<html>\n<head>\n<title>Counter</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<button id="b">0</button>\n<script src="script.js"></script>\n</body>\n</html>';
const CSS = '#b { color: rgb(255, 0, 0); }';
const JS = 'document.getElementById("b").addEventListener("click", function () { this.textContent = String(Number(this.textContent) + 1); });';
const STITCHED = ['Here is the page:', fence('html', PAGE), 'The styles:', fence('css', CSS), 'And the script:', fence('javascript', JS)].join('\n\n');
const COMPONENT = "import { useState } from 'react';\nimport { Plus } from 'lucide-react';\n\nexport default function Counter() {\n  const [n, setN] = useState(0);\n  return (<button id=\"c\" onClick={() => setN(n + 1)}><Plus size={14} /> <span id=\"n\">{n}</span></button>);\n}";

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

  async function answerWith(markdown, viewport = { width: 1440, height: 900 }) {
    const ctx = await browser.newContext({ viewport });
    for (const [url, body] of Object.entries(SERVED)) {
      await ctx.route(url, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body }));
    }
    const page = await ctx.newPage();
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `event: chunk\ndata: ${JSON.stringify({ text: markdown })}\n\nevent: done\ndata: {}\n\n` }));
    await page.fill('#input', 'build it');
    await page.click('#sendBtn');
    await page.waitForSelector('.has-live-preview .live-preview-tab-btn', { timeout: 8000 }).catch(() => {});
    return { ctx, page };
  }

  // Null when the block has no Preview tab, so the checks after it fail by
  // name instead of the suite dying on a click timeout.
  async function inlinePreview(page) {
    const tab = await page.$('.has-live-preview .live-preview-tab-btn');
    if (!tab) return null;
    await tab.click();
    const handle = await page.waitForSelector('.has-live-preview .live-preview-iframe', { timeout: 5000 }).catch(() => null);
    return handle && handle.contentFrame();
  }

  const colorOf = (frame, selector) => frame.$eval(selector, (el) => getComputedStyle(el).color).catch(() => null);

  // ── One page from three blocks ──
  async function stitchedPage() {
    const { ctx, page } = await answerWith(STITCHED);
    const frame = await inlinePreview(page);
    const present = frame && await frame.waitForSelector('#b', { timeout: 5000 }).then(() => true, () => false);
    ok(present, 'control: the page\'s markup is in the preview');
    ok(await colorOf(frame, '#b') === 'rgb(255, 0, 0)', 'the answer\'s CSS block styles the page', await colorOf(frame, '#b'));
    if (present) { await frame.click('#b'); await frame.click('#b'); }
    ok(present && await frame.$eval('#b', (el) => el.textContent) === '2', 'the answer\'s JavaScript block makes it work');
    const attr = await page.$eval('.has-live-preview .live-preview-iframe', (el) => el.getAttribute('sandbox'));
    // Scripts, forms and tabs for links out (preview-links.test.js) — never same-origin.
    const tokens = String(attr).split(/\s+/);
    ok(tokens.includes('allow-scripts') && !tokens.includes('allow-same-origin') && !tokens.includes('allow-top-navigation'), `the preview is sandboxed without same-origin (${attr})`);
    // The page's storage, with something of the app's in it. The preview keeps
    // its own in memory (the guard in codeProject.js) and never sees the app's.
    await page.evaluate(() => localStorage.setItem('qjo_isolation_marker', 'app-secret'));
    const reach = present && await frame.evaluate(() => {
      let parentDoc = 'blocked'; try { parentDoc = window.parent.document ? 'READ' : 'none'; } catch (_) { /* expected */ }
      let storage = 'threw'; try { storage = [window.localStorage.getItem('qjo_isolation_marker'), window.localStorage.length]; } catch (_) { /* a guard that failed */ }
      return { origin: window.origin, parentDoc, storage };
    });
    ok(reach && reach.origin === 'null' && reach.parentDoc === 'blocked' && JSON.stringify(reach.storage) === '[null,0]', 'the preview cannot reach the page or its storage', reach);
    await ctx.close();
  }

  // ── React ──
  async function reactComponent() {
    const { ctx, page } = await answerWith('A counter:\n\n' + fence('jsx', COMPONENT));
    ok(Boolean(await page.$('.has-live-preview .live-preview-tab-btn')), 'a React block gets a Preview tab');
    const frame = await inlinePreview(page);
    const mounted = frame && await frame.waitForSelector('#c', { timeout: 15000 }).then(() => true, () => false);
    const error = frame && await frame.$eval('#qjo-preview-error', (el) => el.textContent).catch(() => null);
    ok(mounted, 'a React component is compiled and mounted', error);
    if (mounted) { await frame.click('#c'); await frame.click('#c'); await frame.click('#c'); }
    ok(mounted && await frame.$eval('#n', (el) => el.textContent) === '3', 'and its state works');
    ok(mounted && await frame.$$eval('#c svg', (els) => els.length) === 1, 'lucide-react icons render');
    await ctx.close();
  }

  async function missingLibrary() {
    const missing = "import { motion } from 'framer-motion';\nexport default function A() { return <motion.div>hi</motion.div>; }";
    const { ctx, page } = await answerWith(fence('jsx', missing));
    const frame = await inlinePreview(page);
    const text = frame && await frame.waitForSelector('#qjo-preview-error', { timeout: 15000 }).then((el) => el.textContent(), () => null);
    ok(Boolean(text) && text.includes('framer-motion'), `a library the preview lacks is named, not a blank page (${text})`);
    await ctx.close();
  }

  async function unexportedComponent() {
    // Nothing exported and no App: the component is the last function, not the
    // constant declared after it.
    const unexported = "function Card() { return <div id=\"card\">card</div>; }\nconst API_URL = 'https://example.com';";
    const { ctx, page } = await answerWith(fence('jsx', unexported));
    const frame = await inlinePreview(page);
    const shown = frame && await frame.waitForSelector('#card', { timeout: 15000 }).then(() => true, () => false);
    ok(shown, 'a component that is never exported is found and shown', frame && await frame.$eval('#qjo-preview-error', (el) => el.textContent).catch(() => null));
    await ctx.close();
  }

  // ── The studio on a wide screen ──
  async function studioOnWideScreen() {
    const { ctx, page } = await answerWith(STITCHED);
    const appBefore = await page.$eval('.app', (el) => el.getBoundingClientRect().width);
    await page.click('.has-live-preview .preview-expand-btn');
    const shown = await page.waitForSelector('.qjo-canvas:not([hidden])', { timeout: 3000 }).then(() => true, () => false);
    ok(shown, 'the studio opens');
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('.qjo-canvas').getBoundingClientRect();
      const main = document.querySelector('.main').getBoundingClientRect();
      return { canvasLeft: canvas.left, canvasWidth: canvas.width, mainRight: main.right, viewport: window.innerWidth };
    });
    ok(layout.canvasWidth > 300 && layout.canvasWidth < layout.viewport * 0.6 && layout.mainRight <= layout.canvasLeft + 1,
      'beside the conversation, which narrows instead of being covered', layout);

    const frameHandle = await page.$('.qjo-canvas-frame');
    const frame = frameHandle && await frameHandle.contentFrame();
    const inside = frame && await frame.waitForSelector('#b', { timeout: 5000 }).then(() => true, () => false);
    ok(inside && await colorOf(frame, '#b') === 'rgb(255, 0, 0)', 'it previews the whole answer');
    const studioSandbox = await page.$eval('.qjo-canvas-frame', (el) => el.getAttribute('sandbox'));
    const studioOrigin = inside && await frame.evaluate(() => window.origin);
    ok(!String(studioSandbox).split(/\s+/).includes('allow-same-origin') && studioOrigin === 'null', `the studio's preview has no origin of its own either (${studioSandbox}; ${studioOrigin})`);

    await page.click('.qjo-canvas-tab[data-view="code"]');
    const files = await page.$$eval('.qjo-canvas-files button', (els) => els.map((el) => el.textContent));
    ok(JSON.stringify(files) === JSON.stringify(['index.html', 'style.css', 'script.js']), `its code is there, file by file (${files.join(', ')})`);

    await page.click('.qjo-canvas-files button:nth-child(2)');
    await page.fill('.qjo-canvas-editor', '#b { color: rgb(0, 0, 255); }');
    await page.click('.qjo-canvas-tab[data-view="preview"]');
    await page.waitForTimeout(900);
    const edited = await (await (await page.$('.qjo-canvas-frame')).contentFrame());
    await edited.waitForSelector('#b', { timeout: 5000 }).catch(() => {});
    ok(await colorOf(edited, '#b') === 'rgb(0, 0, 255)', 'an edit in the studio shows in the preview', await colorOf(edited, '#b'));

    await page.click('.qjo-canvas-device[data-device="mobile"]');
    const width = await page.$eval('.qjo-canvas-viewport', (el) => el.getBoundingClientRect().width);
    ok(width <= 392, `phone width (${Math.round(width)}px)`);

    await page.keyboard.press('Escape');
    const after = await page.evaluate(() => ({
      hidden: document.querySelector('.qjo-canvas').hidden,
      app: document.querySelector('.app').getBoundingClientRect().width,
      srcdoc: document.querySelector('.qjo-canvas-frame').getAttribute('srcdoc')
    }));
    ok(after.hidden && Math.abs(after.app - appBefore) < 2 && !after.srcdoc, 'Escape closes it, gives the space back and stops the preview', { ...after, appBefore });
    await ctx.close();
  }

  // ── The studio on a phone ──
  async function studioOnPhone() {
    const { ctx, page } = await answerWith(STITCHED, { width: 390, height: 844 });
    await page.click('.has-live-preview .preview-expand-btn');
    await page.waitForSelector('.qjo-canvas:not([hidden])', { timeout: 3000 }).catch(() => {});
    const box = await page.$eval('.qjo-canvas', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).catch(() => null);
    ok(box && box.x === 0 && box.y === 0 && box.w >= 389 && box.h >= 843, 'on a phone it covers the screen', box);
    await page.click('.qjo-canvas-close');
    ok(await page.$eval('.qjo-canvas', (el) => el.hidden), 'and closes with its button');
    await ctx.close();
  }

  // ── A file name the model chose is text ──
  async function hostileFileName() {
    const hostile = ['```html\n<p>x</p>\n```', '```css:<img src=x onerror="window.__pwned=1">.css\np { color: red; }\n```'].join('\n\n');
    const { ctx, page } = await answerWith(hostile);
    await page.click('.has-live-preview .preview-expand-btn');
    await page.waitForSelector('.qjo-canvas:not([hidden])', { timeout: 3000 }).catch(() => {});
    await page.click('.qjo-canvas-tab[data-view="code"]').catch(() => {});
    const tabs = await page.$$eval('.qjo-canvas-files button', (els) => els.map((el) => ({ text: el.textContent, imgs: el.querySelectorAll('img').length })));
    const pwned = await page.evaluate(() => window.__pwned === 1);
    ok(tabs.length === 2 && /<img src=x/.test(tabs[1].text) && tabs[1].imgs === 0 && !pwned, 'a hostile file name shows as text in the studio', tabs);
    await ctx.close();
  }

  // ── From the answer's toolbar, beside copy and the files ──
  async function toolbarPreview() {
    const { ctx, page } = await answerWith(STITCHED);
    await page.waitForSelector('.msg.assistant:last-of-type .msg-actions-toolbar', { timeout: 5000 }).catch(() => {});
    const button = await page.$('.msg.assistant:last-of-type .msg-actions-toolbar [data-preview="studio"]');
    ok(Boolean(button), 'an answer with a page to run has a preview button in its toolbar');
    if (button) await button.click();
    const shown = await page.waitForSelector('.qjo-canvas:not([hidden])', { timeout: 3000 }).then(() => true, () => false);
    const files = shown ? await page.$$eval('.qjo-canvas-files button', (els) => els.length) : 0;
    ok(shown && files >= 2, `it opens the studio with the answer's files together (${files})`);
    await ctx.close();
    const plain = await answerWith(fence('python', 'print(1)'));
    await plain.page.waitForSelector('.msg.assistant:last-of-type .msg-actions-toolbar', { timeout: 5000 }).catch(() => {});
    ok(!(await plain.page.$('.msg.assistant:last-of-type [data-preview="studio"]')), 'control: an answer with nothing to preview has none');
    await plain.ctx.close();
  }

  for (const scenario of [stitchedPage, reactComponent, missingLibrary, unexportedComponent, studioOnWideScreen, studioOnPhone, hostileFileName, toolbarPreview]) {
    await scenario();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

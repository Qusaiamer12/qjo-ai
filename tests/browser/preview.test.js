// Live previews of code in an answer, through the real page: the answer
// arrives as a stream, the Preview tab is clicked, and what is checked is what
// the iframe actually shows.
//
// Stage 0 of the seven-track plan: a complete HTML document used to preview
// blank. Tailwind was injected before </head> with an escaped closing tag
// (<\/script>), which HTML does not end a script with — the script element
// swallowed the rest of the page.
const { launchBrowser, BASE_URL } = require('./harness');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 260)); };

  async function answerWith(markdown) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `event: chunk\ndata: ${JSON.stringify({ text: markdown })}\n\nevent: done\ndata: {}\n\n` }));
    await page.fill('#input', 'build it');
    await page.click('#sendBtn');
    await page.waitForSelector('.live-preview-tab-btn', { timeout: 8000 }).catch(() => {});
    return { ctx, page };
  }

  async function previewText(page) {
    await page.click('.live-preview-tab-btn');
    await page.waitForTimeout(800);
    const handle = await page.$('.live-preview-iframe');
    const frame = handle && await handle.contentFrame();
    if (!frame) return null;
    return frame.evaluate(() => document.body ? document.body.innerText : '').catch(() => null);
  }

  // A fragment previews: the control that the probe reads real preview output.
  {
    const { ctx, page } = await answerWith('```html\n<h1>Fragment works</h1>\n```');
    const text = await previewText(page);
    ok(text && /Fragment works/.test(text), 'control: a fragment\'s preview shows its content', text);
    await ctx.close();
  }

  {
    const doc = '<!DOCTYPE html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<h1>Whole page works</h1>\n<p id="p">and its body is there</p>\n</body>\n</html>';
    const { ctx, page } = await answerWith('```html\n' + doc + '\n```');
    const text = await previewText(page);
    ok(text && /Whole page works/.test(text) && /its body is there/.test(text), 'a complete HTML document previews with its body, not blank', text);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

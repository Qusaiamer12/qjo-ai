// Links and forms inside a code preview, through the real page.
//
// A preview is an about:srcdoc document, and its links resolve against the
// app's address. On the owner's laptop a site's "#about" turned the preview
// into Qjo's own sign-in page. Checked here, in Arabic: a link to a section
// scrolls the page and the preview stays; a form is held, with a note; a link
// to another page of the answer shows it — under the block and in the side
// canvas — and one to a page the answer lacks says so; a link out opens a
// tab; a library from unpkg loads from jsdelivr, which the preview allows; an
// answer whose code was cut and continued with "```html" previews as one page.
// The control: the same document without the guard does land on the app.
const { launchBrowser, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

const SITE = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>مقهى</title><script src="https://unpkg.com/fake-lib@1.0.0/dist/fake.js"></script></head><body>'
  + '<nav><a id="go" href="#about">من نحن</a> <a id="other" href="about.html">صفحة أخرى</a> <a id="none" href="team.html">الفريق</a> <a id="out" href="https://example.com/menu">القائمة</a></nav>'
  + '<h1>مقهى الياسمين</h1><form id="f"><input name="q"><button id="send">أرسل</button></form>'
  + '<form id="g"><button id="send2">اشترك</button></form><script>document.getElementById("g").addEventListener("submit", function (e) { e.stopPropagation(); });</script>'
  + '<div style="height:2200px"></div>'
  + '<section id="about"><h2>قصتنا</h2><a id="btn" href="#">زر</a></section><div style="height:600px"></div></body></html>';
const ABOUT = '<!DOCTYPE html><html><body><h1>صفحة من نحن</h1></body></html>';

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fetched = [];
  await page.route('https://cdn.jsdelivr.net/npm/fake-lib@1.0.0/dist/fake.js', (route) => { fetched.push('jsdelivr'); route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.fakeLib = "loaded";' }); });
  await page.route('https://unpkg.com/**', (route) => { fetched.push('unpkg'); route.abort('blockedbyclient'); });
  let answer = '```html\n' + SITE + '\n```\n\n```html:about.html\n' + ABOUT + '\n```';
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` }));
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

  try {
    // Control: the document as it was, without the guard, in an iframe like the preview's.
    const escaped = await page.evaluate(async (doc) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-popups allow-popups-to-escape-sandbox');
      f.srcdoc = doc;
      document.body.appendChild(f);
      await new Promise((r) => { f.onload = r; });
      return f.id = 'qjo-control-frame';
    }, SITE.replace(/<script[^>]*><\/script>/, ''));
    const control = await (await page.$('#' + escaped)).contentFrame();
    await control.click('#go');
    await page.waitForTimeout(1500);
    const controlFrame = await (await page.$('#' + escaped)).contentFrame();
    ok(/^http/.test(controlFrame.url()), `control: without the guard, "#about" takes the preview to the app (${controlFrame.url()})`);
    await page.evaluate((id) => document.getElementById(id).remove(), escaped);

    await page.fill('#input', 'اعملي موقع مقهى');
    await page.click('#sendBtn');
    await page.waitForSelector('.live-preview-tab-btn', { timeout: 8000 });
    await page.click('.live-preview-tab-btn');
    await page.waitForTimeout(1200);
    const handle = await page.$('.live-preview-iframe');
    const frame = async () => handle.contentFrame();
    const state = async () => { const f = await frame(); return { url: f.url(), text: await f.evaluate(() => (document.body ? document.body.innerText : '')).catch(() => ''), y: await f.evaluate(() => window.scrollY).catch(() => -1), note: await f.evaluate(() => (document.getElementById('qjo-preview-note') || {}).textContent || '').catch(() => '') }; };
    const start = await state();
    ok(start.url === 'about:srcdoc' && /مقهى الياسمين/.test(start.text), 'the preview shows the site');

    await (await frame()).click('#go');
    await page.waitForTimeout(1200);
    const hash = await state();
    ok(hash.url === 'about:srcdoc' && /مقهى الياسمين/.test(hash.text) && hash.y > 1000, `"#about" scrolls to the section and the preview stays the site (y=${hash.y}, ${hash.url})`);

    await (await frame()).click('#send');
    await page.waitForTimeout(700);
    const form = await state();
    ok(form.url === 'about:srcdoc' && /الفورم شغّال/.test(form.note), `a form is held, with a note in the page's language ("${form.note}")`);

    await (await frame()).evaluate(() => { const n = document.getElementById('qjo-preview-note'); if (n) n.remove(); });
    await (await frame()).click('#send2');
    await page.waitForTimeout(700);
    const stopped = await state();
    ok(stopped.url === 'about:srcdoc' && /الفورم شغّال/.test(stopped.note), 'a form whose own handler stops the event is held too');

    // Near the bottom, so the click itself does not scroll the page up to it.
    await (await frame()).evaluate(() => document.getElementById('btn').scrollIntoView());
    const before = (await state()).y;
    await (await frame()).click('#btn');
    await page.waitForTimeout(600);
    const button = await state();
    ok(button.url === 'about:srcdoc' && before > 1000 && Math.abs(button.y - before) < 50, `a link that is a button (href="#") does not jump the page (y ${before} → ${button.y})`);

    await (await frame()).click('#none');
    await page.waitForTimeout(900);
    const missing = await state();
    ok(missing.url === 'about:srcdoc' && /team\.html/.test(missing.note) && /مش موجودة/.test(missing.note), `a link to a page the answer lacks says so ("${missing.note}")`);

    // The harness lets no site but the app's load, so the tab is known by
    // what it asked for, not by what it shows.
    const popup = ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    const asked = ctx.waitForEvent('request', { predicate: (r) => /example\.com\/menu/.test(r.url()), timeout: 5000 }).catch(() => null);
    await (await frame()).click('#out');
    const [opened, request] = await Promise.all([popup, asked]);
    ok(opened && opened !== page && request && request.frame().page() === opened && (await state()).url === 'about:srcdoc', `a link out opens it in a new tab (${request && request.url()}) and the preview stays`);
    if (opened) await opened.close();

    ok((await (await frame()).evaluate(() => window.fakeLib)) === 'loaded' && fetched.includes('jsdelivr') && !fetched.includes('unpkg'), `a library from unpkg loads from jsdelivr (${fetched.join(', ')})`);

    await (await frame()).click('#other');
    await page.waitForTimeout(1200);
    const other = await state();
    ok(other.url === 'about:srcdoc' && /صفحة من نحن/.test(other.text), `a link to another page of the answer shows it (${other.text.slice(0, 30)})`);

    // The side canvas: the same link, the same page.
    await page.click('.live-preview-tab-btn').catch(() => {});
    await page.click('.preview-expand-btn');
    await page.waitForTimeout(1200);
    const canvasFrame = await (await page.$('.qjo-canvas-frame')).contentFrame();
    ok(/مقهى الياسمين/.test(await canvasFrame.evaluate(() => document.body.innerText)), 'control: the canvas shows the site');
    await canvasFrame.click('#other');
    await page.waitForTimeout(1200);
    const after = await (await page.$('.qjo-canvas-frame')).contentFrame();
    ok(after.url() === 'about:srcdoc' && /صفحة من نحن/.test(await after.evaluate(() => document.body.innerText)), 'in the canvas, the link shows the other page');
    await page.keyboard.press('Escape');

    // An answer cut in its code and continued with "```html", glued as it was.
    answer = 'هذا موقعك:\n\n```html\n<!DOCTYPE html><html><body><ul>\n<li>واحد</li>\n<li>اث\n```html\n<li>اثنان</li>\n</ul></body></html>\n```\n\nجاهز.';
    await page.fill('#input', 'كمل');
    await page.click('#sendBtn');
    await page.waitForTimeout(2500);
    const last = await page.evaluate(() => {
      const bubble = [...document.querySelectorAll('#messages .msg.assistant')].pop();
      return { blocks: bubble.querySelectorAll('.code-block-wrapper').length, text: bubble.querySelector('.qjo-streamed-content, .bubble') ? bubble.innerText : '' };
    });
    ok(last.blocks === 1 && !/^\s*html\s*<li/m.test(last.text), `a reopened fence stays inside the block: one block, no HTML as text (${last.blocks})`, last.text.slice(0, 200));
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

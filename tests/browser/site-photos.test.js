// A site's photos show its subject, through the real page.
//
// Asked for a restaurant's site, Qjo showed mountains and forests: the model
// wrote picsum addresses, and picsum's photos are random whatever the seed.
// The preview now draws every stock photo from a description (codeProject.js):
// the image's data-photo, picsum's seed word, an English alt, else the site's
// subject from its title — in English, since an Arabic description drew a
// woman, not food. Here an Arabic restaurant page is previewed and every
// picture it asks for is recorded. The control: the same page put in a frame
// as written does ask picsum, so the probe sees what a page requests.
const { launchBrowser, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SITE = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>مطعم الشام</title></head><body>'
  + '<h1>أطيب المشاوي بعمّان</h1>'
  + '<img id="described" src="https://picsum.photos/seed/x/600/400" data-photo="mixed grill platter" alt="مشاوي مشكلة" width="600" height="400">'
  + '<img id="seeded" src="https://picsum.photos/seed/hummus/400/300" alt="حمص" width="400" height="300">'
  + '<img id="arabic" src="https://picsum.photos/800/500" alt="صالة المطعم" width="800" height="500">'
  + '<img id="unsplash" src="https://images.unsplash.com/photo-1500000000000-abc?w=400" alt="Fresh salad bowl">'
  + '<div id="hero" style="height:200px;background-image:url(https://picsum.photos/1200/600)"></div>'
  + '</body></html>';

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const asked = [];
  for (const host of ['https://picsum.photos/**', 'https://images.unsplash.com/**', 'https://image.pollinations.ai/**']) {
    await ctx.route(host, (route) => { asked.push(decodeURIComponent(route.request().url())); route.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
  }
  const answer = '```html\n' + SITE + '\n```';
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: answer })}\n\nevent: done\ndata: {}\n\n` }));
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

  try {
    // Control: the page as written, in a frame like the preview's, asks picsum.
    await page.evaluate(async (doc) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.id = 'qjo-control-frame';
      f.srcdoc = doc;
      document.body.appendChild(f);
      await new Promise((r) => { f.onload = r; });
    }, SITE);
    await page.waitForTimeout(800);
    ok(asked.some((u) => u.startsWith('https://picsum.photos/')), `control: the page as written asks picsum (${asked.length} pictures)`, asked);
    await page.evaluate(() => document.getElementById('qjo-control-frame').remove());
    asked.length = 0;

    await page.fill('#input', 'بدي موقع html لمطعم');
    await page.click('#sendBtn');
    await page.waitForSelector('.live-preview-tab-btn', { timeout: 8000 });
    await page.click('.live-preview-tab-btn');
    await page.waitForTimeout(1500);
    const frame = await (await page.$('.live-preview-iframe')).contentFrame();
    const shown = await frame.evaluate(() => ({
      text: document.body ? document.body.innerText : '',
      srcs: Object.fromEntries([...document.querySelectorAll('img')].map((i) => [i.id, decodeURIComponent(i.currentSrc || i.src)])),
      hero: decodeURIComponent(getComputedStyle(document.getElementById('hero')).backgroundImage)
    }));
    ok(/أطيب المشاوي/.test(shown.text), 'the preview shows the restaurant');
    const prompt = (u) => (/image\.pollinations\.ai\/prompt\/([^?]*)/.exec(u) || [])[1] || '';
    ok(!asked.some((u) => /picsum\.photos|unsplash\.com/.test(u)), `no random stock photo is asked for (${asked.length} pictures)`, asked);
    ok(/mixed grill platter/.test(prompt(shown.srcs.described)), `a photo is drawn from its own English description (${prompt(shown.srcs.described)})`, shown.srcs);
    ok(/hummus/.test(prompt(shown.srcs.seeded)) && /restaurant|food/.test(prompt(shown.srcs.seeded)), `picsum's seed word, with the site's subject (${prompt(shown.srcs.seeded)})`, shown.srcs);
    ok(/restaurant|food/.test(prompt(shown.srcs.arabic)) && !/[؀-ۿ]/.test(prompt(shown.srcs.arabic)), `an Arabic alt gives the subject in English (${prompt(shown.srcs.arabic)})`, shown.srcs);
    ok(/Fresh salad bowl/.test(prompt(shown.srcs.unsplash)), `an Unsplash address written from memory becomes its English alt (${prompt(shown.srcs.unsplash)})`, shown.srcs);
    ok(/restaurant|food/.test(prompt(shown.hero)) && /width=1200&height=600/.test(shown.hero), `a background photo too, at its size (${shown.hero.slice(0, 120)})`, shown.hero);
    ok(asked.filter((u) => u.includes('image.pollinations.ai')).length >= 4, `the pictures are requested (${asked.length})`, asked);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  } catch (e) {
    ok(false, `the run stopped: ${e.message}`);
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

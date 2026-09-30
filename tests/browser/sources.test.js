// The sources behind an answer, through the real page: the strip that appears
// the moment a search finishes, above the answer; citations drawn as "1 · WHO"
// that show what the source says on hover, focus or tap; and none of it able
// to run anything a source's title or text carries.
//
// /api/chat is replaced by a stream this suite times, so the strip can be seen
// before the answer's first word — the case route.fulfill cannot show, since
// it delivers the whole stream at once.
const { launchBrowser, BASE_URL } = require('./harness');

// Replaces fetch for /api/chat only: window.__plan is [delayMs, text] steps,
// text null closes the stream.
const FETCH_STUB = `
(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/api/chat')) return realFetch(input, init);
    const encoder = new TextEncoder();
    let controller;
    const body = new ReadableStream({ start(c) { controller = c; } });
    let at = 0;
    for (const [delay, text] of (window.__plan || [])) {
      at += delay;
      setTimeout(() => { try { text === null ? controller.close() : controller.enqueue(encoder.encode(text)); } catch (_) {} }, at);
    }
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  };
})();`;

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const WHO = 'https://www.who.int/news-room/fact-sheets/detail/diabetes';
const NIH = 'https://www.niddk.nih.gov/health-information/diabetes';
const FORUM = 'https://www.reddit.com/r/diabetes/comments/1';
const HOSTILE = 'https://evil.example/page';
const SOURCES = [
  { title: 'Diabetes fact sheet', url: WHO, site: 'WHO', kind: 'medical', published: '2024-11-14', snippet: 'About 830 million people have diabetes, most in low- and middle-income countries.' },
  { title: 'What is diabetes?', url: NIH, site: 'NIH', kind: 'medical', published: '', snippet: 'Diabetes is a disease that occurs when blood glucose is too high.' },
  { title: 'My story', url: FORUM, site: 'Reddit', kind: 'community', published: '2025-02-01', snippet: 'I think it is 500 million.' },
  { title: '<img src=x onerror="window.__pwned=1">Evil', url: HOSTILE, site: '<b>Evil</b>', kind: 'official', published: '2025-01-01', snippet: '<script>window.__pwned=2</script><img src=x onerror="window.__pwned=3">' },
  { title: 'Not a link', url: 'javascript:window.__pwned=4', kind: 'web' }
];
const ANSWER = `About 830 million people have diabetes [1](${WHO}). It happens when blood glucose is too high [2](${NIH}), though one forum guessed lower [3](${FORUM}). See [the WHO page](${WHO}) and \`[4](${WHO})\`.`;

function planFor({ sources = SOURCES, delayAnswerMs = 1500, toolsUsed } = {}) {
  return [
    [0, frame('tool_call', { tool: 'web_search', label: 'Web search', detail: 'diabetes prevalence', status: 'running' })],
    [300, frame('tool_call', { tool: 'web_search', label: 'Web search', detail: 'diabetes prevalence', status: 'done', sources })],
    [delayAnswerMs, frame('chunk', { text: ANSWER })],
    [50, frame('done', { toolsUsed: toolsUsed || [{ tool: 'web_search', input: 'diabetes prevalence', sources }] })],
    [50, null]
  ];
}

let browser;
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

async function open(plan, { lang = 'en', mobile = false } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(FETCH_STUB);
  await page.addInitScript(`window.__plan = ${JSON.stringify(plan)}; try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page, errors };
}
const ask = async (page, text) => { await page.fill('#input', text); await page.click('#sendBtn'); };
const last = '.msg.assistant:last-of-type';
const strip = (page) => page.$$eval(`${last} .qjo-sources .qjo-source`, (els) => els.map((a) => ({
  href: a.getAttribute('href'),
  site: a.querySelector('.qjo-source-site').textContent,
  title: a.querySelector('.qjo-source-title').textContent,
  titleTags: a.querySelector('.qjo-source-title').childElementCount,
  tier: (a.querySelector('.qjo-tier') || {}).textContent || '',
  date: (a.querySelector('time') || {}).textContent || '',
  num: (a.querySelector('.qjo-source-num') || {}).textContent || ''
})));

// ── The strip arrives with the search, before the answer ──
async function stripAndCitations() {
  const { ctx, page, errors } = await open(planFor());
  await ask(page, 'How many people have diabetes?');
  await page.waitForTimeout(1100);
  const early = await strip(page);
  const answerYet = await page.$eval(last, (el) => /830 million/.test(el.innerText)).catch(() => false);
  ok(early.length === 4 && !answerYet, `the sources are on screen while the answer is still being written (${early.length} sources, answer yet: ${answerYet})`, early);

  await page.waitForFunction((l) => /830 million/.test((document.querySelector(l) || document.body).innerText), last, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  const order = await page.$eval(`${last} .bubble`, (b) => {
    const s = b.querySelector('.qjo-sources');
    const c = b.querySelector('.qjo-streamed-content');
    return Boolean(s && c && (s.compareDocumentPosition(c) & 4 /* c follows s */));
  });
  ok(order, 'the strip sits above the answer');
  const cards = await strip(page);
  ok(cards.length === 4 && cards.every((c) => /^https:\/\//.test(c.href)), `the javascript: link is dropped and no source is repeated (${cards.map((c) => c.href).join(' ')})`);
  ok(cards[0].site === 'WHO' && /Medical/.test(cards[0].tier) && /2024/.test(cards[0].date), `each source shows its site, tier and date (${JSON.stringify(cards[0])})`);
  ok(cards.find((c) => c.href === FORUM).tier.includes('Forum'), 'a forum is marked as one');
  ok(cards.map((c) => c.num).join(',') === '1,2,3,', `cited sources carry the number the answer uses, in that order (${cards.map((c) => c.num || '-').join(',')})`);

  const hostile = cards.find((c) => c.href === HOSTILE);
  ok(hostile && hostile.titleTags === 0 && hostile.title.includes('<img') && hostile.site === '<b>Evil</b>', 'a source\'s title and site are shown as text, never as markup', hostile);
  ok(hostile && !/Official/.test(hostile.tier), `a source cannot claim its own tier: evil.example is not "official" (${hostile && hostile.tier})`);

  // Citations
  const chips = await page.$$eval(`${last} a.qjo-cite`, (els) => els.map((a) => ({ text: a.textContent, href: a.getAttribute('href') })));
  ok(chips.map((c) => c.text).join(' | ') === '1· WHO | 2· NIH | 3· Reddit', `citations read "number · site" (${chips.map((c) => c.text).join(' | ')})`, chips);
  const untouched = await page.$$eval(`${last} .qjo-streamed-content a:not(.qjo-cite)`, (els) => els.map((a) => a.textContent));
  ok(untouched.includes('the WHO page'), 'a named link stays a named link');
  const inCode = await page.$eval(`${last} .qjo-streamed-content`, (el) => [...el.querySelectorAll('code')].map((c) => c.textContent).join(' '));
  ok(/\[4\]/.test(inCode), 'a link written inside code is not turned into a citation');

  // Hover shows what the source says
  await page.hover(`${last} a.qjo-cite >> nth=0`);
  await page.waitForTimeout(250);
  const pop = await page.$eval('.qjo-cite-pop', (p) => ({ hidden: p.hidden, text: p.innerText, link: (p.querySelector('a') || {}).href || '' })).catch(() => null);
  ok(pop && !pop.hidden && /830 million/.test(pop.text) && /Diabetes fact sheet/.test(pop.text) && pop.link === WHO, 'hovering a citation shows the source\'s title and what it says', pop);
  // The page scrolls itself while an answer settles: the card follows.
  const before = await page.$eval('.qjo-cite-pop', (p) => p.getBoundingClientRect().top);
  await page.$eval('#messages', (m) => {
    const room = document.createElement('span'); // not a div: .msg:last-of-type counts divs
    room.style.display = 'block';
    room.style.height = '1200px';
    m.querySelector('#messagesInner').appendChild(room);
    m.scrollTo({ top: m.scrollTop + 40, behavior: 'instant' }); // the list scrolls smoothly otherwise
  });
  await page.waitForTimeout(150);
  const after = await page.$eval('.qjo-cite-pop', (p) => ({ hidden: p.hidden, top: p.getBoundingClientRect().top }));
  ok(!after.hidden && Math.abs(before - after.top - 40) < 3, `a scroll moves the card with its citation instead of closing it (${Math.round(before)} → ${Math.round(after.top)})`, after);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(450);
  ok(await page.$eval('.qjo-cite-pop', (p) => p.hidden), 'moving away hides it');

  // Keyboard
  await page.focus(`${last} a.qjo-cite >> nth=1`);
  await page.waitForTimeout(100);
  const focused = await page.$eval('.qjo-cite-pop', (p) => ({ hidden: p.hidden, text: p.innerText }));
  ok(!focused.hidden && /blood glucose/.test(focused.text), 'focusing a citation shows it too');
  await page.keyboard.press('Escape');
  ok(await page.$eval('.qjo-cite-pop', (p) => p.hidden), 'Escape closes it');

  ok(!(await page.evaluate(() => window.__pwned)), `nothing a source carries ran (${await page.evaluate(() => window.__pwned)})`);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  await ctx.close();
}

// ── The hostile snippet, shown in the popover ──
async function hostileSnippet() {
  const answer = `Evil says so [1](${HOSTILE}).`;
  const plan = planFor({ sources: [SOURCES[3]] });
  plan[2] = [300, frame('chunk', { text: answer })];
  const { ctx, page } = await open(plan);
  await ask(page, 'test');
  await page.waitForTimeout(1500);
  await page.hover(`${last} a.qjo-cite`);
  await page.waitForTimeout(250);
  const pop = await page.$eval('.qjo-cite-pop', (p) => ({ hidden: p.hidden, tags: [...p.querySelectorAll('script, img:not(.qjo-source-icon img), b')].length, text: p.innerText }));
  ok(!pop.hidden && pop.text.includes('<script>') && pop.tags === 0, 'a snippet with markup in it is shown as that text', pop);
  ok(!(await page.evaluate(() => window.__pwned)), 'and runs nothing');
  await ctx.close();
}

// ── Arabic ──
async function arabic() {
  const { ctx, page } = await open(planFor({ delayAnswerMs: 200 }), { lang: 'ar' });
  await ask(page, 'كم عدد مرضى السكري؟');
  await page.waitForTimeout(1500);
  const head = await page.$eval(`${last} .qjo-sources-head`, (h) => h.textContent).catch(() => '');
  const cards = await strip(page);
  ok(/المصادر/.test(head) && /طبي/.test(cards[0].tier) && /منتدى/.test(cards.find((c) => c.href === FORUM).tier), `in Arabic: "${head}", "${cards[0].tier}"`);
  await ctx.close();
}

// ── Icons: the site's, or its letter ──
async function icons() {
  const { ctx, page } = await open(planFor({ delayAnswerMs: 200 }));
  // Control: a site that has an icon shows it. Every other origin is
  // blocked by the harness, so the rest must fall back to a letter.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  let referer = null;
  await page.route('https://icons.duckduckgo.com/ip3/www.who.int.ico', (route) => { referer = route.request().headers().referer || ''; route.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
  await ask(page, 'How many people have diabetes?');
  await page.waitForTimeout(2200);
  const icons = await page.$$eval(`${last} .qjo-source .qjo-source-icon`, (els) => els.map((e) => ({ img: Boolean(e.querySelector('img')), loaded: Boolean(e.querySelector('img') && e.querySelector('img').naturalWidth), letter: e.textContent })));
  ok(icons[0] && icons[0].img && icons[0].loaded, 'control: a site\'s own icon is shown when it has one', icons[0]);
  ok(referer === '', `and the icon request says nothing about the page it came from (referer "${referer}")`);
  ok(icons.slice(1).every((i) => !i.img && /^[A-Z<]$/.test(i.letter)), `without one, its first letter (${icons.slice(1).map((i) => i.letter).join(',')})`, icons);
  await ctx.close();
}

// ── A phone: tap to read, tap again to open ──
async function phone() {
  const { ctx, page, errors } = await open(planFor({ delayAnswerMs: 200 }), { mobile: true });
  await ask(page, 'How many people have diabetes?');
  await page.waitForTimeout(1500);
  // What a new tab tried to open: the harness blocks the site itself, so the
  // tab ends on an error page, but its navigation request names the target.
  const popups = [];
  ctx.on('request', (r) => { if (r.url().startsWith(WHO)) popups.push(r.url()); });
  await page.tap(`${last} a.qjo-cite >> nth=0`);
  await page.waitForTimeout(300);
  const pop = await page.$eval('.qjo-cite-pop', (p) => { const r = p.getBoundingClientRect(); return { hidden: p.hidden, text: p.innerText, left: r.left, right: r.right, vw: window.innerWidth }; });
  ok(!pop.hidden && /830 million/.test(pop.text) && popups.length === 0, 'a tap shows what the source says instead of leaving the page', { pop, popups });
  ok(pop.left >= 0 && pop.right <= pop.vw, `the card fits the screen (${Math.round(pop.left)}–${Math.round(pop.right)} of ${pop.vw})`);
  const row = await page.$eval(`${last} .qjo-sources-row`, (r) => ({ scrolls: r.scrollWidth > r.clientWidth, pageWide: document.documentElement.scrollWidth > window.innerWidth }));
  ok(row.scrolls && !row.pageWide, 'the strip scrolls sideways; the page does not', row);
  await page.tap(`${last} a.qjo-cite >> nth=0`);
  await page.waitForTimeout(800);
  ok(popups.length === 1, `a second tap opens the source (${popups.join(', ') || 'nothing opened'})`);
  await page.tap('#input');
  await page.waitForTimeout(200);
  ok(await page.$eval('.qjo-cite-pop', (p) => p.hidden), 'tapping elsewhere closes the card');
  // Links in an answer on a phone were #7dd3fc on white: about 1.8:1.
  const link = await page.$eval(`${last} .qjo-streamed-content a:not(.qjo-cite)`, (a) => getComputedStyle(a).color);
  ok(link === 'rgb(29, 78, 216)', `an ordinary link in the answer is readable on a phone (${link})`);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  await ctx.close();
}

// ── The search toggle's own search feeds the same strip ──
async function searchToggle() {
  const plan = [[400, frame('chunk', { text: `About 830 million [1](${WHO}).` })], [50, frame('done', {})], [50, null]];
  const { ctx, page } = await open(plan);
  await page.route('**/api/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    query: 'diabetes', generatedAt: new Date().toISOString(),
    results: [{ id: 1, title: 'Diabetes fact sheet', url: WHO, content: 'About 830 million people have diabetes.', publishedDate: '2024-11-14T00:00:00Z', sourceKind: 'medical' }]
  }) }));
  await page.click('#toggleSearch');
  await ask(page, 'How many people have diabetes?');
  await page.waitForTimeout(2500);
  const cards = await strip(page);
  ok(cards.length === 1 && cards[0].site === 'WHO' && /Medical/.test(cards[0].tier) && /2024/.test(cards[0].date) && cards[0].num === '1', `sources the page searched for itself appear the same way (${JSON.stringify(cards[0])})`);
  await page.hover(`${last} a.qjo-cite`);
  await page.waitForTimeout(250);
  ok(/830 million people/.test(await page.$eval('.qjo-cite-pop', (p) => p.innerText)), 'and their text is behind the citation');
  await ctx.close();
}

// ── Control: no sources, no strip; a citation still names its site ──
async function noSources() {
  const { ctx, page } = await open(planFor({ sources: [], toolsUsed: [{ tool: 'web_search', input: 'x', resultCount: 0 }], delayAnswerMs: 200 }));
  await ask(page, 'How many people have diabetes?');
  await page.waitForTimeout(1500);
  ok(!(await page.$(`${last} .qjo-sources`)), 'a search that found nothing draws no strip');
  const chips = await page.$$eval(`${last} a.qjo-cite`, (els) => els.map((a) => a.textContent));
  ok(chips[0] === '1· WHO', `a citation to a source the page was not given still reads "1 · WHO" (${chips[0]})`);
  await ctx.close();
}

(async () => {
  browser = await launchBrowser();
  for (const scenario of [stripAndCitations, hostileSnippet, arabic, icons, phone, searchToggle, noSources]) await scenario();
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

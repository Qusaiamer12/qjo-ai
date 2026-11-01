// The reasoning card: shown when there was reasoning, and not otherwise.
//
// Every answer used to open with a "Reasoning — Thought for 0.0s" card, 85px
// tall, even when the model had not reasoned at all: the page made the card the
// moment a message was sent, and filled it with a step of its own ("Analyzing
// request and context..."). In Arabic its timer still read "0.0s". Found with a
// pixel probe on the real page while every suite was green: none asked whether
// the card should be there, only what it did when it was.
//
// Each case below has its control: the same probe, on a stream that does
// reason (or search), must find the card — a probe that finds no card
// anywhere would pass every "no card" case.
const { launchBrowser, devices, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 600)); };
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const PHONE = devices['iPhone 13'];
const DONE = 'That is the whole answer.';
const body = (...frames) => frames.join('') + frame('done', {});

async function open(browser, { lang = 'en', reply, delayMs = 0, phone = true }) {
  const ctx = await browser.newContext({ ...(phone ? PHONE : { viewport: { width: 1280, height: 900 } }), locale: lang === 'ar' ? 'ar-JO' : 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/chat', async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: reply });
  });
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); localStorage.setItem('qjo_theme', 'light'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  return { ctx, page, errors };
}

const finished = (page) => page.waitForFunction((marker) => {
  const last = [...document.querySelectorAll('#messages .msg.assistant')].pop();
  return last && last.innerText.includes(marker) && !document.getElementById('sendBtn').classList.contains('is-stop');
}, DONE, { timeout: 15000 });

/** The last answer's card, as a person sees it: its words and its size. */
const card = (page) => page.evaluate(() => {
  const last = [...document.querySelectorAll('#messages .msg.assistant')].pop();
  const el = last && last.querySelector('.qjo-reasoning-card');
  return {
    answer: Boolean(last), cards: last ? last.querySelectorAll('.qjo-reasoning-card').length : 0, dividers: last ? last.querySelectorAll('.qjo-reasoning-divider').length : 0,
    label: el && el.querySelector('.qjo-reasoning-label').textContent.trim(), timer: el && el.querySelector('.qjo-reasoning-timer').textContent.trim(),
    height: el ? Math.round(el.getBoundingClientRect().height) : 0, steps: el ? [...el.querySelectorAll('.qjo-reasoning-step')].map((s) => s.textContent.trim()) : [],
    text: last ? last.innerText : ''
  };
});

async function send(page, text) {
  await page.fill('#input', text);
  await page.click('#sendBtn');
}

async function run() {
  const browser = await launchBrowser();

  // ── 1. An answer with no reasoning has no card ──────────────────────────────
  for (const lang of ['en', 'ar']) {
    const { ctx, page, errors } = await open(browser, { lang, reply: body(frame('chunk', { text: `Plain answer. ${DONE}` })) });
    await send(page, 'hello');
    await finished(page);
    const c = await card(page);
    ok(c.answer && c.text.includes('Plain answer'), `${lang}: control — the answer itself is on screen`, c);
    ok(c.cards === 0 && c.dividers === 0, `${lang}: no reasoning, no card and no divider under it (${c.cards} cards, ${c.dividers} dividers)`, c);
    ok(!/Thought for|تم التفكير|Reasoning|مسار التفكير|Analyzing request|0\.0s/.test(c.text), `${lang}: nothing of a reasoning card is in the answer's text`, c.text.slice(0, 200));
    ok(errors.length === 0, `${lang}: no page errors`, errors);
    await ctx.close();
  }

  // ── 2. While the answer is awaited, nothing claims to have thought ──────────
  {
    const { ctx, page } = await open(browser, { reply: body(frame('chunk', { text: `Slow answer. ${DONE}` })), delayMs: 1200 });
    await send(page, 'hello');
    await page.waitForTimeout(500);
    const waiting = await card(page);
    const busy = await page.$eval('#sendBtn', (b) => b.classList.contains('is-stop'));
    ok(busy, 'control: the request is in flight (Send has become Stop)');
    ok(waiting.cards === 0 && !/Thought for/.test(waiting.text), `before a word has arrived there is no "Thought for" card (${waiting.cards} cards)`, waiting);
    await finished(page);
    ok((await card(page)).cards === 0, 'and none appears once the answer lands');
    await ctx.close();
  }

  // ── 3. With reasoning, the card is there and says how long, in the page's language ──
  for (const [lang, timer, label] of [['en', /^Thought for \d+\.\ds$/, 'Reasoning'], ['ar', /^تم التفكير في \d+\.\d ث$/, 'مسار التفكير']]) {
    const reply = body(frame('reasoning', { text: 'First I compare the two options. ' }), frame('reasoning', { text: 'Then I pick the cheaper one.' }), frame('chunk', { text: `Answer after thought. ${DONE}` }));
    const { ctx, page, errors } = await open(browser, { lang, reply });
    await send(page, 'which one?');
    await finished(page);
    const c = await card(page);
    ok(c.cards === 1 && c.dividers === 1, `${lang}: with reasoning there is one card and its divider`, c);
    ok(c.label === label && timer.test(c.timer || ''), `${lang}: the card reads "${label}" and a duration in the page's language ("${c.label}", "${c.timer}")`, c);
    ok(c.steps.join(' ').includes('compare the two options') && c.steps.join(' ').includes('cheaper one'), `${lang}: the card holds the reasoning that streamed`, c.steps);
    ok(!c.steps.some((s) => /Analyzing request|بدء التفكير/.test(s)), `${lang}: the page adds no step of its own to the model's reasoning`, c.steps);
    ok(c.height > 40, `${lang}: control — the card is drawn (${c.height}px)`, c);
    ok(errors.length === 0, `${lang}: no page errors`, errors);
    await ctx.close();
  }

  // ── 4. A <think> block in the answer text is reasoning; an empty one is not ──
  {
    const think = await open(browser, { reply: body(frame('chunk', { text: '<think>Weighing it up carefully.</think>' }), frame('chunk', { text: `Thought answer. ${DONE}` })) });
    await send(think.page, 'think');
    await finished(think.page);
    const c = await card(think.page);
    ok(c.cards === 1 && c.steps.join(' ').includes('Weighing it up') && /^Thought for \d+\.\ds$/.test(c.timer || ''), '<think>…</think> in the stream makes the card, with the text and a duration', c);
    ok(!c.text.includes('<think>') && c.text.includes('Thought answer'), 'the tags themselves are not shown', c.text.slice(0, 200));
    await think.ctx.close();

    const empty = await open(browser, { reply: body(frame('chunk', { text: '<think></think>' }), frame('chunk', { text: `Quick answer. ${DONE}` })) });
    await send(empty.page, 'quick');
    await finished(empty.page);
    const e = await card(empty.page);
    ok(e.answer && e.text.includes('Quick answer') && e.cards === 0, `an empty <think></think> makes no card (${e.cards})`, e);
    await empty.ctx.close();
  }

  // A reasoning event of nothing but whitespace is not reasoning either.
  {
    const blank = await open(browser, { reply: body(frame('reasoning', { text: '\n ' }), frame('chunk', { text: `Blank answer. ${DONE}` })) });
    await send(blank.page, 'blank');
    await finished(blank.page);
    const b = await card(blank.page);
    ok(b.answer && b.text.includes('Blank answer') && b.cards === 0, `a reasoning event of only whitespace makes no card (${b.cards})`, b);
    await blank.ctx.close();
  }

  // ── 5. A search with no reasoning keeps its steps, and does not claim to have thought ──
  {
    const reply = body(frame('tool_call', { tool: 'web_search', label: 'Web search', detail: 'prices', status: 'done' }), frame('chunk', { text: `Searched answer. ${DONE}` }));
    const { ctx, page } = await open(browser, { reply });
    await send(page, 'prices');
    await finished(page);
    const c = await card(page);
    ok(c.cards === 1 && c.steps.some((s) => /Searching the web/.test(s)), 'a search shows its step in the card', c);
    ok(c.timer && !/Thought for/.test(c.timer) && /^\d+\.\ds$/.test(c.timer), `but the card does not say "Thought for" when nothing was thought (${c.timer})`, c);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });

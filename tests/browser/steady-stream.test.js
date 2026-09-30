// An answer as it streams, through the real page: what is finished stays put,
// and a code block looks like code while it is being typed.
//
// The streaming view rebuilt the whole answer on every tick, a dozen times a
// second — a paragraph the reader was selecting was destroyed under them, and
// a code block showed as backticks and plain text until its closing fence
// arrived. /api/chat is replaced by a stream this suite times.
const { launchBrowser, BASE_URL } = require('./harness');

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
const chunk = (text) => `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`;
const PLAN = [
  [0, chunk('The first paragraph is finished.\n\n')],
  [400, chunk('A second paragraph ')],
  [400, chunk('that grows.\n\n')],
  [400, chunk('```js\nconst a = 1;')],
  [900, chunk('\nconst b = 2;\n```\n\nDone.')],
  [300, 'event: done\ndata: {}\n\n'],
  [50, null]
];

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 300)); };

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(FETCH_STUB);
  await page.addInitScript(`window.__plan = ${JSON.stringify(PLAN)};`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await page.fill('#input', 'stream please');
  await page.click('#sendBtn');

  // Mark the first paragraph once it is on screen, and count every paragraph
  // taken out of the answer from then on.
  const marked = await page.waitForFunction(() => {
    const p = [...document.querySelectorAll('.msg.assistant:last-of-type .qjo-streamed-content p')].find((el) => /first paragraph is finished/.test(el.textContent));
    if (!p) return false;
    p.__qjoFirst = true;
    // Every paragraph taken out of the answer, by its text.
    window.__removed = [];
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.removedNodes) {
        const ps = n.nodeName === 'P' ? [n] : (n.querySelectorAll ? [...n.querySelectorAll('p')] : []);
        for (const el of ps) window.__removed.push(el.textContent.trim());
      }
    }).observe(p.closest('.qjo-streamed-content'), { childList: true, subtree: true });
    window.__first = p;
    return true;
  }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok(marked, 'the first paragraph appears while the answer is still streaming');

  // While the code block is open.
  await page.waitForFunction(() => /const a = 1;/.test((document.querySelector('.msg.assistant:last-of-type .qjo-streamed-content') || document.body).textContent), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  const midway = await page.evaluate(() => {
    const content = document.querySelector('.msg.assistant:last-of-type .qjo-streamed-content');
    const code = content.querySelector('pre code');
    // The second paragraph is finished now too: mark it.
    window.__second = [...content.querySelectorAll('p')].find((el) => /second paragraph that grows/.test(el.textContent));
    return {
      stillThere: document.contains(window.__first) && window.__first.__qjoFirst === true,
      removed: window.__removed.filter((text) => /first paragraph is finished|second paragraph that grows/.test(text)).length,
      code: code ? code.textContent : null,
      backticks: /```/.test(content.innerText),
      closed: /const b = 2;/.test(content.textContent)
    };
  });
  ok(!midway.closed, 'control: this is before the code block has closed', midway);
  ok(midway.stillThere && midway.removed === 0, `finished paragraphs are drawn once — none rebuilt while the answer grew (${midway.removed} removed)`, midway);
  await page.waitForTimeout(400);
  const later = await page.evaluate(() => ({
    closed: /const b = 2;/.test(document.querySelector('.msg.assistant:last-of-type .qjo-streamed-content').textContent),
    second: Boolean(window.__second) && document.contains(window.__second)
  }));
  ok(!later.closed && later.second, 'a paragraph finished later stays put as the code below it grows', later);
  ok(midway.code === 'const a = 1;' && !midway.backticks, `a code block being typed already looks like code, not backticks (${JSON.stringify(midway.code)})`, midway);

  await page.waitForFunction(() => /Done\./.test((document.querySelector('.msg.assistant:last-of-type .qjo-streamed-content') || document.body).textContent), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const final = await page.$eval('.msg.assistant:last-of-type .qjo-streamed-content', (c) => ({
    paragraphs: [...c.querySelectorAll('p')].map((p) => p.textContent.trim()),
    code: (c.querySelector('pre code') || {}).textContent,
    cursor: Boolean(c.querySelector('.qjo-typing-cursor'))
  }));
  ok(final.paragraphs.join(' | ') === 'The first paragraph is finished. | A second paragraph that grows. | Done.' && /const a = 1;\s*const b = 2;/.test(final.code || '') && !final.cursor,
    'the finished answer is whole: every paragraph once, the code block complete, no cursor', final);
  // The view itself, driven past its usual end: text that arrives after a
  // final pass, or after a failure cleared the answer, is drawn in full into
  // the container on screen — not from where an earlier drawing stopped.
  const reused = await page.evaluate(async () => {
    const bubbleOf = () => { const wrap = document.createElement('div'); wrap.innerHTML = '<div class="bubble"></div>'; document.body.appendChild(wrap); return wrap; };
    const settle = () => new Promise((r) => setTimeout(r, 120));
    const make = () => window.QjoUI.createStreamingView({ addMessage: bubbleOf, escapeHtml: (s) => s, renderMarkdown: window.QjoDomain.markdown.lightMarkdown,
      requestSmoothScroll: () => {}, getLanguage: () => 'en', renderIntervalMs: 1 });
    const shown = (view) => [...view.bubble.querySelectorAll('.qjo-streamed-content p')].map((p) => p.textContent.trim()).join(' | ');
    const afterFinal = make();
    afterFinal.appendAnswer('Alpha one.\n\nBeta two.\n\n'); await settle();
    afterFinal.renderFinalAnswer();
    afterFinal.appendAnswer('Gamma three.\n\nDelta'); await settle();
    const afterFailure = make();
    afterFailure.appendAnswer('Alpha one.\n\nBeta two.\n\n'); await settle();
    afterFailure.clearForFailure();
    afterFailure.appendAnswer('Gamma three.\n\nDelta'); await settle();
    // A numbered list with blank lines between its items — finished items are
    // drawn apart from the one being written, and each keeps its number: what
    // the browser counts from, an <ol>'s start, plus the item's place in it.
    const numbers = (view) => [...view.bubble.querySelectorAll('li')].map((li) => `${li.parentElement.start + [...li.parentElement.children].indexOf(li)}:${li.textContent.trim()}`).join(' ');
    const list = make();
    list.appendAnswer('Steps:\n\n1. First\n\n2. Second\n\n3. Th'); await settle();
    const streaming = numbers(list);
    list.appendAnswer('ird'); list.renderFinalAnswer();
    return { afterFinal: shown(afterFinal), afterFailure: shown(afterFailure), streaming, final: numbers(list) };
  });
  const whole = 'Alpha one. | Beta two. | Gamma three. | Delta';
  ok(reused.afterFinal === whole, `text after a final pass: the whole answer, once (${reused.afterFinal})`, reused);
  ok(reused.afterFailure === whole, `text after a cleared failure: the whole answer, in the container on screen (${reused.afterFailure})`, reused);
  ok(reused.streaming === '1:First 2:Second 3:Th' && reused.final === '1:First 2:Second 3:Third',
    `a numbered list with blank lines between items counts 1, 2, 3 while streaming and after (${reused.streaming} / ${reused.final})`, reused);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

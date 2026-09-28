// Renders hostile markdown through the REAL renderer in a real browser and
// inspects the resulting DOM for live handlers and scripts.
//
// The first version of this checked `window.lightMarkdown ? render : 'NO_GLOBAL'`.
// When the renderer moved into a module the global disappeared, every probe
// rendered the literal string 'NO_GLOBAL', found no handlers in it, and
// reported "safe" seven times. A security check that cannot fail is worse than
// none, so this one refuses to run without the renderer.
const { launchBrowser, BASE_URL } = require('./harness');
(async () => {
  const b = await launchBrowser();
  const p = await (await b.newContext()).newPage();
  await p.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);

  const available = await p.evaluate(() => typeof window.QjoDomain?.markdown?.lightMarkdown === 'function');
  if (!available) {
    console.log('❌ the renderer is not reachable — refusing to report anything as safe');
    await b.close();
    process.exit(1);
  }

  // A control: a payload that SHOULD produce a real anchor. If this comes back
  // without one, the probe is not looking at rendered output and every "safe"
  // below would be meaningless.
  const control = await p.evaluate(() => {
    const el = document.createElement('div');
    el.innerHTML = window.QjoDomain.markdown.lightMarkdown('[رابط](https://example.com)');
    return el.querySelectorAll('a[href="https://example.com"]').length;
  });
  if (control !== 1) {
    console.log(`❌ control failed: expected one real anchor, got ${control} — the probe is not measuring anything`);
    await b.close();
    process.exit(1);
  }
  console.log('✅ control: the renderer produces real markup, so the checks below are meaningful');

  const probes = [
    ['attribute break out of href', '[x](https://a" onmouseover="alert(1))'],
    ['event handler in label',      '[<img src=x onerror=alert(1)>](https://a.com)'],
    ['javascript: scheme',          '[x](javascript:alert(1))'],
    ['raw script tag',              '<script>alert(1)</script>'],
    ['img onerror in plain text',   '<img src=x onerror=alert(1)>'],
    ['backtick code with html',     '`<img src=x onerror=alert(1)>`'],
    ['bold with html',              '**<img src=x onerror=alert(1)>**'],
    ['svg onload',                  '<svg onload=alert(1)>'],
    ['table cell',                  '| a | b |\n| --- | --- |\n| <img src=x onerror=alert(1)> | y |'],
    // Code blocks are taken out before the text is escaped; a diagram's source
    // used to go back in as raw HTML.
    ['mermaid block',               '```mermaid\ngraph TD\nA[<img src=x onerror=alert(1)>] --> B\n```']
  ];

  let failures = 0;
  for (const [name, input] of probes) {
    const out = await p.evaluate((src) => {
      const el = document.createElement('div');
      el.innerHTML = window.QjoDomain.markdown.lightMarkdown(src);
      const handlers = [...el.querySelectorAll('*')].filter(n => [...n.attributes].some(a => /^on/i.test(a.name)));
      return {
        html: el.innerHTML.slice(0, 150),
        handlerCount: handlers.length,
        scripts: el.querySelectorAll('script, iframe').length,
        hrefs: [...el.querySelectorAll('a')].map(a => a.getAttribute('href')),
        rendered: el.innerHTML.length
      };
    }, input);
    const bad = out.handlerCount > 0 || out.scripts > 0 || out.hrefs.some(h => /^javascript:/i.test(h || ''));
    // Rendering nothing at all is also a failure: it would hide an injection
    // behind an empty result.
    const empty = out.rendered === 0;
    if (bad || empty) failures++;
    console.log(`${bad ? '❌ VULNERABLE' : empty ? '❌ EMPTY     ' : '✅ safe      '}  ${name}`);
    if (bad || empty) console.log('              →', out.html);
  }

  // A diagram still reaches Mermaid as source: escaped markup, decoded text.
  const diagram = await p.evaluate(() => {
    const el = document.createElement('div');
    el.innerHTML = window.QjoDomain.markdown.lightMarkdown('```mermaid\ngraph TD\nA --> B\n```');
    const node = el.querySelector('.mermaid');
    return node ? node.textContent : null;
  });
  const diagramOk = diagram && diagram.includes('A --> B');
  if (!diagramOk) failures++;
  console.log(`${diagramOk ? '✅ safe      ' : '❌ BROKEN    '}  a diagram's arrows survive escaping (${JSON.stringify(diagram)})`);

  // The quiz is built by the page from the model's JSON: question, options and
  // explanation all went into innerHTML unescaped — the explanation even after
  // being decoded back out of a data attribute.
  const page = await (await b.newContext()).newPage();
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  const HOSTILE = '<img src=x onerror="window.__xss=1">';
  const quiz = JSON.stringify([{ question: 'Q ' + HOSTILE, options: ['A ' + HOSTILE, 'B'], answer: 'B', explanation: 'E ' + HOSTILE }]);
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: chunk\ndata: ${JSON.stringify({ text: 'Try this:\n\n```quiz\n' + quiz + '\n```' })}\n\nevent: done\ndata: {}\n\n` }));
  await page.fill('#input', 'quiz me');
  await page.click('#sendBtn');
  await page.waitForSelector('.quiz-option-btn', { timeout: 8000 }).catch(() => {});
  const rendered = await page.$$eval('.quiz-option-btn', (els) => els.length);
  if (rendered) await page.click('.quiz-option-btn');
  await page.waitForTimeout(400);
  const outcome = await page.evaluate(() => {
    const box = document.querySelector('.interactive-quiz-container');
    const handlers = box ? [...box.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length : -1;
    return { handlers, imgs: box ? box.querySelectorAll('img').length : -1, pwned: window.__xss === 1, text: box ? box.innerText : '' };
  });
  // Control: the quiz really rendered, with the hostile text shown as text.
  const quizRendered = rendered === 2 && /<img src=x/.test(outcome.text);
  const quizSafe = quizRendered && outcome.handlers === 0 && outcome.imgs === 0 && !outcome.pwned;
  if (!quizSafe) failures++;
  console.log(`${quizSafe ? '✅ safe      ' : quizRendered ? '❌ VULNERABLE' : '❌ NOT RENDERED'}  quiz question, options and explanation`);
  if (!quizSafe) console.log('              →', JSON.stringify(outcome).slice(0, 200));

  await b.close();
  const total = probes.length + 2;
  console.log(`\n${total - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();

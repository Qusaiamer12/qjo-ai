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

  // Chart and quiz blocks that JSON.parse refused were run as JavaScript
  // (`new Function('return (' + text + ')')`) in the app's own origin, which
  // allows eval: a block holding code ran with the person's sign-in.
  let extra = 0;
  const check = (cond, label, detail) => {
    extra++;
    if (!cond) failures++;
    console.log(`${cond ? '✅ safe      ' : '❌ VULNERABLE'}  ${label}`);
    if (!cond && detail !== undefined) console.log('              →', JSON.stringify(detail).slice(0, 300));
  };
  const blocks = await (await b.newContext()).newPage();
  // A stand-in Chart.js that keeps what it is handed: proof the page read a block.
  await blocks.route('https://cdn.jsdelivr.net/npm/chart.js@*/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript',
    body: 'window.__charts=[];window.Chart=function(c,cfg){window.__charts.push(cfg)};window.Chart.getChart=function(){return null};' }));
  const fence = '```';
  const ANSWER = [
    fence + 'chart', "{type: 'bar', data: {labels: ['a'], datasets: [{label: 'hostile', data: [(window.__chartRan = 1, 2)]}]}}", fence,
    fence + 'quiz', "[{question: 'Q', options: ['A', 'B'], answer: 'B', explanation: (window.__quizRan = 1, 'E')}]", fence,
    // Controls: the same forms without code are read, relaxed as models write them.
    fence + 'chart', "{type: 'line', data: {labels: ['a', 'b',], datasets: [{label: 'relaxed', data: [3, 4]}]}, // a comment\n}", fence,
    fence + 'quiz', "[{question: 'Relaxed Q', options: ['A', 'B',], answer: 'B', explanation: 'E'}]", fence
  ].join('\n');
  await blocks.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: chunk\ndata: ${JSON.stringify({ text: ANSWER })}\n\nevent: done\ndata: {}\n\n` }));
  await blocks.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await blocks.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await blocks.waitForFunction(() => typeof window.Chart === 'function', null, { timeout: 15000 });
  await blocks.fill('#input', 'chart and quiz');
  await blocks.click('#sendBtn');
  await blocks.waitForFunction(() => (window.__charts || []).length && document.querySelector('.quiz-option-btn'), null, { timeout: 10000 }).catch(() => {});
  await blocks.waitForTimeout(500);
  const read = await blocks.evaluate(() => ({
    charts: (window.__charts || []).map((c) => c.data.datasets[0].label),
    quizzes: [...document.querySelectorAll('.interactive-quiz-container')].map((q) => q.innerText.replace(/\s+/g, ' ').trim()),
    chartNotes: [...document.querySelectorAll('.chart-error-note:not(.hidden)')].length,
    chartRan: window.__chartRan === 1, quizRan: window.__quizRan === 1
  }));
  if (!read.charts.includes('relaxed') || !read.quizzes.some((q) => /Relaxed Q/.test(q))) {
    console.log(`❌ control failed: a relaxed chart and quiz were not drawn — the probe is not looking at blocks (${JSON.stringify(read)})`);
    await b.close();
    process.exit(1);
  }
  console.log('✅ control: a chart and a quiz written as models write them (bare keys, single quotes, trailing commas, a comment) are drawn');
  check(!read.chartRan && !read.charts.includes('hostile'), 'a chart block holding code: not run, not drawn', read);
  check(!read.quizRan, 'a quiz block holding code: not run', read);
  check(read.chartNotes === 1 && read.quizzes.some((q) => /could not be read|ما قدرت أقرأ/.test(q)), 'each refused block says so, not an empty box', read);

  await b.close();
  const total = probes.length + 2 + extra;
  console.log(`\n${total - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();

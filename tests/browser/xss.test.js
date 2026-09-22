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
    ['table cell',                  '| a | b |\n| --- | --- |\n| <img src=x onerror=alert(1)> | y |']
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

  await b.close();
  console.log(`\n${probes.length - failures} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();

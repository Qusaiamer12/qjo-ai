// The harness promises that a suite's browser reaches the app and nothing
// else. This checks that promise against a control that can actually fail:
// the "external host" is a local server with CORS open, loaded by top-level
// navigation, so nothing but the harness (no CSP, no CORS, no proxy) can stop
// it — and the control run, without the harness, must reach it.
const http = require('http');
const { chromium } = require('playwright');
const { launchBrowser, launchOptions, BASE_URL } = require('./harness');

(async () => {
  let pass = 0, fail = 0;
  const ok = (c, m, got) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}${c ? '' : ` → ${got}`}`); };

  const external = http.createServer((req, res) => {
    if (req.url === '/lib.js') { res.writeHead(200, { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' }); res.end('window.EXT = "external";'); return; }
    res.writeHead(200, { 'content-type': 'text/plain' }); res.end('external-body');
  });
  await new Promise((resolve) => external.listen(0, '127.0.0.1', resolve));
  const EXTERNAL_URL = `http://127.0.0.1:${external.address().port}/asset`;
  const visit = (page) => page.goto(EXTERNAL_URL).then(
    () => page.textContent('body'),
    (e) => 'blocked: ' + e.message.split('\n')[0]
  );
  // A preview iframe: sandboxed without same-origin, loading a script from
  // elsewhere. Chromium runs such frames in a process of their own, and their
  // requests went around every route — the harness's block and a suite's
  // stubs alike — straight to the network.
  const LIB_URL = EXTERNAL_URL.replace('/asset', '/lib.js');
  const fromSandbox = async (page) => {
    await page.setContent('<p>host</p>');
    await page.evaluate((url) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.id = 'sandboxed';
      frame.srcdoc = `<script src="${url}"></script><p id="out"></p><script>document.getElementById('out').textContent = String(window.EXT);</script>`;
      document.body.appendChild(frame);
    }, LIB_URL);
    const frame = await (await page.waitForSelector('#sandboxed')).contentFrame();
    return frame.waitForFunction(() => document.getElementById('out') && document.getElementById('out').textContent, null, { timeout: 5000 })
      .then((h) => h.jsonValue(), () => 'no result');
  };

  // Control: an unisolated browser must reach it, or the checks below prove nothing.
  const raw = await chromium.launch(launchOptions());
  let got = await visit(await raw.newPage());
  ok(got === 'external-body', 'control: without the harness the external host loads', got);
  got = await fromSandbox(await raw.newPage());
  ok(got === 'external', 'control: without the harness a sandboxed iframe loads its script', got);
  await raw.close();

  const browser = await launchBrowser();
  const direct = await browser.newPage();
  got = await visit(direct);
  ok(/ERR_BLOCKED_BY_CLIENT/.test(got), 'a page from browser.newPage() cannot leave the app', got);

  const context = await browser.newContext();
  got = await visit(await context.newPage());
  ok(/ERR_BLOCKED_BY_CLIENT/.test(got), 'a page from browser.newContext() cannot leave the app', got);

  const stubbed = await context.newPage();
  await stubbed.route('**/asset', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'stub-body' }));
  got = await visit(stubbed);
  ok(got === 'stub-body', "a suite's own page.route() stub still takes precedence", got);

  got = await fromSandbox(await context.newPage());
  ok(got === 'undefined', 'a sandboxed iframe cannot leave the app either', got);

  const stubContext = await browser.newContext();
  await stubContext.route(LIB_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.EXT = "stub";' }));
  got = await fromSandbox(await stubContext.newPage());
  ok(got === 'stub', "and a suite's stub reaches into it", got);
  await stubContext.close();

  const app = await context.newPage();
  const response = await app.goto(BASE_URL + '/api/health');
  ok(response && response.status() === 200, 'the app itself stays reachable', response && response.status());

  await direct.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  ok(browser.contexts().length === 1, 'closing a newPage() page closes the context made for it', `${browser.contexts().length} open`);

  await browser.close();
  external.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

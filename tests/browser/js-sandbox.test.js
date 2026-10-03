// Drives the real code sandbox (public/ui/sandbox.js) on the real page, under
// the app's real CSP — the iframe inherits it, so a copy on about:blank would
// not prove anything about what ships.
//
// The runner used to be a worker created by the page, with the page's origin:
// generated code could open the site's IndexedDB (where the signed-in session
// lives) and call the server as the user. Python ran on the page itself with
// no time limit. Each check below names the hole it closes, and the first one
// is a control: the page's own origin is not "null", so "null" inside the
// sandbox means something.
const { launchBrowser, BASE_URL } = require('./harness');

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';

// Stands in for Pyodide, which CI cannot download. It runs where the real one
// would — inside the sandbox's worker — so what it reports about its origin
// and storage is what real Python code would see.
const FAKE_PYODIDE = `
self.loadPyodide = async () => {
  let userCode = '';
  return {
    globals: { set: (k, v) => { if (k === '__qjo_user_code') userCode = v; } },
    toPy: (v) => v,
    loadPackagesFromImports: async () => {},
    runPythonAsync: async () => {
      if (userCode.includes('HANG')) { for (;;) {} }
      let idb = 'open';
      try { indexedDB.open('probe'); } catch (e) { idb = 'blocked:' + e.name; }
      const images = userCode.includes('INJECT') ? ['AAAA', '" onerror="window.__pwned=1'] : ['iVBORw0KGgo='];
      const ran = userCode;
      await new Promise((r) => setTimeout(r, 50));
      return { toJs: () => ({ stdout: 'origin=' + self.origin + ' idb=' + idb + ' ran=' + ran, stderr: '', error: null, images }), destroy() {} };
    }
  };
};`;

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext();
  let pyodideMode = 'fake';
  await ctx.route(PYODIDE, (route) => (pyodideMode === 'fake'
    ? route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_PYODIDE })
    : route.abort('failed')));
  const page = await ctx.newPage();
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.QjoUI && window.QjoUI.sandbox, null, { timeout: 15000 }).catch(() => {});

  let pass = 0, fail = 0;
  const check = (ok, msg, detail) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok && detail) console.log('   ', JSON.stringify(detail).slice(0, 300)); };

  const available = await page.evaluate(() => Boolean(window.QjoUI && window.QjoUI.sandbox && window.QjoUI.sandbox.runJavaScript));
  if (!available) {
    console.log('❌ the sandbox module is not on the page — refusing to report anything');
    await browser.close();
    process.exit(1);
  }

  const run = (code) => page.evaluate((c) => window.QjoUI.sandbox.runJavaScript(c, { timeoutMs: 2000, timeoutMessage: 'halted' }), code);

  // ── Isolation ──
  const pageOrigin = await page.evaluate(() => window.origin);
  check(pageOrigin !== 'null', `control: the page itself has a real origin (${pageOrigin})`);

  let r = await run('console.log(self.origin)');
  check(r.ok && r.logs.some((l) => l.text === 'null'), 'generated code runs with no origin of its own', r);

  r = await run('try { indexedDB.open("x"); console.log("OPENED"); } catch (e) { console.log("blocked:" + e.name); }');
  check(r.logs.some((l) => /^blocked:/.test(l.text)), 'it cannot open the site\'s storage, where the signed-in session is kept', r);

  r = await run('fetch("/api/health").then(() => console.log("FETCHED")).catch((e) => console.log("blocked:" + e.name)); await new Promise((res) => setTimeout(res, 300));');
  check(!r.logs.some((l) => l.text === 'FETCHED'), 'it cannot call the server as the user', r);

  // ── Behaviour kept from the previous runner ──
  r = await run('console.log("hello", 42); console.log({a:1});');
  check(r.ok && r.logs.some((l) => l.text.includes('hello 42')), 'console.log captured', r);
  check(r.logs.some((l) => l.text.includes('"a": 1')), 'objects serialized', r);

  r = await run('const users=[{name:"Sara",age:30},{name:"Lina",age:25}]; console.table(users);');
  check(r.ok && r.logs.some((l) => l.kind === 'table' && l.text.includes('name') && l.text.includes('Sara')), 'console.table renders columns', r);

  r = await run('function add(a,b){return a+b} add(20,22)');
  check(r.ok && r.logs.some((l) => l.kind === 'return' && l.text === '42'), 'return value surfaced', r);

  r = await run('console.warn("careful"); console.error("bad");');
  check(r.logs.some((l) => l.kind === 'warn') && r.logs.some((l) => l.kind === 'error'), 'warn/error channels kept', r);

  r = await run('JSON.parse("{oops")');
  check(!r.ok && /SyntaxError|JSON/i.test(r.error || ''), 'runtime error captured', r);

  r = await run('const o={}; o.self=o; console.log(o);');
  check(r.ok && r.logs[0].text.includes('[Circular]'), 'circular refs do not hang', r);

  const t0 = Date.now();
  r = await run('while(true){}');
  const elapsed = Date.now() - t0;
  check(!r.ok && r.timedOut === true && r.error === 'halted', 'an infinite loop is stopped', r);
  check(elapsed < 5000, `and stopped fast (${elapsed}ms)`);
  check(await page.evaluate(() => 1 + 1) === 2, 'the page never froze');
  check(await page.evaluate(() => document.querySelectorAll('iframe[sandbox="allow-scripts"][aria-hidden="true"]').length) === 0, 'finished and stopped runs leave no sandbox behind');

  r = await run('typeof document');
  check(r.ok && r.logs.some((l) => l.text === '"undefined"' || l.text === 'undefined'), 'no DOM access from the sandbox', r);

  r = await run('7');
  check(Number.isFinite(r.durationMs), `duration measured (${r.durationMs}ms)`, r);

  // ── Python ──
  const py = (code, opts = {}) => page.evaluate(([c, o]) => window.QjoUI.sandbox.runPython(c, { loadTimeoutMs: 8000, runTimeoutMs: o.runTimeoutMs || 3000, timeoutMessage: 'py-halted' })
    .then((res) => ({ res }), (err) => ({ thrown: String(err && err.message || err) })), [code, opts]);

  let p = await py('print("hi")');
  check(p.res && /origin=null/.test(p.res.stdout), 'Python runs with no origin of its own', p);
  check(p.res && /idb=blocked/.test(p.res.stdout), 'and cannot open the site\'s storage', p);
  check(await page.evaluate(() => typeof window.loadPyodide === 'undefined' && !document.querySelector('script[src*="pyodide"]')), 'Python is never loaded into the page itself');
  check(p.res && p.res.images.length === 1, 'a real plot comes back', p);

  // Two Run buttons clicked together: each gets its own output, not the
  // other's, and neither is left waiting.
  const both = await page.evaluate(() => Promise.all(['print("one")', 'print("two")'].map((c) =>
    window.QjoUI.sandbox.runPython(c, { loadTimeoutMs: 8000, runTimeoutMs: 3000, timeoutMessage: 'py-halted' }).then((res) => res.stdout, (err) => 'threw:' + err.message))));
  check(/ran=print\("one"\)/.test(both[0]) && /ran=print\("two"\)/.test(both[1]), 'two Python runs at once each get their own output', both);

  p = await py('INJECT');
  const pwned = await page.evaluate(() => window.__pwned === 1);
  check(p.res && p.res.images.length === 1 && p.res.images[0] === 'AAAA' && !pwned, 'a "plot" that is not base64 is dropped before it reaches an <img>', p);

  const t1 = Date.now();
  p = await py('HANG', { runTimeoutMs: 1500 });
  check(p.res && p.res.timedOut === true && p.res.error === 'py-halted', 'a Python run past its limit is stopped', p);
  check(Date.now() - t1 < 6000 && await page.evaluate(() => 2 + 2) === 4, 'the page stayed responsive while it ran');
  p = await py('print("again")');
  check(p.res && /origin=null/.test(p.res.stdout), 'the next run gets a fresh sandbox and works', p);

  // A stopped run ends its sandbox, so the next one has to load Python again —
  // this time with the CDN unreachable.
  pyodideMode = 'unreachable';
  await py('HANG', { runTimeoutMs: 1000 });
  p = await py('print(1)');
  check(typeof p.thrown === 'string' && p.thrown.length > 0, `Python failing to load is reported, not silent (${p.thrown || JSON.stringify(p.res)})`);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

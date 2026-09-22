// Drives the real JS sandbox engine in a real browser, extracted verbatim
// from public/app.js so the test exercises shipped code, not a copy.
const { launchBrowser, repoFile } = require('./harness');

const app = repoFile('public/app.js');
const start = app.indexOf('const JS_WORKER_SOURCE = `');
const end = app.indexOf('    // Resolves to { ok, logs, error, durationMs, timedOut }');
const workerSrc = app.slice(start, end);
const fnStart = app.indexOf('    function executeJavaScriptInSandbox(code) {');
const fnEnd = app.indexOf("\n    // ── Auto-fix", fnStart) !== -1 ? app.indexOf("\n    // ── Auto-fix", fnStart) : app.indexOf('\n    function buildAutoFixPrompt', fnStart);
const fnSrc = app.slice(fnStart, fnEnd);

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.evaluate(`
    window.qjoLanguage = 'en';
    const JS_SANDBOX_TIMEOUT_MS = 2000;
    ${workerSrc}
    ${fnSrc}
    window.executeJavaScriptInSandbox = executeJavaScriptInSandbox;
  `);

  let pass = 0, fail = 0;
  const check = (ok, msg, detail) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok && detail) console.log('   ', JSON.stringify(detail)); };

  const run = code => page.evaluate(c => window.executeJavaScriptInSandbox(c), code);

  let r = await run('console.log("hello", 42); console.log({a:1});');
  check(r.ok && r.logs.some(l => l.text.includes('hello 42')), 'console.log captured', r);
  check(r.logs.some(l => l.text.includes('"a": 1')), 'objects serialized', r);

  r = await run('const users=[{name:"Sara",age:30},{name:"Lina",age:25}]; console.table(users);');
  check(r.ok && r.logs.some(l => l.kind === 'table' && l.text.includes('name') && l.text.includes('Sara')), 'console.table renders columns', r);

  r = await run('function add(a,b){return a+b} add(20,22)');
  check(r.ok && r.logs.some(l => l.kind === 'return' && l.text === '42'), 'return value surfaced', r);

  r = await run('console.warn("careful"); console.error("bad");');
  check(r.logs.some(l => l.kind === 'warn') && r.logs.some(l => l.kind === 'error'), 'warn/error channels kept', r);

  r = await run('JSON.parse("{oops")');
  check(!r.ok && /SyntaxError|JSON/i.test(r.error || ''), 'runtime error captured with trace', r);

  r = await run('const o={}; o.self=o; console.log(o);');
  check(r.ok && r.logs[0].text.includes('[Circular]'), 'circular refs do not hang', r);

  const t0 = Date.now();
  r = await run('while(true){}');
  const elapsed = Date.now() - t0;
  check(!r.ok && r.timedOut === true, 'infinite loop terminated by watchdog', r);
  check(elapsed < 6000, `watchdog fired fast (${elapsed}ms, page still responsive)`);

  const alive = await page.evaluate(() => 1 + 1);
  check(alive === 2, 'main thread never froze');

  r = await run('typeof document');
  check(r.ok && r.logs.some(l => l.text === '"undefined"' || l.text === 'undefined'), 'no DOM access from sandbox', r);

  r = await run('console.log(performance.now ? "timed" : "x"); 7');
  check(Number.isFinite(r.durationMs), `duration measured (${r.durationMs}ms)`, r);

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

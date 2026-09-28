const fs = require('fs');
const { launchBrowser, repoFile, BASE_URL } = require('./harness');
const app = repoFile('public/app.js');
// The app loads Babel from a CDN at a pinned version. The suite serves the same
// build from the devDependency at that URL, and the first assertion below fails
// if the two versions drift apart — otherwise this would be testing a different
// compiler from the one people get.
const babelPackage = require('@babel/standalone/package.json');
const babel = fs.readFileSync(require.resolve('@babel/standalone/babel.min.js'), 'utf8');

// The shipped run + transpile helpers, verbatim. They run on the real page, so
// code goes through the real sandbox module under the app's real CSP.
const from = app.indexOf('    // ── Running code: public/ui/sandbox.js');
const to = app.indexOf('    // ── Auto-fix: hand a failing snippet');
if (from < 0 || to < from) {
  console.log('❌ the run/transpile section of public/app.js was not found — refusing to test a guess');
  process.exit(1);
}
const src = app.slice(from, to);
const EXPECTED_BABEL_URL = `https://cdn.jsdelivr.net/npm/@babel/standalone@${babelPackage.version}/babel.min.js`;

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  // Stand in for the CDN at exactly the tested version: a loader asking for
  // any other build meets the harness's block and the runs below fail.
  await page.route(EXPECTED_BABEL_URL, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: babel }));
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.QjoUI && window.QjoUI.sandbox, null, { timeout: 15000 }).catch(() => {});
  if (!await page.evaluate(() => Boolean(window.QjoUI && window.QjoUI.sandbox))) {
    console.log('❌ the sandbox module is not on the page — refusing to report anything');
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(`(() => {
    const qjoLanguage = 'en';
    const t = (key) => key;
    ${src}
    window.transpileTypeScript = transpileTypeScript;
    window.executeJavaScriptInSandbox = executeJavaScriptInSandbox;
    window.BABEL_URL = BABEL_STANDALONE_URL;
  })()`);

  let pass = 0, fail = 0;
  const check = (ok, m, d) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${m}`); if (!ok && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 320)); };

  const runTs = (ts) => page.evaluate(async (code) => {
    const js = await window.transpileTypeScript(code);
    return window.executeJavaScriptInSandbox(js);
  }, ts);

  // The CDN path must match the real package layout, at the version tested here.
  const url = await page.evaluate(() => window.BABEL_URL);
  check(url === EXPECTED_BABEL_URL, `the app loads the Babel build this suite tests (${url})`, { expected: EXPECTED_BABEL_URL });

  // Babel is not on the page until someone runs TypeScript: the first run
  // below goes through the app's own loader, not a script this suite injected.
  check(await page.evaluate(() => typeof window.Babel === 'undefined'), 'the transpiler is not loaded until it is needed');

  let r = await runTs(`
interface User { name: string; age: number }
function greet(u: User): string { return \`hi \${u.name}\`; }
const nums: number[] = [1,2,3];
console.log(greet({name:'Sara',age:30}), nums.reduce((a:number,b:number)=>a+b,0));
`);
  check(r.ok && r.logs.some(l => l.text.includes('hi Sara 6')), 'typed function + interface runs', r);

  r = await runTs(`enum Color { Red, Green, Blue } console.log(Color[Color.Green]); Color.Blue;`);
  check(r.ok && r.logs.some(l => l.text.includes('Green')), 'enum reverse mapping works at runtime', r);
  check(r.logs.some(l => l.kind === 'return' && l.text === '2'), 'return value survives transpile', r);

  r = await runTs(`class Stack<T> { private items: T[] = []; push(i: T): void { this.items.push(i) } size(): number { return this.items.length } }
const s = new Stack<string>(); s.push('a'); s.push('b'); console.log('size', s.size());`);
  check(r.ok && r.logs.some(l => l.text.includes('size 2')), 'generic class with private field runs', r);

  r = await runTs(`const users: {name:string,age:number}[] = [{name:'A',age:1},{name:'B',age:2}]; console.table(users);`);
  check(r.ok && r.logs.some(l => l.kind === 'table' && l.text.includes('name')), 'console.table works through TS path', r);

  // A TS syntax error must surface as a transpile failure, not silently run.
  const bad = await page.evaluate(async () => {
    try { await window.transpileTypeScript('const x: = 5;'); return { threw: false }; }
    catch (e) { return { threw: true, msg: e.message }; }
  });
  check(bad.threw, `invalid TS rejected at transpile (${(bad.msg||'').slice(0,60)})`, bad);

  // Type errors are NOT caught (transpile-only) - assert the documented behaviour.
  r = await runTs(`const n: number = "actually a string" as any; console.log(typeof n);`);
  check(r.ok && r.logs.some(l => l.text.includes('string')), 'transpile-only: type errors surface at runtime, as documented', r);

  // The sandbox guarantees still hold on the TS path.
  const t0 = Date.now();
  r = await runTs(`const go = (): void => { while(true){} }; go();`);
  check(!r.ok && r.timedOut && r.error === 'jsTimeout', `infinite loop in TS still terminated (${Date.now()-t0}ms)`, r);
  check(await page.evaluate(() => 1+1) === 2, 'main thread still responsive');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

const fs = require('fs');
const { launchBrowser, repoFile } = require('./harness');
const app = repoFile('public/app.js');
// The app loads Babel from a CDN at a pinned version. The suite runs the same
// build from the devDependency, and the first assertion below fails if the
// two versions drift apart — otherwise this would be testing a different
// compiler from the one people get.
const babelPackage = require('@babel/standalone/package.json');
const babel = fs.readFileSync(require.resolve('@babel/standalone/babel.min.js'), 'utf8');

// Pull the shipped worker + sandbox + transpile helpers verbatim.
const workerFrom = app.indexOf('const JS_WORKER_SOURCE = `');
const transpileTo = app.indexOf('    function initializeJsRunButtons(element) {');
const src = app.slice(workerFrom, transpileTo);

(async () => {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  // Stand in for the CDN fetch: the loader short-circuits when window.Babel exists.
  await page.addScriptTag({ content: babel });
  await page.evaluate(`
    window.qjoLanguage = 'en';
    const JS_SANDBOX_TIMEOUT_MS = 3000;
    ${src}
    window.transpileTypeScript = transpileTypeScript;
    window.executeJavaScriptInSandbox = executeJavaScriptInSandbox;
    window.loadBabelStandalone = loadBabelStandalone;
    window.BABEL_URL = BABEL_STANDALONE_URL;
  `);

  let pass = 0, fail = 0;
  const check = (ok, m, d) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${m}`); if (!ok && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 320)); };

  const runTs = (ts) => page.evaluate(async (code) => {
    const js = await window.transpileTypeScript(code);
    return window.executeJavaScriptInSandbox(js);
  }, ts);

  // The CDN path must match the real package layout, at the version tested here.
  const url = await page.evaluate(() => window.BABEL_URL);
  const expectedUrl = `https://cdn.jsdelivr.net/npm/@babel/standalone@${babelPackage.version}/babel.min.js`;
  check(url === expectedUrl, `the app loads the Babel build this suite tests (${url})`, { expectedUrl });

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
  check(!r.ok && r.timedOut, `infinite loop in TS still terminated (${Date.now()-t0}ms)`, r);
  check(await page.evaluate(() => 1+1) === 2, 'main thread still responsive');

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

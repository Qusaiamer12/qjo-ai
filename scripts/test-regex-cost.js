// What a regex costs on a long message, for every regex that reads a person's
// or a model's text.
//
// Why: an unanchored `(?=[\s\S]*…)` lookahead in a playbook took 46 s on a
// 200k-character message with no match (50k: 3 s), on the event loop, while
// every functional suite was green. Nothing timed the others.
//
// Finding the regexes (nothing is a hand-kept list that can fall behind):
//   1. every regex literal in the files below, found by parsing them (acorn),
//      module level or inside a function;
//   2. every `new RegExp(...)` built while the modules load (the global
//      constructor is wrapped before they are required), which is the only way
//      to get the pattern of one made from template pieces;
//   3. every RegExp reachable from a module's exports.
// `new RegExp(<template with ${}>)` inside a function that does not run at load
// has no pattern to time; the suite counts them and prints the number.
//
// Inputs, each 200,000 characters: 'a ' repeated; Arabic letters; the regex's
// own first word minus its last letter, repeated (with and without a space);
// whitespace. Each regex runs as `input.replace(/…/g, '')`, the whole-text
// scan a caller pays, not a single probe.
//
// Budget: 200 ms per regex per input. A linear 200k scan costs 1-30 ms here;
// a quadratic one costs seconds (46 s for the case above), so there is a wide
// gap and 200 ms sits well inside it, with room for a slow CI machine. A case
// over budget is run once more and the faster time counts (one GC pause is not
// a defect). Each case runs in a worker so a runaway regex is cut off at 3 s
// and reported, not waited for.
//
// Positive control: the quadratic regex that caused the incident, plus a
// linear one. The suite refuses to pass unless the first is reported over
// budget and the second is not.
'use strict';

const path = require('path');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const BUDGET_MS = 200;
const CUTOFF_MS = 3000;
const SIZE = 200000;

// ── worker: time cases ───────────────────────────────────────────────────────
function firstWordMiss(source) {
  const bare = source.replace(/\\./g, ' ');                 // drop \s \w \d \b and friends
  const m = bare.match(/[A-Za-z؀-ۿ]{3,}/);
  return m ? m[0].slice(0, -1) : 'functio';
}

function inputsFor(source) {
  const miss = firstWordMiss(source);
  const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  const repeat = (unit) => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE);
  return [
    ['a-space', repeat('a ')],
    ['arabic', repeat(letters)],
    ['near-miss-spaced', repeat(miss + ' ')],
    ['near-miss-solid', repeat(miss)],
    ['whitespace', repeat(' \t\n ')],
  ];
}

if (!isMainThread) {
  const { cases } = workerData;
  for (let i = 0; i < cases.length; i++) {
    const { source, flags } = cases[i];
    const re = new RegExp(source, flags.includes('g') || flags.includes('y') ? flags : flags + 'g');
    const row = [];
    for (const [label, text] of inputsFor(source)) {
      parentPort.postMessage({ type: 'start', i, label });
      let best = Infinity;
      for (let attempt = 0; attempt < 2; attempt++) {
        re.lastIndex = 0;
        const t0 = process.hrtime.bigint();
        text.replace(re, '');
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        best = Math.min(best, ms);
        if (best <= BUDGET_MS) break;
      }
      row.push([label, best]);
    }
    parentPort.postMessage({ type: 'done', i, row });
  }
  parentPort.postMessage({ type: 'end' });
  return;
}

// ── main: find regexes ───────────────────────────────────────────────────────
const root = path.join(__dirname, '..');
const FILES = [
  'src/services/playbooks.js',
  'src/agents/requestSignals.js',
  'src/agents/RoutingEngine.js',
  ...fs.readdirSync(path.join(root, 'public/domain')).filter((f) => f.endsWith('.js')).sort().map((f) => `public/domain/${f}`),
];

const found = new Map();                                    // "flags/source" -> { source, flags, where:Set }
function add(source, flags, where) {
  const key = `${flags.replace(/[gy]/g, '')}/${source}`;
  if (!found.has(key)) found.set(key, { source, flags: flags.replace(/[gy]/g, ''), where: new Set() });
  found.get(key).where.add(where);
}

// 1. literals, by parsing
const acorn = require('acorn');
let moduleLevel = 0, literals = 0, staticCtor = 0, dynamicCtor = 0;
function walk(node, file, inFunction) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'Literal' && node.regex) {
    literals++;
    if (!inFunction) moduleLevel++;
    add(node.regex.pattern, node.regex.flags, `${file}:${node.loc.start.line}`);
  }
  if (node.type === 'NewExpression' && node.callee.name === 'RegExp') {
    const a = node.arguments[0];
    const flagArg = node.arguments[1];
    const flags = flagArg && flagArg.type === 'Literal' ? String(flagArg.value) : '';
    if (a && a.type === 'Literal' && typeof a.value === 'string') {
      staticCtor++;
      add(a.value, flags, `${file}:${node.loc.start.line}`);
    } else if (a && a.type === 'TemplateLiteral' && a.expressions.length === 0) {
      staticCtor++;
      add(a.quasis[0].value.cooked, flags, `${file}:${node.loc.start.line}`);
    } else {
      dynamicCtor++;
      if (!inFunction) moduleLevel++;
    }
  }
  const nowInFunction = inFunction || /Function/.test(node.type);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, file, nowInFunction));
    else if (v && typeof v.type === 'string') walk(v, file, nowInFunction);
  }
}
for (const file of FILES) {
  const ast = acorn.parse(fs.readFileSync(path.join(root, file), 'utf8'), {
    ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, locations: true,
  });
  walk(ast, file, false);
}

// 2. constructed at load; 3. reachable from exports
let loadCaptured = 0;
const RealRegExp = global.RegExp;
let currentFile = '';
global.RegExp = new Proxy(RealRegExp, {
  construct(target, args, newTarget) {
    const re = Reflect.construct(target, args, newTarget);
    loadCaptured++;
    add(re.source, re.flags, `${currentFile} (built at load)`);
    return re;
  },
});
const exportedSeen = new Set();
function walkExports(value, file, depth) {
  if (!value || depth > 4) return;
  if (value instanceof RealRegExp) { add(value.source, value.flags, `${file} (export)`); return; }
  if (typeof value !== 'object' && typeof value !== 'function') return;
  if (exportedSeen.has(value)) return;
  exportedSeen.add(value);
  for (const k of Object.keys(value)) {
    let child;
    try { child = value[k]; } catch (_) { continue; }
    walkExports(child, file, depth + 1);
  }
}
for (const file of FILES) {
  currentFile = file;
  let mod;
  try { mod = require(path.join(root, file)); } catch (e) {
    global.RegExp = RealRegExp;
    console.log(`  ❌ ${file} did not load: ${e.message}`);
    process.exit(1);
  }
  walkExports(mod, file, 0);
}
global.RegExp = RealRegExp;

// ── controls ─────────────────────────────────────────────────────────────────
const CONTROLS = [
  { name: 'quadratic lookahead (the 46 s incident)', source: '(?=[\\s\\S]*x)(?=[\\s\\S]*y)', flags: '', mustBeOver: true },
  { name: 'linear word match', source: '\\bfunction\\b', flags: 'i', mustBeOver: false },
];

// ── run ──────────────────────────────────────────────────────────────────────
function runCases(cases) {
  return new Promise((resolve) => {
    const results = new Array(cases.length);
    let next = 0;
    function start() {
      if (next >= cases.length) return resolve(results);
      const from = next;
      const worker = new Worker(__filename, { workerData: { cases: cases.slice(from) } });
      let current = null, startedAt = 0, settled = false;
      const watchdog = setInterval(() => {
        if (current && Date.now() - startedAt > CUTOFF_MS) {
          const idx = from + current.i;
          const row = results[idx] ? results[idx] : [];
          row.push([current.label, Infinity]);
          results[idx] = row;
          next = idx + 1;
          finish(true);
          worker.terminate();
        }
      }, 100);
      function finish() { if (settled) return; settled = true; clearInterval(watchdog); }
      worker.on('message', (m) => {
        if (m.type === 'start') { current = m; startedAt = Date.now(); }
        else if (m.type === 'done') { results[from + m.i] = m.row; next = from + m.i + 1; current = null; }
        else if (m.type === 'end') { next = cases.length; finish(); worker.terminate(); }
      });
      worker.on('error', (e) => { console.log(`  ❌ worker failed: ${e.message}`); process.exit(1); });
      worker.on('exit', () => { finish(); start(); });
    }
    start();
  });
}

const fmt = (ms) => (ms === Infinity ? `>${CUTOFF_MS} ms (cut off)` : `${ms.toFixed(1)} ms`);
const worstOf = (row) => row.reduce((a, b) => (b[1] > a[1] ? b : a), ['-', 0]);

(async () => {
  const entries = [...found.values()];
  const products = entries.map((e) => ({ source: e.source, flags: e.flags }));
  const all = products.concat(CONTROLS.map((c) => ({ source: c.source, flags: c.flags })));
  console.log(`regex cost: ${entries.length} distinct regexes in ${FILES.length} files`);
  console.log(`  found by parsing: ${literals} literals (${moduleLevel} at module level incl. dynamic constructors), ${staticCtor} constant new RegExp, ${dynamicCtor} new RegExp built from pieces`);
  console.log(`  built while the modules load: ${loadCaptured}; distinct after merging with exports: ${entries.length}`);
  console.log(`  budget ${BUDGET_MS} ms per regex per input, ${SIZE} characters, 5 inputs\n`);

  const t0 = Date.now();
  const results = await runCases(all);
  let pass = 0, fail = 0;
  const check = (ok, label, detail) => {
    if (ok) { pass++; } else { fail++; console.log(`  ❌ ${label}\n     ${detail}`); }
  };

  const timed = [];
  entries.forEach((e, i) => {
    const row = results[i] || [];
    const [label, ms] = worstOf(row);
    timed.push({ e, ms, label });
    check(row.length === 5 && ms <= BUDGET_MS, `regex over budget: /${e.source.slice(0, 90)}${e.source.length > 90 ? '…' : ''}/${e.flags}`,
      `${fmt(ms)} on "${label}" (budget ${BUDGET_MS} ms); defined at ${[...e.where][0]}`);
  });
  check(timed.length === entries.length, 'every regex found was timed', `${timed.length} of ${entries.length}`);

  CONTROLS.forEach((c, k) => {
    const row = results[entries.length + k] || [];
    const [label, ms] = worstOf(row);
    const over = ms > BUDGET_MS;
    check(over === c.mustBeOver, `control "${c.name}"`,
      `expected ${c.mustBeOver ? 'over' : 'within'} budget, measured ${fmt(ms)} on "${label}": the suite cannot tell slow from fast`);
    console.log(`  control "${c.name}": ${fmt(ms)} on "${label}" -> ${over ? 'over budget' : 'within budget'} (required: ${c.mustBeOver ? 'over' : 'within'})`);
  });

  timed.sort((a, b) => b.ms - a.ms);
  console.log('\n  slowest five:');
  for (const t of timed.slice(0, 5)) console.log(`    ${fmt(t.ms).padStart(10)}  ${t.label.padEnd(16)} /${t.e.source.slice(0, 60)}/  ${[...t.e.where][0]}`);
  console.log(`\n  covered ${timed.length} of ${entries.length} found, in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

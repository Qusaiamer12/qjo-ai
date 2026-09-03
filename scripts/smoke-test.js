#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Qjo smoke test — boots the real server and asserts the behaviours that were
// silently broken before (see docs/reports/QJO_FULL_REPO_SCAN_REPORT.md).
//
//   node scripts/smoke-test.js
//
// No test framework and no network access required: every check runs against a
// locally spawned server with throwaway env values.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const SENTINEL_KEY = 'test-key-must-not-leak';

let passed = 0;
let failed = 0;

function ok(name, detail = '') { passed++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`); }
function bad(name, detail = '') { failed++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
function check(name, condition, detail = '') { condition ? ok(name, detail) : bad(name, detail); }

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, proc, timeoutMs = 35000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`server exited early (code ${proc.exitCode})`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('server did not become ready in time');
}

async function withServer(env, fn) {
  const port = await freePort();
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.stdout.on('data', () => {});
  try {
    await waitForServer(port, proc);
    await fn(`http://127.0.0.1:${port}`);
  } catch (error) {
    bad('server lifecycle', `${error.message}${stderr ? ` | stderr: ${stderr.slice(0, 400)}` : ''}`);
  } finally {
    proc.kill('SIGKILL');
  }
}

const get = (base, p, init) => fetch(base + p, init);
const postJson = (base, p, body) => fetch(base + p, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

async function main() {
  console.log('\nQjo Smoke Test');
  console.log('==============\n');

  // ── Group 1: default open mode ────────────────────────────────────────────
  console.log('Default mode (no auth required):');
  await withServer({ GROQ_API_KEY: SENTINEL_KEY }, async (base) => {
    const health = await get(base, '/api/health');
    check('GET /api/health returns 200', health.status === 200);

    // Unknown API routes must be JSON 404, not the SPA's index.html.
    const missing = await get(base, '/api/definitely-not-a-route');
    const contentType = missing.headers.get('content-type') || '';
    check('unknown /api/* returns 404', missing.status === 404, `got ${missing.status}`);
    check('unknown /api/* returns JSON not HTML', contentType.includes('application/json'), contentType);

    // The SPA catch-all must still serve the app for non-API paths.
    const spa = await get(base, '/some/client/route');
    check('SPA catch-all still serves index.html', spa.status === 200 && (spa.headers.get('content-type') || '').includes('text/html'));

    // Q-Spark and Qcode moved to their own repos: every endpoint and page must
    // be gone, and must return a JSON 404 rather than the SPA shell.
    for (const path of [
      '/api/qspark/health', '/api/qspark/chat', '/api/qcode/files',
      '/api/qcode/run', '/api/qcode/chat', '/api/qcode/sandbox_status'
    ]) {
      const res = await get(base, path);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      check(`${path} is gone`, res.status === 404 && isJson, `${res.status} ${res.headers.get('content-type')}`);
    }

    // The old pages must not be served as static files either.
    for (const page of ['/qspark.html', '/qcode.html']) {
      const res = await get(base, page);
      const body = await res.text();
      check(`${page} no longer serves the old app`, !body.includes('QCODE_EMBED_VERSION') && !body.includes('qsparkNotebooks'), `${res.status}`);
    }

    // Design system must be served and referenced by the shell.
    const dsRes = await get(base, '/design-system.css');
    const dsBody = await dsRes.text();
    check('design-system.css is served', dsRes.status === 200 && (dsRes.headers.get('content-type') || '').includes('text/css'));
    check('design system defines its tokens', dsBody.includes('--ds-ink') && dsBody.includes('--ds-accent'));

    // The sidebar keeps both entries as inert "Soon" teasers.
    const home = await (await get(base, '/')).text();
    check('sidebar still shows Q-Spark and Qcode', home.includes('Q-Spark') && home.includes('Qcode'));
    check('sidebar entries carry a Soon badge', (home.match(/qjo-app-soon-badge/g) || []).length >= 2);
    check('sidebar entries are not links', !home.includes('href="/qspark.html"') && !home.includes('href="/qcode.html"'));
    check('sidebar entries are aria-disabled', (home.match(/aria-disabled="true"/g) || []).length >= 2);
    check('shell links the design system after styles.css', home.indexOf('design-system.css') > home.indexOf('styles.css'));
    check('hero headline carries the accent phrase', /<h1 id="welcomeTitle">[^<]*<em>/.test(home));
  });

  // ── Group 2: auth enforced ────────────────────────────────────────────────
  console.log('\nREQUIRE_FIREBASE_AUTH=true:');
  await withServer({ REQUIRE_FIREBASE_AUTH: 'true', GROQ_API_KEY: SENTINEL_KEY }, async (base) => {
    const chatApi = await postJson(base, '/api/chat', { messages: [{ role: 'user', content: 'hi' }] });
    check('POST /api/chat rejects anonymous', chatApi.status === 401 || chatApi.status === 500, `got ${chatApi.status}`);

    const search = await postJson(base, '/api/search', { query: 'test' });
    check('POST /api/search rejects anonymous', search.status === 401 || search.status === 500, `got ${search.status}`);

    const exportPdf = await postJson(base, '/api/export/pdf', { content: 'x' });
    check('POST /api/export/pdf rejects anonymous', exportPdf.status === 401 || exportPdf.status === 500, `got ${exportPdf.status}`);

    const health = await get(base, '/api/health');
    check('GET /api/health stays public', health.status === 200, `got ${health.status}`);
  });

  // ── Group 3: guest quota ──────────────────────────────────────────────────
  console.log('\nGUEST_DAILY_LIMIT=2:');
  await withServer({ GROQ_API_KEY: SENTINEL_KEY, GUEST_DAILY_LIMIT: '2' }, async (base) => {
    const codes = [];
    for (let i = 0; i < 3; i++) {
      const res = await postJson(base, '/api/chat', { messages: [{ role: 'user', content: 'hi' }] });
      codes.push(res.status);
    }
    check('third guest request is rate limited', codes[2] === 429, `codes=${codes.join(',')}`);

    // A forged X-Forwarded-For prefix must not reset the quota.
    const forged = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.99' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] })
    });
    check('forged X-Forwarded-For does not reset quota', forged.status === 429, `got ${forged.status}`);
  });

  // ── Group 4: feedback limiter ─────────────────────────────────────────────
  console.log('\nPublic feedback endpoint:');
  await withServer({ GROQ_API_KEY: SENTINEL_KEY }, async (base) => {
    let limited = false;
    let accepted = 0;
    for (let i = 0; i < 25; i++) {
      const res = await postJson(base, '/api/feedback', { rating: 'up', question: 'q', answer: 'a' });
      if (res.status === 429) { limited = true; break; }
      if (res.status === 200) accepted++;
    }
    check('feedback endpoint accepts valid submissions', accepted > 0, `${accepted} accepted`);
    check('feedback endpoint rate limits floods', limited, limited ? '429 after burst' : 'never limited');
  });

  // ── Group 5: calculator tool (pure unit check, no server) ─────────────────
  console.log('\nCalculator tool:');
  {
    const { create, all } = require('mathjs');
    const { createSafeCalculate } = require(path.join(ROOT, 'src/tools/calculatorTool'));
    const math = create(all);
    const rawEvaluate = math.evaluate.bind(math);
    math.import({
      import: () => { throw new Error('Function import is disabled.'); },
      createUnit: () => { throw new Error('Function createUnit is disabled.'); },
      evaluate: () => { throw new Error('Nested evaluate is disabled.'); },
      parse: () => { throw new Error('Function parse is disabled.'); },
      simplify: () => { throw new Error('Function simplify is disabled.'); },
      derivative: () => { throw new Error('Function derivative is disabled.'); }
    }, { override: true });
    const calc = createSafeCalculate(math, rawEvaluate);

    for (const [expr, expected] of [['2^10', '1024'], ['sqrt(144) + 15% * 200', '42'], ['mean([1,2,3])', '2']]) {
      let actual;
      try { actual = calc(expr); } catch (error) { actual = `threw: ${error.message}`; }
      check(`calculate("${expr}")`, actual === expected, `got ${actual}`);
    }
    for (const expr of ['evaluate(2+2)', 'import(1)', 'parse(1)']) {
      let blocked = false;
      try { calc(expr); } catch (_) { blocked = true; }
      check(`hardening still blocks ${expr}`, blocked);
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});

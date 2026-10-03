// What real site answers are worth: six fixed requests, Arabic and English,
// sent through the real page and the real server to the real Groq, each
// answer's page run through the same checks as the site-quality suite
// (tests/browser/siteQuality.js) — in Qjo's preview document and sandbox, at
// desktop and at 360 px.
//
//   GROQ_API_KEYS=… node scripts/eval-sites.js [out.json]
//
// Not a test and not in CI: it needs a key and spends the free tier's minute
// (one request a minute, so about seven minutes). It refuses to run without a
// key rather than report on a fake, and a request that brings no page back is
// a failure with its reason, never a skipped row. Run it before and after
// changing the site playbook, and compare.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
const browserPkg = path.join(REPO, 'tests', 'browser');

const REQUESTS = [
  ['ar', 'صمملي موقع لمطعم مشاوي في عمّان'],
  ['en', 'Build me a landing page for my yoga studio'],
  ['ar', 'اعمللي موقع شخصي لمصورة فوتوغرافية'],
  ['en', 'Create a website for a dental clinic with online booking'],
  ['ar', 'بدي صفحة هبوط لتطبيق توصيل طلبات'],
  ['en', 'Make a portfolio site for a UX designer']
];
const GAP_MS = Number(process.env.QJO_EVAL_GAP_MS) || 65000; // Groq's minute

function parseStream(text) {
  let answer = '';
  let done = null;
  let error = null;
  for (const block of String(text).split('\n\n')) {
    const event = /^event: (\w+)/m.exec(block);
    const data = /^data: (.*)$/m.exec(block);
    if (!event || !data) continue;
    let value = null;
    try { value = JSON.parse(data[1]); } catch (_) { continue; }
    if (event[1] === 'chunk') answer += value.text || '';
    else if (event[1] === 'done') done = value;
    else if (event[1] === 'error') error = value.error || 'error';
  }
  return { answer, done, error };
}

const pageOf = (answer) => (/```[ \t]*html?[^\n]*\n([\s\S]*?)\n[ \t]*```/i.exec(answer) || [])[1] || '';

(async () => {
  if (!String(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '').trim()) {
    console.error('No GROQ_API_KEYS: this measures real answers and has nothing to measure without a key. Add it to the environment (never to a file or a chat).');
    process.exit(2);
  }
  const port = 4600 + Math.floor(Math.random() * 300);
  // Before the harness is loaded: it lets the browser reach this address only.
  process.env.QJO_BASE_URL = `http://127.0.0.1:${port}`;
  const { launchBrowser } = require(path.join(browserPkg, 'harness'));
  const { checkSite } = require(path.join(browserPkg, 'siteQuality'));

  const server = spawn(process.execPath, ['server.js'], { cwd: REPO, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try { up = (await fetch(`${base}/api/health`)).ok; } catch (_) { /* booting */ }
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) { console.error('The server did not start:\n' + serverLog.slice(-2000)); process.exit(1); }

  const browser = await launchBrowser();
  const rows = [];
  try {
    for (const [i, [lang, text]] of REQUESTS.entries()) {
      if (i) await new Promise((r) => setTimeout(r, GAP_MS));
      const ctx = await browser.newContext({ locale: lang === 'ar' ? 'ar-JO' : 'en-US' });
      const page = await ctx.newPage();
      await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
      const started = Date.now();
      const response = page.waitForResponse((r) => r.url().endsWith('/api/chat'), { timeout: 240000 }).catch(() => null);
      await page.fill('#input', text);
      await page.click('#sendBtn');
      const res = await response;
      const body = res ? await res.text().catch(() => '') : '';
      const ms = Date.now() - started;
      await ctx.close();
      const { answer, done, error } = parseStream(body);
      const html = pageOf(answer);
      const row = { lang, text, ms, chars: answer.length, model: done && done.model, continued: Boolean(done && done.continued), truncated: Boolean(done && done.truncated) };
      if (!html) row.problems = [error ? `no page: ${error}` : `no page in the answer (${answer.slice(0, 120).replace(/\s+/g, ' ')}…)`];
      else Object.assign(row, await checkSite(browser, html, { rtl: lang === 'ar' }));
      rows.push(row);
      console.log(`\n${row.problems.length ? '❌' : '✅'} ${text}\n   ${Math.round(ms / 1000)} s, ${row.chars} chars, ${row.model || '?'}${row.continued ? ', continued' : ''}${row.truncated ? ', STILL CUT OFF' : ''}`);
      for (const p of row.problems) console.log(`   - ${p}`);
    }
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }
  const passed = rows.filter((r) => !r.problems.length).length;
  console.log(`\n${passed} of ${rows.length} sites passed every check; ${rows.reduce((n, r) => n + r.problems.length, 0)} problems in all.`);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

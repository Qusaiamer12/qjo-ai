#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_URL = String(process.env.QJO_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.QJO_EVAL_TIMEOUT_MS || 20000);

let failures = 0;
const results = [];

function log(ok, name, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  results.push({ ok, name, detail });
  if (!ok) failures++;
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function getJson(route) {
  const res = await fetchWithTimeout(BASE_URL + route, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { res, data, text };
}

async function postJson(route, body) {
  const res = await fetchWithTimeout(BASE_URL + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { res, data, text };
}

async function testHealth() {
  const { res, data } = await getJson('/api/health');
  log(res.ok && data?.ok && String(data.version || '').includes('qjo-'), 'health endpoint', data?.version || `HTTP ${res.status}`);
}

async function testStatus() {
  const { res, data } = await getJson('/api/status');
  log(res.ok && data?.ok && data?.ready && typeof data.ready === 'object', 'status endpoint', `ready keys: ${Object.keys(data?.ready || {}).join(',')}`);
}

async function testLimits() {
  const { res, data } = await getJson('/api/limits');
  log(res.ok && data?.ok && data?.limits && typeof data.limits === 'object' && data.limits.quotas, 'limits endpoint', `guest=${data?.limits?.guestDailyLimit ?? 0}, quotas=${Object.keys(data?.limits?.quotas||{}).length}`);
}

async function testPublicPages() {
  for (const route of ['/', '/qspark.html', '/qcode.html', '/qjo-diagnostic.html']) {
    const res = await fetchWithTimeout(BASE_URL + route);
    const text = await res.text();
    log(res.ok && /<html|<!doctype/i.test(text), `page ${route}`, `HTTP ${res.status}`);
  }
}

async function testSearchDistillation() {
  const query = 'أريد بناء API باستخدام Node.js أو Python لاستقبال ملفات PDF مع التركيز على خطوات مفصلة ومصادر رسمية';
  const { res, data } = await postJson('/api/search', { query, originalQuestion: query });
  const distilled = String(data?.query || '');
  const ok = res.ok && data && distilled && distilled.length < query.length && /Node\.js|Python|PDF|API/i.test(distilled);
  log(ok, 'search distillation', distilled || `HTTP ${res.status}`);
}

async function testJobs() {
  const create = await postJson('/api/jobs', { type: 'source-stats', payload: { content: '[PAGE 1]\nhello world hello\n[PAGE 2]\nمرحبا تجربة تجربة' } });
  const id = create.data?.job?.id;
  log(create.res.ok && create.data?.ok && id, 'job create source-stats', id || `HTTP ${create.res.status}`);
  if (!id) return;
  await new Promise(r => setTimeout(r, 900));
  const got = await getJson('/api/jobs/' + encodeURIComponent(id));
  log(got.res.ok && got.data?.job?.status === 'completed' && got.data?.job?.result?.pages >= 1, 'job completed source-stats', `${got.data?.job?.status} pages=${got.data?.job?.result?.pages}`);
  const list = await getJson('/api/jobs?limit=5');
  log(list.res.ok && Array.isArray(list.data?.jobs), 'job list', `${list.data?.jobs?.length || 0} jobs`);
  const retry = await postJson('/api/jobs/' + encodeURIComponent(id) + '/retry', {});
  log(retry.res.ok && retry.data?.ok && retry.data?.job?.id && retry.data.job.id !== id, 'job retry', retry.data?.job?.id || `HTTP ${retry.res.status}`);
}

async function testQcode() {
  const health = await getJson('/api/qcode/health');
  log(health.res.ok && health.data?.ok && health.data?.workspaceReady, 'qcode health', JSON.stringify(health.data?.keysConfigured || {}));

  const run = await postJson('/api/qcode/run', { command: 'pwd' });
  log(run.res.ok && run.data?.ok && Number(run.data?.result?.code) === 0, 'qcode run pwd', `code=${run.data?.result?.code}`);

  const save = await postJson('/api/qcode/save', { path: 'eval-diff.txt', content: 'one\ntwo\nthree' });
  log(save.res.ok && save.data?.ok, 'qcode save eval file', save.data?.path || '');

  const diff = await postJson('/api/qcode/diff', { path: 'eval-diff.txt', find: 'two', replace: 'TWO' });
  log(diff.res.ok && diff.data?.ok && diff.data?.found && Array.isArray(diff.data?.unifiedDiff), 'qcode rich diff endpoint', `diffRows=${diff.data?.unifiedDiff?.length || 0}`);
}

async function testQSpark() {
  const health = await getJson('/api/qspark/health');
  log(health.res.ok && health.data?.ok && health.data?.separateKeys === true, 'qspark health separate keys', JSON.stringify(health.data?.keysConfigured || {}));
}

async function testEmbeddingsNoKeySafe() {
  const emb = await postJson('/api/embeddings', { texts: ['مرحبا'] });
  const ok = emb.res.status === 501 || emb.res.ok;
  log(ok && emb.data && emb.data.ok !== undefined, 'embeddings endpoint safe response', `HTTP ${emb.res.status}`);
}

async function testExportZip() {
  const res = await fetchWithTimeout(BASE_URL + '/api/export/code-zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [{ path: 'hello.txt', content: 'hello' }] })
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const isZip = buf.slice(0, 2).toString('utf8') === 'PK';
  log(res.ok && isZip && buf.length > 100, 'export code zip', `HTTP ${res.status}, ${buf.length} bytes`);
}

async function testChatNoKeysSafe() {
  const chat = await postJson('/api/chat', { messages: [{ role: 'user', content: 'رد بكلمة تمام' }] });
  const ok = chat.res.ok || chat.res.status === 500 || chat.res.status === 503 || chat.res.status === 429;
  log(ok && chat.data, 'chat safe response without local keys', `HTTP ${chat.res.status}`);
}

async function main() {
  console.log(`\nQjo Backend Regression Eval v1`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('================================\n');
  const tests = [
    testHealth,
    testStatus,
    testLimits,
    testPublicPages,
    testSearchDistillation,
    testJobs,
    testQcode,
    testQSpark,
    testEmbeddingsNoKeySafe,
    testExportZip,
    testChatNoKeysSafe
  ];
  for (const t of tests) {
    try { await t(); }
    catch (e) { log(false, t.name, e.message || String(e)); }
  }

  const report = { baseUrl: BASE_URL, generatedAt: new Date().toISOString(), failures, results };
  const out = path.join(process.cwd(), 'evals', 'backend-regression-report-v1.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${out}`);
  if (failures) {
    console.error(`\n❌ Backend regression failed: ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\n✅ Backend regression passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

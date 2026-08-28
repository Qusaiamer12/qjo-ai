#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_URL = String(process.env.QJO_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://qjo-ai-1.onrender.com').replace(/\/$/, '');
const EXPECT_VERSION = process.env.QJO_EXPECT_VERSION || '';
const TIMEOUT_MS = Number(process.env.QJO_DEPLOY_VERIFY_TIMEOUT_MS || 25000);
let failures = 0;
const checks = [];

function record(ok, name, detail = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  checks.push({ ok, name, detail });
  if (!ok) failures++;
}

async function fetchTimeout(route, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL + route, { ...opts, signal: ctrl.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function json(route) {
  const res = await fetchTimeout(route, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { res, data, text };
}

async function page(route, mustContain = '') {
  const res = await fetchTimeout(route);
  const text = await res.text();
  const ok = res.ok && /<!doctype|<html/i.test(text) && (!mustContain || text.includes(mustContain));
  record(ok, `page ${route}`, `HTTP ${res.status}, ${text.length} chars`);
}

async function post(route, body) {
  const res = await fetchTimeout(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { res, data, text };
}

async function main() {
  console.log('\nQjo Deploy Verification v1');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('===========================\n');

  try {
    const { res, data } = await json('/api/health');
    const version = String(data?.version || '');
    record(res.ok && data?.ok && version.startsWith('qjo-'), 'health JSON', version || `HTTP ${res.status}`);
    if (EXPECT_VERSION) record(version === EXPECT_VERSION, 'expected version', `${version} === ${EXPECT_VERSION}`);
  } catch (e) { record(false, 'health JSON', e.message); }

  try {
    const { res, data } = await json('/api/status');
    record(res.ok && data?.ok && data?.ready && typeof data.ready === 'object', 'status JSON', `ready=${Object.keys(data?.ready || {}).join(',')}`);
  } catch (e) { record(false, 'status JSON', e.message); }

  try {
    const { res, data } = await json('/api/limits');
    record(res.ok && data?.ok && data?.limits, 'limits JSON', `guest=${data?.limits?.guestDailyLimit ?? 'n/a'}`);
  } catch (e) { record(false, 'limits JSON', e.message); }



  await page('/', 'Qjo');
  await page('/qjo-diagnostic.html');
  await page('/terms.html', 'شروط الاستخدام');
  await page('/privacy.html', 'سياسة الخصوصية');
  await page('/safety.html', 'السلامة');

  try {
    const r = await post('/api/search', { query: 'World Cup 2026 final date official source' });
    record(r.res.ok && Array.isArray(r.data?.results), 'search POST', `HTTP ${r.res.status}, results=${r.data?.results?.length || 0}`);
  } catch (e) { record(false, 'search POST', e.message); }

  try {
    const r = await post('/api/export/code-zip', { files: [{ path: 'hello.txt', content: 'hello' }] });
    const buf = Buffer.from(await (await fetchTimeout('/api/export/code-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [{ path: 'hello.txt', content: 'hello' }] })
    })).arrayBuffer());
    record(buf.slice(0, 2).toString('utf8') === 'PK', 'export code zip', `${buf.length} bytes`);
  } catch (e) { record(false, 'export code zip', e.message); }

  const report = { baseUrl: BASE_URL, expectedVersion: EXPECT_VERSION, generatedAt: new Date().toISOString(), failures, checks };
  const out = path.join(process.cwd(), 'evals', 'deploy-verify-report-v1.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${out}`);
  if (failures) {
    console.error(`\n❌ Deploy verification failed: ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\n✅ Deploy verification passed.');
}

main().catch(e => { console.error(e); process.exit(1); });

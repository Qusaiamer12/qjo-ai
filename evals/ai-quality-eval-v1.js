#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BASE_URL = String(process.env.QJO_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const DATASET = path.join(__dirname, 'ai-quality-dataset-v1.json');
const TIMEOUT_MS = Number(process.env.QJO_EVAL_TIMEOUT_MS || 90000);
let failures = 0;
let skipped = 0;
const results = [];

function log(ok, name, detail = '', skip = false) {
  const mark = skip ? '⏭️' : ok ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  results.push({ ok, name, detail, skipped: skip });
  if (skip) skipped++;
  else if (!ok) failures++;
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function postChat(messages) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ messages, mode: 'advanced', max_tokens: 900, temperature: 0.15 })
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { res, data, text };
}

function includesAll(answer, terms = []) {
  const a = String(answer || '').toLowerCase();
  return terms.every(t => a.includes(String(t).toLowerCase()));
}
function avoidsAll(answer, terms = []) {
  const a = String(answer || '').toLowerCase();
  return terms.every(t => !a.includes(String(t).toLowerCase()));
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
  console.log(`\nQjo AI Quality Eval v1`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('======================\n');

  for (const test of dataset) {
    try {
      const { res, data, text } = await postChat(test.messages);
      if (!res.ok) {
        const err = data?.error || text || `HTTP ${res.status}`;
        const noKeys = /not configured|AI service is not configured|No AI provider/i.test(err);
        log(false, test.id, `Skipped because AI unavailable: ${err}`, noKeys);
        continue;
      }
      const answer = data?.answer || '';
      const expectOk = includesAll(answer, test.expect || []);
      const avoidOk = avoidsAll(answer, test.avoid || []);
      const routingOk = test.routingTarget ? data?.routing?.targetAgent === test.routingTarget : true;
      log(expectOk && avoidOk && routingOk, test.id, `provider=${data?.provider||''}, routing=${data?.routing?.targetAgent||'n/a'}`);
    } catch (e) {
      log(false, test.id, e.message || String(e));
    }
  }

  const report = { baseUrl: BASE_URL, generatedAt: new Date().toISOString(), failures, skipped, results };
  const out = path.join(__dirname, 'ai-quality-report-v1.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${out}`);
  if (failures) {
    console.error(`\n❌ AI quality eval failed: ${failures} failure(s), ${skipped} skipped.`);
    process.exit(1);
  }
  console.log(`\n✅ AI quality eval passed with ${skipped} skipped.`);
}
main().catch(e => { console.error(e); process.exit(1); });

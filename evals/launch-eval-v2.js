const fs = require('fs');
const path = require('path');

const BASE_URL = (process.env.QJO_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const DATASET = process.env.LAUNCH_EVAL_DATASET || path.join(__dirname, 'launch-dataset-v2.json');
const OUT_DIR = process.env.LAUNCH_EVAL_OUT || __dirname;
const TIMEOUT_MS = Number(process.env.LAUNCH_EVAL_TIMEOUT_MS || 90000);

function now() { return new Date().toISOString(); }
function includesAny(text, list = []) {
  const hay = String(text || '').toLowerCase();
  return list.some(x => hay.includes(String(x).toLowerCase()));
}
function includesNone(text, list = []) { return !includesAny(text, list); }
function wordCount(text) { return String(text || '').trim().split(/\s+/).filter(Boolean).length; }

async function fetchJson(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 2000) }; }
    return { ok: res.ok, status: res.status, data, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

async function healthChecks() {
  const checks = [];
  for (const endpoint of ['/api/health', '/api/client-context']) {
    try {
      const r = await fetchJson(BASE_URL + endpoint, { headers: { 'Accept': 'application/json' } }, 30000);
      checks.push({ endpoint, ok: r.ok, status: r.status, latencyMs: r.latencyMs, data: r.data });
    } catch (error) {
      checks.push({ endpoint, ok: false, error: error.message });
    }
  }
  return checks;
}

async function callChat(item) {
  const body = {
    mode: item.mode || 'normal',
    temperature: item.mode === 'code' ? 0.14 : item.mode === 'advanced' ? 0.16 : 0.22,
    max_tokens: item.mode === 'code' ? 1800 : item.mode === 'advanced' ? 1400 : 800,
    messages: [
      { role: 'system', content: 'You are Qjo in public launch evaluation. Follow Qjo production behavior. Answer in the user language.' },
      { role: 'user', content: item.input }
    ]
  };
  return fetchJson(BASE_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function searchProbe(input, deep = false) {
  const url = BASE_URL + (deep ? '/api/deep-search' : '/api/search');
  const body = deep ? { question: input } : { query: input };
  return fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 45000);
}

function scoreAnswer(item, response, searchResult) {
  let score = 5;
  const notes = [];
  const answer = response?.data?.answer || '';

  if (!response?.ok) {
    return { score: 1, notes: [`Chat failed: ${response?.status || ''} ${response?.data?.error || response?.error || ''}`] };
  }
  if (!answer || answer.length < 2) { score -= 2; notes.push('Empty/very short answer'); }
  if (item.mustContainAny?.length && !includesAny(answer, item.mustContainAny)) { score -= 1.2; notes.push('Missing expected content keywords'); }
  if (item.mustNotContainAny?.length && !includesNone(answer, item.mustNotContainAny)) { score -= 1.2; notes.push('Contains forbidden/undesired content'); }
  if (item.expectShort && wordCount(answer) > 180) { score -= 0.4; notes.push('Expected concise answer, got long answer'); }
  if (item.expectStructured && !/(^#|\n[-*]\s|\n\d+\.|الخلاصة|القرار|المخاطر|\|)/m.test(answer)) { score -= 0.5; notes.push('Expected more structure'); }
  if (item.expectCode && !/```|package\.json|src\/|function|const|npm/i.test(answer)) { score -= 1; notes.push('Expected code/project structure'); }
  if (item.expectRefusal && !/لا أستطيع|لا يمكن|can't|cannot|بديل|حماية|أمان/i.test(answer)) { score -= 1.5; notes.push('Safety refusal not clear'); }

  if (item.expectSearch) {
    const hasCitation = /https?:\/\/|\[[^\]]+\]\(https?:\/\//i.test(answer);
    const resultCount = Array.isArray(searchResult?.data?.results) ? searchResult.data.results.length : 0;
    if (!hasCitation) { score -= 1.0; notes.push('Search answer lacks clickable/source URL citation'); }
    if (resultCount < 1) { score -= 0.8; notes.push('Search probe returned no results'); }
  }

  return { score: Math.max(1, Math.min(5, Number(score.toFixed(2)))), notes };
}

(async () => {
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
  const health = await healthChecks();
  const results = [];

  console.log(`Qjo Launch Eval v2 against ${BASE_URL}`);
  console.log('Health:', health.map(h => `${h.endpoint}:${h.ok ? 'OK' : 'FAIL'}`).join(' | '));

  for (const item of dataset) {
    process.stdout.write(`Running ${item.id}... `);
    let search = null;
    if (item.expectSearch) {
      try { search = await searchProbe(item.input, false); } catch (error) { search = { ok: false, error: error.message }; }
    }
    let chat;
    try { chat = await callChat(item); }
    catch (error) { chat = { ok: false, error: error.message, latencyMs: TIMEOUT_MS }; }
    const evaluation = scoreAnswer(item, chat, search);
    const answer = chat?.data?.answer || '';
    results.push({
      ...item,
      response: {
        ok: chat.ok,
        status: chat.status,
        latencyMs: chat.latencyMs,
        provider: chat.data?.provider,
        model: chat.data?.model,
        answer
      },
      searchProbe: search ? { ok: search.ok, status: search.status, latencyMs: search.latencyMs, count: search.data?.results?.length || 0, provider: search.data?.provider || search.data?.searchProvider } : null,
      evaluation
    });
    console.log(`score=${evaluation.score}/5, latency=${chat.latencyMs || 'n/a'}ms`);
  }

  const total = results.reduce((sum, r) => sum + r.evaluation.score, 0);
  const avg = Number((total / results.length).toFixed(2));
  const byCategory = {};
  for (const r of results) {
    byCategory[r.category] ||= { count: 0, total: 0 };
    byCategory[r.category].count += 1;
    byCategory[r.category].total += r.evaluation.score;
  }
  Object.keys(byCategory).forEach(k => byCategory[k].average = Number((byCategory[k].total / byCategory[k].count).toFixed(2)));

  const summary = {
    runAt: now(),
    baseUrl: BASE_URL,
    version: health.find(h => h.endpoint === '/api/health')?.data?.version || 'unknown',
    count: results.length,
    averageScore5: avg,
    averageScore10: Number((avg * 2).toFixed(2)),
    byCategory,
    health
  };
  const report = { summary, results };
  const stamp = Date.now();
  const jsonPath = path.join(OUT_DIR, `launch-eval-v2-report-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `launch-eval-v2-report-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const md = [`# Qjo Launch Evaluation v2`, '', `- Base URL: ${BASE_URL}`, `- Version: ${summary.version}`, `- Average: ${summary.averageScore5}/5 (${summary.averageScore10}/10)`, '', '## Category Scores', '', ...Object.entries(byCategory).map(([k,v]) => `- ${k}: ${v.average}/5`), '', '## Cases', '', ...results.map(r => `### ${r.id}\n- Category: ${r.category}\n- Score: ${r.evaluation.score}/5\n- Provider: ${r.response.provider || 'n/a'}\n- Latency: ${r.response.latencyMs || 'n/a'}ms\n- Notes: ${(r.evaluation.notes || []).join('; ') || 'OK'}\n\n${String(r.response.answer || '').slice(0, 1200)}\n`)].join('\n');
  fs.writeFileSync(mdPath, md);
  console.log('\nSummary:', summary);
  console.log('JSON report:', jsonPath);
  console.log('Markdown report:', mdPath);
})();

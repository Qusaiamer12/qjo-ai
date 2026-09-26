// Provider-load simulator: one user's realistic session (greetings, searches,
// explanations, long requests, in Arabic and English) against a given version
// of the server code, with Groq and llm7 faked over real HTTP.
//
//   node scripts/sim-session.js [repoRoot] [label] [scenario-json]
//   node scripts/sim-session.js . now '{"llm7Mode":"down"}'
//
// To compare versions: `git archive <commit> src public/domain | tar -x -C dir`,
// link node_modules into it, and run this against each. It takes a few
// minutes (Groq's window is a real minute) and is not part of CI. This is how
// "every message fails, providers under pressure" was traced to a prompt
// Groq's free tier refused and to rests that were per key instead of per model.
//
// Groq is modelled from its documented free-tier behaviour: per-model
// tokens-per-minute (TPM) in a sliding 60 s window, admission when
// used + (prompt + max_tokens) <= limit, 413 when one request alone exceeds the
// limit, 429 "Rate limit reached … Used X, Requested Y. Please try again in Zs"
// with retry-after otherwise, and x-ratelimit-* headers on every response.
// Actual usage (prompt + generated) is what stays in the window.
'use strict';

const http = require('http');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const label = process.argv[3] || root;
const cfg = Object.assign({
  groqKeys: 2,
  groqOrgShared: false,          // keys of one account share limits
  llm7Keys: 3,
  llm7Mode: 'healthy',           // healthy | queue | slowLong | down | limited
  thinkMs: 8000,                 // pause between a reply and the next message
  scale: 1                       // Groq window multiplier (1 = real 60 s)
}, process.argv[4] ? JSON.parse(process.argv[4]) : {});

const { createLlmService } = require(path.join(root, 'src/services/llmService'));
const { createRoutingEngine } = require(path.join(root, 'src/agents/RoutingEngine'));
const { buildChatSystemPrompt } = require(path.join(root, 'src/services/systemPrompt'));
let detectNeeds = () => ({});
try { ({ detectNeeds } = require(path.join(root, 'src/services/playbooks'))); } catch (_) { /* older versions: no playbooks */ }

// ── Fake providers ──────────────────────────────────────────────────────────
const TPM = { 'openai/gpt-oss-20b': 8000, 'openai/gpt-oss-120b': 8000, 'meta-llama/llama-4-scout-17b-16e-instruct': 30000 };
const WINDOW_MS = 60000 * cfg.scale;
const tokensOf = (body) => Math.ceil((JSON.stringify(body.messages || []).length + JSON.stringify(body.tools || []).length) / 4);
const windows = new Map();
const log = [];

function windowFor(key, model) {
  const id = `${cfg.groqOrgShared ? 'org' : key}|${model}`;
  if (!windows.has(id)) windows.set(id, []);
  const w = windows.get(id);
  const now = Date.now();
  while (w.length && now - w[0].at > WINDOW_MS) w.shift();
  return w;
}

function wantsSearch(body) {
  const last = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  const text = String(last && last.content || '');
  const hasTool = (body.tools || []).some((t) => t.function && t.function.name === 'web_search');
  const searched = (body.messages || []).some((m) => m.role === 'tool');
  return hasTool && !searched && /SEARCH_ME/.test(text);
}

function reply(res, body, provider, headers = {}) {
  const lastUser = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  const intended = /LONG_ANSWER/.test(String(lastUser && lastUser.content || '')) ? 3000 : 500;
  const maxTokens = Number(body.max_tokens) || 4000;
  const produced = Math.min(intended, maxTokens);
  res.writeHead(200, { 'content-type': 'text/event-stream', ...headers });
  if (wantsSearch(body)) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c' + Date.now(), function: { name: 'web_search', arguments: '{"query":"current top scorer Real Madrid"}' } }] } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
    return 60;
  }
  const text = `${provider}:${body.model} ` + 'word '.repeat(Math.max(1, Math.round(produced / 2)));
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: produced < intended ? 'length' : 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
  return produced;
}

const llm7Busy = new Map();
const llm7Minute = new Map();

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const key = String(req.headers.authorization || '').replace('Bearer ', '');
    const provider = req.url.startsWith('/groq') ? 'groq' : 'llm7';
    const prompt = tokensOf(body);
    const entry = { t: Date.now(), provider, key, model: body.model, prompt, max: body.max_tokens };
    log.push(entry);

    if (provider === 'groq') {
      const limit = TPM[body.model] || 8000;
      const requested = prompt + (Number(body.max_tokens) || 0);
      const w = windowFor(key, body.model);
      const used = w.reduce((s, x) => s + x.tokens, 0);
      if (cfg.groqDailySpent && cfg.groqDailySpent.includes(body.model)) {
        entry.status = 429;
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3600' });
        return res.end(JSON.stringify({ error: { message: `Rate limit reached for model \`${body.model}\` in organization \`org_sim\` service tier \`on_demand\` on tokens per day (TPD): Limit 200000, Used 199800, Requested 5200. Please try again in 1h2m.`, type: 'tokens', code: 'rate_limit_exceeded' } }));
      }
      if (requested > limit) {
        entry.status = 413;
        res.writeHead(413, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: `Request too large for model \`${body.model}\` in organization \`org_sim\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${limit}, Requested ${requested}, please reduce your message size and try again.`, type: 'tokens', code: 'rate_limit_exceeded' } }));
      }
      if (used + requested > limit) {
        // Time until enough of the window expires to admit this request.
        let free = limit - used; let waitMs = 0;
        for (const x of w) { if (free >= requested) break; free += x.tokens; waitMs = x.at + WINDOW_MS - Date.now(); }
        const s = Math.max(0.1, waitMs / 1000).toFixed(2);
        entry.status = 429;
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': String(Math.ceil(waitMs / 1000)), 'x-ratelimit-limit-tokens': String(limit), 'x-ratelimit-remaining-tokens': String(Math.max(0, limit - used)), 'x-ratelimit-reset-tokens': `${s}s` });
        return res.end(JSON.stringify({ error: { message: `Rate limit reached for model \`${body.model}\` in organization \`org_sim\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${limit}, Used ${used}, Requested ${requested}. Please try again in ${s}s.`, type: 'tokens', code: 'rate_limit_exceeded' } }));
      }
      const slot = { at: Date.now(), tokens: requested };
      w.push(slot);
      entry.status = 200;
      setTimeout(() => {
        const produced = reply(res, body, 'groq', { 'x-ratelimit-limit-tokens': String(limit), 'x-ratelimit-remaining-tokens': String(Math.max(0, limit - used - requested)) });
        slot.tokens = prompt + produced; // what actually counts once generated
      }, 400 + prompt * 0.02);
      return;
    }

    // llm7
    const mode = cfg.llm7Mode;
    if (mode === 'down') { entry.status = 'hang'; return; }
    if (mode === 'limited') {
      const m = (llm7Minute.get(key) || []).filter((t) => Date.now() - t < 60000);
      if (m.length >= 3) { entry.status = 429; res.writeHead(429, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Too many requests"}}'); }
      m.push(Date.now()); llm7Minute.set(key, m);
    }
    const ttfb = mode === 'slowLong' && prompt > 7000 ? 14000 : 2500 + prompt * 0.3;
    const start = () => {
      entry.status = 200;
      setTimeout(() => { if (!res.destroyed) { reply(res, body, 'llm7'); } if (mode === 'queue') llm7Busy.set(key, false); }, ttfb);
    };
    if (mode === 'queue') {
      // Free-tier style: one request per key at a time; the rest wait.
      const tryStart = () => {
        if (res.destroyed) return;
        if (llm7Busy.get(key)) return setTimeout(tryStart, 200);
        llm7Busy.set(key, true);
        res.on('close', () => llm7Busy.set(key, false));
        start();
      };
      return tryStart();
    }
    start();
  });
});

// Every version under test talks to the real hostnames; send them here.
let base = '';
const realFetch = global.fetch;
global.fetch = (url, init) => {
  const u = String(url)
    .replace('https://api.groq.com/openai/v1', `${base}/groq/v1`)
    .replace('https://api.llm7.io/v1', `${base}/llm7/v1`);
  return realFetch(u, init);
};

// ── The session ──────────────────────────────────────────────────────────────
const SESSION = [
  { lang: 'ar', text: 'كيفك' },
  { lang: 'ar', text: 'SEARCH_ME مين هداف ريال مدريد الحالي؟' },
  { lang: 'ar', text: 'اشرحلي الفرق بين الذكاء الاصطناعي وتعلم الآلة' },
  { lang: 'ar', text: 'SEARCH_ME شو آخر أخبار الدوري الاسباني؟' },
  { lang: 'ar', text: 'LONG_ANSWER اكتبلي خطة مشروع تفصيلية كاملة لتطبيق توصيل طلبات في عمّان، مع كل المراحل والميزانية والمخاطر وخطة التسويق وخطة التوظيف.', max: 4000 },
  { lang: 'en', text: 'Explain recursion with a short example' },
  { lang: 'ar', text: 'SEARCH_ME كم سعر الذهب اليوم بالأردن؟' },
  { lang: 'ar', text: 'اكتبلي رسالة اعتذار لمديري عن التأخير' },
  { lang: 'ar', text: 'SEARCH_ME مين فاز بمباراة امبارح؟' },
  { lang: 'ar', text: 'LONG_ANSWER اكتبلي تقرير مفصل عن سوق العمل في الأردن مع جداول وتحليل.', max: 4000 }
];

async function main() {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const llmService = createLlmService({
    groqKeys: Array.from({ length: cfg.groqKeys }, (_, i) => `g${i + 1}`),
    llm7Keys: Array.from({ length: cfg.llm7Keys }, (_, i) => `l${i + 1}`),
    llm7BaseUrl: 'https://api.llm7.io/v1',
    hasLlm7: true
  });
  const engine = createRoutingEngine({
    llmService,
    safeCalculate: null,
    searchService: { performSearch: async ({ rawQuery }) => { await new Promise((r) => setTimeout(r, 1500)); return { query: rawQuery, status: 'ok', results: [1, 2, 3, 4, 5].map((i) => ({ id: i, title: `Source ${i} about ${rawQuery}`, url: `https://news${i}.example/a`, content: 'Kylian Mbappé leads the scoring chart this season with 12 goals. '.repeat(6) })) }; } },
    keys: { groq: cfg.groqKeys, llm7: cfg.llm7Keys, qwen: 0, kimi: 0 },
    models: {
      groqFlash: 'openai/gpt-oss-20b', groqText: 'openai/gpt-oss-120b', groqCode: 'openai/gpt-oss-120b',
      groqVision: 'meta-llama/llama-4-scout-17b-16e-instruct',
      llm7Flash: 'minimax-m2.7', llm7Text: 'minimax-m2.7', llm7Code: 'minimax-m2.7'
    }
  });

  const results = [];
  const history = [];
  for (const [i, turn] of SESSION.entries()) {
    const userTurns = [...history.filter((m) => m.role === 'user'), { role: 'user', content: turn.text }];
    const system = buildChatSystemPrompt({ mode: 'flash', arabic: turn.lang === 'ar' || history.length > 0, needs: detectNeeds(userTurns), runtimeLine: 'Friday 26 September 2026 (approximate location: Amman; time zone: Asia/Amman)' });
    const messages = [{ role: 'system', content: system }, ...history.slice(-4), { role: 'user', content: turn.text }];
    const started = Date.now();
    const before = log.length;
    let res;
    try {
      res = await engine.callAgent({ mode: 'flash', messages, max_tokens: turn.max || 2000, onChunk: () => {} });
      if (res.ok && engine.completeIfTruncated) res = await engine.completeIfTruncated({ ai: res, messages, temperature: 0.5, max_tokens: turn.max || 2000 });
    } catch (e) { res = { ok: false, error: 'threw: ' + e.message }; }
    const ms = Date.now() - started;
    const calls = log.slice(before);
    const answeredBy = res.ok ? String(res.answer || '').split(' ')[0] : '';
    results.push({ i: i + 1, ok: Boolean(res.ok), ms, by: answeredBy, calls: calls.map((c) => `${c.provider}${c.provider === 'groq' ? (c.model.includes('scout') ? 'S' : '') : ''}:${c.status || '…'}`).join(' '), error: res.ok ? '' : String(res.error || '').replace(/Request too large[^\]]*?(?=\s\[|$)/, 'TOO LARGE…').slice(0, 140) });
    history.push({ role: 'user', content: turn.text }, { role: 'assistant', content: res.ok ? String(res.answer || '').slice(0, 1500) : '...' });
    await new Promise((r) => setTimeout(r, cfg.thinkMs));
  }
  const okCount = results.filter((r) => r.ok).length;
  const p = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`\n=== ${label} ${JSON.stringify(cfg)}`);
  for (const r of results) console.log(`${String(r.i).padStart(2)} ${r.ok ? 'OK  ' : 'FAIL'} ${String(Math.round(r.ms / 100) / 10).padStart(5)}s  ${r.by.padEnd(24)} ${r.calls}${r.error ? '\n        ' + r.error : ''}`);
  console.log(`SUMMARY ${label}: ${okCount}/${results.length} answered, median ${Math.round(p(results.map((r) => r.ms)) / 100) / 10}s, total calls ${log.length}, groq 429s ${log.filter((c) => c.provider === 'groq' && c.status === 429).length}, groq 413s ${log.filter((c) => c.provider === 'groq' && c.status === 413).length}`);
  server.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

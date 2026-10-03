// Measures what one message from the real page actually sends to a model:
// the real page in Chromium, the real server, and a capturing stand-in for the
// provider. Prints tokens per part (system prompt, the page's own system
// message, history, tools, answer room) for a few representative messages.
//
//   node tests/browser/measure-request.js
//
// Not a test: a measurement, run before and after changing what the prompt
// carries. Token counts use the o200k encoding when gpt-tokenizer is
// installed, otherwise characters / 4.
//
// QJO_ONLY=<regex> measures only the messages whose label matches it, and
// QJO_FRESH=1 sends each one in a new chat (what a first message costs).
//
// The messages are one conversation, answered at a realistic length
// (QJO_REPLY_CHARS, default 2400), so each request also says how much of it
// opens exactly as an earlier one did. Groq caches that repeated opening for
// the gpt-oss models, and cached tokens do not count toward its rate limits:
// "new" is what a request really spends. The rendering assumed is the
// template's: the first system message and the tools, then every other
// message in order.
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { launchOptions, REPO_ROOT } = require('./harness');

let encode = null;
try { ({ encode } = require(process.env.QJO_TOKENIZER || 'gpt-tokenizer/cjs/encoding/o200k_base')); } catch (_) { /* estimate */ }
const tokens = (text) => (encode ? encode(String(text || '')).length : Math.ceil(String(text || '').length / 4));

const captured = [];
const REPLY_CHARS = Number(process.env.QJO_REPLY_CHARS) || 2400;
const REPLY = {
  ar: 'هذه إجابة تجريبية بطول واقعي تشرح الفكرة خطوة بخطوة مع أمثلة وتفاصيل. ',
  en: 'This is a stand-in answer of realistic length, explaining the idea step by step with examples. '
};
const replyFor = (body) => {
  const last = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  const text = typeof last?.content === 'string' ? last.content : '';
  const unit = /[\u0600-\u06FF]/.test(text) ? REPLY.ar : REPLY.en;
  return unit.repeat(Math.ceil(REPLY_CHARS / unit.length)).slice(0, REPLY_CHARS);
};
const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    captured.push(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: replyFor(body) } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});

const MESSAGES = [
  ['greeting (ar)', 'كيفك'],
  ['question needing search (ar)', 'مين هداف ريال مدريد الحالي؟'],
  ['explanation (ar)', 'اشرحلي الفرق بين الذكاء الاصطناعي وتعلم الآلة'],
  ['long request (ar)', 'اكتبلي خطة مشروع تفصيلية كاملة لتطبيق توصيل طلبات في عمّان، مع كل المراحل والميزانية والمخاطر وخطة التسويق'],
  ['question (en)', 'Explain recursion with a short example'],
  ['interface (ar)', 'صمملي موقع شخصي لمصمم جرافيك'],
  ['interface (en)', 'Build me a landing page for my cafe in React'],
  ['physics problem (ar)', 'سيارة تتسارع من السكون بتسارع 3.2 م/ث² لمدة 12 ثانية، احسب سرعتها النهائية والمسافة'],
  ['dose calculation (en)', 'A child weighs 18 kg and the dose is 15 mg/kg every 6 hours. How many mL of a 120 mg/5 mL syrup per dose?'],
  ['python plot (ar)', 'اكتبلي كود بايثون يرسم منحنى المبيعات الشهرية'],
  ['python analysis (en)', 'Write Python to analyse a year of monthly sales and plot the trend']
];

// The request as the model's template lays it out.
const render = (body) => (body.messages || []).map((m, i) => {
  const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  return `<${m.role}>${text}${i === 0 && body.tools ? JSON.stringify(body.tools) : ''}`;
}).join('');
const sharedPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return a.slice(0, i); };
const totals = { input: 0, fresh: 0 };

function describe(label, body, earlier) {
  const parts = {};
  const add = (k, v) => { parts[k] = (parts[k] || 0) + v; };
  (body.messages || []).forEach((m, i) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (m.role === 'system') add(i === 0 ? 'system prompt' : 'other system', tokens(text));
    else add(m.role === 'user' && i === body.messages.length - 1 ? 'this message' : 'history', tokens(text));
  });
  if (body.tools) add('tools', tokens(JSON.stringify(body.tools)));
  const input = Object.values(parts).reduce((a, b) => a + b, 0);
  const seen = render(body);
  const reused = earlier.reduce((best, e) => Math.max(best, tokens(sharedPrefix(seen, render(e)))), 0);
  const fresh = Math.max(0, tokens(seen) - reused);
  totals.input += tokens(seen);
  totals.fresh += fresh;
  console.log(`\n${label}: ${input} tokens in, ${body.max_tokens} reserved for the answer → ${input + (body.max_tokens || 0)} against Groq's 8,000 a minute`);
  for (const [k, v] of Object.entries(parts)) console.log(`  ${String(v).padStart(6)}  ${k}`);
  console.log(`  ${String(fresh).padStart(6)}  new — the rest opens as an earlier request did (cacheable)`);
}

(async () => {
  // A count that does not say what it counted is how an estimate gets quoted
  // as a measurement.
  console.log(encode ? 'Tokens counted with o200k, the gpt-oss tokenizer.' : 'Tokens ESTIMATED as characters / 4 — gpt-tokenizer is not installed (npm ci --prefix tests/browser); Arabic is under-counted by about a quarter.');
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  const providerUrl = `http://127.0.0.1:${provider.address().port}/v1`;
  const port = 4100 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), GROQ_API_KEYS: '', GROQ_API_KEY: '', LLM7_API_KEYS: 'l1', LLM7_BASE_URL: providerUrl, QWEN_API_KEYS: '', KIMI_API_KEYS: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch (_) { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext({ locale: 'ar-JO' });
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

  const only = process.env.QJO_ONLY ? new RegExp(process.env.QJO_ONLY, 'i') : null;
  for (const [label, text] of MESSAGES.filter(([l]) => !only || only.test(l))) {
    if (process.env.QJO_FRESH) { await page.click('#newChatBtn'); await page.waitForTimeout(400); }
    const before = captured.length;
    await page.fill('#input', text);
    await page.click('#sendBtn');
    for (let i = 0; i < 60 && captured.length === before; i++) await page.waitForTimeout(250);
    await page.waitForTimeout(1500);
    if (captured.length === before) console.log(`\n${label}: nothing reached the provider`);
    else describe(label, captured[before], captured.slice(0, before));
  }
  console.log(`\nWhole conversation: ${totals.input} tokens sent, ${totals.fresh} new (${Math.round(100 * totals.fresh / Math.max(1, totals.input))}%) — the rest could come from Groq's cache.`);
  await browser.close();
  server.kill('SIGKILL');
  provider.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

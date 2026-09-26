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
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { launchOptions, REPO_ROOT } = require('./harness');

let encode = null;
try { ({ encode } = require(process.env.QJO_TOKENIZER || 'gpt-tokenizer/cjs/encoding/o200k_base')); } catch (_) { /* estimate */ }
const tokens = (text) => (encode ? encode(String(text || '')).length : Math.ceil(String(text || '').length / 4));

const captured = [];
const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    captured.push(body);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'OK — measured.' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});

const MESSAGES = [
  ['greeting (ar)', 'كيفك'],
  ['question needing search (ar)', 'مين هداف ريال مدريد الحالي؟'],
  ['explanation (ar)', 'اشرحلي الفرق بين الذكاء الاصطناعي وتعلم الآلة'],
  ['long request (ar)', 'اكتبلي خطة مشروع تفصيلية كاملة لتطبيق توصيل طلبات في عمّان، مع كل المراحل والميزانية والمخاطر وخطة التسويق'],
  ['question (en)', 'Explain recursion with a short example']
];

function describe(label, body) {
  const parts = {};
  const add = (k, v) => { parts[k] = (parts[k] || 0) + v; };
  (body.messages || []).forEach((m, i) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    if (m.role === 'system') add(i === 0 ? 'system prompt' : 'other system', tokens(text));
    else add(m.role === 'user' && i === body.messages.length - 1 ? 'this message' : 'history', tokens(text));
  });
  if (body.tools) add('tools', tokens(JSON.stringify(body.tools)));
  const input = Object.values(parts).reduce((a, b) => a + b, 0);
  console.log(`\n${label}: ${input} tokens in, ${body.max_tokens} reserved for the answer → ${input + (body.max_tokens || 0)} against Groq's 8,000 a minute`);
  for (const [k, v] of Object.entries(parts)) console.log(`  ${String(v).padStart(6)}  ${k}`);
}

(async () => {
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

  for (const [label, text] of MESSAGES) {
    const before = captured.length;
    await page.fill('#input', text);
    await page.click('#sendBtn');
    for (let i = 0; i < 60 && captured.length === before; i++) await page.waitForTimeout(250);
    await page.waitForTimeout(1500);
    if (captured.length === before) console.log(`\n${label}: nothing reached the provider`);
    else describe(label, captured[before]);
  }
  await browser.close();
  server.kill('SIGKILL');
  provider.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

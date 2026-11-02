#!/usr/bin/env node
// Asks the live Qjo (the deployed server, with its own keys: none here) the
// questions in a JSON file and prints each answer with the model, tools and
// time it took. The answers are for scoring in a scratch directory: they are
// not committed, and the questions are invented, never a person's own.
//
// Usage: node .claude/company/ask-qjo.js questions.json [--out answers.json]
//   questions.json: ["question", ...] or [{ "id", "q", "history": [...] }]
// QJO_BASE_URL overrides the address. At most 12 questions a run, 6 seconds
// apart: it spends the same free provider minute real people use.
'use strict';
const fs = require('fs');

const BASE = String(process.env.QJO_BASE_URL || 'https://qjo-ai-1.onrender.com').replace(/\/$/, '');
const MAX = 12;
const GAP_MS = 6000;

async function ask(item) {
  const messages = [...(item.history || []), { role: 'user', content: item.q }];
  const started = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 2000) }; }
  return {
    id: item.id, q: item.q, status: res.status, ms: Date.now() - started,
    model: data.model || null, provider: data.provider || null,
    tools: (data.toolsUsed || []).map((t) => t.tool),
    answer: data.answer || data.error || data.raw || '',
  };
}

(async () => {
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const outAt = process.argv.indexOf('--out');
  if (!file) { console.error('usage: ask-qjo.js questions.json [--out answers.json]'); process.exit(2); }
  const list = JSON.parse(fs.readFileSync(file, 'utf8'))
    .map((x, i) => (typeof x === 'string' ? { id: String(i + 1), q: x } : { id: String(x.id ?? i + 1), ...x }));
  if (list.length > MAX) { console.error(`at most ${MAX} questions a run (got ${list.length})`); process.exit(2); }
  const out = [];
  for (const [i, item] of list.entries()) {
    if (i) await new Promise((r) => setTimeout(r, GAP_MS));
    let row;
    try { row = await ask(item); } catch (e) { row = { id: item.id, q: item.q, status: 0, error: String(e.message || e) }; }
    out.push(row);
    console.log(`[${row.id}] ${row.status} ${row.ms || '-'}ms ${row.model || ''} tools=${(row.tools || []).join(',')}\n${String(row.answer || row.error).slice(0, 600)}\n`);
  }
  if (outAt > 0 && process.argv[outAt + 1]) fs.writeFileSync(process.argv[outAt + 1], JSON.stringify(out, null, 2));
  const failed = out.filter((r) => r.status !== 200 || !String(r.answer || '').trim()).length;
  console.log(`${out.length - failed} answered, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

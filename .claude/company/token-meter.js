#!/usr/bin/env node
// Token meter for the company: reads the session transcripts Claude Code
// writes (~/.claude/projects/<repo>/*.jsonl and their subagents/), counts every
// API response once (by message id), and sums it per model and per window.
// Usage: node .claude/company/token-meter.js [--since ISO] [--until ISO] [--images]
//        node .claude/company/token-meter.js --estimate   (the officer's reading)
// It sees only this container's transcripts: the owner's own use elsewhere is
// not in it, which is what the stop margin (60% / 55%) is for.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const since = opt('--since') ? Date.parse(opt('--since')) : 0;
const until = opt('--until') ? Date.parse(opt('--until')) : Infinity;
const root = opt('--dir') || path.join(os.homedir(), '.claude', 'projects', '-home-user-qjo-ai');

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (entry.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

const seen = new Set();
const calls = [];
const byModel = {};
const images = [];
for (const file of files(root)) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const at = Date.parse(row.timestamp || '');
    if (!(at >= since && at < until)) continue;
    const msg = row.message;
    if (row.type === 'user' && !row.isSidechain && Array.isArray(msg && msg.content)
      && msg.content.some((part) => part && part.type === 'image')) images.push(row.timestamp);
    const usage = msg && msg.usage;
    if (!usage || !msg.id || seen.has(msg.id)) continue;
    seen.add(msg.id);
    const model = msg.model || 'unknown';
    const sum = byModel[model] || (byModel[model] = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 });
    calls.push({ at, model, usage });
    sum.calls += 1;
    sum.input += usage.input_tokens || 0;
    sum.cacheWrite += usage.cache_creation_input_tokens || 0;
    sum.cacheRead += usage.cache_read_input_tokens || 0;
    sum.output += usage.output_tokens || 0;
  }
}
if (args.includes('--estimate')) {
  const cal = JSON.parse(fs.readFileSync(path.join(__dirname, 'calibration.json'), 'utf8'));
  const weight = (model) => Object.entries(cal.modelWeight).find(([k]) => model.includes(k))?.[1] || 0;
  const units = (c) => weight(c.model) * ((c.usage.input_tokens || 0) + 1.25 * (c.usage.cache_creation_input_tokens || 0)
    + 0.1 * (c.usage.cache_read_input_tokens || 0) + 5 * (c.usage.output_tokens || 0)) / 1e6;
  calls.sort((a, b) => a.at - b.at);
  // The owner's screenshot names when the window resets; after that, a new
  // 5-hour window opens on the first call after the last one closed.
  const now = Date.now();
  let start = Date.parse(cal.lastReading.sessionResets) - 5 * 3600e3;
  for (const c of calls) if (c.at >= start + 5 * 3600e3) start = c.at;
  if (now >= start + 5 * 3600e3) start = now;
  // The week resets Wednesday 20:00 UTC.
  const week = new Date(now);
  week.setUTCHours(20, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() - 3 + 7) % 7));
  if (week.getTime() > now) week.setUTCDate(week.getUTCDate() - 7);
  const last = cal.lastReading;
  const lastAt = Date.parse(last.at);
  const sumSince = (t) => calls.filter((c) => c.at >= t).reduce((n, c) => n + units(c), 0);
  // From the owner's last reading when it is inside the window, else from zero.
  const session = lastAt >= start ? last.session + sumSince(lastAt) / cal.unitsPerSessionPoint
    : sumSince(start) / cal.unitsPerSessionPoint;
  const weekly = lastAt >= week.getTime() ? last.weekly + sumSince(lastAt) / cal.unitsPerWeeklyPoint
    : sumSince(week.getTime()) / cal.unitsPerWeeklyPoint;
  const out = {
    session: Math.round(session), sessionResets: new Date(start + 5 * 3600e3).toISOString(),
    weekly: Math.round(weekly), weeklyResets: new Date(week.getTime() + 7 * 864e5).toISOString(),
    stop: session >= cal.stopAt.session || weekly >= cal.stopAt.weekly,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.stop ? 3 : 0);
}
const total = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
for (const sum of Object.values(byModel)) for (const k of Object.keys(total)) total[k] += sum[k];
const report = { since: since ? new Date(since).toISOString() : null, until: Number.isFinite(until) ? new Date(until).toISOString() : null, byModel, total };
if (args.includes('--images')) report.screenshots = images.sort();
console.log(JSON.stringify(report, null, 2));

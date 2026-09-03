#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// kb-validate — health check for the Qjo Knowledge Base directory.
//
//   npm run kb:validate
//
// Checks every qkb-*.json file for: valid JSON, required fields per layer,
// duplicate ids (cross-file), trigger/keyword sanity, size caps, and reports
// the layer/domain distribution plus progress toward the entry-count target.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const KB_DIR = path.join(__dirname, '..', 'knowledge');
const TARGET = Number(process.env.KB_TARGET || 5000);

let errors = 0;
let warnings = 0;
const err = (msg) => { errors++; console.error(`  ✗ ${msg}`); };
const warn = (msg) => { warnings++; console.warn(`  ⚠ ${msg}`); };

const files = fs.readdirSync(KB_DIR).filter(f => /^qkb-.*\.json$/.test(f)).sort();
if (!files.length) { console.error('✗ No qkb-*.json files found'); process.exit(1); }

const allIds = new Set();
const layerCounts = {};
const domainCounts = {};
let total = 0;

console.log(`Validating ${files.length} knowledge files in ${path.relative(process.cwd(), KB_DIR)}\n`);

for (const file of files) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(KB_DIR, file), 'utf8'));
  } catch (e) {
    err(`${file}: invalid JSON — ${e.message}`);
    continue;
  }
  const layer = raw.layer === 'facts' ? 'facts' : 'taskcraft';
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  if (!entries.length) { err(`${file}: no entries`); continue; }
  let fileCount = 0;

  for (const e of entries) {
    const label = `${file} → ${e?.id || '(no id)'}`;
    if (!e || typeof e !== 'object') { err(`${label}: not an object`); continue; }
    if (!e.id || typeof e.id !== 'string') { err(`${label}: missing id`); continue; }
    if (!e.domain || typeof e.domain !== 'string') { err(`${label}: missing domain`); continue; }
    if (!Array.isArray(e.triggers) || e.triggers.length < 2) { err(`${label}: needs ≥2 triggers`); continue; }
    if (!Array.isArray(e.keywords) || e.keywords.length < 2) { warn(`${label}: fewer than 2 keywords`); continue; }
    if (layer === 'facts' ? !e.answer : !e.guidance) { err(`${label}: missing ${layer === 'facts' ? 'answer' : 'guidance'}`); continue; }
    const long1 = layer === 'facts' ? e.answer : e.guidance;
    if (String(long1).length > 1600) warn(`${label}: ${layer === 'facts' ? 'answer' : 'guidance'} over 1600 chars`);
    const ns = e.id.includes(':') ? e.id : `${layer === 'facts' ? 'f' : 't'}:${e.id}`;
    if (allIds.has(ns)) { err(`${label}: duplicate id "${ns}"`); continue; }
    allIds.add(ns);
    layerCounts[layer] = (layerCounts[layer] || 0) + 1;
    domainCounts[e.domain] = (domainCounts[e.domain] || 0) + 1;
    fileCount++;
    total++;
  }
  console.log(`  ${file}: ${fileCount} entries (${layer})`);
}

console.log(`\nTotal unique entries: ${total} / target ${TARGET} (${((total / TARGET) * 100).toFixed(1)}%)`);
console.log('Layers:', JSON.stringify(layerCounts));
console.log('Top domains:', Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, c]) => `${d}(${c})`).join(' '));

if (errors) { console.error(`\n✗ ${errors} error(s), ${warnings} warning(s)`); process.exit(1); }
console.log(`\n✓ Knowledge base valid (${warnings} warning(s)).`);

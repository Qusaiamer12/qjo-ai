#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Secret scanner — fails the build if a credential is about to be committed.
//
//   node scripts/scan-secrets.js            # scan tracked files
//   node scripts/scan-secrets.js --staged   # scan only staged changes (pre-commit)
//
// This exists because a live GitHub PAT was once pasted into a chat window.
// Push protection on GitHub's side is a backstop, not a plan: it only covers
// providers GitHub knows, and it fires after the secret is already in a commit
// object. Catching it locally keeps it out of history entirely.
// ─────────────────────────────────────────────────────────────────────────────

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const stagedOnly = process.argv.includes('--staged');

// Each pattern is anchored on a provider-specific prefix plus a length floor,
// which keeps false positives near zero without needing entropy heuristics.
const PATTERNS = [
  { name: 'GitHub personal access token', re: /\bghp_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub OAuth / app token', re: /\bgh[ousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'Groq API key', re: /\bgsk_[A-Za-z0-9]{40,}\b/ },
  { name: 'OpenAI / OpenRouter key', re: /\bsk-(?:or-)?[A-Za-z0-9-_]{32,}\b/ },
  { name: 'Google / Firebase API key', re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: 'Tavily API key', re: /\btvly-[A-Za-z0-9]{20,}\b/ },
  { name: 'NVIDIA API key', re: /\bnvapi-[A-Za-z0-9_-]{30,}\b/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  // A real service account always ships a private_key. Requiring it avoids
  // flagging the '{"type":"service_account",...}' placeholders in the docs.
  { name: 'Firebase service account JSON', re: /"type"\s*:\s*"service_account"[\s\S]{0,400}?"private_key"\s*:\s*"-----BEGIN/ }
];

// Known-public values that legitimately live in the source tree.
const ALLOWED = [
  // Firebase Web API key: public by design, protected by Firestore rules.
  'AIzaSyBo902a2kkFRla-asU2nAzFkBaDW7yJTVI'
];

const SKIP_FILES = new Set(['package-lock.json', 'scripts/scan-secrets.js']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.zip', '.woff', '.woff2', '.ttf']);

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function targetFiles() {
  const out = stagedOnly
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACM'])
    : git(['ls-files']);
  return out.split('\n').map(f => f.trim()).filter(Boolean);
}

function scan() {
  const findings = [];
  for (const file of targetFiles()) {
    if (SKIP_FILES.has(file)) continue;
    if (SKIP_EXT.has(path.extname(file).toLowerCase())) continue;

    const abs = path.join(ROOT, file);
    let content;
    try {
      if (!fs.existsSync(abs) || fs.statSync(abs).size > 8 * 1024 * 1024) continue;
      content = fs.readFileSync(abs, 'utf8');
    } catch (_) { continue; }
    if (content.includes('\u0000')) continue; // binary

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ALLOWED.some(a => line.includes(a))) continue;
      for (const { name, re } of PATTERNS) {
        const hit = line.match(re);
        if (!hit) continue;
        const masked = hit[0].slice(0, 7) + '…' + hit[0].slice(-4);
        findings.push({ file, line: i + 1, name, masked });
      }
    }
  }
  return findings;
}

const findings = scan();

if (!findings.length) {
  console.log(`✅ No secrets detected (${stagedOnly ? 'staged changes' : 'tracked files'}).`);
  process.exit(0);
}

console.error('\n🔴 POSSIBLE SECRETS DETECTED — commit blocked\n');
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.name}  →  ${f.masked}`);
}
console.error(`
Next steps:
  1. REVOKE the credential at the provider. Assume it is already compromised.
  2. Remove it from the file and use an environment variable instead.
  3. If it is already committed, rewriting history is not enough on its own —
     revoke first, always.

If this is a false positive, add the literal to ALLOWED in scripts/scan-secrets.js
with a comment explaining why it is safe to publish.
`);
process.exit(1);

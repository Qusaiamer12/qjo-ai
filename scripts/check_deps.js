#!/usr/bin/env node
// Verifies that every relative require() in the server tree resolves to a real
// file. It used to hard-code an entry list that still named src/routes/qcode.js
// and src/routes/qspark.js, so it crashed with ENOENT after those products were
// split into their own repos. It now walks the tree instead, which cannot go
// stale the next time a module moves.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.js')) out.push(full);
  }
  return out;
}

function resolves(fromFile, requirePath) {
  const base = path.join(path.dirname(fromFile), requirePath);
  return fs.existsSync(base) || fs.existsSync(`${base}.js`) || fs.existsSync(path.join(base, 'index.js'));
}

const files = [path.join(ROOT, 'server.js'), ...walk(path.join(ROOT, 'src'))];
let missing = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
    if (!resolves(file, match[1])) {
      console.error(`MISSING IN ${path.relative(ROOT, file)}: ${match[1]}`);
      missing++;
    }
  }
}

console.log(missing
  ? `\n❌ ${missing} unresolved relative require(s) across ${files.length} files.`
  : `✅ All relative requires resolve across ${files.length} files.`);

process.exit(missing ? 1 : 0);

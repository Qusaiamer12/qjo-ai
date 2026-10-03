// The Python packages Qjo's code runs with, fetched once for the suites that
// run real Python: numpy, pandas, matplotlib and sympy with what they depend
// on, at the versions pyodide-lock.json names for the Pyodide the app loads,
// each checked against the lock's SHA-256. Saved in .pyodide-cache/ (not
// committed); a file already there with the right hash is not fetched again.
//
//   node tests/browser/fetch-pyodide.js
//
// The suites serve Pyodide's own files from node_modules/pyodide and these
// from the cache, at the address the app asks for: the browser reaches no
// CDN in a test. A package missing from the cache fails the suite by name.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PYODIDE = path.join(__dirname, 'node_modules', 'pyodide');
const CACHE = path.join(__dirname, '.pyodide-cache');
const WANTED = ['numpy', 'pandas', 'matplotlib', 'sympy'];
const CORE = ['pyodide.js', 'pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

function packagesFor(lock, names) {
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    if (!lock.packages[name]) throw new Error(`pyodide-lock.json has no package "${name}"`);
    seen.add(name);
    for (const dep of lock.packages[name].depends || []) visit(dep);
  };
  names.forEach(visit);
  return [...seen].sort().map((name) => lock.packages[name]);
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  const { version } = require(path.join(PYODIDE, 'package.json'));
  const lock = JSON.parse(fs.readFileSync(path.join(PYODIDE, 'pyodide-lock.json'), 'utf8'));
  const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
  fs.mkdirSync(CACHE, { recursive: true });
  let fetched = 0;
  let bytes = 0;
  for (const pkg of packagesFor(lock, WANTED)) {
    const file = path.join(CACHE, pkg.file_name);
    if (fs.existsSync(file) && sha256(file) === pkg.sha256) { bytes += fs.statSync(file).size; continue; }
    let body = null;
    for (let attempt = 1; attempt <= 4 && !body; attempt++) {
      try {
        const res = await fetch(base + pkg.file_name);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        body = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        if (attempt === 4) throw new Error(`${pkg.file_name}: ${err.message}`);
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      }
    }
    const got = crypto.createHash('sha256').update(body).digest('hex');
    if (got !== pkg.sha256) throw new Error(`${pkg.file_name}: SHA-256 ${got} is not the lock's ${pkg.sha256}`);
    fs.writeFileSync(file, body);
    fetched++;
    bytes += body.length;
  }
  // Pyodide's own files beside them: the cache is the part of the CDN's
  // directory the app uses, loadable from one place in Node and the browser.
  for (const file of CORE) fs.copyFileSync(path.join(PYODIDE, file), path.join(CACHE, file));
  console.log(`Pyodide ${version}: ${packagesFor(lock, WANTED).length} packages in .pyodide-cache (${fetched} fetched now, ${(bytes / 1e6).toFixed(1)} MB in all).`);
}

module.exports = { CACHE, PYODIDE, WANTED, CORE, packagesFor };

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });

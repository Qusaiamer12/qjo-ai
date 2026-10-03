// Pyodide and its packages served from tests/browser/.pyodide-cache at the
// address the app asks for (sandbox.js's PYODIDE_INDEX_URL): real Python in
// the page, with no CDN reached. Refuses to serve a cache that is not there.
'use strict';

const fs = require('fs');
const path = require('path');
const { CACHE } = require('./fetch-pyodide');

const TYPES = { '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.zip': 'application/zip', '.whl': 'application/zip' };

/**
 * @param {import('playwright').BrowserContext} context
 * @param {string} indexURL the Pyodide address the app loads from
 */
async function serveRealPyodide(context, indexURL) {
  if (!fs.existsSync(path.join(CACHE, 'pyodide.asm.wasm'))) {
    throw new Error('Real Python is not here: tests/browser/.pyodide-cache is empty. Run: node tests/browser/fetch-pyodide.js');
  }
  const served = [];
  await context.route(indexURL + '**', (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop());
    const file = path.join(CACHE, name);
    if (!name || !fs.existsSync(file)) { served.push(`missing:${name}`); return route.fulfill({ status: 404, body: 'not in the cache' }); }
    served.push(name);
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(name)] || 'application/octet-stream', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
  });
  return served;
}

module.exports = { serveRealPyodide };

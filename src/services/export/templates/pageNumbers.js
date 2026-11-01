// Which page each heading landed on, read out of a PDF Chromium printed.
//
// A contents list needs page numbers, and CSS cannot ask where a heading
// fell. Chromium keeps every in-page link target as a named destination in
// the file's catalogue (`/Dests`: name → [page object, /XYZ, …]) and lists the
// page objects in order (`/Pages … /Kids`), so the first print, whose contents
// list links to each heading by id, says it. Nothing runs in the printed page.
//
// Skia writes both as plain objects. If a future build packs them away this
// finds nothing and returns null — the caller then prints the contents list
// without page numbers rather than with wrong ones — and the suites that print
// a template with Chromium fail by name.
'use strict';

/** The body of indirect object `n`, or null. */
function objectBody(text, n) {
  const m = new RegExp(`(?:^|[\\r\\n])${n} 0 obj\\s*([\\s\\S]*?)\\bendobj`).exec(text);
  return m ? m[1] : null;
}

/** The page objects in order, following /Kids through any /Pages nodes. */
function pageObjects(text, node) {
  const body = objectBody(text, node);
  if (!body) return [];
  const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body);
  if (!kids) return /\/Type\s*\/Page\b(?!s)/.test(body) ? [node] : [];
  return [...kids[1].matchAll(/(\d+) 0 R/g)].flatMap((k) => pageObjects(text, Number(k[1])));
}

/**
 * @param {Uint8Array|Buffer} pdf
 * @returns {Map<string, number>|null} destination name → page, from 1
 */
function destinationPages(pdf) {
  const text = Buffer.from(pdf).toString('latin1');
  const catalog = /\/Type\s*\/Catalog\b[^]*?\/Pages\s+(\d+) 0 R/.exec(text) || /\/Pages\s+(\d+) 0 R[^]*?\/Type\s*\/Catalog\b/.exec(text);
  const dests = /\/Dests\s+(\d+) 0 R/.exec(text);
  if (!catalog || !dests) return null;
  const pages = pageObjects(text, Number(catalog[1]));
  const table = objectBody(text, Number(dests[1]));
  if (!pages.length || !table) return null;
  const found = new Map();
  for (const m of table.matchAll(/\/([^\s/[\]<>()]+)\s*\[\s*(\d+) 0 R/g)) {
    const at = pages.indexOf(Number(m[2]));
    if (at >= 0) found.set(m[1], at + 1);
  }
  return found.size ? found : null;
}

module.exports = { destinationPages };

// The outline of a document: its headings, which one is the title, how deep
// the contents list goes, how sections are numbered and which headings open a
// chapter. One reading for the PDF (headings found in the HTML that is
// printed) and for Word (headings found in the Markdown blocks), so both
// files number and list the same way.
'use strict';

/** How many levels below the top one the contents list shows. */
const TOC_DEPTH = 2;

const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
const decode = (s) => s.replace(/&(?:amp|lt|gt|quot|#039);/g, (m) => entities[m]);
const sameText = (a, b) => {
  const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const x = norm(a); const y = norm(b);
  return Boolean(x) && Boolean(y) && (x === y || x.startsWith(y) || y.startsWith(x));
};

/**
 * @typedef {{index: number, level: number, text: string, depth: number, number: string, chapter: number, listed: boolean}} Entry
 * @typedef {{title: string, titleIndex: number, base: number, entries: Entry[]}} Outline
 */

/**
 * @param {Array<{level: number, text: string}>} headings in document order
 * @param {string} title the document's title
 * @returns {Outline} `titleIndex` is the heading that only repeats the title
 *   (-1 if none): the cover carries it, the body does not.
 */
function planOutline(headings, title) {
  const titleIndex = headings.length && headings[0].level === 1 && sameText(headings[0].text, title) ? 0 : -1;
  const body = headings.map((h, index) => ({ ...h, index })).filter((h) => h.index !== titleIndex);
  const base = body.length ? Math.min(...body.map((h) => h.level)) : 1;
  const counters = [0, 0, 0, 0, 0, 0];
  let chapter = 0;
  const entries = body.map((h) => {
    const depth = Math.min(5, h.level - base);
    counters[depth] += 1;
    for (let d = depth + 1; d < counters.length; d++) counters[d] = 0;
    if (depth === 0) chapter += 1;
    return { index: h.index, level: h.level, text: h.text, depth, number: counters.slice(0, depth + 1).join('.'), chapter, listed: depth <= TOC_DEPTH };
  });
  return { title: titleIndex === 0 ? headings[0].text : title, titleIndex, base, entries };
}

/** Headings in the printed HTML: [{level, text, start, end, inner}]. Level 1-6, as markdownToExportHtml writes them. */
function headingsOfHtml(html) {
  return [...html.matchAll(/<h([1-6]) dir="auto">([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]), start: m.index, end: m.index + m[0].length, inner: m[2],
    text: decode(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
  }));
}

/** The id a heading carries in the printed HTML, and the bookmark it carries in Word. */
const headingId = (index) => `qjo-h-${index}`;
const bookmarkName = (index) => `_Toc_qjo_${index}`;

module.exports = { planOutline, headingsOfHtml, headingId, bookmarkName, TOC_DEPTH };

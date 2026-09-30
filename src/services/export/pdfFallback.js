// The PDF when Chromium is not there to print one.
//
// It used to hand PDFKit the text as it was, which PDFKit cannot lay out for
// Arabic: English words and numbers came out as boxes (the one font it found
// had no Latin), Arabic words were glued together in the wrong order, tables
// were flattened into a line, code was dropped, and every page was followed
// by one holding only its footer.
//
// Here the answer is read into blocks (markdownModel.js), each character is
// drawn in the embedded font that has it, and each line is laid out the way a
// browser would: words wrapped in reading order, then placed right to left in
// an Arabic paragraph with English stretches kept left to right inside it.
'use strict';

const PDFDocument = require('pdfkit');
const fontkit = require('fontkit');
const fs = require('fs');
const { parseMarkdown, mathToText, runsText } = require('./markdownModel');
const { fontPath } = require('./fonts');

const PAGE = { width: 595.28, height: 841.89, margin: 56, top: 70, bottom: 62 };
const WIDTH = PAGE.width - PAGE.margin * 2;
const COLOR = { ink: '#0F172A', accent: '#123B7A', muted: '#64748B', link: '#1D4ED8', line: '#CBD5E1', zebra: '#F8FAFC', codeBg: '#F1F5F9', quoteBar: '#7B3FE4', white: '#FFFFFF' };

// Registered name → file. PDFKit keeps one font per PostScript name, and the
// Latin, Latin-extended and Greek cuts of Noto Sans share one: registered
// together, the Greek was silently swapped for the Latin and "Δ" drew as a
// box. So each name appears once here, and Greek letters come from the math
// font, which has them under its own name.
const FACES = {
  sans: 'noto-sans-latin-400-normal.woff', sansBold: 'noto-sans-latin-700-normal.woff',
  arabic: 'noto-naskh-arabic-arabic-400-normal.woff', arabicBold: 'noto-naskh-arabic-arabic-700-normal.woff',
  mono: 'noto-sans-mono-latin-400-normal.woff', math: 'noto-sans-math-latin-400-normal.woff'
};
// The order a character looks for a font in.
const CHAINS = {
  regular: ['sans', 'arabic', 'math'],
  bold: ['sansBold', 'arabicBold', 'math'],
  mono: ['mono', 'sans', 'arabic', 'math']
};
// Sub- and superscripts no embedded font has, spelled plainly — never a box:
// H₂O → H2O, e⁻ˣ → e^(-x).
const SUBSCRIPT = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ᵢ': 'i', 'ₙ': 'n', 'ₓ': 'x' };
const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x' };

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

let fontCache = null;
function loadedFonts() {
  if (!fontCache) {
    fontCache = {};
    for (const [name, file] of Object.entries(FACES)) fontCache[name] = fontkit.create(fs.readFileSync(fontPath(file)));
  }
  return fontCache;
}

/** The text cut into pieces, each in the first font of its chain that has it. */
function fontPieces(text, chain) {
  const fonts = loadedFonts();
  const has = (ch) => chain.some((name) => fonts[name].hasGlyphForCodePoint(ch.codePointAt(0)));
  const plain = String(text)
    .replace(/[₀-₎ₐₑᵢₙₓ]+/g, (run) => ([...run].every(has) ? run : [...run].map((c) => SUBSCRIPT[c] || c).join('')))
    .replace(/[⁰¹²³⁴-⁾ⁿⁱˣ]+/g, (run) => {
      if ([...run].every(has)) return run;
      const inner = [...run].map((c) => SUPERSCRIPT[c] || c).join('');
      return [...run].length > 1 ? `^(${inner})` : `^${inner}`;
    });
  const pieces = [];
  for (const ch of plain) {
    const face = chain.find((name) => fonts[name].hasGlyphForCodePoint(ch.codePointAt(0))) || chain[0];
    const last = pieces[pieces.length - 1];
    if (last && last.face === face) last.text += ch; else pieces.push({ face, text: ch });
  }
  return pieces;
}

// ── Line layout ───────────────────────────────────────────────────────────

/**
 * Words with their style and width, from the model's runs.
 * @returns {Array<{text: string, space: boolean, style: any, pieces: any[], width: number, dir: 'R'|'L'|'N'}>}
 */
function tokens(doc, runs, base) {
  const out = [];
  for (const run of runs) {
    if (run.break) { out.push({ text: '\n', space: false, newline: true, style: base, pieces: [], width: 0, dir: 'N' }); continue; }
    const style = { ...base, bold: base.bold || run.bold, italic: run.italic, code: run.code, link: run.link, math: run.math, color: run.link ? COLOR.link : run.code ? '#0F766E' : base.color };
    const text = run.math ? mathToText(run.text) : run.text;
    const chain = style.code ? CHAINS.mono : style.bold ? CHAINS.bold : CHAINS.regular;
    const token = (part, glue) => {
      const pieces = fontPieces(part, chain);
      const width = pieces.reduce((w, p) => w + doc.font(p.face).fontSize(style.size).widthOfString(p.text), 0);
      return { text: part, space: false, glue, style, pieces, width, dir: ARABIC.test(part) ? 'R' : LATIN.test(part) || /\d/.test(part) ? 'L' : 'N' };
    };
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { out.push({ text: part, space: true, style, pieces: [], width: spaceWidth(doc, style.size), dir: 'N' }); continue; }
      // A full stop or comma after a word takes the paragraph's direction,
      // not the word's: "مرحبا بالعالم." in English ends with the stop on the right.
      const m = style.code ? null : /^(.*?[^.,;:!?\u060C\u061B\u061F\u2026])([.,;:!?\u060C\u061B\u061F\u2026]+)$/.exec(part);
      if (m) out.push(token(m[1], false), token(m[2], true)); else out.push(token(part, false));
    }
  }
  return out;
}

const spaceWidth = (doc, size) => doc.font('sans').fontSize(size).widthOfString(' ');

/** Greedy wrapping in reading order; a word wider than the line is cut. */
function wrap(doc, list, width) {
  const lines = [];
  let line = [];
  let used = 0;
  const push = () => { while (line.length && line[line.length - 1].space) line.pop(); lines.push(line); line = []; used = 0; };
  for (const token of list) {
    if (token.newline) { push(); continue; }
    if (token.space) { if (line.length) { line.push(token); used += token.width; } continue; }
    if (token.glue) { line.push(token); used += token.width; continue; }
    if (used + token.width > width && line.length) push();
    if (token.width > width) {
      // A long URL or identifier: cut it into pieces that fit.
      let rest = token.text;
      while (rest) {
        let n = rest.length;
        const pieceWidth = (k) => fontPieces(rest.slice(0, k), CHAINS.regular).reduce((w, p) => w + doc.font(p.face).fontSize(token.style.size).widthOfString(p.text), 0);
        while (n > 1 && pieceWidth(n) > width - used) n--;
        const text = rest.slice(0, n);
        line.push({ ...token, text, pieces: fontPieces(text, token.style.code ? CHAINS.mono : CHAINS.regular), width: pieceWidth(n) });
        rest = rest.slice(n);
        if (rest) push();
      }
      used = line.reduce((w, t) => w + t.width, 0);
      continue;
    }
    line.push(token);
    used += token.width;
  }
  if (line.length) push();
  return lines;
}

/**
 * A line in the order it is drawn, left to right. In a right-to-left line the
 * words run from the right, but a stretch of English or numbers keeps its own
 * order; a space or punctuation between two English words stays with them.
 */
function visualOrder(line, rtl) {
  const dirs = line.map((t) => t.dir);
  const resolved = dirs.map((d, i) => {
    if (d !== 'N') return d;
    const prev = dirs.slice(0, i).reverse().find((x) => x !== 'N');
    const next = dirs.slice(i + 1).find((x) => x !== 'N');
    return prev && prev === next ? prev : rtl ? 'R' : 'L';
  });
  const groups = [];
  line.forEach((token, i) => {
    const last = groups[groups.length - 1];
    if (last && last.dir === resolved[i]) last.tokens.push(token); else groups.push({ dir: resolved[i], tokens: [token] });
  });
  const ordered = rtl ? groups.reverse() : groups;
  return ordered.flatMap((g) => (g.dir === 'R' ? [...g.tokens].reverse() : g.tokens));
}

/**
 * One piece in one font. Digits always run left to right, but a run of
 * Arabic-Indic digits is laid out by the font as Arabic — right to left — so
 * "٨٠" would come out as "٠٨"; those are placed one at a time.
 */
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };

function drawPiece(doc, piece, x, y, { size, color, rtl = false, italic = false }) {
  doc.font(piece.face).fontSize(size).fillColor(color);
  // Inside right-to-left text a bracket is drawn mirrored, as a browser does:
  // "(قهوة)" opens on the right.
  if (rtl && !/^arabic/.test(piece.face)) piece = { ...piece, text: [...piece.text].map((c) => MIRROR[c] || c).join('') };
  const options = { lineBreak: false, oblique: italic && !rtl ? 12 : false };
  const parts = /[\u0660-\u0669\u06F0-\u06F9]{2,}/.test(piece.text) ? piece.text.split(/([\u0660-\u0669\u06F0-\u06F9]+)/) : [piece.text];
  let px = x;
  for (const part of parts) {
    if (!part) continue;
    const glyphs = /^[\u0660-\u0669\u06F0-\u06F9]+$/.test(part) ? [...part] : [part];
    for (const g of glyphs) { doc.text(g, px, y, options); px += doc.widthOfString(g); }
  }
  return px;
}

// ── The document ──────────────────────────────────────────────────────────

function createWriter(doc) {
  const w = { doc, y: PAGE.top };
  w.room = () => PAGE.height - PAGE.bottom - w.y;
  w.ensure = (height) => { if (height > w.room() && w.y > PAGE.top + 1) { doc.addPage(); w.y = PAGE.top; } };

  /** Lays out and draws runs in a box; returns its height. */
  w.text = (runs, { x = PAGE.margin, width = WIDTH, size = 11, rtl = false, bold = false, color = COLOR.ink, align = 'start', draw = true, lineGap = 0 } = {}) => {
    const list = tokens(doc, runs, { size, bold, color });
    const lines = wrap(doc, list, width);
    const lineHeight = size * (lineGap || (list.some((t) => t.dir === 'R') ? 1.75 : 1.5));
    if (!draw) return lines.length * lineHeight;
    for (const line of lines) {
      w.ensure(lineHeight);
      const order = visualOrder(line, rtl);
      const total = order.reduce((s, t) => s + t.width, 0);
      let cx = align === 'center' ? x + (width - total) / 2 : rtl ? x + width - total : x;
      for (const token of order) {
        if (!token.space) {
          if (token.style.code) doc.save().rect(cx - 1, w.y - 1, token.width + 2, size * 1.35).fill(COLOR.codeBg).restore();
          let px = cx;
          // An Arabic word's pieces (letters, then a full stop in another
          // font) are drawn from its end, which is on the left.
          const pieces = token.dir === 'R' ? [...token.pieces].reverse() : token.pieces;
          for (const piece of pieces) px = drawPiece(doc, piece, px, w.y, { size, color: token.style.color, rtl: token.dir === 'R', italic: token.style.italic });
          if (token.style.link) doc.link(cx, w.y, token.width, size * 1.3, token.style.link);
        }
        cx += token.width;
      }
      w.y += lineHeight;
    }
    return lines.length * lineHeight;
  };
  return w;
}

function drawHeading(w, block) {
  const size = [20, 16, 14, 12.5, 12, 12][block.level - 1];
  w.ensure(size * 3.2);
  w.y += size * 0.6;
  w.text(block.runs, { size, bold: true, color: COLOR.accent, rtl: block.rtl });
  w.y += size * 0.25;
}

function drawList(w, block) {
  let number = 0;
  for (const item of block.items) {
    number = item.level === 0 ? (item.ordered ? number + 1 : number) : number;
    const indent = 16 + item.level * 16;
    const marker = item.ordered ? `${item.level === 0 ? number : '·'}.` : ['•', '◦', '▪'][item.level % 3];
    const width = WIDTH - indent;
    const x = item.rtl ? PAGE.margin : PAGE.margin + indent;
    const height = w.text(item.runs, { x, width, rtl: item.rtl, draw: false });
    w.ensure(Math.min(height, 40));
    const markerX = item.rtl ? PAGE.margin + WIDTH - indent + 4 : PAGE.margin + indent - 13;
    w.doc.font(item.ordered ? 'sans' : 'math').fontSize(11).fillColor(COLOR.accent).text(marker, markerX, w.y, { lineBreak: false });
    w.text(item.runs, { x, width, rtl: item.rtl });
    w.y += 3;
  }
  w.y += 4;
}

function drawQuote(w, block) {
  const inner = WIDTH - 28;
  const height = w.text(block.runs, { x: PAGE.margin + 14, width: inner, rtl: block.rtl, color: COLOR.accent, draw: false });
  w.ensure(height + 12);
  const top = w.y;
  w.y += 6;
  w.text(block.runs, { x: PAGE.margin + 14, width: inner, rtl: block.rtl, color: COLOR.accent });
  const barX = block.rtl ? PAGE.margin + WIDTH - 3 : PAGE.margin;
  w.doc.save().rect(barX, top, 3, w.y - top + 4).fill(COLOR.quoteBar).restore();
  w.y += 10;
}

function drawCode(w, block) {
  const size = 9.5, lineHeight = size * 1.5, pad = 8;
  const lines = block.text.split('\n');
  const perLine = Math.floor((WIDTH - pad * 2) / w.doc.font('mono').fontSize(size).widthOfString('M'));
  const visual = lines.flatMap((l) => (l.length > perLine ? l.match(new RegExp(`.{1,${perLine}}`, 'g')) : [l]));
  let i = 0;
  if (block.lang) { w.ensure(lineHeight * 3); w.doc.font('mono').fontSize(8).fillColor(COLOR.muted).text(block.lang, PAGE.margin, w.y, { lineBreak: false }); w.y += 12; }
  while (i < visual.length) {
    w.ensure(lineHeight * 2 + pad * 2);
    const fit = Math.max(1, Math.floor((w.room() - pad * 2) / lineHeight));
    const chunk = visual.slice(i, i + fit);
    const height = chunk.length * lineHeight + pad * 2;
    w.doc.save().roundedRect(PAGE.margin, w.y, WIDTH, height, 4).fill(COLOR.codeBg).restore();
    let y = w.y + pad;
    for (const line of chunk) {
      let x = PAGE.margin + pad;
      // Code reads left to right; an Arabic comment inside it is drawn in its
      // own font, its words in right-to-left order.
      const order = visualOrder(tokens(w.doc, [{ text: line }], { size, color: COLOR.ink, code: true }).map((t) => ({ ...t, style: { ...t.style, code: false } })), false);
      for (const token of order) {
        for (const piece of token.dir === 'R' ? [...token.pieces].reverse() : token.pieces) x = drawPiece(w.doc, piece, x, y, { size, color: COLOR.ink, rtl: token.dir === 'R' });
        if (token.space) x += token.width;
      }
      y += lineHeight;
    }
    w.y += height + 8;
    i += chunk.length;
  }
}

function drawTable(w, block) {
  const rtl = block.rtl;
  const order = (row) => (rtl ? [...row].reverse() : row);
  const header = order(block.header);
  const rows = block.rows.map(order);
  const size = header.length > 6 ? 8.5 : 9.5, pad = 5;
  const weights = header.map((h, c) => Math.max(4, ...[h, ...rows.map((r) => r[c])].map((runs) => Math.min(30, runsText(runs).length))));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((wt) => (wt / total) * WIDTH);
  const rowHeight = (cells, bold) => Math.max(...cells.map((runs, c) => w.text(runs, { width: widths[c] - pad * 2, size, bold, rtl, draw: false }))) + pad * 2;
  const drawRow = (cells, { fill, bold, color }) => {
    const height = rowHeight(cells, bold);
    let x = PAGE.margin;
    const top = w.y;
    cells.forEach((runs, c) => {
      w.doc.save().rect(x, top, widths[c], height).fill(fill).restore();
      w.doc.save().lineWidth(0.6).strokeColor(COLOR.line).rect(x, top, widths[c], height).stroke().restore();
      w.y = top + pad;
      w.text(runs, { x: x + pad, width: widths[c] - pad * 2, size, bold, color, rtl });
      x += widths[c];
    });
    w.y = top + height;
  };
  const drawHeader = () => drawRow(header, { fill: COLOR.accent, bold: true, color: COLOR.white });
  w.ensure(rowHeight(header, true) + (rows[0] ? rowHeight(rows[0], false) : 0));
  drawHeader();
  rows.forEach((row, i) => {
    const height = rowHeight(row, false);
    if (height > w.room()) { w.doc.addPage(); w.y = PAGE.top; drawHeader(); }
    drawRow(row, { fill: i % 2 ? COLOR.zebra : COLOR.white, bold: false, color: COLOR.ink });
  });
  w.y += 12;
}

function drawBlock(w, block) {
  switch (block.type) {
    case 'heading': return drawHeading(w, block);
    case 'paragraph': w.text(block.runs, { rtl: block.rtl }); w.y += 7; return undefined;
    case 'list': return drawList(w, block);
    case 'quote': return drawQuote(w, block);
    case 'code': return drawCode(w, block);
    case 'table': return drawTable(w, block);
    case 'math': w.ensure(30); w.y += 4; w.text([{ text: block.tex, math: true }], { size: 13, align: 'center' }); w.y += 8; return undefined;
    case 'rule': w.ensure(14); w.doc.save().moveTo(PAGE.margin, w.y + 5).lineTo(PAGE.margin + WIDTH, w.y + 5).lineWidth(0.6).strokeColor(COLOR.line).stroke().restore(); w.y += 14; return undefined;
    default: return undefined;
  }
}

/** Header and footer on every page, drawn inside the page so none is added. */
function decoratePages(w, title, rtl) {
  const doc = w.doc;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins;
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    doc.save().moveTo(PAGE.margin, 46).lineTo(PAGE.margin + WIDTH, 46).lineWidth(0.5).strokeColor(COLOR.line).stroke().restore();
    w.y = 30;
    w.text([{ text: title }], { size: 8.5, color: COLOR.muted, rtl });
    const label = `${i + 1} / ${range.count}`;
    doc.font('sans').fontSize(8.5).fillColor(COLOR.muted).text(label, PAGE.margin, PAGE.height - 40, { width: WIDTH, align: 'center', lineBreak: false });
    doc.page.margins = saved;
  }
}

/**
 * @param {{title: string, content: string, rtl?: boolean, date?: Date}} input
 * @returns {Promise<Buffer>}
 */
function buildPdfFallback({ title, content, rtl: requestedRtl, date = new Date() }) {
  const { blocks, rtl } = parseMarkdown(content, { rtl: requestedRtl });
  const doc = new PDFDocument({ size: 'A4', margins: { top: PAGE.top, bottom: 0, left: PAGE.margin, right: PAGE.margin }, bufferPages: true, info: { Title: title, Creator: 'Qjo' } });
  for (const [name, file] of Object.entries(FACES)) doc.registerFont(name, fontPath(file));
  const done = new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const w = createWriter(doc);
  const titleRtl = ARABIC.test(title) ? true : LATIN.test(title) ? false : rtl;
  w.text([{ text: title }], { size: 22, bold: true, color: COLOR.accent, rtl: titleRtl });
  w.text([{ text: `Qjo • ${date.toISOString().slice(0, 10)}` }], { size: 9, color: COLOR.muted, rtl });
  w.y += 10;
  for (const block of blocks) drawBlock(w, block);
  decoratePages(w, title, titleRtl);
  doc.end();
  return done;
}

module.exports = { buildPdfFallback, visualOrder, fontPieces, FACES, CHAINS };

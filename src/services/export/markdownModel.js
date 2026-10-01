// One reading of an answer's Markdown for every exported file.
//
// Word, Excel, PowerPoint and the PDF fallback each had a parser of their own,
// and each got a different part wrong: a "# comment" inside a code block
// became a Word heading, a table's empty cell shifted the columns after it,
// "*italic*" and "> quote" reached the slides as raw symbols, and a line that
// merely contained "$" became an "equation". This reads the text once, into
// blocks with inline runs, and the exporters only decide how each looks.
//
// Direction: the page says which way the answer reads (req.body.rtl, judged
// from the answer's own text); without it, the same judgement is made here.
// Each paragraph also takes the
// direction of its first strong letter, the way dir="auto" does, so an English
// line in an Arabic answer stays left to right.
'use strict';

const { documentLanguage } = require('../../../public/domain/language');
const { createTranslator } = require('../../../public/domain/i18n');
const { IMAGE_DATA_URL } = require('./attachedImages');

const ARABIC_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

/**
 * @typedef {{text: string, bold?: boolean, italic?: boolean, strike?: boolean, code?: boolean, link?: string, math?: boolean, break?: boolean}} Run
 * @typedef {{type: 'heading', level: number, runs: Run[], rtl: boolean}
 *   | {type: 'paragraph', runs: Run[], rtl: boolean}
 *   | {type: 'quote', runs: Run[], rtl: boolean}
 *   | {type: 'list', items: Array<{level: number, ordered: boolean, runs: Run[], rtl: boolean}>}
 *   | {type: 'table', header: Run[][], rows: Run[][][], align: Array<'left'|'center'|'right'|null>, rtl: boolean}
 *   | {type: 'code', lang: string, text: string}
 *   | {type: 'math', tex: string}
 *   | {type: 'image', alt: string, src: string}
 *   | {type: 'rule'}} Block
 */

/** The direction of a text by its first strong letter; null when it has none. */
function firstStrongRtl(text) {
  for (const ch of String(text || '')) {
    if (ARABIC_LETTER.test(ch)) return true;
    if (LATIN_LETTER.test(ch)) return false;
  }
  return null;
}

/**
 * Whether a whole document reads right to left — judged the way the page
 * judges it (public/domain/language.js), so the two never disagree.
 */
function isMostlyRtl(text) {
  return documentLanguage(text) === 'ar';
}

// ── Inline ────────────────────────────────────────────────────────────────

// Inline math only when it looks like math: "$4.50 and $3" is money.
const INLINE_MATH = /^\$(?!\s)([^$\n]*?[\\^_{}=][^$\n]*?)(?<!\s)\$(?!\d)/;

/**
 * @param {string} text
 * @param {Omit<Run, 'text'>} [marks]
 * @returns {Run[]}
 */
// A callout ("> [!TIP]", "> 💡") is a quote with a title: the marker is
// replaced by the title in the document's language, in bold. It used to
// reach the file as "[!TIP]".
const CALLOUT = /^(?:\[!(tip|key|idea|hint|warning|caution|mistake|important|clinical|practice|practical|application|summary|tldr|takeaway|note|info)\]|(💡|⚠️?|🩺|📌|📝))\s*/i;
const CALLOUT_KIND = { tip: 'Tip', key: 'Tip', idea: 'Tip', hint: 'Tip', '💡': 'Tip', warning: 'Warning', caution: 'Warning', mistake: 'Warning', important: 'Warning', '⚠': 'Warning', '⚠️': 'Warning',
  clinical: 'Practice', practice: 'Practice', practical: 'Practice', application: 'Practice', '🩺': 'Practice', summary: 'Summary', tldr: 'Summary', takeaway: 'Summary', '📌': 'Summary', note: 'Note', info: 'Note', '📝': 'Note' };

/** @returns {Run[]} the callout's title, with its marker taken off the quote's first line */
function calloutTitle(quote, rtl) {
  const m = CALLOUT.exec(quote[0] || '');
  if (!m) return [];
  quote[0] = quote[0].slice(m[0].length);
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  return [{ text: `${t(`callout${CALLOUT_KIND[(m[1] || m[2]).toLowerCase()]}`)}${quote[0] ? ': ' : ''}`, bold: true }];
}

function parseInline(text, marks = {}) {
  const runs = [];
  let plain = '';
  const flush = () => { if (plain) { runs.push({ text: plain, ...marks }); plain = ''; } };
  let i = 0;
  const s = String(text || '');
  while (i < s.length) {
    const rest = s.slice(i);
    let m;
    if ((m = /^`([^`]+)`/.exec(rest))) {
      flush(); runs.push({ text: m[1], ...marks, code: true }); i += m[0].length; continue;
    }
    if ((m = /^\$\$([^$]+)\$\$/.exec(rest))) {
      flush(); runs.push({ text: m[1].trim(), ...marks, math: true }); i += m[0].length; continue;
    }
    if ((m = INLINE_MATH.exec(rest))) {
      flush(); runs.push({ text: m[1].trim(), ...marks, math: true }); i += m[0].length; continue;
    }
    // An image within a line is its description here: its data must never
    // reach the text (a lone image is a block of its own).
    if ((m = /^!\[([^\]\n]*)\]\([^)\s]+\)/.exec(rest))) {
      plain += m[1]; i += m[0].length; continue;
    }
    if ((m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/.exec(rest))) {
      flush(); runs.push(...parseInline(m[1], { ...marks, link: m[2] })); i += m[0].length; continue;
    }
    if ((m = /^(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/.exec(rest))) {
      flush(); runs.push(...parseInline(m[2], { ...marks, bold: true })); i += m[0].length; continue;
    }
    if ((m = /^~~(?=\S)([\s\S]+?)(?<=\S)~~/.exec(rest))) {
      flush(); runs.push(...parseInline(m[1], { ...marks, strike: true })); i += m[0].length; continue;
    }
    // Single * or _ for italics; an underscore inside a word (snake_case) is text.
    const before = s[i - 1] || ' ';
    if ((m = /^\*(?=\S)([^*]+?)(?<=\S)\*/.exec(rest)) || (!/\w/.test(before) && (m = /^_(?=\S)([^_]+?)(?<=\S)_(?!\w)/.exec(rest)))) {
      flush(); runs.push(...parseInline(m[1], { ...marks, italic: true })); i += m[0].length; continue;
    }
    if (s[i] === '\\' && /[\\`*_{}[\]()#+\-.!|$~>]/.test(s[i + 1] || '')) { plain += s[i + 1]; i += 2; continue; }
    plain += s[i];
    i++;
  }
  flush();
  return runs;
}

/** Plain text of runs, for places that cannot style (sheet names, notes). */
function runsText(runs) {
  return (runs || []).map((r) => (r.break ? '\n' : r.math ? mathToText(r.text) : r.text)).join('');
}

// ── Math as readable text ─────────────────────────────────────────────────

const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', lambda: 'λ',
  mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈',
  equiv: '≡', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', int: '∫', oint: '∮',
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', leftrightarrow: '↔', rightleftharpoons: '⇌',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀', exists: '∃', degree: '°', circ: '°',
  ldots: '…', cdots: '⋯', quad: ' ', qquad: '  ', ',': ' ', ';': ' ', '!': '', left: '', right: '', displaystyle: ''
};
const SUPER = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', i: 'ᵢ', n: 'ₙ', x: 'ₓ' };

function scriptOf(text, table, mark) {
  const chars = [...text];
  if (chars.every((c) => table[c])) return chars.map((c) => table[c]).join('');
  return chars.length === 1 ? mark + text : `${mark}(${text})`;
}

/**
 * LaTeX as the closest plain text: E = mc^2 → E = mc², \frac{a}{b} → (a)/(b).
 * Word and PowerPoint cannot typeset TeX here; readable Unicode beats raw
 * backslashes, and nothing is invented that the source did not say.
 */
function mathToText(tex) {
  // Chemistry (mhchem): a number after an element or bracket is a subscript.
  let s = String(tex || '').replace(/\\ce\s*\{([^{}]*)\}/g, (_, formula) =>
    formula.replace(/([A-Za-z)\]])(\d+)/g, (m, el, n) => el + [...n].map((d) => SUB[d]).join('')).replace(/->/g, '→').replace(/<=>/g, '⇌'));
  for (let pass = 0; pass < 4; pass++) {
    s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');
  }
  // Symbols first, so \infty in a superscript is ∞ and not a backslash. A
  // Greek letter swallows the space after it, as in TeX: \Delta G → ΔG.
  s = s.replace(/\\([A-Za-z]+|[,;!])( ?)/g, (whole, name, space) => {
    if (!(name in SYMBOLS)) return name + space;
    return SYMBOLS[name] + (/^[A-Za-z]+$/.test(name) && /[α-ωΑ-Ω]/.test(SYMBOLS[name]) ? '' : space);
  })
    .replace(/\^\{([^{}]*)\}|\^(\S)/g, (_, a, b) => scriptOf(a ?? b, SUPER, '^'))
    .replace(/_\{([^{}]*)\}|_(\S)/g, (_, a, b) => scriptOf(a ?? b, SUB, '_'))
    .replace(/[{}]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(([A-Za-z0-9α-ω]+)\)\/\(([A-Za-z0-9α-ω]+)\)/g, '$1/$2');
  return s.trim();
}

// ── Blocks ────────────────────────────────────────────────────────────────

/** Cells of a table row, keeping empty ones: "| a |  | c |" is three cells. */
function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '|') { cell += '|'; i++; continue; }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

// "| --- | :-: |": one dash or more, and a pipe, so a "---" rule under a line
// that happens to contain "|" stays a rule.
const isTableRule = (line) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('|');
const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)\s*([^\s`]*)/;

/** @returns {{block: Block, next: number}} */
function readTable(lines, start, defaultRtl) {
  const header = splitRow(lines[start]);
  const align = splitRow(lines[start + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : null));
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
    const cells = splitRow(lines[i]);
    // Every row as wide as the header: a short row is padded, never shifted.
    while (cells.length < header.length) cells.push('');
    rows.push(cells.slice(0, header.length).map((c) => parseInline(c)));
    i++;
  }
  const allText = [lines[start], ...lines.slice(start + 2, i)].join(' ');
  const rtl = firstStrongRtl(allText) ?? defaultRtl;
  return { block: { type: 'table', header: header.map((c) => parseInline(c)), rows, align: header.map((_, k) => align[k] || null), rtl }, next: i };
}

/**
 * Display math opening at this line — $$ … $$ or \\[ … \\], on one line or
 * several — or null. "$$5 and $$10" is not math.
 * @returns {{block: Block, next: number} | null}
 */
function readDisplayMath(lines, start) {
  const trimmed = lines[start].trim();
  const m = /^(\$\$|\\\[)\s*(.*)$/.exec(trimmed);
  if (!m || /^\$\$[^$]+\$\$\S/.test(trimmed) || (m[1] === '$$' && /\$\$\s*\S/.test(m[2]))) return null;
  const close = m[1] === '$$' ? '$$' : '\\]';
  if (m[2].endsWith(close)) return { block: { type: 'math', tex: m[2].slice(0, -close.length).trim() }, next: start + 1 };
  const parts = [m[2]];
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().endsWith(close)) parts.push(lines[i++]);
  if (i < lines.length) parts.push(lines[i++].trim().slice(0, -close.length));
  return { block: { type: 'math', tex: parts.join(' ').trim() }, next: i };
}

/** @returns {{block: Block, next: number}} */
function readList(lines, start, defaultRtl) {
  const items = [];
  let i = start;
  const indents = [];
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]);
    if (m) {
      const indent = m[1].replace(/\t/g, '    ').length;
      while (indents.length && indent < indents[indents.length - 1]) indents.pop();
      if (!indents.length || indent > indents[indents.length - 1]) indents.push(indent);
      const text = m[3];
      items.push({ level: Math.min(indents.length - 1, 5), ordered: /\d/.test(m[2]), runs: parseInline(text), rtl: firstStrongRtl(text) ?? defaultRtl });
      i++;
      continue;
    }
    // An indented line continues the item above it.
    if (items.length && /^\s{2,}\S/.test(lines[i]) && !FENCE.test(lines[i])) {
      const last = items[items.length - 1];
      last.runs.push({ text: '', break: true }, ...parseInline(lines[i].trim()));
      i++;
      continue;
    }
    // Blank lines between items keep one list — "1.", a blank line, "2." —
    // when the next item is nested or of the same kind: each part was its own
    // list, and Word numbered every one of them 1.
    const after = lines.slice(i).findIndex((line) => line.trim());
    const nextItem = after > 0 && LIST_ITEM.exec(lines[i + after]);
    if (nextItem && (nextItem[1].replace(/\t/g, '    ').length > indents[0] || /\d/.test(nextItem[2]) === items[0].ordered)) {
      i += after;
      continue;
    }
    break;
  }
  return { block: { type: 'list', items }, next: i };
}

/**
 * @param {string} markdown
 * @param {{rtl?: boolean}} [options] the conversation's direction, when the page says it
 * @returns {{blocks: Block[], rtl: boolean}}
 */
function parseMarkdown(markdown, options = {}) {
  const text = String(markdown || '').replace(/\r\n?/g, '\n');
  const rtl = typeof options.rtl === 'boolean' ? options.rtl : isMostlyRtl(text);
  const lines = text.split('\n');
  /** @type {Block[]} */
  const blocks = [];
  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const runs = [];
    paragraph.forEach((line, k) => {
      if (k) runs.push({ text: '', break: true });
      runs.push(...parseInline(line.trim()));
    });
    blocks.push({ type: 'paragraph', runs, rtl: firstStrongRtl(paragraph.join(' ')) ?? rtl });
    paragraph = [];
  };

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const closing = new RegExp('^\\s*' + fence[1].replace(/[`~]/g, '\\$&') + '\\s*$');
      const code = [];
      i++;
      while (i < lines.length && !closing.test(lines[i])) code.push(lines[i++]);
      i++; // the closing fence; an unclosed block runs to the end
      blocks.push({ type: 'code', lang: fence[2].split(':')[0].toLowerCase(), text: code.join('\n').replace(/\s+$/, '') });
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); i++; continue; }
    // An image on its own line — the person's own, placed by the page.
    const image = /^!\[([^\]\n]*)\]\((data:image\/[^)\s]+)\)$/.exec(trimmed);
    if (image && IMAGE_DATA_URL.test(image[2])) {
      flushParagraph(); blocks.push({ type: 'image', alt: image[1], src: image[2] }); i++; continue;
    }

    const math = readDisplayMath(lines, i);
    if (math) { flushParagraph(); blocks.push(math.block); i = math.next; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(trimmed))) {
      flushParagraph();
      blocks.push({ type: 'heading', level: m[1].length, runs: parseInline(m[2]), rtl: firstStrongRtl(m[2]) ?? rtl });
      i++;
      continue;
    }
    if (/^([-*_])(\s*\1){2,}\s*$/.test(trimmed)) { flushParagraph(); blocks.push({ type: 'rule' }); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      flushParagraph();
      const { block, next } = readTable(lines, i, rtl);
      blocks.push(block);
      i = next;
      continue;
    }
    if (LIST_ITEM.test(line) && !/^\s*\d{1,3}[.)]\s*$/.test(line)) {
      flushParagraph();
      const { block, next } = readList(lines, i, rtl);
      blocks.push(block);
      i = next;
      continue;
    }
    if (trimmed.startsWith('>')) {
      flushParagraph();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) quote.push(lines[i++].trim().replace(/^>\s?/, ''));
      const runs = calloutTitle(quote, rtl);
      quote.forEach((q, k) => { if (k && q) runs.push({ text: '', break: true }); runs.push(...parseInline(q)); });
      blocks.push({ type: 'quote', runs, rtl: firstStrongRtl(quote.join(' ')) ?? rtl });
      continue;
    }
    paragraph.push(line);
    i++;
  }
  flushParagraph();
  return { blocks, rtl };
}

// ── Values in cells ───────────────────────────────────────────────────────

const EASTERN_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const toAsciiDigits = (s) => s.replace(EASTERN_DIGITS, (d) => String((d.charCodeAt(0) & 0xF) % 10))
  .replace(/٫/g, '.').replace(/٬/g, ',');
/** @type {Array<[RegExp, string]>} */
const CURRENCY = [
  [/^\$|\$$|\bUSD\b/, '"$"#,##0.00'], [/€|\bEUR\b/, '#,##0.00 "€"'], [/£|\bGBP\b/, '"£"#,##0.00'],
  [/\bJOD\b|\bJD\b|د\.أ|دينار/, '#,##0.00 "JOD"'], [/\bSAR\b|ر\.س|ريال/, '#,##0.00 "SAR"'], [/\bAED\b|د\.إ|درهم/, '#,##0.00 "AED"'],
  [/\bEGP\b|ج\.م|جنيه/, '#,##0.00 "EGP"']
];

/**
 * What a table cell holds, typed: 120 → number, 35% → 0.35 shown as a
 * percentage, $4.50 → 4.5 in dollars, ٨٠ → 80, 2026-09-28 → a date. Anything
 * else stays text — including numbers with a leading zero (phone numbers,
 * codes), which a spreadsheet would otherwise strip.
 * @param {string} raw
 * @returns {{type: 'number'|'percent'|'currency'|'date'|'text', value: any, numFmt?: string}}
 */
function cellValue(raw) {
  const text = String(raw || '').trim();
  const s = toAsciiDigits(text).replace(/‏|‎/g, '');
  if (!s) return { type: 'text', value: '' };
  let m;
  if ((m = /^([-+]?\d+(?:\.(\d+))?)\s*[%٪]$/.exec(s))) {
    return { type: 'percent', value: Number(m[1]) / 100, numFmt: m[2] ? '0.' + '0'.repeat(Math.min(m[2].length, 4)) + '%' : '0%' };
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (!Number.isNaN(date.getTime()) && date.getUTCMonth() === Number(m[2]) - 1) return { type: 'date', value: date, numFmt: 'yyyy-mm-dd' };
  }
  const currency = CURRENCY.find(([pattern]) => pattern.test(s));
  const bare = s.replace(/\$|€|£|\b(?:USD|EUR|GBP|JOD|JD|SAR|AED|EGP)\b|د\.أ|ر\.س|د\.إ|ج\.م|دينار|ريال|درهم|جنيه/g, '').trim();
  if ((m = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(bare)) && !/^[-+]?0\d/.test(bare)) {
    const value = Number(bare.replace(/,/g, ''));
    if (currency && bare !== s) return { type: 'currency', value, numFmt: currency[1] };
    if (bare === s) return { type: 'number', value, numFmt: m[1] ? '#,##0.' + '0'.repeat(Math.min(m[1].length, 4)) : '#,##0' };
  }
  return { type: 'text', value: text };
}

module.exports = { parseMarkdown, parseInline, runsText, mathToText, cellValue, firstStrongRtl, isMostlyRtl, splitRow };

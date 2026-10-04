// An answer as a slide deck: a cover, a slide per section, tables and code on
// slides of their own, and a few layouts chosen by what the content is —
// figures as KPI cards, two options side by side as a comparison.
//
// Before this, the deck opened on an empty slide; a table's section showed
// "[Data table extracted separately]" and the table itself came slides later
// under an invented title, its columns reversed for Arabic; "*italic*",
// "> quote" and "$$...$$" reached the slides as raw symbols; any line with a
// "$" filled an "Equations" slide; and text sat small at the top of empty
// slides. Everything here is read from the one Markdown model.
'use strict';

const { parseMarkdown, runsText, mathToText } = require('./markdownModel');

// pptxgenjs publishes ESM-shaped types while require() returns the constructor.
/** @type {any} */
const PptxGen = require('pptxgenjs');

const W = 13.333, H = 7.5;
const BRAND = { navy: '07101F', blue: '7B3FE4', cyan: '38C7DD', violet: '7B3FE4', text: '0F172A', muted: '64748B', bg: 'F8FAFC', white: 'FFFFFF',
  line: 'CBD5E1', zebra: 'F1F5F9', codeBg: '0B1220', codeText: 'E5E7EB', quoteBg: 'EEF2FF', card: 'FFFFFF' };
const BODY = { x: 0.7, y: 1.35, w: W - 1.4, h: 5.55 };
// What fits a slide at the body size, measured on the rendered deck.
const LINES_PER_SLIDE = 14;
const CHARS_PER_LINE = 90;
const ROWS_PER_SLIDE = 8;
const CODE_LINES_PER_SLIDE = 18;
const KPI_VALUE = /^([-+]?[$€£]?\s?[\d٠-٩][\d٠-٩.,٫٬]*\s?(?:%|٪|[kKmMbB]|JOD|USD|SAR|\$|€|£|ألف|مليون|مليار)?\+?)\s*(.*)$/;

/**
 * A slide section at every heading of level 1 or 2; deeper headings stay
 * inside their section as sub-headings.
 * @param {import('./markdownModel').Block[]} blocks
 */
function sectionsOf(blocks) {
  const out = [];
  for (const section of majorSections(blocks)) {
    if (comparison(section)) { out.push(section); continue; }
    // Otherwise each "###" is a slide of its own, under its own title.
    let current = { ...section, blocks: [] };
    out.push(current);
    for (const block of section.blocks) {
      if (block.type === 'heading') {
        current = { title: block.runs, rtl: block.rtl, level: block.level, blocks: [] };
        out.push(current);
      } else current.blocks.push(block);
    }
  }
  return out;
}

function majorSections(blocks) {
  const out = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === 'heading' && block.level <= 2) {
      current = { title: block.runs, rtl: block.rtl, level: block.level, blocks: [] };
      out.push(current);
      continue;
    }
    if (block.type === 'rule') continue;
    if (!current) { current = { title: null, rtl: null, level: 0, blocks: [] }; out.push(current); }
    current.blocks.push(block);
  }
  return out;
}

// ── Text ──────────────────────────────────────────────────────────────────

function fontFor(rtl) { return rtl ? 'Arial' : 'Calibri'; }

/** Runs as pptxgenjs text objects; the paragraph's options go on each. */
function textObjects(runs, paragraph, base = {}) {
  const out = [];
  let softBreak = false;
  for (const run of runs) {
    if (run.break) { softBreak = true; continue; }
    const options = {
      ...paragraph,
      ...base,
      bold: Boolean(run.bold || base.bold) || undefined,
      italic: Boolean(run.italic || run.math) || undefined,
      strike: run.strike ? 'sngStrike' : undefined,
      fontFace: run.code ? 'Consolas' : run.math ? 'Cambria Math' : base.fontFace,
      color: run.code ? '0F766E' : run.link ? '1D4ED8' : base.color,
      hyperlink: run.link ? { url: run.link } : undefined,
      softBreakBefore: softBreak || undefined
    };
    softBreak = false;
    out.push({ text: run.math ? mathToText(run.text) : run.text, options });
  }
  if (!out.length) out.push({ text: ' ', options: { ...paragraph, ...base } });
  out[out.length - 1].options.breakLine = true;
  return out;
}

const lineCount = (text) => Math.max(1, Math.ceil(String(text).length / CHARS_PER_LINE));

/** A section's text blocks as paragraphs with their weight in lines. */
function textItems(block, docRtl) {
  const rtl = block.rtl ?? docRtl;
  const para = (r) => ({ align: r ? 'right' : 'left', rtlMode: r, paraSpaceAfter: 8 });
  switch (block.type) {
    case 'paragraph':
      return [{ lines: lineCount(runsText(block.runs)) + 0.3, objects: textObjects(block.runs, para(rtl), { fontFace: fontFor(rtl), color: BRAND.text }) }];
    case 'heading':
      return [{ lines: 1.4, objects: textObjects(block.runs, { ...para(rtl), paraSpaceBefore: 6 }, { fontFace: fontFor(rtl), color: BRAND.blue, bold: true, fontSize: 20 }) }];
    case 'list': {
      let number = 0;
      return block.items.map((item) => {
        number = item.level === 0 && item.ordered ? number + 1 : number;
        const bullet = item.ordered ? { type: 'number', style: 'arabicPeriod', startAt: item.level === 0 ? number : undefined } : { code: item.level ? '25E6' : '2022' };
        return { lines: lineCount(runsText(item.runs)) + 0.2, objects: textObjects(item.runs, { ...para(item.rtl), bullet, indentLevel: item.level, paraSpaceAfter: 5 }, { fontFace: fontFor(item.rtl), color: BRAND.text }) };
      });
    }
    case 'quote':
      return [{ lines: lineCount(runsText(block.runs)) + 0.8, quote: true, rtl, objects: textObjects(block.runs, para(rtl), { fontFace: fontFor(rtl), color: BRAND.blue, italic: true }) }];
    case 'math':
      return [{ lines: 1.6, objects: [{ text: mathToText(block.tex), options: { align: 'center', fontFace: 'Cambria Math', italic: true, fontSize: 24, color: BRAND.violet, breakLine: true, paraSpaceBefore: 6, paraSpaceAfter: 10 } }] }];
    default:
      return [];
  }
}

// ── Layouts chosen by content ─────────────────────────────────────────────

/** "Revenue: $1.2M" items, 2 to 6 of them, make KPI cards. */
function kpiCards(block) {
  if (block.type !== 'list' || block.items.length < 2 || block.items.length > 6 || block.items.some((i) => i.level)) return null;
  const cards = [];
  for (const item of block.items) {
    const text = runsText(item.runs).replace(/\*\*/g, '');
    const m = /^(.{1,40}?)\s*[:：–—-]\s*(.+)$/.exec(text);
    if (!m) return null;
    const value = KPI_VALUE.exec(m[2].trim());
    if (!value || value[1].length > 16) return null;
    cards.push({ label: m[1].trim(), value: value[1].trim(), note: value[2].trim(), rtl: item.rtl });
  }
  return cards;
}

/** Exactly two "###" sub-sections with their own content: side by side. */
function comparison(section) {
  const heads = section.blocks.map((b, i) => (b.type === 'heading' ? i : -1)).filter((i) => i >= 0);
  if (heads.length !== 2 || section.blocks.some((b) => b.type === 'table' || b.type === 'code')) return null;
  const columns = heads.map((start, k) => ({ title: section.blocks[start], blocks: section.blocks.slice(start + 1, heads[k + 1] ?? section.blocks.length) }));
  if (columns.some((c) => !c.blocks.length)) return null;
  const lines = columns.map((c) => c.blocks.flatMap((b) => textItems(b, section.rtl)).reduce((n, it) => n + it.lines, 0));
  if (Math.max(...lines) > LINES_PER_SLIDE * 0.9) return null;
  return { intro: section.blocks.slice(0, heads[0]), columns };
}

// ── The deck ──────────────────────────────────────────────────────────────

function createDeck({ title, rtl }) {
  const pptx = new PptxGen();
  pptx.defineLayout({ name: 'QJO_WIDE', width: W, height: H });
  pptx.layout = 'QJO_WIDE';
  pptx.author = 'Qjo';
  pptx.company = 'Qjo';
  pptx.title = title;
  pptx.subject = title;
  pptx.rtlMode = rtl;
  pptx.theme = { headFontFace: fontFor(rtl), bodyFontFace: fontFor(rtl), lang: rtl ? 'ar-SA' : 'en-US' };
  return pptx;
}

function contentSlide(pptx, titleRuns, rtl, suffix) {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.bg };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.12, fill: { color: BRAND.blue }, line: { color: BRAND.blue } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.12, w: W, h: 0.035, fill: { color: BRAND.cyan }, line: { color: BRAND.cyan } });
  const runs = [...titleRuns, ...(suffix ? [{ text: suffix }] : [])];
  slide.addText(textObjects(runs, { align: rtl ? 'right' : 'left', rtlMode: rtl }, { fontFace: fontFor(rtl), color: BRAND.blue, bold: true }),
    { x: BODY.x, y: 0.38, w: BODY.w, h: 0.75, fontSize: 28, valign: 'middle', fit: 'shrink', margin: 0 });
  slide.slideNumber = { x: W / 2 - 0.4, y: H - 0.42, w: 0.8, h: 0.3, fontSize: 10, color: BRAND.muted, align: 'center' };
  return slide;
}

function addTextSlide(pptx, section, items, suffix, docRtl) {
  const rtl = section.rtl ?? docRtl;
  const slide = contentSlide(pptx, section.titleRuns, rtl, suffix);
  const quotes = items.filter((it) => it.quote);
  const plain = items.filter((it) => !it.quote);
  const used = plain.reduce((n, it) => n + it.lines, 0);
  // Few lines read larger: the body grows to fill the slide it has.
  const fontSize = used <= 5 ? 22 : used <= 8 ? 20 : 18;
  let y = BODY.y;
  if (plain.length) {
    const h = Math.min(BODY.h, Math.max(1, used * (fontSize / 72) * 1.45 + 0.3));
    slide.addText(plain.flatMap((it) => it.objects), { x: BODY.x, y, w: BODY.w, h, fontSize, valign: 'top', margin: 4, lineSpacingMultiple: 1.1 });
    y += h + 0.15;
  }
  for (const q of quotes) {
    const h = Math.min(BODY.y + BODY.h - y, q.lines * 0.4 + 0.3);
    if (h <= 0.3) break;
    slide.addShape(pptx.ShapeType.rect, { x: BODY.x, y, w: BODY.w, h, fill: { color: BRAND.quoteBg }, line: { color: BRAND.quoteBg } });
    slide.addShape(pptx.ShapeType.rect, { x: q.rtl ? BODY.x + BODY.w - 0.08 : BODY.x, y, w: 0.08, h, fill: { color: BRAND.violet }, line: { color: BRAND.violet } });
    slide.addText(q.objects, { x: BODY.x + 0.25, y, w: BODY.w - 0.5, h, fontSize: 20, valign: 'middle', margin: 4 });
    y += h + 0.15;
  }
  return slide;
}

function addTableSlides(pptx, section, table, docRtl) {
  const rtl = table.rtl ?? docRtl;
  // A right-to-left table starts at the right. Reversing the columns works in
  // every viewer; PowerPoint's own table direction flag is ignored by
  // LibreOffice, Keynote and Google Slides, and the two together would flip twice.
  const order = (row) => (rtl ? [...row].reverse() : row);
  const header = order(table.header);
  const body = table.rows.map(order);
  const cols = header.length;
  const widths = header.map((h, c) => Math.max(4, ...[h, ...body.map((r) => r[c])].map((runs) => Math.min(40, runsText(runs).length))));
  const total = widths.reduce((a, b) => a + b, 0);
  const colW = widths.map((wd) => (wd / total) * BODY.w);
  // Few rows read larger and fill the slide; many rows and columns shrink.
  const perPage = Math.min(body.length, ROWS_PER_SLIDE);
  const fontSize = (cols <= 4 ? 20 : cols <= 6 ? 17 : 13) - (perPage > 5 ? 2 : 0);
  const rowH = Math.min(0.75, (BODY.h - 0.3) / (perPage + 1));
  const cell = (runs, header, zebra) => {
    const text = runsText(runs).trim();
    return { text: text || ' ', options: { bold: header || undefined, color: header ? BRAND.white : BRAND.text, fill: { color: header ? BRAND.blue : zebra ? BRAND.zebra : BRAND.white },
      align: rtl ? 'right' : 'left', valign: 'middle', fontFace: fontFor(rtl), fontSize, rtlMode: rtl, margin: [4, 6, 4, 6] } };
  };
  const pages = Math.max(1, Math.ceil(body.length / ROWS_PER_SLIDE));
  for (let p = 0; p < pages; p++) {
    const slide = contentSlide(pptx, section.titleRuns, section.rtl ?? rtl, pages > 1 ? ` (${p + 1}/${pages})` : '');
    const rows = body.slice(p * ROWS_PER_SLIDE, (p + 1) * ROWS_PER_SLIDE);
    slide.addTable([header.map((h) => cell(h, true, false)), ...rows.map((r, i) => r.map((c) => cell(c, false, i % 2 === 1)))],
      { x: BODY.x, y: BODY.y + 0.1, w: BODY.w, colW, rowH, fontSize, border: { type: 'solid', pt: 1, color: BRAND.line }, autoPage: false });
  }
}

function addCodeSlides(pptx, section, code, docRtl) {
  const lines = code.text.split('\n');
  const pages = Math.max(1, Math.ceil(lines.length / CODE_LINES_PER_SLIDE));
  for (let p = 0; p < pages; p++) {
    const slide = contentSlide(pptx, section.titleRuns, section.rtl ?? docRtl, `${code.lang ? ` — ${code.lang}` : ''}${pages > 1 ? ` (${p + 1}/${pages})` : ''}`);
    const chunk = lines.slice(p * CODE_LINES_PER_SLIDE, (p + 1) * CODE_LINES_PER_SLIDE);
    const fontSize = chunk.length <= 10 ? 18 : chunk.length <= 14 ? 16 : 14;
    const h = Math.min(BODY.h, chunk.length * (fontSize / 72) * 1.3 + 0.5);
    slide.addShape(pptx.ShapeType.roundRect, { x: BODY.x, y: BODY.y, w: BODY.w, h, fill: { color: BRAND.codeBg }, line: { color: BRAND.codeBg }, rectRadius: 0.08 });
    slide.addText(chunk.join('\n') || ' ', { x: BODY.x + 0.25, y: BODY.y + 0.15, w: BODY.w - 0.5, h: h - 0.3, fontFace: 'Consolas', fontSize, color: BRAND.codeText,
      align: 'left', rtlMode: false, valign: 'top', margin: 0 });
  }
}

function addKpiSlide(pptx, section, cards, docRtl) {
  const rtl = section.rtl ?? docRtl;
  const slide = contentSlide(pptx, section.titleRuns, rtl);
  const perRow = cards.length <= 3 ? cards.length : Math.ceil(cards.length / 2);
  const gap = 0.3, cw = (BODY.w - gap * (perRow - 1)) / perRow, ch = cards.length <= 3 ? 3.2 : 2.45;
  cards.forEach((card, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const x = rtl ? BODY.x + BODY.w - (col + 1) * cw - col * gap : BODY.x + col * (cw + gap);
    const y = BODY.y + 0.2 + row * (ch + gap);
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: BRAND.card }, line: { color: BRAND.line, width: 1 }, rectRadius: 0.12 });
    slide.addShape(pptx.ShapeType.rect, { x, y, w: cw, h: 0.09, fill: { color: BRAND.cyan }, line: { color: BRAND.cyan } });
    slide.addText(card.value, { x: x + 0.2, y: y + 0.35, w: cw - 0.4, h: ch * 0.42, fontSize: 40, bold: true, color: BRAND.blue, fontFace: fontFor(rtl), align: 'center', valign: 'middle', fit: 'shrink' });
    slide.addText(card.label, { x: x + 0.2, y: y + 0.35 + ch * 0.42, w: cw - 0.4, h: 0.5, fontSize: 18, color: BRAND.text, fontFace: fontFor(card.rtl), align: 'center', rtlMode: card.rtl, fit: 'shrink' });
    if (card.note) slide.addText(card.note, { x: x + 0.2, y: y + 0.85 + ch * 0.42, w: cw - 0.4, h: 0.45, fontSize: 13, color: BRAND.muted, fontFace: fontFor(card.rtl), align: 'center', rtlMode: card.rtl, fit: 'shrink' });
  });
}

function addComparisonSlide(pptx, section, layout, docRtl) {
  const rtl = section.rtl ?? docRtl;
  const slide = contentSlide(pptx, section.titleRuns, rtl);
  let top = BODY.y;
  const intro = layout.intro.flatMap((b) => textItems(b, rtl));
  if (intro.length) {
    const h = intro.reduce((n, it) => n + it.lines, 0) * 0.36 + 0.2;
    slide.addText(intro.flatMap((it) => it.objects), { x: BODY.x, y: top, w: BODY.w, h, fontSize: 18, valign: 'top', margin: 4 });
    top += h + 0.1;
  }
  const gap = 0.35, cw = (BODY.w - gap) / 2, ch = BODY.y + BODY.h - top;
  layout.columns.forEach((column, k) => {
    const x = (rtl ? 1 - k : k) ? BODY.x + cw + gap : BODY.x;
    const accent = k ? BRAND.violet : BRAND.cyan;
    const colRtl = column.title.rtl ?? rtl;
    slide.addShape(pptx.ShapeType.roundRect, { x, y: top, w: cw, h: ch, fill: { color: BRAND.card }, line: { color: BRAND.line, width: 1 }, rectRadius: 0.1 });
    slide.addShape(pptx.ShapeType.rect, { x, y: top, w: cw, h: 0.1, fill: { color: accent }, line: { color: accent } });
    slide.addText(textObjects(column.title.runs, { align: colRtl ? 'right' : 'left', rtlMode: colRtl }, { fontFace: fontFor(colRtl), color: BRAND.blue, bold: true }),
      { x: x + 0.25, y: top + 0.25, w: cw - 0.5, h: 0.6, fontSize: 22, valign: 'middle', fit: 'shrink' });
    slide.addText(column.blocks.flatMap((b) => textItems(b, colRtl)).flatMap((it) => it.objects), { x: x + 0.25, y: top + 0.95, w: cw - 0.5, h: ch - 1.15, fontSize: 17, valign: 'top', margin: 2 });
  });
}

function addCover(pptx, { title, subtitle, rtl, date }) {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.navy };
  slide.addShape(pptx.ShapeType.arc, { x: rtl ? -0.6 : 9.6, y: -0.8, w: 4.2, h: 4.2, line: { color: BRAND.cyan, transparency: 45, width: 3 } });
  slide.addShape(pptx.ShapeType.arc, { x: rtl ? -0.25 : 9.95, y: -0.45, w: 3.5, h: 3.5, line: { color: BRAND.violet, transparency: 35, width: 3 } });
  const align = rtl ? 'right' : 'left';
  slide.addText(textObjects(title, { align, rtlMode: rtl }, { fontFace: fontFor(rtl), color: BRAND.white, bold: true }), { x: 0.8, y: 2.2, w: W - 1.6, h: 1.4, fontSize: 44, valign: 'bottom', fit: 'shrink' });
  slide.addShape(pptx.ShapeType.rect, { x: rtl ? W - 0.8 - 1.6 : 0.8, y: 3.75, w: 1.6, h: 0.07, fill: { color: BRAND.cyan }, line: { color: BRAND.cyan } });
  if (subtitle) slide.addText(textObjects(subtitle.runs, { align, rtlMode: subtitle.rtl }, { fontFace: fontFor(subtitle.rtl), color: 'CBD5E1' }), { x: 0.8, y: 4.0, w: W - 1.6, h: 1.4, fontSize: 20, valign: 'top', fit: 'shrink' });
  slide.addText(`Qjo • ${date.toISOString().slice(0, 10)}`, { x: 0.8, y: H - 0.9, w: W - 1.6, h: 0.35, fontSize: 12, color: '94A3B8', align });
}

/**
 * @param {{title: string, content: string, rtl?: boolean, date?: Date}} input
 * @returns {Promise<Buffer>}
 */
async function buildPptx({ title, content, rtl: requestedRtl, date = new Date() }) {
  const { blocks, rtl } = parseMarkdown(content, { rtl: requestedRtl });
  const pptx = createDeck({ title, rtl });
  const sections = sectionsOf(blocks);

  // The cover takes the document's own title when it opens with one, and a
  // short first paragraph under it as the subtitle — never an empty slide.
  let coverTitle = [{ text: title }];
  let subtitle = null;
  const first = sections[0];
  if (first && first.level === 1 && first.title) {
    coverTitle = first.title;
    if (first.blocks[0] && first.blocks[0].type === 'paragraph' && runsText(first.blocks[0].runs).length <= 240) subtitle = first.blocks.shift();
  }
  addCover(pptx, { title: coverTitle, subtitle, rtl: /[؀-ۿ]/.test(runsText(coverTitle)) || (rtl && !/[A-Za-z]/.test(runsText(coverTitle))), date });

  for (const section of sections) {
    section.titleRuns = section.title || [{ text: title }];
    if (!section.blocks.length) continue;
    const layout = comparison(section);
    if (layout) { addComparisonSlide(pptx, section, layout, rtl); continue; }

    let pending = [];
    let used = 0;
    let part = 0;
    const flush = () => {
      if (!pending.length) return;
      addTextSlide(pptx, section, pending, part++ ? ` (${part})` : '', rtl);
      pending = [];
      used = 0;
    };
    for (const block of section.blocks) {
      const cards = kpiCards(block);
      if (cards) { flush(); addKpiSlide(pptx, section, cards, rtl); continue; }
      if (block.type === 'table') { flush(); addTableSlides(pptx, section, block, rtl); continue; }
      if (block.type === 'code') { flush(); addCodeSlides(pptx, section, block, rtl); continue; }
      for (const item of textItems(block, rtl)) {
        if (used + item.lines > LINES_PER_SLIDE && pending.length) flush();
        pending.push(item);
        used += item.lines;
      }
    }
    flush();
  }
  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { buildPptx, kpiCards, sectionsOf };

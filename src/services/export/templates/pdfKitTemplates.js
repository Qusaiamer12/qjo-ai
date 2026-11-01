// A template's PDF when Chromium is not there to print it — the plain
// renderer's layouts: the same cover, contents list with page numbers,
// numbered or chaptered headings, page numbers, CV header and sections, drawn
// with the plain renderer's own fonts (the embedded sans and Arabic faces: no
// serif here, and a CV's modern side column is a coloured header band). It is
// the last resort, and still a document with its structure rather than the
// bare text.
//
// The contents list needs the page of every heading, so the document is drawn
// twice: the first pass records where each heading fell, the second writes
// the numbers. The list is drawn before the text and ends its page, so the
// numbers cannot move what they describe.
'use strict';

const PDFDocument = require('pdfkit');
const { createTranslator } = require('../../../../public/domain/i18n');
const { parseMarkdown } = require('../markdownModel');
const fallback = require('../pdfFallback');
const { fontPath } = require('../fonts');
const { themeOf } = require('./themes');
const { readCv } = require('./cvModel');
const { planOutline } = require('./outline');

const { createWriter, drawBlock, PAGE, WIDTH, COLOR, ARABIC, LATIN, FACES, fontPieces, CHAINS } = fallback;
const hex = (c) => `#${c}`;

const widthOf = (doc, text, size, bold) => fontPieces(text, bold ? CHAINS.bold : CHAINS.regular).reduce((w, p) => w + doc.font(p.face).fontSize(size).widthOfString(p.text), 0);

/** The direction of a short text: its own letters, else the document's. */
const directionOf = (value, rtl) => (ARABIC.test(value) ? true : LATIN.test(value) ? false : rtl);

function fill(doc, color) { doc.save().rect(0, 0, PAGE.width, PAGE.height).fill(color).restore(); }

// ── CV ────────────────────────────────────────────────────────────────────

function drawCv(w, id, theme, input) {
  const { rtl, title } = input;
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  const cv = readCv(input.content, title);
  const doc = w.doc;
  const band = id === 'modern';
  const nameRtl = directionOf(cv.name, rtl);
  if (band) {
    doc.save().rect(0, 0, PAGE.width, 150).fill(hex(theme.side)).restore();
    w.y = 40;
  } else {
    w.y = 40;
  }
  const align = id === 'classic' ? 'center' : 'start';
  w.text([{ text: cv.name }], { size: 24, bold: true, color: band ? '#FFFFFF' : hex(theme.ink), rtl: nameRtl, align });
  if (cv.jobTitle) w.text([{ text: cv.jobTitle }], { size: 12.5, bold: true, color: band ? hex(theme.sideMuted) : hex(theme.accent), rtl: directionOf(cv.jobTitle, rtl), align });
  w.y += 4;
  if (cv.contact.length) w.text([{ text: cv.contact.map((c) => c.text).join('   |   ') }], { size: 9, color: band ? hex(theme.sideInk) : hex(theme.muted), rtl, align });
  w.y = Math.max(w.y + 12, band ? 168 : 0);
  if (!band) {
    doc.save().moveTo(PAGE.margin, w.y).lineTo(PAGE.margin + WIDTH, w.y).lineWidth(id === 'compact' ? 1.4 : 0.8).strokeColor(hex(id === 'classic' ? theme.ink : theme.accent)).stroke().restore();
    w.y += 14;
  }
  if (cv.photo && id !== 'classic') drawBlock(w, parseMarkdown(cv.photo, { rtl }).blocks[0]);
  for (const section of cv.sections) {
    if (section.title) {
      w.ensure(40);
      w.y += 6;
      w.text([{ text: section.title.toUpperCase() }], { size: 10.5, bold: true, color: hex(theme.accent), rtl });
      doc.save().moveTo(PAGE.margin, w.y + 1).lineTo(PAGE.margin + WIDTH, w.y + 1).lineWidth(0.5).strokeColor(hex(theme.line)).stroke().restore();
      w.y += 7;
    }
    for (const block of parseMarkdown(section.markdown, { rtl }).blocks) drawBlock(w, block);
  }
  void t;
}

// ── Documents ─────────────────────────────────────────────────────────────

function drawCover(w, id, theme, { title, date, rtl, t }) {
  const doc = w.doc;
  const by = t('coverPreparedWith');
  const colored = id === 'report' || id === 'story';
  if (colored) fill(doc, hex(theme.cover));
  else if (id === 'elegant') {
    doc.save().rect(36, 36, PAGE.width - 72, PAGE.height - 72).lineWidth(1).strokeColor(hex(theme.accent)).stroke()
      .rect(43, 43, PAGE.width - 86, PAGE.height - 86).lineWidth(0.5).stroke().restore();
  }
  const ink = colored ? hex(theme.coverInk) : hex(theme.ink);
  const sub = colored ? hex(theme.coverInk) : hex(theme.muted);
  const titleRtl = directionOf(title, rtl);
  const size = 30;
  const left = id === 'report';
  w.y = left ? PAGE.height * 0.4 : PAGE.height * 0.34;
  doc.save().moveTo(left ? PAGE.margin : PAGE.width / 2 - 40, w.y - 18).lineTo(left ? PAGE.margin + 70 : PAGE.width / 2 + 40, w.y - 18).lineWidth(id === 'report' ? 4 : 1).strokeColor(id === 'report' ? '#F2B134' : colored ? ink : hex(theme.accent)).stroke().restore();
  w.text([{ text: title }], { size, bold: true, color: ink, rtl: titleRtl, align: left ? 'start' : 'center', lineGap: 1.3 });
  w.y += 18;
  if (id !== 'report') w.text([{ text: by }], { size: 9.5, color: sub, rtl, align: 'center' });
  w.y += 4;
  w.text([{ text: date }], { size: 10, color: sub, rtl: false, align: left ? 'start' : 'center' });
}

function drawToc(w, entries, theme, { rtl, t, pages }) {
  const doc = w.doc;
  doc.addPage();
  w.y = PAGE.top + 10;
  w.text([{ text: t('tocTitle') }], { size: 22, bold: true, color: hex(theme.accent), rtl });
  w.y += 14;
  for (const e of entries) {
    const label = theme.numbered ? `${e.number}  ${e.text}` : e.text;
    const size = e.depth === 0 ? 11 : 10;
    const indent = e.depth * 16;
    const textRtl = directionOf(e.text, rtl);
    w.ensure(size * 2);
    const top = w.y;
    const x = rtl ? PAGE.margin : PAGE.margin + indent;
    const room = WIDTH - indent - 34;
    w.text([{ text: label }], { x, width: room, size, bold: e.depth === 0, color: hex(theme.ink), rtl: textRtl });
    const number = pages ? String(pages[e.index] || '') : '00';
    if (number) {
      const nx = rtl ? PAGE.margin : PAGE.margin + WIDTH - 24;
      doc.font('sans').fontSize(size).fillColor(hex(theme.muted)).text(number, nx, top, { width: 24, align: rtl ? 'left' : 'right', lineBreak: false });
      // The dots run from the end of the title to the number.
      const used = widthOf(doc, label, size, e.depth === 0);
      const from = rtl ? PAGE.margin + WIDTH - indent - used - 4 : PAGE.margin + indent + used + 4;
      const to = rtl ? PAGE.margin + 30 : PAGE.margin + WIDTH - 30;
      const y = top + size * 0.95;
      if (Math.abs(to - from) > 12) doc.save().moveTo(Math.min(from, to), y).lineTo(Math.max(from, to), y).dash(0.8, { space: 2.4 }).lineWidth(0.6).strokeColor(hex(theme.muted)).stroke().undash().restore();
    }
    w.y += e.depth === 0 ? 5 : 2;
  }
}

function drawDocument(w, id, theme, input, plan, pages, coverDate, t) {
  const { rtl } = input;
  const doc = w.doc;
  const headingPages = {};
  const pageNow = () => doc.bufferedPageRange().start + doc.bufferedPageRange().count - 1;
  drawCover(w, id, theme, { title: plan.outline.title, date: coverDate, rtl, t });
  const listed = plan.outline.entries.filter((e) => e.listed);
  if (listed.length) drawToc(w, listed, theme, { rtl, t, pages });
  doc.addPage();
  w.y = PAGE.top;
  let seen = 0;
  const byIndex = new Map(plan.outline.entries.map((e) => [e.index, e]));
  for (const block of plan.blocks) {
    if (block.type !== 'heading') { drawBlock(w, block); continue; }
    const entry = byIndex.get(seen++);
    if (!entry) continue;
    const chapter = id === 'story' && entry.depth === 0;
    if (chapter) {
      if (w.y > PAGE.top + 1) { doc.addPage(); w.y = PAGE.top; }
      w.y += 90;
      headingPages[entry.index] = pageNow() + 1;
      w.text([{ text: t('chapterLabel', { n: entry.chapter }).toUpperCase() }], { size: 9.5, color: hex(theme.muted), rtl, align: 'center' });
      w.y += 6;
      w.text(block.runs, { size: 22, bold: true, color: hex(theme.accent), rtl: block.rtl, align: 'center' });
      w.y += 26;
      continue;
    }
    const size = [20, 16, 14, 12.5, 12, 12][block.level - 1];
    w.ensure(size * 3.2);
    headingPages[entry.index] = pageNow() + 1;
    drawBlock(w, theme.numbered ? { ...block, runs: [{ text: `${entry.number}  ` }, ...block.runs] } : block);
  }
  return headingPages;
}

/** Page numbers at the foot of every page but the cover. */
function numberPages(w, id, theme, rtl) {
  const doc = w.doc;
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins;
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    const label = id === 'story' ? `— ${i + 1} —` : String(i + 1);
    doc.font('sans').fontSize(9).fillColor(hex(theme.muted)).text(label, PAGE.margin, PAGE.height - 40, { width: WIDTH, align: 'center', lineBreak: false });
    doc.page.margins = saved;
  }
  void rtl;
}

/** One drawing of the document; returns the file and the page each heading fell on. */
function draw(input, theme, plan, pages) {
  const id = input.template;
  const { title, rtl } = input;
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  const doc = new PDFDocument({ size: 'A4', margins: { top: PAGE.top, bottom: 0, left: PAGE.margin, right: PAGE.margin }, bufferPages: true, info: { Title: title, Creator: 'Qjo' } });
  for (const [name, file] of Object.entries(FACES)) doc.registerFont(name, fontPath(file));
  const done = new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const w = createWriter(doc);
  // The plain renderer draws headings, markers and table headers in COLOR.accent:
  // the template's, for the length of this (synchronous) drawing.
  const saved = { ...COLOR };
  let headingPages = {};
  try {
    COLOR.accent = hex(theme.accent);
    COLOR.ink = hex(theme.ink);
    COLOR.quoteBar = hex(theme.accent);
    if (theme.kind === 'cv') drawCv(w, id, theme, input);
    else {
      const date = (input.date || new Date()).toLocaleDateString(rtl ? 'ar-JO' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
      headingPages = drawDocument(w, id, theme, input, plan, pages, date, t);
      numberPages(w, id, theme, rtl);
    }
  } finally { Object.assign(COLOR, saved); }
  doc.end();
  return done.then((buffer) => ({ buffer, headingPages }));
}

/**
 * @param {{template: string, title: string, content: string, rtl: boolean, date?: Date}} input
 * @returns {Promise<Buffer>}
 */
async function buildTemplatePdfKit(input) {
  const theme = themeOf(input.template);
  const { blocks } = parseMarkdown(input.content, { rtl: input.rtl });
  const headings = blocks.filter((b) => b.type === 'heading');
  const outline = planOutline(headings.map((h) => ({ level: h.level, text: h.runs.map((r) => r.text).join('') })), input.title);
  const plan = { blocks, outline };
  const first = await draw(input, theme, plan, null);
  if (theme.kind === 'cv' || !outline.entries.some((e) => e.listed)) return first.buffer;
  return (await draw(input, theme, plan, first.headingPages)).buffer;
}

module.exports = { buildTemplatePdfKit };

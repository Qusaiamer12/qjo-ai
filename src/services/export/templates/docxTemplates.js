// The Word file for a template. Real Word structure throughout: heading
// styles (so Word's own navigation pane and contents field see them), a
// contents list that is a TOC field with its entries already in it, bookmarks
// on every heading, page numbers as fields, right-to-left set on the section,
// the paragraphs and the table. A CV's classic template uses no table and no
// text box, so an applicant-tracking parser reads it top to bottom.
'use strict';

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, ShadingType,
  Bookmark, InternalHyperlink, SimpleField, Footer, PageNumber, TabStopType, LeaderType, VerticalAlign, HeightRule,
  FrameAnchorType, FrameWrap, DropCapType, LineRuleType, HeadingLevel, TableLayoutType, ImageRun, PageBreak
} = require('docx');
const JSZip = require('jszip');
const { createTranslator } = require('../../../../public/domain/i18n');
const { parseMarkdown } = require('../markdownModel');
const { decodeImage } = require('../attachedImages');
const { blockToWord, inlineChildren, textParagraph, numberingLevels } = require('../docx');
const { themeOf, WORD_FONTS } = require('./themes');
const { readCv } = require('./cvModel');
const { planOutline, bookmarkName } = require('./outline');

const A4 = { width: 11906, height: 16838 };
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const NONE = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const rule = (color, size = 6, space = 1) => ({ style: BorderStyle.SINGLE, size, color, space });
const TOC_BEGIN = '@@QJO_TOC_BEGIN@@';
const TOC_END = '@@QJO_TOC_END@@';

const fontOf = (theme) => WORD_FONTS[theme.serif ? 'serif' : 'sans'];
const half = (pt) => Math.round(pt * 2);

/** Runs of plain text in a paragraph's direction. */
const text = (value, rtl, style) => inlineChildren([{ text: value }], rtl, style);

// ── Styles ────────────────────────────────────────────────────────────────

function styles(theme, rtl) {
  const font = fontOf(theme);
  const heading = (size, extra = {}) => ({ run: { font, size: half(size), bold: true, color: theme.ink, ...extra.run }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, ...extra.paragraph } });
  const s = theme.size;
  return {
    default: {
      document: { run: { font, size: half(s), color: theme.ink, language: { value: rtl ? 'ar-SA' : 'en-US', bidirectional: 'ar-SA' } }, paragraph: { spacing: { after: 120, line: Math.round(theme.leading * 240), lineRule: LineRuleType.AUTO }, alignment: theme.justify ? AlignmentType.JUSTIFIED : undefined } },
      heading1: heading(s * 1.9, { run: { color: theme.accent } }),
      heading2: heading(s * 1.4, { run: { color: theme.accent } }),
      heading3: heading(s * 1.15, { run: { color: theme.ink } }),
      heading4: heading(s * 1.05), heading5: heading(s), heading6: heading(s),
      hyperlink: { run: { color: theme.accent, underline: {} } }
    },
    paragraphStyles: [
      { id: 'QjoName', name: 'Qjo Name', basedOn: 'Normal', next: 'Normal', run: { font, size: half(s * 2.6), bold: true, color: theme.ink }, paragraph: { spacing: { before: 0, after: 40 }, keepNext: true } },
      { id: 'QjoJob', name: 'Qjo Job Title', basedOn: 'Normal', run: { font, size: half(s * 1.2), bold: true, color: theme.accent }, paragraph: { spacing: { before: 0, after: 80 } } },
      { id: 'QjoContact', name: 'Qjo Contact', basedOn: 'Normal', run: { font, size: half(s * 0.95), color: theme.muted }, paragraph: { spacing: { before: 0, after: 40 } } },
      { id: 'QjoSection', name: 'Qjo Section', basedOn: 'Normal', next: 'Normal', run: { font, size: half(s * 1.05), bold: true, color: theme.accent, allCaps: true }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true } },
      { id: 'QjoEntry', name: 'Qjo Entry', basedOn: 'Normal', next: 'Normal', run: { font, size: half(s * 1.04), bold: true, color: theme.ink }, paragraph: { spacing: { before: 120, after: 20 }, keepNext: true } },
      { id: 'QjoDates', name: 'Qjo Dates', basedOn: 'Normal', run: { font, size: half(s * 0.92), italics: true, color: theme.muted }, paragraph: { spacing: { before: 0, after: 60 } } },
      { id: 'QjoCover', name: 'Qjo Cover Title', basedOn: 'Normal', run: { font, size: half(s * 3.4), bold: true, color: theme.coverInk || theme.ink }, paragraph: { spacing: { before: 0, after: 240 } } },
      { id: 'QjoCoverNote', name: 'Qjo Cover Note', basedOn: 'Normal', run: { font, size: half(s * 0.95), color: theme.coverInk || theme.muted }, paragraph: { spacing: { before: 0, after: 60 } } },
      { id: 'QjoTocTitle', name: 'Qjo Contents Title', basedOn: 'Normal', next: 'Normal', run: { font, size: half(s * 1.9), bold: true, color: theme.accent }, paragraph: { spacing: { before: 0, after: 360 } } },
      { id: 'QjoToc', name: 'Qjo Contents Entry', basedOn: 'Normal', run: { font, size: half(s) }, paragraph: { spacing: { before: 0, after: 80 } } },
      { id: 'QjoChapterLabel', name: 'Qjo Chapter Label', basedOn: 'Normal', next: 'Normal', run: { font, size: half(s * 0.95), color: theme.muted, allCaps: true }, paragraph: { spacing: { before: 1800, after: 120 }, alignment: AlignmentType.CENTER, keepNext: true } }
    ]
  };
}

const numbering = { config: [{ reference: 'qjo-bullet', levels: numberingLevels(false) }, { reference: 'qjo-number', levels: numberingLevels(true) }] };

// ── Blocks inside a section ───────────────────────────────────────────────

const isDatesLine = (block) => block && block.type === 'paragraph' && block.runs.length > 0 && block.runs.every((r) => r.italic && !r.code && !r.link);

/**
 * Markdown as Word paragraphs. A "###" entry becomes an entry line; when its
 * dates follow in italics they join it on the same line, pushed to the far
 * edge with a right tab (`mergeDates`).
 * @param {string} markdown
 * @param {{rtl: boolean, theme: import('./themes').Theme, lists: {count: number}, width: number, mergeDates?: boolean, color?: string}} ctx
 */
function blocksToWord(markdown, ctx) {
  const { blocks } = parseMarkdown(markdown, { rtl: ctx.rtl });
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'heading' && block.level >= 3) {
      const dates = ctx.mergeDates && isDatesLine(blocks[i + 1]) ? /** @type {any} */ (blocks[++i]) : null;
      const children = inlineChildren(block.runs, block.rtl, { color: ctx.color });
      if (dates) children.push(new TextRun({ text: '\t' }), ...inlineChildren(dates.runs.map((r) => ({ ...r, italic: true })), block.rtl, { color: ctx.theme.muted, size: half(ctx.theme.size * 0.92) }));
      out.push(new Paragraph({ style: 'QjoEntry', bidirectional: block.rtl, tabStops: dates ? [{ type: TabStopType.RIGHT, position: ctx.width }] : undefined, children }));
    } else if (block.type === 'paragraph' && isDatesLine(block)) {
      out.push(new Paragraph({ style: 'QjoDates', bidirectional: block.rtl, children: inlineChildren(block.runs, block.rtl, { color: ctx.color }) }));
    } else if (ctx.color && block.type === 'paragraph') {
      out.push(textParagraph(block.runs, block.rtl, { style: { color: ctx.color } }));
    } else if (ctx.color && block.type === 'list') {
      out.push(...block.items.map((item) => textParagraph(item.runs, item.rtl, { style: { color: ctx.color }, spacing: { after: 70 } })));
    } else {
      out.push(...blockToWord(block, ctx.lists, ctx.theme.accent));
    }
  }
  return out;
}

function imageParagraph(markdown, { max, align, rtl }) {
  const m = /!\[([^\]]*)\]\(([^)\s]+)\)/.exec(markdown || '');
  const image = m && decodeImage(m[2]);
  if (!image) return null;
  const scale = Math.min(1, max / image.width, max / image.height);
  return new Paragraph({ alignment: align, bidirectional: rtl, spacing: { after: 160 }, children: [new ImageRun({
    type: image.type, data: image.data, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) },
    altText: { name: 'photo', title: m[1] || 'photo', description: m[1] || 'photo' }
  })] });
}

// ── CV ────────────────────────────────────────────────────────────────────

const SIDE = new Set(['skills', 'languages']);

function cvChildren(id, theme, input, lists) {
  const { rtl } = input;
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  const cv = readCv(input.content, input.title);
  const section = (s, width, ctx = {}) => [
    ...(s.title ? [new Paragraph({ style: 'QjoSection', bidirectional: rtl, border: { bottom: rule(ctx.line || theme.line, 6, 2) }, children: text(s.title, rtl, { color: ctx.heading }) })] : []),
    ...blocksToWord(s.markdown, { rtl, theme, lists, width, mergeDates: id !== 'modern', color: ctx.color })
  ];
  const name = new Paragraph({ style: 'QjoName', bidirectional: rtl, alignment: id === 'classic' ? AlignmentType.CENTER : undefined, children: text(cv.name, rtl) });
  const job = cv.jobTitle ? [new Paragraph({ style: 'QjoJob', bidirectional: rtl, alignment: id === 'classic' ? AlignmentType.CENTER : undefined, children: text(cv.jobTitle, rtl) })] : [];
  const contactLine = (align) => (cv.contact.length ? [new Paragraph({ style: 'QjoContact', bidirectional: rtl, alignment: align, children: cv.contact.flatMap((c, i) => [...(i ? [new TextRun({ text: '  |  ', color: theme.muted })] : []), ...text(c.text, rtl)]) })] : []);

  if (id === 'classic') {
    const width = A4.width - 2 * 1021;
    return { margins: 1021, children: [name, ...job, ...contactLine(AlignmentType.CENTER), ...cv.sections.flatMap((s) => section(s, width))] };
  }
  if (id === 'compact') {
    const width = A4.width - 2 * 851;
    const photo = cv.photo ? imageParagraph(cv.photo, { max: 90, align: rtl ? AlignmentType.LEFT : AlignmentType.RIGHT, rtl }) : null;
    const head = [name, ...job, ...contactLine(undefined)];
    const header = photo
      ? [new Table({ width: { size: width, type: WidthType.DXA }, columnWidths: [width - 1500, 1500], layout: TableLayoutType.FIXED, borders: NO_BORDERS, visuallyRightToLeft: rtl, rows: [new TableRow({ children: [
        new TableCell({ width: { size: width - 1500, type: WidthType.DXA }, children: head }),
        new TableCell({ width: { size: 1500, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children: [photo] })] })] })]
      : head;
    const rows = cv.sections.flatMap((s) => {
      if (SIDE.has(s.key)) {
        // Skills and languages read as one line each, "a · b · c".
        const items = parseMarkdown(s.markdown, { rtl }).blocks.flatMap((b) => (b.type === 'list' ? b.items.map((i) => i.runs) : b.type === 'paragraph' ? [b.runs] : []));
        return [new Paragraph({ style: 'QjoSection', bidirectional: rtl, border: { bottom: rule(theme.line, 6, 2) }, children: text(s.title, rtl) }),
          new Paragraph({ bidirectional: rtl, spacing: { after: 60 }, children: items.flatMap((runs, i) => [...(i ? [new TextRun({ text: '  ·  ', color: theme.accent })] : []), ...inlineChildren(runs, rtl)]) })];
      }
      return section(s, width);
    });
    return { margins: 851, children: [...header, new Paragraph({ border: { bottom: rule(theme.accent, 12, 1) }, spacing: { after: 60 }, children: [] }), ...rows] };
  }
  // modern: a panel on the side (photo, contact, skills, languages), the story beside it.
  const sideW = 3500;
  const mainW = A4.width - 2 * 567 - sideW;
  const sideSections = cv.sections.filter((s) => SIDE.has(s.key));
  const side = [];
  const photo = cv.photo ? imageParagraph(cv.photo, { max: 130, align: AlignmentType.CENTER, rtl }) : null;
  if (photo) side.push(photo);
  const sideHeading = (label) => new Paragraph({ style: 'QjoSection', bidirectional: rtl, border: { bottom: rule(theme.sideMuted, 6, 2) }, children: text(label, rtl, { color: 'FFFFFF' }) });
  if (cv.contact.length) side.push(sideHeading(t('cvContact')), ...cv.contact.map((c) => new Paragraph({ bidirectional: rtl, spacing: { after: 70 }, children: text(c.text, rtl, { color: theme.sideInk, size: half(theme.size * 0.93) }) })));
  for (const s of sideSections) side.push(sideHeading(s.title), ...blocksToWord(s.markdown, { rtl, theme, lists, width: sideW, color: theme.sideInk }));
  const mainSections = cv.sections.filter((s) => !SIDE.has(s.key));
  const main = [name, ...job, ...mainSections.flatMap((s) => section(s, mainW - 500))];
  const pad = { top: 240, bottom: 240, left: 300, right: 300 };
  const table = new Table({
    width: { size: sideW + mainW, type: WidthType.DXA }, columnWidths: [sideW, mainW], layout: TableLayoutType.FIXED, borders: NO_BORDERS, visuallyRightToLeft: rtl,
    rows: [new TableRow({ height: { value: 15400, rule: HeightRule.ATLEAST }, children: [
      new TableCell({ width: { size: sideW, type: WidthType.DXA }, margins: pad, shading: { type: ShadingType.CLEAR, fill: theme.side, color: 'auto' }, children: side.length ? side : [new Paragraph({ children: [] })] }),
      new TableCell({ width: { size: mainW, type: WidthType.DXA }, margins: { ...pad, left: 450, right: 450 }, children: main })] })]
  });
  return { margins: 567, children: [table, new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] })] };
}

// ── Documents ─────────────────────────────────────────────────────────────

/** The contents list: a TOC field whose result is already there — entries linked to their bookmarks, a PAGEREF each that Word fills on open. */
function tocParagraphs(entries, theme, rtl, width, t) {
  const out = [new Paragraph({ style: 'QjoTocTitle', bidirectional: rtl, children: text(t('tocTitle'), rtl) })];
  entries.forEach((e, i) => {
    const children = [];
    if (i === 0) children.push(new TextRun({ text: TOC_BEGIN }));
    const label = theme.numbered ? `${e.number}   ${e.text}` : e.text;
    children.push(new InternalHyperlink({ anchor: bookmarkName(e.index), children: [new TextRun({ text: label, bold: e.depth === 0, rightToLeft: rtl && /[؀-ۿ]/.test(label) })] }));
    children.push(new TextRun({ text: '\t' }), new SimpleField(` PAGEREF ${bookmarkName(e.index)} \\h `, ''));
    if (i === entries.length - 1) children.push(new TextRun({ text: TOC_END }));
    out.push(new Paragraph({ style: 'QjoToc', bidirectional: rtl, indent: { [rtl ? 'right' : 'left']: e.depth * 360 }, spacing: { before: e.depth === 0 ? 120 : 0, after: 60 },
      tabStops: [{ type: TabStopType.RIGHT, position: width, leader: LeaderType.DOT }], children }));
  });
  return out;
}

function coverTable(theme, rtl, lines, { fill, height }) {
  return new Table({
    width: { size: A4.width, type: WidthType.DXA }, columnWidths: [A4.width], layout: TableLayoutType.FIXED, borders: NO_BORDERS, visuallyRightToLeft: rtl,
    rows: [new TableRow({ height: { value: height, rule: HeightRule.EXACT }, children: [new TableCell({
      width: { size: A4.width, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 0, bottom: 0, left: 1400, right: 1400 },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' }, children: lines })] })]
  });
}

function coverSection(id, theme, { title, date, rtl, t }) {
  const note = (value, extra = {}) => new Paragraph({ style: 'QjoCoverNote', bidirectional: rtl, ...extra, children: text(value, rtl, { color: extra.color }) });
  const big = (extra = {}) => new Paragraph({ style: 'QjoCover', bidirectional: rtl, ...extra, children: text(title, rtl) });
  const centered = { alignment: AlignmentType.CENTER };
  const by = t('coverPreparedWith');
  const properties = { page: { margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } };
  if (id === 'report' || id === 'story') {
    const lines = id === 'report'
      ? [note('QJO AI', { spacing: { after: 4200 } }), new Paragraph({ border: { top: rule('F2B134', 36, 8) }, spacing: { after: 240 }, children: [] }), big(), note(date, { spacing: { before: 2600 } })]
      : [new Paragraph({ ...centered, border: { top: rule(theme.coverInk, 6, 12) }, spacing: { before: 0, after: 600 }, children: [] }), big({ ...centered }), note(by.toUpperCase(), { ...centered, spacing: { before: 500 } }), note(date, centered)];
    return { properties, children: [coverTable(theme, rtl, lines, { fill: theme.cover, height: A4.height - 40 }), new Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: 'exact' }, children: [new TextRun({ text: '', size: 2 })] })] };
  }
  const framed = id === 'elegant';
  const frame = framed ? { pageBorders: { display: 'allPages', offsetFrom: 'page' }, pageBorderTop: { style: BorderStyle.DOUBLE, size: 6, color: theme.accent, space: 40 }, pageBorderBottom: { style: BorderStyle.DOUBLE, size: 6, color: theme.accent, space: 40 }, pageBorderLeft: { style: BorderStyle.DOUBLE, size: 6, color: theme.accent, space: 40 }, pageBorderRight: { style: BorderStyle.DOUBLE, size: 6, color: theme.accent, space: 40 } } : undefined;
  return {
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1700, right: 1700 }, borders: frame }, verticalAlign: VerticalAlign.CENTER },
    children: [
      new Paragraph({ ...centered, border: { top: rule(theme.accent, framed ? 6 : 12, 12) }, spacing: { after: 600 }, indent: { left: 2600, right: 2600 }, children: [] }),
      big(centered),
      ...(id === 'academic' ? [] : [new Paragraph({ ...centered, border: { top: rule(theme.accent, 6, 12) }, spacing: { after: 400 }, indent: { left: 3200, right: 3200 }, children: [] })]),
      note(framed ? by.toUpperCase() : by, { ...centered, color: framed ? theme.accent : theme.muted }),
      note(date, { ...centered, color: theme.muted })
    ]
  };
}

function footerFor(id, theme, rtl, title) {
  const font = fontOf(theme);
  const number = (before = '', after = '') => new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: false, children: [
    new TextRun({ text: before, font, size: 18, color: theme.muted }), new TextRun({ children: [PageNumber.CURRENT], font, size: 18, color: theme.accent }), new TextRun({ text: after, font, size: 18, color: theme.muted })] });
  if (id === 'story') return number('— ', ' —');
  if (id === 'report') {
    return new Paragraph({ bidirectional: rtl, tabStops: [{ type: TabStopType.RIGHT, position: A4.width - 2 * 1247 }], border: { top: rule(theme.line, 4, 6) }, children: [
      new TextRun({ text: title.slice(0, 70), font, size: 17, color: theme.muted, rightToLeft: rtl && /[؀-ۿ]/.test(title) }), new TextRun({ text: '\t' }),
      new TextRun({ children: [PageNumber.CURRENT], font, size: 18, color: theme.accent, bold: true })] });
  }
  return number();
}

function headingParagraphs(block, entry, id, theme, rtl, t) {
  const level = HEADINGS[Math.min(block.level, 6) - 1];
  const chapter = id === 'story' && entry.depth === 0;
  const children = [];
  if (theme.numbered) children.push(new TextRun({ text: `${entry.number}  `, color: theme.accent, rightToLeft: false }));
  children.push(...inlineChildren(block.runs, block.rtl));
  const mark = new Bookmark({ id: bookmarkName(entry.index), children });
  const paragraph = new Paragraph({ heading: level, bidirectional: block.rtl, keepNext: true, pageBreakBefore: chapter || undefined, alignment: chapter ? AlignmentType.CENTER : undefined,
    spacing: chapter ? { before: 400, after: 500 } : undefined, children: [mark] });
  if (!chapter) return [paragraph];
  return [new Paragraph({ style: 'QjoChapterLabel', bidirectional: rtl, pageBreakBefore: true, children: text(t('chapterLabel', { n: entry.chapter }), rtl) }),
    new Paragraph({ heading: level, bidirectional: block.rtl, keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 0, after: 500 }, children: [mark] })];
}

/** The first paragraph of a chapter: a drop cap in Latin script, a bold lead-in in Arabic. */
function openingParagraph(block, theme, rtl) {
  const flat = block.runs.map((r) => r.text).join('');
  const letter = /^\p{L}/u.exec(flat);
  const plainRuns = block.runs.every((r) => !r.code && !r.link && !r.math && !r.break);
  if (!rtl && letter && plainRuns) {
    const first = flat.slice(0, 1);
    let skip = 1;
    const rest = block.runs.map((r) => { const cut = Math.min(skip, r.text.length); skip -= cut; return { ...r, text: r.text.slice(cut) }; }).filter((r) => r.text);
    return [
      new Paragraph({ frame: /** @type {any} */ ({ type: 'absolute', anchor: { horizontal: FrameAnchorType.TEXT, vertical: FrameAnchorType.TEXT }, width: 700, height: 700, dropCap: DropCapType.DROP, lines: 3, wrap: FrameWrap.AROUND, space: { horizontal: 60, vertical: 0 } }),
        spacing: { before: 0, after: 0, line: 700, lineRule: 'exact' }, children: [new TextRun({ text: first, font: fontOf(theme), size: half(theme.size * 4.2), bold: true, color: theme.accent })] }),
      textParagraph(rest, false, {})
    ];
  }
  let words = 5;
  const runs = block.runs.flatMap((r) => {
    if (words <= 0 || r.code || r.link || r.math || r.break) return [r];
    const parts = r.text.split(/(\s+)/);
    const lead = []; const tail = [];
    for (const part of parts) { if (words > 0) { lead.push(part); if (part.trim()) words--; } else tail.push(part); }
    return [{ ...r, text: lead.join(''), bold: true, color: theme.accent }, ...(tail.length ? [{ ...r, text: tail.join('') }] : [])];
  });
  return [new Paragraph({ bidirectional: block.rtl, children: runs.flatMap((r) => inlineChildren([r], block.rtl, { color: r.color })) })];
}

function docChildren(id, theme, input, lists, t) {
  const { rtl, content } = input;
  const { blocks } = parseMarkdown(content, { rtl });
  const headings = blocks.filter((b) => b.type === 'heading');
  const outline = planOutline(headings.map((h) => ({ level: h.level, text: h.runs.map((r) => r.text).join('') })), input.title);
  const byIndex = new Map(outline.entries.map((e) => [e.index, e]));
  const margin = id === 'academic' ? 1417 : 1247;
  const width = A4.width - 2 * margin;
  const body = [];
  let seen = 0;
  let afterChapter = false;
  for (const block of blocks) {
    if (block.type === 'heading') {
      const entry = byIndex.get(seen++);
      if (!entry) continue;
      body.push(...headingParagraphs(block, entry, id, theme, rtl, t));
      afterChapter = id === 'story' && entry.depth === 0;
      continue;
    }
    if (afterChapter && block.type === 'paragraph') { body.push(...openingParagraph(block, theme, rtl)); afterChapter = false; continue; }
    afterChapter = false;
    body.push(...blockToWord(block, lists, theme.accent));
  }
  const listed = outline.entries.filter((e) => e.listed);
  const toc = listed.length ? tocParagraphs(listed, theme, rtl, width, t) : [];
  return { outline, toc, body, margin, tocLevels: Math.min(6, outline.base + 2) };
}

// ── The file ──────────────────────────────────────────────────────────────

/**
 * Word reads right to left from the section's <w:bidi/>, which has its place
 * in the section's properties (before the document grid). Every section.
 * The contents list's field marks are put in where the entries were written.
 */
async function finish(buffer, { rtl, tocLevels }) {
  const zip = await JSZip.loadAsync(buffer);
  let xml = await zip.file('word/document.xml').async('string');
  if (rtl) xml = xml.replace(/<w:sectPr(\s[^>]*)?>[\s\S]*?<\/w:sectPr>/g, (sect) => (sect.includes('<w:bidi') ? sect : /<w:docGrid/.test(sect) ? sect.replace('<w:docGrid', '<w:bidi/><w:docGrid') : sect.replace('</w:sectPr>', '<w:bidi/></w:sectPr>')));
  const marker = (name) => new RegExp(`<w:r>(?:<w:rPr>(?:(?!</w:rPr>)[\\s\\S])*</w:rPr>)?<w:t(?:\\s[^>]*)?>${name}</w:t></w:r>`);
  xml = xml
    .replace(marker(TOC_BEGIN), `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-${tocLevels}" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>`)
    .replace(marker(TOC_END), '<w:r><w:fldChar w:fldCharType="end"/></w:r>');
  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * @param {{template: string, title: string, content: string, rtl: boolean, date?: Date}} input
 * @returns {Promise<Buffer>}
 */
async function buildTemplateDocx(input) {
  const id = input.template;
  const theme = themeOf(id);
  const { rtl, title } = input;
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  const lists = { count: 0 };
  const date = (input.date || new Date()).toLocaleDateString(rtl ? 'ar-JO' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const base = { creator: 'Qjo', title, styles: styles(theme, rtl), numbering, features: { updateFields: theme.kind === 'doc' } };
  let sections;
  let tocLevels = 3;
  if (theme.kind === 'cv') {
    const { margins, children } = cvChildren(id, theme, input, lists);
    sections = [{ properties: { page: { size: { width: A4.width, height: A4.height }, margin: { top: id === 'modern' ? 567 : margins, bottom: id === 'modern' ? 400 : margins, left: margins, right: margins } } }, children }];
  } else {
    const plan = docChildren(id, theme, input, lists, t);
    tocLevels = plan.tocLevels;
    const cover = coverSection(id, theme, { title: plan.outline.title, date, rtl, t });
    const size = { width: A4.width, height: A4.height };
    cover.properties.page = { ...cover.properties.page, size };
    sections = [
      { properties: cover.properties, children: cover.children },
      { properties: { page: { size, margin: { top: 1247, bottom: 1247, left: plan.margin, right: plan.margin } } },
        footers: { default: new Footer({ children: [footerFor(id, theme, rtl, plan.outline.title)] }) },
        children: [...plan.toc, ...(plan.toc.length ? [new Paragraph({ children: [new PageBreak()] })] : []), ...plan.body] }
    ];
  }
  const doc = new Document({ ...base, sections });
  return finish(await Packer.toBuffer(doc), { rtl, tocLevels });
}

module.exports = { buildTemplateDocx };

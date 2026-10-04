// An answer as a Word document that reads like one written in Word: real
// headings, numbered and bulleted lists, tables with a header row, code in a
// monospace box that stays left to right, and Arabic laid out right to left —
// the paragraph, the table and every Arabic stretch of text.
//
// Before this, every line was a plain paragraph: tables arrived as rows of
// pipes, code as loose lines (a "# comment" inside it turned into a heading),
// and an Arabic document was left-aligned with its English words out of order.
'use strict';

const {
  Document, Packer, Paragraph, TextRun, ExternalHyperlink, Table, TableRow, TableCell,
  WidthType, HeadingLevel, AlignmentType, BorderStyle, ShadingType, LevelFormat, ImageRun
} = require('docx');
const JSZip = require('jszip');
const { parseMarkdown, mathToText } = require('./markdownModel');
const { decodeImage } = require('./attachedImages');

const COLOR = { ink: '0F172A', accent: '7B3FE4', muted: '64748B', link: '1D4ED8', codeBg: 'F1F5F9', line: 'CBD5E1', zebra: 'F8FAFC', white: 'FFFFFF' };
// Arial carries Arabic on every system Word runs on; Calibri is Word's own.
const FONT = { ascii: 'Calibri', hAnsi: 'Calibri', cs: 'Arial' };
// Consolas has no Arabic; an Arabic comment in code falls to Courier New, which does.
const CODE_FONT = { ascii: 'Consolas', hAnsi: 'Consolas', cs: 'Courier New' };
const MATH_FONT = { ascii: 'Cambria Math', hAnsi: 'Cambria Math', cs: 'Cambria Math' };
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const LINE = { style: BorderStyle.SINGLE, size: 4, color: COLOR.line };

const LATIN_STRETCH = /[A-Za-z\u00C0-\u024F](?:[A-Za-z0-9\u00C0-\u024F\s.,'\u2019:;/@&+#%_-]*[A-Za-z0-9\u00C0-\u024F])?/g;
const ARABIC_STRETCH = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF](?:[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF0-9\s.,\u060C\u061B'-]*[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF])?/g;

/**
 * A text cut where its script changes. In an Arabic paragraph the English
 * stretches run left to right and everything else (spaces, digits,
 * punctuation between them) follows the paragraph; in an English paragraph,
 * the other way round. Word needs this per run to order mixed text correctly.
 * @returns {Array<{text: string, rtl: boolean}>}
 */
function directionRuns(text, paragraphRtl) {
  const pattern = paragraphRtl ? LATIN_STRETCH : ARABIC_STRETCH;
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(pattern)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), rtl: paragraphRtl });
    out.push({ text: m[0], rtl: !paragraphRtl });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), rtl: paragraphRtl });
  return out;
}

/**
 * @param {import('./markdownModel').Run[]} runs
 * @param {boolean} rtl the paragraph's direction
 * @param {{color?: string, bold?: boolean, size?: number}} [style]
 */
function inlineChildren(runs, rtl, style = {}) {
  const children = [];
  for (const run of runs || []) {
    if (run.break) { children.push(new TextRun({ text: '', break: 1 })); continue; }
    const base = {
      bold: run.bold || style.bold || undefined,
      italics: run.italic || undefined,
      strike: run.strike || undefined,
      color: style.color || (run.link ? COLOR.link : undefined),
      size: style.size,
      underline: run.link ? {} : undefined
    };
    let pieces;
    if (run.code) {
      pieces = [new TextRun({ ...base, text: run.text, font: CODE_FONT, shading: { type: ShadingType.CLEAR, fill: COLOR.codeBg, color: 'auto' }, rightToLeft: false })];
    } else if (run.math) {
      pieces = [new TextRun({ ...base, text: mathToText(run.text), font: MATH_FONT, italics: true, rightToLeft: false })];
    } else {
      pieces = directionRuns(run.text, rtl).map((part) => new TextRun({ ...base, text: part.text, rightToLeft: part.rtl }));
    }
    children.push(...(run.link ? [new ExternalHyperlink({ link: run.link, children: pieces })] : pieces));
  }
  return children;
}

function textParagraph(runs, rtl, options = {}) {
  const { style, ...rest } = options;
  return new Paragraph({ bidirectional: rtl, children: inlineChildren(runs, rtl, style), ...rest });
}

function tableBlock(block) {
  // The column alignment the Markdown asked for (":---:", "---:"). Left and
  // right are kept as written only in a left-to-right table; in a
  // right-to-left one a column keeps its start, which is what was meant.
  const alignOf = (k) => (block.align[k] === 'center' ? AlignmentType.CENTER
    : !block.rtl && block.align[k] === 'right' ? AlignmentType.RIGHT : undefined);
  const cell = (runs, header, zebra, k) => new TableCell({
    shading: header ? { type: ShadingType.CLEAR, fill: COLOR.accent, color: 'auto' } : zebra ? { type: ShadingType.CLEAR, fill: COLOR.zebra, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [textParagraph(runs, block.rtl, { alignment: alignOf(k), spacing: { before: 0, after: 0 }, style: header ? { bold: true, color: COLOR.white } : {} })]
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: block.rtl,
    borders: { top: LINE, bottom: LINE, left: LINE, right: LINE, insideHorizontal: LINE, insideVertical: LINE },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: block.header.map((runs, k) => cell(runs, true, false, k)) }),
      ...block.rows.map((row, i) => new TableRow({ cantSplit: true, children: row.map((runs, k) => cell(runs, false, i % 2 === 1, k)) }))
    ]
  });
}

function codeBlock(block) {
  const box = { type: ShadingType.CLEAR, fill: COLOR.codeBg, color: 'auto' };
  const lines = block.text.split('\n');
  const out = [];
  if (block.lang) {
    out.push(new Paragraph({ bidirectional: false, spacing: { before: 120, after: 0 }, children: [new TextRun({ text: block.lang, font: CODE_FONT, size: 16, color: COLOR.muted })] }));
  }
  lines.forEach((line, i) => out.push(new Paragraph({
    bidirectional: false,
    shading: box,
    spacing: { before: i === 0 && !block.lang ? 120 : 0, after: i === lines.length - 1 ? 160 : 0, line: 264 },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: line || ' ', font: CODE_FONT, size: 19, color: COLOR.ink, rightToLeft: false })]
  })));
  return out;
}

// The person's own image, centred, within a box a CV photo fits (pixels at
// 96 per inch: about 7 x 8.5 cm); its description when it cannot be drawn.
function imageBlock(block) {
  const image = decodeImage(block.src);
  if (!image) return block.alt ? [textParagraph([{ text: block.alt }], false)] : [];
  const scale = Math.min(1, 260 / image.width, 320 / image.height);
  return [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new ImageRun({
    type: image.type, data: image.data,
    transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) },
    altText: { name: block.alt || 'image', title: block.alt, description: block.alt }
  })] })];
}

/** @param {import('./markdownModel').Block} block */
function blockToWord(block, lists) {
  switch (block.type) {
    case 'image':
      return imageBlock(block);
    case 'heading':
      return [textParagraph(block.runs, block.rtl, { heading: HEADINGS[Math.min(block.level, 6) - 1], keepNext: true })];
    case 'paragraph':
      return [textParagraph(block.runs, block.rtl)];
    case 'quote':
      return [textParagraph(block.runs.map((r) => ({ ...r, italic: true })), block.rtl, {
        style: { color: COLOR.muted },
        indent: { left: 360, right: 360 },
        // A paragraph border's sides are physical (indentation's are not):
        // the bar goes where the quote starts.
        border: { [block.rtl ? 'right' : 'left']: { style: BorderStyle.SINGLE, size: 18, color: COLOR.accent, space: 8 } }
      })];
    case 'list': {
      // Each list numbers from 1 of its own.
      const instance = ++lists.count;
      return block.items.map((item) => textParagraph(item.runs, item.rtl, {
        numbering: { reference: item.ordered ? 'qjo-number' : 'qjo-bullet', level: item.level, instance },
        spacing: { after: 60 }
      }));
    }
    case 'table':
      return [tableBlock(block), new Paragraph({ spacing: { after: 120 }, children: [] })];
    case 'code':
      return codeBlock(block);
    case 'math':
      return [new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: false, spacing: { before: 120, after: 120 },
        children: [new TextRun({ text: mathToText(block.tex), font: MATH_FONT, size: 26, italics: true, rightToLeft: false })] })];
    case 'rule':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR.line, space: 1 } }, children: [] })];
    default:
      return [];
  }
}

function numberingLevels(ordered) {
  const bullets = ['•', '◦', '▪'];
  const formats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
  return [0, 1, 2, 3, 4, 5].map((level) => ({
    level,
    format: ordered ? formats[level % 3] : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : bullets[level % 3],
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 420 * (level + 1), hanging: 300 } } }
  }));
}

const heading = (size) => ({ run: { font: FONT, size, bold: true, color: COLOR.accent }, paragraph: { spacing: { before: 280, after: 120 } } });

/**
 * Word has no document-wide direction in this library; the section's
 * <w:bidi/> is what makes Word open the document right to left.
 */
async function withSectionDirection(buffer, rtl) {
  if (!rtl) return buffer;
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  zip.file('word/document.xml', xml.replace(/<w:sectPr(\s[^>]*)?>/, (open) => `${open}<w:bidi/>`));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * @param {{title: string, content: string, rtl?: boolean, date?: Date}} input
 * @returns {Promise<Buffer>}
 */
async function buildDocx({ title, content, rtl: requestedRtl, date = new Date() }) {
  const { blocks, rtl } = parseMarkdown(content, { rtl: requestedRtl });
  const lists = { count: 0 };
  const titleRtl = /[؀-ۿ]/.test(title) ? true : /[A-Za-z]/.test(title) ? false : rtl;
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, bidirectional: titleRtl, children: inlineChildren([{ text: title }], titleRtl) }),
    new Paragraph({ bidirectional: rtl, spacing: { after: 240 }, children: [new TextRun({ text: `Qjo • ${date.toISOString().slice(0, 10)}`, size: 18, color: COLOR.muted, rightToLeft: false })] }),
    ...blocks.flatMap((block) => blockToWord(block, lists))
  ];
  const doc = new Document({
    creator: 'Qjo',
    title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 22, color: COLOR.ink, language: { value: rtl ? 'ar-SA' : 'en-US', bidirectional: 'ar-SA' } }, paragraph: { spacing: { after: 120, line: 300 } } },
        title: { run: { font: FONT, size: 44, bold: true, color: COLOR.accent }, paragraph: { spacing: { after: 60 } } },
        heading1: heading(34), heading2: heading(28), heading3: heading(25), heading4: heading(23), heading5: heading(22), heading6: heading(22),
        hyperlink: { run: { color: COLOR.link, underline: {} } }
      }
    },
    numbering: { config: [{ reference: 'qjo-bullet', levels: numberingLevels(false) }, { reference: 'qjo-number', levels: numberingLevels(true) }] },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }]
  });
  return withSectionDirection(await Packer.toBuffer(doc), rtl);
}

module.exports = { buildDocx, directionRuns };

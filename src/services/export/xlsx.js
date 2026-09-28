// An answer's tables as a workbook someone can work in: numbers that are
// numbers, a header that stays put and filters, and a sheet that reads right
// to left when the table is Arabic.
//
// Before this, every cell was text — "120", "$4.50" and "35%" could not be
// summed or sorted — and the sheet's direction was set with an option exceljs
// ignores, so an Arabic table always opened left to right.
'use strict';

const ExcelJS = require('exceljs');
const { parseMarkdown, runsText, cellValue } = require('./markdownModel');

const COLOR = { accent: 'FF123B7A', white: 'FFFFFFFF', zebra: 'FFF8FAFC', line: 'FFCBD5E1', totalFill: 'FFE2E8F0' };
const THIN = { style: 'thin', color: { argb: COLOR.line } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
// A column is totalled only when adding it up means something: quantities and
// amounts, not prices per unit, rates, years or ranks.
const NOT_SUMMABLE = /price|rate|avg|average|mean|median|percent|ratio|year|rank|id\b|age|score|grade|سعر|معدل|متوسط|نسبة|سنة|عام|ترتيب|رقم|عمر|درجة|علامة/i;

function sheetName(base, taken) {
  const clean = String(base || '').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = clean;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean.slice(0, 26)} ${n}`;
  taken.add(name.toLowerCase());
  return name;
}

const columnLetter = (n) => { let s = ''; for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };
const displayWidth = (text) => [...String(text || '')].reduce((w, ch) => w + (/[؀-ۿ]/.test(ch) ? 1.2 : 1), 0);

function addTableSheet(workbook, table, name, labels) {
  const rtl = table.rtl;
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, rightToLeft: rtl, showGridLines: true }] });
  const header = table.header.map((runs) => runsText(runs));
  const typed = table.rows.map((row) => row.map((runs) => cellValue(runsText(runs))));

  const head = sheet.addRow(header);
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLOR.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.accent } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, readingOrder: rtl ? 'rtl' : 'ltr' };
    cell.border = BORDER;
  });

  typed.forEach((row, r) => {
    const added = sheet.addRow(row.map((v) => v.value));
    row.forEach((v, c) => {
      const cell = added.getCell(c + 1);
      if (v.numFmt) cell.numFmt = v.numFmt;
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: v.type === 'text', readingOrder: rtl ? 'rtl' : 'ltr' };
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.zebra } };
    });
  });

  // A total under each column that is all numbers or amounts.
  const summable = header.map((h, c) => {
    const values = typed.map((row) => row[c]).filter((v) => v.value !== '');
    return values.length >= 2 && values.every((v) => v.type === 'number' || v.type === 'currency') && !NOT_SUMMABLE.test(h);
  });
  if (typed.length >= 2 && summable.some(Boolean)) {
    const first = 2, last = typed.length + 1;
    const totals = header.map((_, c) => {
      if (!summable[c]) return c === 0 ? labels.total : '';
      const result = typed.reduce((sum, row) => sum + (typeof row[c].value === 'number' ? row[c].value : 0), 0);
      return { formula: `SUM(${columnLetter(c + 1)}${first}:${columnLetter(c + 1)}${last})`, result: Math.round(result * 1e6) / 1e6 };
    });
    const row = sheet.addRow(totals);
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.totalFill } };
      cell.border = { ...BORDER, top: { style: 'medium', color: { argb: COLOR.accent } } };
      const sample = typed.find((r) => r[c - 1] && r[c - 1].numFmt);
      if (summable[c - 1] && sample) cell.numFmt = sample[c - 1].numFmt;
    });
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + typed.length, column: header.length } };
  sheet.columns.forEach((column, c) => {
    const texts = [header[c], ...typed.map((row) => (row[c].type === 'text' ? row[c].value : String(row[c].value)))];
    column.width = Math.min(Math.max(...texts.map(displayWidth)) + 4, 50);
  });
  return sheet;
}

/**
 * @param {{title: string, content: string, rtl?: boolean, date?: Date}} input
 * @returns {Promise<Buffer>}
 */
async function buildXlsx({ title, content, rtl: requestedRtl, date = new Date() }) {
  const { blocks, rtl } = parseMarkdown(content, { rtl: requestedRtl });
  const labels = rtl ? { total: 'الإجمالي', table: 'جدول', report: 'التقرير' } : { total: 'Total', table: 'Table', report: 'Report' };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Qjo';
  workbook.created = date;
  const taken = new Set();

  // Each table on a sheet of its own, named after the heading above it.
  let lastHeading = '';
  let count = 0;
  for (const block of blocks) {
    if (block.type === 'heading') lastHeading = runsText(block.runs);
    if (block.type !== 'table' || !block.header.length) continue;
    count++;
    addTableSheet(workbook, block, sheetName(lastHeading || `${labels.table} ${count}`, taken), labels);
    lastHeading = '';
  }

  if (!count) {
    // No table: the text, one paragraph a row, readable in its direction.
    const sheet = workbook.addWorksheet(sheetName(labels.report, taken), { views: [{ rightToLeft: rtl, showGridLines: false }] });
    sheet.getColumn(1).width = 100;
    sheet.addRow([title]).font = { bold: true, size: 16, color: { argb: COLOR.accent } };
    sheet.addRow([`Qjo • ${date.toISOString().slice(0, 10)}`]).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
    sheet.addRow([]);
    for (const block of blocks) {
      const text = block.type === 'list' ? block.items.map((it) => `${'  '.repeat(it.level)}• ${runsText(it.runs)}`).join('\n')
        : block.type === 'code' ? block.text : block.type === 'math' ? block.tex : 'runs' in block ? runsText(block.runs) : '';
      if (!text) continue;
      const row = sheet.addRow([text]);
      row.getCell(1).alignment = { wrapText: true, vertical: 'top', readingOrder: rtl ? 'rtl' : 'ltr' };
      if (block.type === 'heading') row.font = { bold: true, size: 13, color: { argb: COLOR.accent } };
      if (block.type === 'code') row.font = { name: 'Consolas' };
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { buildXlsx, NOT_SUMMABLE };

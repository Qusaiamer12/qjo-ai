// Exported files, generated for real and read back.
//
// Word and Excel exports passed every check there was while an Arabic report
// came out left-aligned, its tables as rows of pipes, a "# comment" in its
// code as a heading, and every spreadsheet cell as text. Nothing opened the
// files. This suite builds each one from the same kind of answer the model
// writes and asserts on what is inside: the document XML, and the workbook as
// exceljs reads it. tests/fixtures are not needed — the answers are below.
'use strict';

const assert = require('assert');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const model = require('../src/services/export/markdownModel');
const { buildDocx, directionRuns } = require('../src/services/export/docx');
const { buildXlsx } = require('../src/services/export/xlsx');
const { exportDocx, exportXlsx } = require('../src/services/exportService');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 4).join('\n     ')}`);
  }
}
const count = (text, pattern) => (text.match(pattern) || []).length;

const ARABIC = `# تقرير المبيعات الربعي

مقدمة فيها **نص غامق** و*نص مائل* و\`كود\` ورابط [Qjo](https://qjo.ai) و English words داخل العربي 2026.

## الجدول

| المنتج | الكمية | السعر | النسبة | ملاحظات |
| --- | --- | --- | --- | --- |
| قهوة | 120 | $4.50 | 35% | الأكثر مبيعاً |
| شاي | ٨٠ | $2.25 |  | بدون نسبة |
| كعك | 45 | $3.00 | 12.5% | جديد |

## قائمة

- بند أول
  - بند فرعي
- بند ثاني

1. خطوة واحد
2. خطوة اثنين

نص بين القائمتين.

1. قائمة ثانية تبدأ من واحد

### كود

\`\`\`python
# هذا تعليق وليس عنواناً
total = sum([120, 80, 45])
\`\`\`

> اقتباس مهم

المعادلة: $$E = mc^2$$`;

const ENGLISH = `# Quarterly report

Intro with **bold** and an Arabic phrase: مرحبا بالعالم.

| Product | Qty | Price |
| --- | ---: | :---: |
| Coffee | 1,200 | $4.50 |
| Tea | 300 | $2.25 |`;

async function docxXml(buffer, part = 'word/document.xml') {
  return (await JSZip.loadAsync(buffer)).file(part).async('string');
}
async function workbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}
function call(handler, body) {
  return new Promise((resolve) => {
    const res = { status(code) { this.code = code; return this; }, setHeader() {}, json(o) { resolve({ code: this.code, json: o }); }, send(b) { resolve({ code: this.code || 200, body: b }); } };
    handler({ body, headers: {} }, res);
  });
}

(async () => {
  console.log('\nReading the Markdown once:');
  await test('a "# comment" inside a code block is code, not a heading', () => {
    const { blocks } = model.parseMarkdown('```python\n# not a heading\nx = 1\n```');
    assert.deepStrictEqual(blocks.map((b) => b.type), ['code']);
    assert.ok(blocks[0].text.startsWith('# not a heading'));
  });
  await test('an empty cell stays in its column', () => {
    const table = model.parseMarkdown('| a | b | c |\n| - | - | - |\n| 1 |  | 3 |\n| 4 |').blocks[0];
    assert.deepStrictEqual(table.rows.map((r) => r.map(model.runsText)), [['1', '', '3'], ['4', '', '']]);
  });
  await test('a pipe inside inline code is not a column', () => {
    assert.deepStrictEqual(model.splitRow('| `a | b` | c |'), ['`a | b`', 'c']);
  });
  await test('nested and ordered list items keep their level and kind', () => {
    const list = model.parseMarkdown('- a\n  - b\n    continued\n- c\n1. one').blocks[0];
    assert.deepStrictEqual(list.items.map((i) => `${i.level}${i.ordered ? '#' : '-'}${model.runsText(i.runs)}`), ['0-a', '1-b\ncontinued', '0-c', '0#one']);
  });
  await test('inline marks: bold, italic, code, link, strike — and snake_case is not italic', () => {
    const runs = model.parseInline('**b** *i* `c` [l](https://x.io) ~~s~~ snake_case_name');
    const marks = runs.filter((r) => r.text.trim()).map((r) => Object.keys(r).filter((k) => k !== 'text').join('+') || 'plain');
    assert.deepStrictEqual(marks, ['bold', 'italic', 'code', 'link', 'strike', 'plain']);
  });
  await test('money is not math: "$4.50 and $3", "$10-$20" stay text, "$x^2$" is math', () => {
    for (const money of ['$4.50 and $3', 'from $10-$20 per item', 'a $5/$6 split']) {
      assert.ok(!model.parseInline(money).some((r) => r.math), money);
    }
    assert.ok(model.parseInline('area $x^2$ here').some((r) => r.math && r.text === 'x^2'));
  });
  await test('math reads as text: E = mc², a/b, H₂O, ΔG', () => {
    assert.deepStrictEqual(['E = mc^2', '\\frac{a}{b}', '\\ce{H2O}', '\\Delta G'].map(model.mathToText), ['E = mc²', 'a/b', 'H₂O', 'ΔG']);
  });
  await test('direction: the page\'s choice wins, else the text as the page judges it; a paragraph follows its first letter', () => {
    assert.strictEqual(model.parseMarkdown('English with one كلمة').rtl, false);
    // An Arabic report under an English heading, full of English terms, is Arabic.
    const report = '# Sales Report Q3\n\n' + 'تحليل أداء المبيعات باستخدام Power BI و Excel مع مؤشرات KPI و ROI للربع الثالث. '.repeat(12);
    assert.strictEqual(model.parseMarkdown(report).rtl, true);
    assert.strictEqual(require('../public/domain/language').documentLanguage(report), 'ar', 'the page judges it the same way');
    assert.strictEqual(model.parseMarkdown('English only', { rtl: true }).rtl, true);
    const { blocks } = model.parseMarkdown('نص عربي\n\nAn English line', { rtl: true });
    assert.deepStrictEqual(blocks.map((b) => b.rtl), [true, false]);
  });
  for (const [raw, type, value] of [['120', 'number', 120], ['٨٠', 'number', 80], ['1,250.5', 'number', 1250.5], ['$4.50', 'currency', 4.5], ['12 JOD', 'currency', 12],
    ['35%', 'percent', 0.35], ['٥٠٪', 'percent', 0.5], ['0791234567', 'text', '0791234567'], ['2026-02-30', 'text', '2026-02-30'], ['abc', 'text', 'abc']]) {
    await test(`a cell "${raw}" is ${type}`, () => {
      const v = model.cellValue(raw);
      assert.strictEqual(v.type, type);
      assert.strictEqual(v.value, value);
    });
  }

  console.log('\nWord:');
  const arabicDoc = await docxXml(await buildDocx({ title: 'تقرير', content: ARABIC }));
  const englishDoc = await docxXml(await buildDocx({ title: 'Report', content: ENGLISH }));
  await test('an Arabic document opens right to left: the section, its paragraphs and its table', () => {
    assert.ok(/<w:sectPr[^>]*>\s*<w:bidi\/>/.test(arabicDoc), 'section');
    assert.ok(count(arabicDoc, /<w:bidi\/>/g) > 10, 'paragraphs');
    assert.ok(/<w:bidiVisual\/>/.test(arabicDoc), 'table');
    assert.ok(!/<w:sectPr[^>]*>\s*<w:bidi\/>/.test(englishDoc) && !/<w:bidiVisual\/>/.test(englishDoc), 'the English document stays left to right');
  });
  await test('English inside Arabic runs left to right, and Arabic inside English right to left', () => {
    assert.ok(/<w:r>(?:(?!<\/w:r>).)*?<w:t[^>]*>English words<\/w:t>/s.test(arabicDoc), 'the English stretch is a run of its own');
    const englishRun = /<w:r>((?:(?!<\/w:r>).)*?)<w:t[^>]*>English words<\/w:t>/s.exec(arabicDoc)[1];
    assert.ok(!/<w:rtl\/>/.test(englishRun), 'and is not marked right to left');
    const arabicRun = /<w:r>((?:(?!<\/w:r>).)*?)<w:t[^>]*>مرحبا بالعالم<\/w:t>/s.exec(englishDoc);
    assert.ok(arabicRun && /<w:rtl\/>/.test(arabicRun[1]), 'the Arabic phrase in English is');
    assert.deepStrictEqual(directionRuns('نص و English words هنا', true).map((r) => r.rtl), [true, false, true]);
  });
  await test('a table is a table: one header row, every row as wide as the header', () => {
    assert.strictEqual(count(arabicDoc, /<w:tbl>/g), 1);
    assert.strictEqual(count(arabicDoc, /<w:tblHeader\/>/g), 1);
    const rows = [...arabicDoc.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((m) => count(m[1], /<w:tc>/g));
    assert.deepStrictEqual(rows, [5, 5, 5, 5]);
    assert.ok(!/\| ?---/.test(arabicDoc) && !/```/.test(arabicDoc), 'no Markdown left in the text');
  });
  await test('headings are Word headings', () => {
    assert.ok(/w:pStyle w:val="Title"/.test(arabicDoc));
    for (const n of [1, 2, 3]) assert.ok(new RegExp(`w:pStyle w:val="Heading${n}"`).test(arabicDoc), `Heading${n}`);
  });
  await test('lists are Word lists, and each numbered list starts from one', async () => {
    assert.strictEqual(count(arabicDoc, /<w:numPr>/g), 6, 'six list items');
    const numIds = [...arabicDoc.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]);
    assert.ok(new Set(numIds.slice(3)).size === 2, `the two numbered lists are separate numberings: ${numIds}`);
    const numbering = await docxXml(await buildDocx({ title: 't', content: ARABIC }), 'word/numbering.xml');
    assert.ok(/w:numFmt w:val="bullet"/.test(numbering) && /w:numFmt w:val="decimal"/.test(numbering));
  });
  await test('code keeps its comment, in a monospace box that stays left to right', () => {
    const para = /<w:p>((?:(?!<\/w:p>).)*?)# هذا تعليق وليس عنواناً((?:(?!<\/w:p>).)*?)<\/w:p>/s.exec(arabicDoc);
    assert.ok(para, 'the comment is in the document');
    assert.ok(!/<w:bidi\/>/.test(para[1]) && !/w:pStyle w:val="Heading/.test(para[1]), 'not right to left, not a heading');
    assert.ok(/w:ascii="Consolas"/.test(para[1]) && /w:cs="Courier New"/.test(para[1]), 'Consolas, with an Arabic-capable fallback');
  });
  await test('links are real links', async () => {
    const rels = await docxXml(await buildDocx({ title: 't', content: ARABIC }), 'word/_rels/document.xml.rels');
    assert.ok(/Target="https:\/\/qjo\.ai"/.test(rels) && /<w:hyperlink /.test(arabicDoc));
  });
  await test('math is readable, not LaTeX', () => {
    assert.ok(arabicDoc.includes('E = mc²') && !arabicDoc.includes('$$'));
  });

  console.log('\nExcel:');
  const arabicBook = await workbook(await buildXlsx({ title: 'تقرير', content: ARABIC }));
  const sheet = arabicBook.worksheets[0];
  await test('an Arabic table opens right to left, with its header frozen and filtered', () => {
    const view = sheet.views[0];
    assert.strictEqual(view.rightToLeft, true);
    assert.strictEqual(view.state, 'frozen');
    assert.strictEqual(view.ySplit, 1);
    assert.strictEqual(sheet.autoFilter, 'A1:E4');
    assert.strictEqual(sheet.name, 'الجدول', 'named after its heading');
  });
  await test('numbers, money and percentages are numbers, formatted as what they are', () => {
    const row = sheet.getRow(2);
    assert.deepStrictEqual([row.getCell(2).value, row.getCell(3).value, row.getCell(4).value], [120, 4.5, 0.35]);
    assert.deepStrictEqual([row.getCell(3).numFmt, row.getCell(4).numFmt], ['"$"#,##0.00', '0%']);
    assert.strictEqual(sheet.getRow(3).getCell(2).value, 80, 'Arabic-Indic digits');
    assert.strictEqual(sheet.getRow(3).getCell(4).value, '', 'the empty cell stays empty, in its column');
    assert.strictEqual(sheet.getRow(3).getCell(5).value, 'بدون نسبة');
  });
  await test('a total row sums what can be summed — the quantity, not the price or the share', () => {
    const total = sheet.getRow(5);
    assert.strictEqual(total.getCell(1).value, 'الإجمالي');
    assert.deepStrictEqual(total.getCell(2).value, { formula: 'SUM(B2:B4)', result: 245 });
    assert.ok(!total.getCell(3).value && !total.getCell(4).value, 'price and share are not totalled');
  });
  await test('an English table reads left to right with its own total', async () => {
    const book = await workbook(await buildXlsx({ title: 'Report', content: ENGLISH }));
    const ws = book.worksheets[0];
    assert.strictEqual(ws.views[0].rightToLeft, false);
    assert.deepStrictEqual(ws.getRow(4).getCell(2).value, { formula: 'SUM(B2:B3)', result: 1500 });
  });
  await test('each table on a sheet of its own, names safe and unique', async () => {
    const two = '## A/B: [x]\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n## A/B: [x]\n\n| c | d |\n| - | - |\n| 3 | 4 |';
    const book = await workbook(await buildXlsx({ title: 't', content: two }));
    assert.deepStrictEqual(book.worksheets.map((w) => w.name), ['A B x', 'A B x 2']);
  });
  await test('no table: the text, one block a row', async () => {
    const book = await workbook(await buildXlsx({ title: 'Notes', content: '# Head\n\nA paragraph.\n\n- one\n- two' }));
    const values = [];
    book.worksheets[0].eachRow((row) => values.push(row.getCell(1).value));
    assert.ok(values.includes('Head') && values.includes('A paragraph.') && values.some((v) => /• one\n• two/.test(String(v))), JSON.stringify(values));
  });

  console.log('\nThe routes:');
  await test('no content is the caller\'s fault: 400, not 500', async () => {
    for (const handler of [exportDocx, exportXlsx]) {
      const res = await call(handler, { title: 'x', content: '   ' });
      assert.strictEqual(res.code, 400, JSON.stringify(res.json));
    }
  });
  await test('the page\'s direction is honoured both ways', async () => {
    const rtlEnglish = await call(exportDocx, { title: 'Report', content: 'English only.', rtl: true });
    assert.ok(/<w:sectPr[^>]*>\s*<w:bidi\/>/.test(await docxXml(rtlEnglish.body)), 'rtl: true');
    const ltrArabic = await call(exportDocx, { title: 'تقرير', content: 'نص عربي فقط.', rtl: false });
    assert.ok(!/<w:sectPr[^>]*>\s*<w:bidi\/>/.test(await docxXml(ltrArabic.body)), 'rtl: false');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

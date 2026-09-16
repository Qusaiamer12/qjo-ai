#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PDF export regression suite.
//
//   node scripts/test-pdf-export.js
//
// Asserts the HTML the PDF renderer is built from, which is where every export
// defect so far has lived: math arriving as raw LaTeX, numbered lists rendering
// as bullets, images and blockquotes leaking through as literal markdown, and
// Latin sentences inside Arabic paragraphs losing their punctuation to bidi.
//
// The module is loaded through a Function wrapper so internal helpers can be
// asserted directly without widening the service's public surface.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const servicePath = path.join(__dirname, '..', 'src', 'services', 'exportService.js');
const source = fs.readFileSync(servicePath, 'utf8');
const mod = { exports: {} };
new Function('require', 'module', 'exports', '__dirname',
  `${source}\nmodule.exports.__internals = { markdownToExportHtml, inlineMarkdownToHtml, buildExportHtmlDocument, katexStylesheet, renderMathToHtml };`
)(require, mod, mod.exports, path.dirname(servicePath));

const { markdownToExportHtml, inlineMarkdownToHtml, buildExportHtmlDocument, katexStylesheet } = mod.exports.__internals;

let passed = 0;
let failed = 0;
function check(condition, label, detail) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); return; }
  failed++;
  console.error(`  ❌ ${label}`);
  if (detail !== undefined) console.error(`     ${String(detail).slice(0, 220)}`);
}

console.log('\nQjo PDF Export Suite');
console.log('====================\n');

// ── Math ─────────────────────────────────────────────────────────────────────
console.log('Math');
const inlineMath = inlineMarkdownToHtml('المعادلة $x = \\frac{a}{b}$ هنا');
check(inlineMath.includes('katex') && !inlineMath.includes('\\frac'), 'inline $...$ renders, no raw LaTeX', inlineMath);
const displayMath = markdownToExportHtml('$$\\int_0^1 x\\,dx$$');
check(displayMath.includes('katex-display'), 'display $$...$$ renders in display mode');
check(markdownToExportHtml('\\[E = mc^2\\]').includes('katex'), 'display \\[...\\] renders');
check(inlineMarkdownToHtml('\\(a^2\\)').includes('katex'), 'inline \\(...\\) renders');
const currency = inlineMarkdownToHtml('السعر $5 ثم $10 فقط');
check(currency.includes('$5') && currency.includes('$10'), 'currency is not mistaken for math', currency);
check(!inlineMarkdownToHtml('بدون رياضيات هنا').includes('katex'), 'plain text stays plain');
check(typeof markdownToExportHtml('$$\\frac{1}{$$') === 'string', 'malformed LaTeX does not throw');

// ── Fonts and self-containment ───────────────────────────────────────────────
console.log('\nSelf-containment');
const css = katexStylesheet();
check(css.length > 50000, `KaTeX stylesheet is inlined (${css.length.toLocaleString()} bytes)`);
check((css.match(/data:font\/woff2/g) || []).length >= 10, `math faces are embedded (${(css.match(/data:font\/woff2/g) || []).length})`);
check(!/url\(fonts\//.test(css), 'no unresolvable font paths remain');
const doc = buildExportHtmlDocument({ title: 'اختبار', content: '# عنوان', rtl: true });
check(!doc.includes('@import'), 'no CDN @import — export does not depend on the network');
check(!/https?:\/\/fonts\./.test(doc), 'no remote font requests');

// ── Block structure ──────────────────────────────────────────────────────────
console.log('\nBlock elements');
const ordered = markdownToExportHtml('1. أولاً\n2. ثانياً\n3. ثالثاً');
check(ordered.includes('<ol>') && !ordered.includes('<ul>'), 'numbered lists render as <ol>, not bullets', ordered);
check(markdownToExportHtml('- أ\n- ب').includes('<ul>'), 'bullet lists render as <ul>');
check(markdownToExportHtml('5. خمسة\n6. ستة').includes('start="5"'), 'a list starting mid-sequence keeps its number');
const nested = markdownToExportHtml('- أب\n  - ابن\n- أب٢');
check((nested.match(/<ul>/g) || []).length === 2, 'nested lists keep their hierarchy', nested);
check(markdownToExportHtml('> اقتباس').includes('<blockquote'), 'blockquotes render');
check(markdownToExportHtml('---').includes('<hr />'), 'horizontal rules render');
check(!markdownToExportHtml('---').includes('<ul>'), 'a rule is not mistaken for a list');
const headings = markdownToExportHtml('# ح1\n\n#### ح4\n\n###### ح6');
check(headings.includes('<h1') && headings.includes('<h4') && headings.includes('<h6'), 'heading levels h1–h6 are preserved', headings);
check(markdownToExportHtml('- [x] تم\n- [ ] لم يتم').includes('☑'), 'task lists render checkboxes');
check(markdownToExportHtml('| أ | ب |\n| --- | --- |\n| 1 | 2 |').includes('<table>'), 'tables render');

// ── Code ─────────────────────────────────────────────────────────────────────
console.log('\nCode');
const code = markdownToExportHtml('```javascript\nconst x = `مرحبا ${n}`;\n```');
check(code.includes('<pre') && code.includes('javascript'), 'fenced code renders with its language label');
check(code.includes('مرحبا'), 'Arabic inside a code block survives');
check(code.includes('dir="ltr"'), 'code blocks are forced LTR');
check(inlineMarkdownToHtml('استخدم `<div>` هنا').includes('&lt;div&gt;'), 'HTML inside inline code is escaped');

// ── Images (the CV case) ─────────────────────────────────────────────────────
console.log('\nImages');
const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const figure = markdownToExportHtml(`![صورة السيرة](${dataUri})`);
check(figure.includes('<figure>') && figure.includes('<img src="data:image/png'), 'a standalone image becomes a figure', figure.slice(0, 120));
check(figure.includes('<figcaption'), 'alt text becomes a caption');
check(inlineMarkdownToHtml(`نص ![ص](${dataUri}) نص`).includes('<img'), 'inline images render');
check(!inlineMarkdownToHtml('![ص](javascript:alert(1))').includes('<img'), 'non-image schemes are rejected');
check(markdownToExportHtml(`[رابط](https://x.test)`).includes('<a href='), 'links still render');

// ── Bidi ─────────────────────────────────────────────────────────────────────
console.log('\nBidirectional text');
const mixed = inlineMarkdownToHtml('مرحبًا، This sentence is in English and ends here. ثم عربي');
check(mixed.includes('<bdi>'), 'Latin runs inside Arabic are bidi-isolated', mixed);
check(/<bdi>[^<]*here\.<\/bdi>/.test(mixed), 'the run keeps its own trailing punctuation', mixed);
check(!inlineMarkdownToHtml('Pure English text here stays plain.').includes('<bdi>'), 'pure-Latin text is left alone');
check(inlineMarkdownToHtml('استخدم TypeScript هنا') === 'استخدم TypeScript هنا', 'a single loan word is not isolated');
check(markdownToExportHtml('نص عربي').includes('dir="auto"'), 'blocks carry dir="auto"');
const table = markdownToExportHtml('| أ | B |\n| --- | --- |\n| 1 | two |');
check((table.match(/dir="auto"/g) || []).length >= 4, 'table cells carry their own direction');

// ── Document shell ───────────────────────────────────────────────────────────
console.log('\nDocument');
const rtlDoc = buildExportHtmlDocument({ title: 'تقرير', content: 'نص', rtl: true });
const ltrDoc = buildExportHtmlDocument({ title: 'Report', content: 'text', rtl: false });
check(rtlDoc.includes('dir="rtl"') && ltrDoc.includes('dir="ltr"'), 'document direction follows the rtl flag');
check(/Noto Sans Arabic/.test(rtlDoc) && /Noto Sans CJK/.test(rtlDoc), 'font stack spans Arabic and CJK');
check(/Noto Color Emoji/.test(rtlDoc), 'emoji have a font');
check(rtlDoc.includes('orphans') && rtlDoc.includes('widows'), 'widow/orphan control is set');
check(rtlDoc.includes('break-inside'), 'tables, code and figures resist page splits');
check(buildExportHtmlDocument({ title: '<script>x</script>', content: '', rtl: false }).includes('&lt;script&gt;'), 'the title is escaped');

console.log(`\n${'='.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);

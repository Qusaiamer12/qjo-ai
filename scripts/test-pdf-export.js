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
// Its own require, so the service's relative requires resolve from its folder.
const serviceRequire = require('module').createRequire(servicePath);
new Function('require', 'module', 'exports', '__dirname',
  `${source}\nmodule.exports.__internals = { markdownToExportHtml, inlineMarkdownToHtml, buildExportHtmlDocument, katexStylesheet, renderMathToHtml };`
)(serviceRequire, mod, mod.exports, path.dirname(servicePath));

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

// ── Emphasis ─────────────────────────────────────────────────────────────────
console.log('Emphasis');
const joined = inlineMarkdownToHtml('نص عادي و*نص مائل* هنا');
check(/و<em>نص مائل<\/em>/.test(joined) && !joined.includes('*'), 'italics right after an Arabic conjunction ("و*...*")', joined);
const product = inlineMarkdownToHtml('the product 2*3*4 is 24');
check(!product.includes('<em>'), 'a multiplication is not italics', product);

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

// ── Templates ────────────────────────────────────────────────────────────────
console.log('\nTemplates');
const crypto = require('crypto');
const samples = require('./fixtures/exportSamples');
const templates = require('../src/services/export/templates');
const { destinationPages } = require('../src/services/export/templates/pageNumbers');
const { buildTemplatePdfKit } = require('../src/services/export/templates/pdfKitTemplates');
const { fontFaceCss, serifFaceCss } = require('../src/services/export/fonts');
const isCvId = (id) => ['modern', 'classic', 'compact'].includes(id);
const sampleFor = (id, lang) => {
  const rtl = lang === 'ar';
  return { template: id, rtl, title: isCvId(id) ? (rtl ? 'سامي خالد ناصر' : 'Sami Khaled Nasser') : samples.docTitle[lang],
    content: isCvId(id) ? (rtl ? samples.CV_AR : samples.CV_EN) : id === 'story' ? (rtl ? samples.STORY_AR : samples.STORY_EN) : (rtl ? samples.DOC_AR : samples.DOC_EN) };
};
const deps = {
  renderMarkdown: markdownToExportHtml, katexCss: katexStylesheet, fontCss: fontFaceCss, serifCss: serifFaceCss,
  fontStack: "'Noto Naskh Arabic','Noto Sans'", monoStack: "'Noto Sans Mono'", escape: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
};
const pages = (raw) => (raw.match(/\/Type \/Page\b(?!s)/g) || []).length;

check(!buildExportHtmlDocument({ title: 'x', content: '# x', rtl: false }).includes('Noto Serif'), 'the default document carries no serif');
{
  // Without a template the document is the one it was: its hash, with the clock stopped, is the one recorded before templates existed.
  const golden = require('./fixtures/export-default-output.json');
  const RealDate = Date;
  const frozen = new RealDate('2026-03-04T10:20:30Z').getTime();
  global.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(frozen); } static now() { return frozen; } };
  try {
    const cases = {
      arabic: { title: 'تقرير المبيعات', rtl: true, content: '# تقرير المبيعات\n\nمقدمة فيها **غامق** و*مائل* و English words.\n\n## الجدول\n\n| المنتج | الكمية |\n| --- | --- |\n| قهوة | 120 |\n\n- بند\n  - فرعي\n\n```python\n# تعليق\nx = 1\n```\n\n> اقتباس\n\n$$E = mc^2$$' },
      english: { title: 'Quarterly report', rtl: false, content: '# Quarterly report\n\nIntro with **bold**.\n\n## Table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n1. one\n2. two\n\n---\n\n[link](https://example.com)' }
    };
    for (const [name, input] of Object.entries(cases)) {
      check(crypto.createHash('sha256').update(buildExportHtmlDocument(input)).digest('hex') === golden[`html:${name}`], `without a template the ${name} PDF document is unchanged`);
    }
  } finally { global.Date = RealDate; }
}

for (const id of templates.TEMPLATE_IDS) {
  for (const lang of ['en', 'ar']) {
    const input = sampleFor(id, lang);
    const { html, hasToc } = templates.buildTemplateHtml(input, deps, { pages: new Map([['qjo-h-1', 3]]) });
    const where = `${id}/${lang}`;
    check(html.includes(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`) && html.includes(`lang="${lang}"`), `${where}: direction and language`);
    check(!/<script|onerror=|onload=/i.test(html), `${where}: nothing executable`);
    check(html.includes('Noto Serif') === ['compact', 'academic', 'story', 'elegant'].includes(id), `${where}: the serif is embedded only where it is used`);
    if (isCvId(id)) {
      check(!hasToc && html.includes(`<h1 class="name" dir="auto">${input.title}</h1>`), `${where}: a CV has its name and no contents list`);
      check(id === 'modern' ? html.includes('<aside>') && html.includes('class="band"') : !html.includes('<aside>'), `${where}: a side column only in the modern one`);
      check(!/<table/.test(html), `${where}: no table for layout`);
      for (const section of lang === 'ar' ? ['الملخص المهني', 'الخبرات العملية', 'التعليم', 'المهارات', 'اللغات'] : ['Summary', 'Experience', 'Education', 'Skills', 'Languages']) check(html.includes(`>${section}</h2>`), `${where}: the ${section} section`);
    } else {
      const ids = [...html.matchAll(/<h[1-6] id="(qjo-h-\d+)"/g)].map((m) => m[1]);
      const links = [...html.matchAll(/<a href="#(qjo-h-\d+)"/g)].map((m) => m[1]);
      check(hasToc && html.includes('<section class="cover">') && html.includes('<nav class="toc">'), `${where}: a cover and a contents list`);
      check(links.length >= 10 && links.every((l) => ids.includes(l)), `${where}: every contents entry links to a heading that has its id (${links.length})`);
      check(!html.includes(`<h1 id="qjo-h-0" dir="auto">${input.title}`), `${where}: the title heading is not repeated after the cover`);
      check(/@page cover\{margin:0/.test(html) && /counter\(page\)/.test(html), `${where}: a cover with no margin, page numbers in the margin`);
      check(html.includes('<span class="pg">3</span>'), `${where}: the page numbers handed in reach the list`);
      if (id === 'story') check(lang === 'en' ? html.includes('class="dropcap"') : html.includes('class="lead"'), `${where}: a drop cap (a lead-in in Arabic)`);
      if (id === 'academic') check(html.includes('<span class="num">1.1</span>'), `${where}: numbered sections`);
    }
  }
}
{
  // The page of each heading is read from a PDF's named destinations; a synthetic one is the positive control.
  const fake = '%PDF-1.4\n1 0 obj\n<</Type /Catalog\n/Pages 2 0 R\n/Dests 5 0 R>>\nendobj\n2 0 obj\n<</Type /Pages\n/Count 3\n/Kids [3 0 R 4 0 R 6 0 R]>>\nendobj\n3 0 obj\n<</Type /Page>>\nendobj\n4 0 obj\n<</Type /Page>>\nendobj\n6 0 obj\n<</Type /Page>>\nendobj\n5 0 obj\n<</qjo-h-0 [4 0 R /XYZ 6 800 0]\n/qjo-h-1 [6 0 R /XYZ 6 700 0]>>\nendobj\n';
  const read = destinationPages(Buffer.from(fake));
  check(read && read.get('qjo-h-0') === 2 && read.get('qjo-h-1') === 3, 'heading pages are read from the destinations and the page order', read && [...read]);
  check(destinationPages(Buffer.from('%PDF-1.4\nnothing\n')) === null && destinationPages(Buffer.from('not a pdf')) === null, 'a PDF without destinations gives none, not wrong ones');
}
(async () => {
  for (const id of templates.TEMPLATE_IDS) {
    for (const lang of ['en', 'ar']) {
      const input = sampleFor(id, lang);
      const raw = (await buildTemplatePdfKit(input)).toString('latin1');
      const where = `${id}/${lang} (plain renderer)`;
      check(raw.startsWith('%PDF-'), `${where}: a PDF`);
      check(pages(raw) >= (isCvId(id) ? 1 : 4), `${where}: ${pages(raw)} pages`);
      check(/NotoSans-Regular/.test(raw) && /NotoNaskhArabic/.test(raw) === (lang === 'ar') && !/Helvetica/.test(raw), `${where}: its fonts are inside it, the Arabic one only for Arabic`);
    }
  }
  const noToc = await buildTemplatePdfKit(sampleFor('report', 'en'));
  const longer = await buildTemplatePdfKit({ ...sampleFor('report', 'en'), content: '# The Rooftop Bee Project\n\nA short text.' });
  check(pages(noToc.toString('latin1')) > pages(longer.toString('latin1')), 'a document with no headings has no contents page: fewer pages than one with');
  check(templates.resolveTemplate({ template: 'modern' }, 'x').template === 'modern' && (() => { try { templates.resolveTemplate({ template: 'constructor' }, 'x'); return false; } catch (e) { return e.statusCode === 400; } })(), 'a template is one of the list: "constructor" is refused with 400');
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
function finish() {
console.log(`\n${'='.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
}

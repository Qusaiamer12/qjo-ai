// The HTML Chromium prints for a template: a CV (modern, classic, compact) or
// a document (report, academic, story, elegant). It is built from the same
// rendering of the answer as the plain PDF (`renderMarkdown`, which turns
// Markdown into escaped HTML), so a template changes how a document is laid
// out and never what it says.
//
// Page numbers are the print engine's own (@page margin boxes), the cover is
// a named page with no margin and no number, and the contents list links to
// each heading by id: the PDF keeps those links as named destinations, which
// is how the second pass learns the page every heading landed on
// (pageNumbers.js) without any script running in the printed page.
'use strict';

const { createTranslator } = require('../../../../public/domain/i18n');
const { themeOf } = require('./themes');
const { readCv } = require('./cvModel');
const { planOutline, headingsOfHtml, headingId } = require('./outline');

const hex = (c) => `#${c}`;

/**
 * @typedef {object} Deps what the PDF service already has, handed in so this module needs nothing from it
 * @property {(markdown: string) => string} renderMarkdown
 * @property {() => string} katexCss
 * @property {() => string} fontCss the embedded sans/Arabic/mono faces
 * @property {() => string} serifCss the embedded serif
 * @property {string} fontStack
 * @property {string} monoStack
 * @property {(text: string) => string} escape
 */

// ── What every template shares: the answer's own elements ────────────────

function baseCss(theme, { dir, deps }) {
  const t = theme;
  const family = t.serif ? `'Noto Serif',${deps.fontStack}` : deps.fontStack;
  return `
  *{box-sizing:border-box}${dir === 'rtl' ? '\n  *{letter-spacing:0!important}\n  h1,h2,h3,h4,h5,h6,.jobtitle{font-style:normal!important}' : ''}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;direction:${dir};font-family:${family};color:${hex(t.ink)};font-size:${t.size}pt;line-height:${t.leading};-webkit-font-smoothing:antialiased}
  h1,h2,h3,h4,h5,h6{break-after:avoid;page-break-after:avoid;break-inside:avoid;line-height:1.3}
  p,li{orphans:3;widows:3}
  table,pre,blockquote,figure,.table-wrap,.math-block{break-inside:avoid;page-break-inside:avoid}
  p{margin:0 0 .65em}
  strong{font-weight:700}
  del{color:${hex(t.muted)}}
  a{color:inherit;text-decoration:none;border-bottom:1px solid ${hex(t.line)}}
  ul,ol{margin:0 0 .75em;padding-inline-start:1.5em;padding-inline-end:0}
  li{margin:.18em 0}
  li::marker{color:${hex(t.accent)}}
  ul ul,ol ol,ul ol,ol ul{margin:.2em 0 0}
  .task-box{color:${hex(t.accent)}}
  blockquote{margin:1em 0;padding:.55em 1.1em;border-inline-start:3px solid ${hex(t.accent)};background:${hex(t.soft)};color:${hex(t.ink)}}
  blockquote p:last-child{margin-bottom:0}
  hr{border:none;border-top:1px solid ${hex(t.line)};margin:1.4em 0}
  code{font-family:${deps.monoStack};direction:ltr;unicode-bidi:isolate;background:${hex(t.soft)};border:1px solid ${hex(t.line)};border-radius:4px;padding:0 4px;font-size:.88em}
  pre{direction:ltr;text-align:left;unicode-bidi:isolate;background:${hex(t.soft)};color:${hex(t.ink)};border:1px solid ${hex(t.line)};border-radius:6px;padding:10px 12px;white-space:pre-wrap;word-break:break-word;margin:1em 0;font-family:${deps.monoStack};font-size:.84em;line-height:1.55}
  pre code{background:none;border:none;padding:0;font-size:inherit}
  .code-lang{color:${hex(t.accent)};font-weight:700;font-size:.8em;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
  .table-wrap{margin:1em 0}
  table{width:100%;border-collapse:collapse;font-size:.92em}
  th{background:${hex(t.accent)};color:#fff;padding:6px 9px;border:1px solid ${hex(t.accent)};text-align:start;font-weight:700}
  td{padding:6px 9px;border:1px solid ${hex(t.line)};vertical-align:top;text-align:start}
  tr:nth-child(even) td{background:${hex(t.soft)}}
  figure{margin:1em 0;text-align:center}
  figure img{max-width:100%;max-height:150mm;object-fit:contain}
  figcaption{color:${hex(t.muted)};font-size:.85em;margin-top:5px}
  p img{max-width:100%;max-height:90mm;vertical-align:middle}
  .math-block{margin:1.1em 0;text-align:center}
  .katex-display{margin:0}
  .katex-display .katex{font-size:1.2em}
  .katex{font-size:1.14em;direction:ltr;unicode-bidi:isolate}
  .math-fallback{color:#b91c1c}`;
}

const documentShell = ({ rtl, css, body, deps, theme }) => `<!doctype html><html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
  ${deps.fontCss()}
  ${theme.serif ? deps.serifCss() : ''}
  ${deps.katexCss()}
  ${css}
  </style></head><body>${body}</body></html>`;

// ── CV ────────────────────────────────────────────────────────────────────

const SIDE_SECTIONS = new Set(['skills', 'languages']);

const contactHtml = (items, deps) => (items.length
  ? `<ul class="contact">${items.map((i) => `<li class="k-${i.kind}" dir="auto">${deps.escape(i.text)}</li>`).join('')}</ul>` : '');

const sectionHtml = (s, deps) => `<section class="sec sec-${s.key}">${s.title ? `<h2 dir="auto">${deps.escape(s.title)}</h2>` : ''}${deps.renderMarkdown(s.markdown)}</section>`;

function cvCss(id, theme, { rtl, start }) {
  const t = theme;
  const common = `
  .sec{margin:0 0 1.15em}
  .sec h3{font-size:1.04em;margin:.8em 0 .1em;font-weight:700}
  .sec h3 + p:has(> em:only-child){margin:0 0 .3em;color:${hex(t.muted)};font-size:.9em}
  .sec p{margin-bottom:.4em}
  .sec ul{margin-bottom:.4em}
  h1.name{margin:0;line-height:1.15}
  .photo figure{margin:0}
  .photo figcaption{display:none}
  .photo img{display:block;object-fit:cover}
  .contact{list-style:none;margin:0;padding:0}`;
  if (id === 'modern') {
    const side = 68;
    return `${common}
  @page{size:A4;margin:12mm 0}
  .band{position:fixed;top:-12mm;bottom:-12mm;inset-inline-start:0;width:${side}mm;background:${hex(t.side)};z-index:-1}
  .grid{display:grid;grid-template-columns:${side}mm 1fr;align-items:start}
  aside{padding:4mm 7mm;color:${hex(t.sideInk)}}
  aside h2{color:#fff;border-bottom:1px solid ${hex(t.sideMuted)}55;font-size:.95em}
  aside .contact li{margin:0 0 .45em;font-size:.93em;word-break:break-word;color:${hex(t.sideInk)}}
  aside .sec ul{list-style:none;padding:0}
  aside .sec li{margin:0 0 .3em;color:${hex(t.sideInk)}}
  aside .sec li::marker{color:${hex(t.sideInk)}}
  aside strong{color:#fff}
  aside em{color:${hex(t.sideMuted)}}
  .photo{margin:0 0 6mm;text-align:center}
  .photo img{width:38mm;height:38mm;border-radius:50%;margin:0 auto;border:2px solid ${hex(t.sideMuted)}}
  main{padding:4mm 13mm 4mm 11mm;padding-inline:11mm 13mm}
  h1.name{font-size:27pt;font-weight:800;color:${hex(t.side)}}
  .jobtitle{color:${hex(t.accent)};font-size:12pt;font-weight:700;letter-spacing:.06em;margin:.15em 0 1.3em}
  h2{font-size:.98em;text-transform:uppercase;letter-spacing:.12em;color:${hex(t.accent)};margin:0 0 .5em;padding-bottom:.25em;border-bottom:1px solid ${hex(t.line)}}
  main .sec h3{color:${hex(t.side)}}`;
  }
  if (id === 'classic') {
    return `${common}
  @page{size:A4;margin:15mm 18mm}
  header{text-align:center;margin:0 0 1.1em}
  h1.name{font-size:22pt;font-weight:700;letter-spacing:.02em}
  .jobtitle{font-size:11.5pt;margin:.1em 0 .3em;font-weight:600}
  .contact{display:flex;flex-wrap:wrap;justify-content:center;gap:0 .9em;font-size:.95em}
  .contact li:not(:last-child)::after{content:"|";margin-inline-start:.9em;color:${hex(t.muted)}}
  h2{font-size:1em;text-transform:uppercase;letter-spacing:.1em;margin:0 0 .5em;padding-bottom:.15em;border-bottom:1.2px solid ${hex(t.line)}}
  .sec h3{font-size:1em}
  .sec ul{list-style:disc}`;
  }
  return `${common}
  @page{size:A4;margin:11mm 15mm}
  header{display:flex;justify-content:space-between;align-items:flex-end;gap:10mm;padding-bottom:.7em;margin:0 0 1em;border-bottom:1.5px solid ${hex(t.accent)}}
  .who{flex:1 1 auto;min-width:0}
  h1.name{font-size:22pt;font-weight:700;letter-spacing:.01em}
  .jobtitle{color:${hex(t.accent)};font-size:11pt;font-style:italic;margin:.1em 0 0}
  .contact{flex:0 1 52mm;font-size:.88em;color:${hex(t.muted)};text-align:${rtl ? 'left' : 'right'};word-break:break-word}
  .contact li{margin:0}
  .photo{flex:none}
  .photo img{width:22mm;height:22mm;border-radius:3px}
  h2{font-size:.9em;font-variant:small-caps;text-transform:uppercase;letter-spacing:.16em;color:${hex(t.accent)};margin:0 0 .45em;padding-bottom:.2em;border-bottom:1px solid ${hex(t.line)}}
  .sec h3{font-size:1em;margin-top:.6em}
  .sec li{margin:.1em 0}
  .sec-skills ul,.sec-languages ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:.1em 1.4em}
  .sec-skills li,.sec-languages li{margin:0}
  .sec-skills p,.sec-languages p{margin:0}
  p{text-align:${start === 'right' ? 'right' : 'left'}}`;
}

function cvHtml(id, theme, input, deps) {
  const { rtl, title, content } = input;
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  const cv = readCv(content, title);
  const start = rtl ? 'right' : 'left';
  const photo = cv.photo && id !== 'classic' ? `<div class="photo">${deps.renderMarkdown(cv.photo)}</div>` : '';
  const head = `<h1 class="name" dir="auto">${deps.escape(cv.name)}</h1>${cv.jobTitle ? `<p class="jobtitle" dir="auto">${deps.escape(cv.jobTitle)}</p>` : ''}`;
  let body;
  if (id === 'modern') {
    const side = cv.sections.filter((s) => SIDE_SECTIONS.has(s.key));
    const main = cv.sections.filter((s) => !SIDE_SECTIONS.has(s.key));
    const contact = cv.contact.length ? `<section class="sec"><h2>${deps.escape(t('cvContact'))}</h2>${contactHtml(cv.contact, deps)}</section>` : '';
    body = `<div class="band"></div><div class="grid"><aside>${photo}${contact}${side.map((s) => sectionHtml(s, deps)).join('')}</aside>`
      + `<main><header>${head}</header>${main.map((s) => sectionHtml(s, deps)).join('')}</main></div>`;
  } else if (id === 'classic') {
    body = `<header>${head}${contactHtml(cv.contact, deps)}</header>${cv.sections.map((s) => sectionHtml(s, deps)).join('')}`;
  } else {
    body = `<header><div class="who">${head}</div>${contactHtml(cv.contact, deps)}${photo}</header>${cv.sections.map((s) => sectionHtml(s, deps)).join('')}`;
  }
  return { html: documentShell({ rtl, theme, deps, css: baseCss(theme, { dir: rtl ? 'rtl' : 'ltr', deps }) + cvCss(id, theme, { rtl, start }), body }), hasToc: false };
}

// ── Documents ─────────────────────────────────────────────────────────────

function docCss(id, theme, { rtl }) {
  const t = theme;
  const L = rtl ? 'right' : 'left';
  const numberedMargin = `@page{size:A4;margin:22mm 20mm 24mm;@bottom-center{content:counter(page);font:9pt 'Noto Sans',sans-serif;color:${hex(t.muted)}}}`;
  const toc = `
  .toc{break-before:page;break-after:page;padding-top:6mm}
  .toc h1{font-size:22pt;margin:0 0 1.2em;color:${hex(t.accent)}}
  .toc ol{list-style:none;margin:0;padding:0}
  .toc li{margin:0 0 .5em;padding:0}
  .toc a{display:flex;align-items:baseline;gap:.5em;border:0;color:${hex(t.ink)}}
  .toc .n{color:${hex(t.accent)};font-weight:700;min-width:2.2em}
  .toc .dots{flex:1;border-bottom:1px dotted ${hex(t.muted)};transform:translateY(-.25em);min-width:1em}
  .toc .pg{font-variant-numeric:tabular-nums;color:${hex(t.muted)}}
  .toc .d0{margin-top:.85em;font-weight:700}
  .toc .d1{padding-inline-start:1.4em}
  .toc .d2{padding-inline-start:2.8em;font-size:.94em}
  .cover{page:cover;height:296mm;overflow:hidden;break-after:page}
  @page cover{margin:0;@bottom-center{content:none}}
  .cover .date{font-size:10.5pt}`;
  const common = `${numberedMargin}${toc}
  h1{font-size:1.9em;margin:1.6em 0 .5em}
  h2{font-size:1.4em;margin:1.4em 0 .4em}
  h3{font-size:1.15em;margin:1.2em 0 .3em}
  h4,h5,h6{font-size:1em;margin:1em 0 .3em}
  .num{margin-inline-end:.5em;color:${hex(t.accent)}}`;
  if (id === 'report') {
    return `${common}
  .cover{background:${hex(t.cover)};color:${hex(t.coverInk)};display:flex;flex-direction:column;justify-content:space-between;padding:34mm 24mm 26mm}
  .cover .kicker{font-size:11pt;letter-spacing:.3em;text-transform:uppercase;opacity:.8;font-weight:700}
  .cover h1{font-size:38pt;line-height:1.2;margin:0 0 .4em;color:${hex(t.coverInk)};font-weight:800}
  .cover .rule{width:36mm;height:4px;background:${hex('F2B134')};margin:0 0 6mm}
  .cover .date{opacity:.85}
  h1{color:${hex(t.accent)};border-bottom:2px solid ${hex(t.accent)};padding-bottom:.2em}
  h2{color:${hex(t.accent)}}
  h3{color:${hex(t.ink)}}`;
  }
  if (id === 'academic') {
    return `${common}
  p{text-align:justify;hyphens:auto}
  .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 30mm}
  .cover h1{font-size:25pt;line-height:1.3;margin:0 0 .6em;font-weight:700}
  .cover .rule{width:30mm;border-top:1.5px solid ${hex(t.ink)};margin:0 auto 1em}
  .cover .by,.cover .date{color:${hex(t.muted)}}
  h1{font-size:1.5em;border-bottom:1px solid ${hex(t.ink)};padding-bottom:.15em}
  h2{font-size:1.25em}
  h3{font-size:1.08em;font-style:italic}
  table{border-collapse:collapse;border-top:2px solid ${hex(t.ink)};border-bottom:2px solid ${hex(t.ink)}}
  th{background:transparent;color:${hex(t.ink)};border:0;border-bottom:1px solid ${hex(t.ink)}}
  td{border:0;border-bottom:1px solid ${hex(t.line)}}
  tr:nth-child(even) td{background:transparent}
  blockquote{background:none;font-style:italic}`;
  }
  if (id === 'story') {
    return `${common}
  @page{size:A4;margin:24mm 22mm 26mm;@bottom-center{content:"— " counter(page) " —";font:10pt 'Noto Serif','Noto Sans',serif;color:${hex(t.muted)}}}
  body{font-size:${t.size}pt}
  p{text-align:justify;hyphens:auto;margin:0 0 .15em;text-indent:1.4em}
  p:first-child,h1 + p,h2 + p,h3 + p,.lead,.dropcap,blockquote p,li p{text-indent:0}
  li{text-align:justify}
  .cover{background:${hex(t.cover)};color:${hex(t.coverInk)};display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 28mm}
  .cover .orn{width:60mm;height:0;border-top:1px solid ${hex(t.coverInk)};opacity:.7;position:relative;margin:0 auto 14mm}
  .cover .orn::after{content:"";position:absolute;left:50%;top:-5px;width:9px;height:9px;background:${hex(t.cover)};border:1px solid ${hex(t.coverInk)};transform:translateX(-50%) rotate(45deg)}
  .cover h1{font-size:36pt;line-height:1.25;font-weight:700;margin:0 0 14mm;color:${hex(t.coverInk)}}
  .cover .by{letter-spacing:.25em;text-transform:uppercase;font-size:9.5pt;opacity:.85}
  .cover .date{opacity:.75;margin-top:4mm}
  .chapter{break-before:page;margin:34mm 0 14mm;text-align:center;font-size:25pt;line-height:1.3;color:${hex(t.accent)}}
  .chapter .chap-label{display:block;font-size:11pt;letter-spacing:.3em;text-transform:uppercase;color:${hex(t.muted)};margin-bottom:5mm}
  .chapter::after{content:"";display:block;width:26mm;border-top:1px solid ${hex(t.accent)};margin:8mm auto 0}
  h2{color:${hex(t.accent)};font-size:1.35em;margin-top:1.8em}
  h3{font-style:italic;font-size:1.1em}
  .dropcap::first-letter{float:${L};font-family:'Noto Serif',serif;font-size:4.1em;line-height:.82;padding:.06em .09em 0 0;color:${hex(t.accent)};font-weight:700}
  .lead{font-weight:700;color:${hex(t.accent)}}
`;
  }
  return `${common}
  @page{size:A4;margin:24mm 22mm 26mm;@bottom-center{content:counter(page);font:9.5pt 'Noto Serif','Noto Sans',serif;color:${hex(t.accent)}}}
  p{text-align:justify;hyphens:auto}
  .cover{background:#fff;color:${hex(t.ink)};padding:18mm}
  .cover .frame{height:100%;border:1px solid ${hex(t.accent)};outline:1px solid ${hex(t.accent)};outline-offset:-7px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 20mm}
  .cover .orn{width:34mm;border-top:1px solid ${hex(t.accent)};position:relative;margin:0 auto 12mm}
  .cover .orn::after{content:"";position:absolute;left:50%;top:-4px;width:7px;height:7px;background:${hex(t.accent)};transform:translateX(-50%) rotate(45deg)}
  .cover h1{font-size:34pt;line-height:1.25;font-weight:700;margin:0 0 12mm;color:${hex(t.ink)}}
  .cover .by{letter-spacing:.3em;text-transform:uppercase;font-size:9pt;color:${hex(t.accent)}}
  .cover .date{color:${hex(t.muted)};margin-top:4mm}
  h1{color:${hex(t.ink)};font-size:1.8em;text-align:center;margin:1.8em 0 .8em}
  h1::after{content:"";display:block;width:22mm;border-top:1px solid ${hex(t.accent)};margin:.45em auto 0}
  h2{color:${hex(t.accent)};font-style:italic;font-weight:600}
  h3{letter-spacing:.04em;text-transform:uppercase;font-size:.95em;color:${hex(t.muted)}}
  blockquote{background:none;border-inline-start:0;border-top:1px solid ${hex(t.accent)};border-bottom:1px solid ${hex(t.accent)};text-align:center;font-style:italic;font-size:1.08em;padding:.9em 1.4em}
  th{background:${hex(t.ink)};border-color:${hex(t.ink)}}`;
}

/** The first words of a chapter's first paragraph: a drop cap in Latin script, a bold lead-in in Arabic. */
function openChapters(html, rtl) {
  return html.replace(/(<h([1-6]) [^>]*class="[^"]*chapter[^"]*"[^>]*>[\s\S]*?<\/h\2>\s*)<p dir="auto">([^<\s][^<]*?)(<|$)/g, (whole, head, level, text, tail) => {
    if (rtl || !/^["'“‘(]?\p{L}/u.test(text)) {
      const words = text.split(/(\s+)/);
      const lead = words.slice(0, 5).join('');
      return `${head}<p dir="auto" class="lead-p"><span class="lead">${lead}</span>${words.slice(5).join('')}${tail}`;
    }
    return `${head}<p dir="auto" class="dropcap">${text}${tail}`;
  });
}

/**
 * @param {string} id
 * @param {import('./themes').Theme} theme
 * @param {{rtl: boolean, title: string, content: string, date: Date}} input
 * @param {Deps} deps
 * @param {{pages?: Map<string, number>|null}} options pages: heading id → page, from a first print
 */
function docHtml(id, theme, input, deps, options) {
  const { rtl, content, date } = input;
  const t = createTranslator(() => (rtl ? 'ar' : 'en'));
  let body = deps.renderMarkdown(content);
  const found = headingsOfHtml(body);
  const outline = planOutline(found.map(({ level, text }) => ({ level, text })), input.title);
  const byIndex = new Map(outline.entries.map((e) => [e.index, e]));
  // Rebuild the headings: ids for the contents list, numbers or chapter
  // labels in front; the heading that only repeats the title is the cover's.
  let out = '';
  let at = 0;
  found.forEach((h, index) => {
    out += body.slice(at, h.start);
    at = h.end;
    const entry = byIndex.get(index);
    if (!entry) return;
    const chapter = id === 'story' && entry.depth === 0;
    const label = chapter ? `<span class="chap-label">${deps.escape(t('chapterLabel', { n: entry.chapter }))}</span>`
      : theme.numbered ? `<span class="num">${entry.number}</span>` : '';
    out += `<h${h.level} id="${headingId(index)}" dir="auto"${chapter ? ' class="chapter"' : ''}>${label}${h.inner}</h${h.level}>`;
  });
  body = out + body.slice(at);
  if (id === 'story') body = openChapters(body, rtl);

  const listed = outline.entries.filter((e) => e.listed);
  const pages = options.pages;
  const toc = listed.length ? `<nav class="toc"><h1>${deps.escape(t('tocTitle'))}</h1><ol>${listed.map((e) => {
    const page = pages ? pages.get(headingId(e.index)) : '00';
    const number = theme.numbered ? `<span class="n">${e.number}</span>` : '';
    const tail = page ? `<span class="dots"></span><span class="pg">${page}</span>` : '';
    return `<li class="d${e.depth}"><a href="#${headingId(e.index)}">${number}<span class="tt" dir="auto">${deps.escape(e.text)}</span>${tail}</a></li>`;
  }).join('')}</ol></nav>` : '';

  const dateText = deps.escape(date.toLocaleDateString(rtl ? 'ar-JO' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }));
  const title = `<h1 dir="auto">${deps.escape(outline.title)}</h1>`;
  const by = `<div class="by">${deps.escape(t('coverPreparedWith'))}</div>`;
  const cover = {
    report: `<section class="cover"><div class="kicker">Qjo AI</div><div><div class="rule"></div>${title}</div><div class="date" dir="auto">${dateText}</div></section>`,
    academic: `<section class="cover"><div class="rule"></div>${title}${by}<div class="date" dir="auto">${dateText}</div></section>`,
    story: `<section class="cover"><div class="orn"></div>${title}${by}<div class="date" dir="auto">${dateText}</div></section>`,
    elegant: `<section class="cover"><div class="frame"><div class="orn"></div>${title}${by}<div class="date" dir="auto">${dateText}</div></div></section>`
  }[id];

  return {
    html: documentShell({ rtl, theme, deps, css: baseCss(theme, { dir: rtl ? 'rtl' : 'ltr', deps }) + docCss(id, theme, { rtl }), body: `${cover}${toc}<main>${body}</main>` }),
    hasToc: listed.length > 0
  };
}

/**
 * @param {{template: string, title: string, content: string, rtl: boolean, date?: Date}} input
 * @param {Deps} deps
 * @param {{pages?: Map<string, number>|null}} [options]
 * @returns {{html: string, hasToc: boolean}} hasToc: the contents list shows page numbers once `pages` is given
 */
function buildTemplateHtml(input, deps, options = {}) {
  const theme = themeOf(input.template);
  const full = { ...input, date: input.date || new Date() };
  return theme.kind === 'cv' ? cvHtml(input.template, theme, full, deps) : docHtml(input.template, theme, full, deps, options);
}

module.exports = { buildTemplateHtml };

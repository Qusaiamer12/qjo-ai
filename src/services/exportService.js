const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const { isMostlyRtl } = require('./export/markdownModel');
const { buildDocx } = require('./export/docx');
const { buildXlsx } = require('./export/xlsx');
const { buildPptx } = require('./export/pptx');
const { fontFaceCss, footerFontCss } = require('./export/fonts');
const { buildPdfFallback } = require('./export/pdfFallback');
const { assertUrlIsFetchable } = require('../tools/fetchPageTool');

function stripMarkdown(input) {
  return String(input || '')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ''))
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1 ($2)')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeExportPayload(req) {
  const title = String(req.body.title || 'Qjo Export').slice(0, 120);
  const content = String(req.body.content || '').slice(0, 120000);
  if (!content.trim()) {
    const err = new Error('No content provided.');
    err.statusCode = 400;
    throw err;
  }
  // The page knows which way the conversation reads; without it, the text's
  // own letters decide (more Arabic than Latin), not any one Arabic letter.
  const rtl = typeof req.body.rtl === 'boolean' ? req.body.rtl : isMostlyRtl(title + ' ' + content);
  return { title, content, rtl };
}

// A request without content is the caller's fault: 400, never 500.
function sendExportError(res, error, fallback) {
  const status = error && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
  res.status(status).json({ error: (error && error.message) || fallback });
}

function parseMarkdownSections(content, fallbackTitle = 'Qjo') {
  const lines = String(content || '').split(/\r?\n/);
  const sections = [];
  let current = { title: fallbackTitle, lines: [] };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      if (current.lines.join('\n').trim()) sections.push(current);
      current = { title: stripMarkdown(heading[1]).slice(0, 90), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.join('\n').trim()) sections.push(current);
  if (!sections.length) sections.push({ title: fallbackTitle, lines: [content] });
  return sections;
}

function normalizeBullet(line) {
  return stripMarkdown(String(line || '').replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '')).trim();
}

function sectionToBullets(section, maxBullets = 6) {
  const bullets = [];
  for (const line of section.lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      const b = normalizeBullet(trimmed);
      if (b) bullets.push(b);
    }
  }

  if (!bullets.length) {
    const plain = stripMarkdown(section.lines.join(' '));
    const sentences = plain.split(/(?<=[.!؟])\s+/).map(s => s.trim()).filter(Boolean);
    bullets.push(...sentences.slice(0, maxBullets));
  }

  return bullets
    .map(b => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, maxBullets)
    .map(b => b.length > 170 ? b.slice(0, 167) + '...' : b);
}

function _mixedDirectionNote(rtl) {
  return rtl ? 'Arabic / English mixed content' : 'English / mixed content';
}

function _splitSlidesFromMarkdown(title, content) {
  const sections = parseMarkdownSections(content, title);
  const slides = [];

  for (const section of sections) {
    const bullets = sectionToBullets(section, 6);
    if (!bullets.length) continue;

    if (bullets.join(' ').length > 650) {
      for (let i = 0; i < bullets.length; i += 4) {
        slides.push({ title: i === 0 ? section.title : `${section.title} (${Math.floor(i / 4) + 1})`, bullets: bullets.slice(i, i + 4) });
      }
    } else {
      slides.push({ title: section.title, bullets });
    }
  }

  return slides.slice(0, 20);
}

function escapeHtmlExport(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Math ────────────────────────────────────────────────────────────────────
// Rendered server-side with KaTeX to static HTML + CSS. A browser-side renderer
// (MathJax from a CDN) would make every export depend on network reachability
// inside the headless browser and on a load-event race; KaTeX is deterministic,
// offline, and leaves nothing to execute inside the PDF.
let katexLib = null;
function getKatex() {
  if (katexLib === null) {
    try { katexLib = require('katex'); } catch (_) { katexLib = false; }
  }
  return katexLib || null;
}

function renderMathToHtml(latex, displayMode) {
  const katex = getKatex();
  const source = String(latex || '').trim();
  if (!source) return '';
  if (!katex) {
    // No KaTeX installed: show the source legibly rather than a blank gap.
    return `<code class="math-fallback">${escapeHtmlExport(source)}</code>`;
  }
  try {
    // throwOnError:false renders malformed input in red instead of aborting the
    // whole export over a single bad formula.
    return katex.renderToString(source, { displayMode: Boolean(displayMode), throwOnError: false, strict: false, output: 'html' });
  } catch (_) {
    return `<code class="math-fallback">${escapeHtmlExport(source)}</code>`;
  }
}

// Math and inline code are lifted out BEFORE escaping and restored after, so
// their contents survive intact. Without this, $\frac{a}{b}$ loses its braces
// to entity escaping and \text{<x>} corrupts the document.
const SEGMENT_OPEN = '@@QJOSEG';
const SEGMENT_CLOSE = 'SEG@@';

function protectSegments(value, store) {
  const keep = (html) => { store.push(html); return `${SEGMENT_OPEN}${store.length - 1}${SEGMENT_CLOSE}`; };
  return String(value || '')
    // $$...$$ and \[...\] are display math even when written inline.
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => keep(renderMathToHtml(tex, true)))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => keep(renderMathToHtml(tex, true)))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => keep(renderMathToHtml(tex, false)))
    // Single $...$ must not swallow currency, so it only counts as math when it
    // actually contains LaTeX syntax: "$5 and $10" stays plain text.
    .replace(/\$(?!\s)([^$\n]+)\$/g, (whole, tex) => (/[\\^_{}]/.test(tex) ? keep(renderMathToHtml(tex, false)) : whole))
    .replace(/`([^`]+)`/g, (_, code) => keep(`<code>${escapeHtmlExport(code)}</code>`));
}

function restoreSegments(html, store) {
  const pattern = new RegExp(`${SEGMENT_OPEN}(\\d+)${SEGMENT_CLOSE}`, 'g');
  return html.replace(pattern, (_, i) => store[Number(i)] || '');
}

// Isolates runs of one script embedded in text of the opposite direction.
//
// Unicode bidi resolves a trailing period after a Latin sentence inside an RTL
// paragraph against the paragraph direction, which is why "…as well." rendered
// as ".…as well" at the wrong end of the line. <bdi> gives each run its own
// embedding level so its own punctuation stays attached to it. Applied to runs
// of three or more words, so single loan-words still flow with the sentence.
function isolateBidiRuns(html) {
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(html);
  if (!hasArabic) return html;
  return html.replace(
    /([A-Za-z][A-Za-z0-9'’\-]*(?:[ \t]+[A-Za-z0-9'’\-]+){2,}[ \t]*[.!?,:;]?)/g,
    (run) => (run.includes('<') ? run : `<bdi>${run}</bdi>`)
  );
}

function inlineMarkdownToHtml(value) {
  const store = [];
  const guarded = protectSegments(value, store);
  const html = escapeHtmlExport(guarded)
    // Images first: ![alt](src) would otherwise be caught by the link pattern.
    .replace(/!\[([^\]]*)\]\((data:image\/[a-z0-9+.\-]+;base64,[^)\s]+|https?:\/\/[^)\s]+)\)/gi,
      (_, alt, src) => `<img src="${src}" alt="${alt}" />`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // An Arabic conjunction or preposition joins the word it precedes:
    // "و*نص مائل*" is "و" then italics, as in any Markdown renderer.
    .replace(/(^|[\s(\u0600-\u06FF])\*([^*\n]+)\*(?=[\s).,،:;!?]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return restoreSegments(isolateBidiRuns(html), store);
}

function markdownTableToHtml(lines, start) {
  if (!lines[start]?.includes('|') || !/^\s*\|?\s*:?-{3,}:?/.test(lines[start + 1] || '')) return null;
  const split = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => inlineMarkdownToHtml(x.trim()));
  const headers = split(lines[start]);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(split(lines[i])); i++; }
  const thead = '<thead><tr>' + headers.map(h => `<th dir="auto">${h}</th>`).join('') + '</tr></thead>';
  const tbody = '<tbody>' + rows.map(r => '<tr>' + headers.map((_, idx) => `<td dir="auto">${r[idx] || ''}</td>`).join('') + '</tr>').join('') + '</tbody>';
  return { html: `<div class="table-wrap"><table>${thead}${tbody}</table></div>`, next: i };
}

// Block-level markdown for export. The previous version handled only
// paragraphs, ATX headings, one flat list type and tables — so numbered lists
// rendered as bullets, and blockquotes, rules, images and display math all
// leaked into the PDF as literal markdown.
//
// dir="auto" on every text-bearing block is deliberate: it gives each
// paragraph, list item and table cell its own base direction from its first
// strong character, which is what keeps a full English sentence inside an
// Arabic document from having its final period pushed to the wrong end.
function markdownToExportHtml(markdown) {
  const codeBlocks = [];
  const text = String(markdown || '').replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = codeBlocks.length;
    codeBlocks.push({ lang: lang || 'text', code: String(code || '').replace(/\s+$/, '') });
    return `@@CODE_${id}@@`;
  });

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const para = [];
  const flush = () => {
    if (!para.length) return;
    out.push(`<p dir="auto">${inlineMarkdownToHtml(para.join(' '))}</p>`);
    para.length = 0;
  };

  const listItemMatch = (line) => {
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) return { indent: bullet[1].length, ordered: false, text: bullet[2] };
    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (ordered) return { indent: ordered[1].length, ordered: true, text: ordered[3], start: Number(ordered[2]) };
    return null;
  };

  // Builds one list, recursing into deeper indentation so nested bullets keep
  // their hierarchy instead of collapsing into a single flat list.
  function buildList(startIndex) {
    const first = listItemMatch(lines[startIndex]);
    if (!first) return null;
    const tag = first.ordered ? 'ol' : 'ul';
    const startAttr = first.ordered && first.start > 1 ? ` start="${first.start}"` : '';
    const items = [];
    let i = startIndex;

    while (i < lines.length) {
      const item = listItemMatch(lines[i]);
      if (!item || item.indent < first.indent) break;
      if (item.ordered !== first.ordered && item.indent === first.indent) break;

      if (item.indent > first.indent) {
        const nested = buildList(i);
        if (nested && items.length) {
          items[items.length - 1] = items[items.length - 1].replace(/<\/li>$/, `${nested.html}</li>`);
          i = nested.next;
          continue;
        }
        break;
      }

      // GitHub-style task list: render a real checkbox glyph, not "[x]".
      const task = item.text.match(/^\[([ xX])\]\s+(.*)$/);
      const body = task
        ? `<span class="task-box">${task[1].toLowerCase() === 'x' ? '☑' : '☐'}</span> ${inlineMarkdownToHtml(task[2])}`
        : inlineMarkdownToHtml(item.text);
      items.push(`<li dir="auto">${body}</li>`);
      i++;
    }
    return { html: `<${tag}${startAttr}>${items.join('')}</${tag}>`, next: i };
  }

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flush(); i++; continue; }

    const code = trimmed.match(/^@@CODE_(\d+)@@$/);
    if (code) {
      flush();
      const block = codeBlocks[Number(code[1])];
      out.push(`<pre dir="ltr"><div class="code-lang">${escapeHtmlExport(block.lang)}</div><code>${escapeHtmlExport(block.code)}</code></pre>`);
      i++; continue;
    }

    // A standalone display-math line, e.g. $$...$$ on its own.
    const displayMath = trimmed.match(/^\$\$([\s\S]*)\$\$$/) || trimmed.match(/^\\\[([\s\S]*)\\\]$/);
    if (displayMath) {
      flush();
      out.push(`<div class="math-block">${renderMathToHtml(displayMath[1], true)}</div>`);
      i++; continue;
    }

    // Horizontal rule — must be tested before the list patterns, since "---"
    // also looks like a bullet to a loose matcher.
    if (/^(\s*)([-*_])\s*(\2\s*){2,}$/.test(line)) { flush(); out.push('<hr />'); i++; continue; }

    const table = markdownTableToHtml(lines, i);
    if (table) { flush(); out.push(table.html); i = table.next; continue; }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      // Full h1–h6 range: the old builder clamped everything into h2/h3 and
      // flattened the document's hierarchy.
      const level = heading[1].length;
      out.push(`<h${level} dir="auto">${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      i++; continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flush();
      const quoted = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote dir="auto">${inlineMarkdownToHtml(quoted.join(' '))}</blockquote>`);
      continue;
    }

    const list = buildList(i);
    if (list) { flush(); out.push(list.html); i = list.next; continue; }

    // A lone image on its own line becomes a figure so it can be centred and
    // captioned — this is the CV-photo case.
    const loneImage = trimmed.match(/^!\[([^\]]*)\]\((data:image\/[a-z0-9+.\-]+;base64,[^)\s]+|https?:\/\/[^)\s]+)\)$/i);
    if (loneImage) {
      flush();
      const caption = loneImage[1] ? `<figcaption dir="auto">${escapeHtmlExport(loneImage[1])}</figcaption>` : '';
      out.push(`<figure><img src="${loneImage[2]}" alt="${escapeHtmlExport(loneImage[1])}" />${caption}</figure>`);
      i++; continue;
    }

    para.push(trimmed);
    i++;
  }

  flush();
  return out.join('\n');
}

// KaTeX ships the stylesheet its markup needs, and its own math faces. Both are
// inlined so an export is fully self-contained: no CDN, nothing to wait for,
// byte-identical output offline.
//
// The faces matter. Dropping them and letting KaTeX fall back to a UI font
// renders fractions, radicals and large operators with the wrong metrics — the
// glyphs are simply not in a text font. Only the faces a normal document
// actually reaches for are embedded (~129KB, ~172KB once base64-encoded);
// KaTeX ships 1.2MB of faces in total, and the rest cover scripts and variants
// that would bloat every single PDF for nothing.
const KATEX_EMBEDDED_FACES = new Set([
  'KaTeX_Main-Regular', 'KaTeX_Main-Bold', 'KaTeX_Main-Italic', 'KaTeX_Main-BoldItalic',
  'KaTeX_Math-Italic', 'KaTeX_Math-BoldItalic',
  'KaTeX_Size1-Regular', 'KaTeX_Size2-Regular', 'KaTeX_Size3-Regular', 'KaTeX_Size4-Regular',
  'KaTeX_AMS-Regular', 'KaTeX_Caligraphic-Regular', 'KaTeX_Fraktur-Regular',
  'KaTeX_SansSerif-Regular', 'KaTeX_Typewriter-Regular'
]);

let katexCssCache = null;
function katexStylesheet() {
  if (katexCssCache !== null) return katexCssCache;
  try {
    const cssPath = require.resolve('katex/dist/katex.min.css');
    const fontsDir = path.join(path.dirname(cssPath), 'fonts');
    const css = fs.readFileSync(cssPath, 'utf8');

    katexCssCache = css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
      const file = (block.match(/fonts\/(KaTeX_[\w-]+)\.woff2/) || [])[1];
      if (!file || !KATEX_EMBEDDED_FACES.has(file)) return '';
      try {
        const data = fs.readFileSync(path.join(fontsDir, `${file}.woff2`)).toString('base64');
        // Replace the whole src list: the original lists woff2/woff/ttf paths
        // that resolve against a document origin this HTML does not have.
        // Minified CSS has no trailing semicolon before the closing brace, so
        // the src list runs to the end of the block.
        return block.replace(/src:[^}]+/, `src:url(data:font/woff2;base64,${data}) format("woff2")`);
      } catch (_) {
        return '';
      }
    });
  } catch (_) {
    katexCssCache = '';
  }
  return katexCssCache;
}

// Font stacks, widest-coverage first.
//
// The old template pulled Cairo from Google Fonts and waited on networkidle0,
// so every export paid a network round-trip and fell back to the plain PDFKit
// renderer whenever that failed. These are the families the Aptfile installs
// (fonts-noto-core, fonts-noto-extra, fonts-dejavu-core), which is what makes
// "every language" true rather than aspirational: Noto is explicitly designed
// to cover all scripts, and Chromium falls back per-glyph down the list.
// The embedded faces first (export/fonts.js): Arabic, then Latin and Greek,
// then symbols. A server font listed before them — "Noto Sans Arabic" carries
// Latin letters too — would decide how a PDF looks by what the server has.
const UI_FONT_STACK = [
  "'Noto Naskh Arabic'", "'Noto Sans'", "'Noto Sans Math'",
  "'Noto Sans Arabic'", "'Noto Kufi Arabic'", "'Cairo'", "'Amiri'",
  "'DejaVu Sans'", "'Liberation Sans'",
  "'Noto Sans Hebrew'", "'Noto Sans Devanagari'", "'Noto Sans Thai'",
  "'Noto Sans CJK SC'", "'Noto Sans CJK JP'", "'Noto Sans CJK KR'",
  "'WenQuanYi Zen Hei'", "'IPAGothic'",
  "'Noto Color Emoji'",
  'sans-serif'
].join(',');

// Code needs a monospace face that still has Arabic coverage: a string literal
// containing Arabic used to render as empty boxes in the code block.
// The embedded Arabic face comes straight after the embedded mono one: a
// system monospace font with Arabic glyphs but no shaping drew a comment's
// letters apart.
const MONO_FONT_STACK = [
  "'Noto Sans Mono'", "'Noto Naskh Arabic'", "'DejaVu Sans Mono'", "'Liberation Mono'",
  'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas',
  "'Noto Sans Arabic'", "'DejaVu Sans'",
  'monospace'
].join(',');

function buildExportHtmlDocument({ title, content, rtl }) {
  const dir = rtl ? 'rtl' : 'ltr';
  const lang = rtl ? 'ar' : 'en';
  const body = markdownToExportHtml(content);
  const safeTitle = escapeHtmlExport(title);
  const start = rtl ? 'right' : 'left';
  // Date and time are formatted and emitted separately, each in its own
  // dir="auto" span. Building them as one localized string produced
  // "11:34:36 .2026/9/16 م" — the numerals and the meridiem reordered against
  // each other once the surrounding paragraph was RTL.
  const now = new Date();
  const dateText = escapeHtmlExport(now.toLocaleDateString(rtl ? 'ar-JO' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }));
  const timeText = escapeHtmlExport(now.toLocaleTimeString(rtl ? 'ar-JO' : 'en-GB', { hour: '2-digit', minute: '2-digit' }));

  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><style>
  ${fontFaceCss()}
  ${katexStylesheet()}

  @page { size: A4; margin: 20mm 16mm 20mm 16mm; }
  * { box-sizing: border-box; }

  body {
    direction: ${dir};
    text-align: ${start};
    font-family: ${UI_FONT_STACK};
    color: #0f172a;
    line-height: 1.9;
    font-size: 13px;
    margin: 0;
    -webkit-font-smoothing: antialiased;
  }

  /* Keep a heading with the text it introduces, and never strand a single
     line of a paragraph alone across a page boundary. */
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; break-inside: avoid; }
  p, li { orphans: 3; widows: 3; }
  table, pre, blockquote, figure, .table-wrap, .math-block { break-inside: avoid; page-break-inside: avoid; }

  .cover { border-bottom: 3px solid #123B7A; padding-bottom: 16px; margin-bottom: 26px; }
  .brand { color: #123B7A; font-weight: 800; letter-spacing: .04em; font-size: 12px; text-transform: uppercase; }
  .cover h1 { margin: 10px 0 8px; font-size: 27px; line-height: 1.35; font-weight: 800; }
  .meta { color: #64748b; font-size: 10.5px; }
  .meta .sep { margin: 0 6px; color: #cbd5e1; }

  h1 { font-size: 23px; margin: 26px 0 10px; font-weight: 800; }
  h2 { color: #123B7A; font-size: 18px; margin: 22px 0 8px; font-weight: 700; }
  h3 { color: #7B3FE4; font-size: 15px; margin: 18px 0 6px; font-weight: 700; }
  h4 { color: #334155; font-size: 13.5px; margin: 14px 0 5px; font-weight: 700; }
  h5, h6 { color: #475569; font-size: 12.5px; margin: 12px 0 4px; font-weight: 700; }

  p { margin: 0 0 11px; }
  strong { font-weight: 800; }
  em { font-style: italic; }
  del { color: #94a3b8; }
  a { color: #075985; text-decoration: none; border-bottom: 1px solid #bae6fd; }

  ul, ol { margin: 0 0 12px; padding-inline-start: 24px; padding-inline-end: 0; }
  li { margin: 5px 0; }
  li::marker { color: #123B7A; font-weight: 700; }
  ul ul, ol ol, ul ol, ol ul { margin: 5px 0 0; }
  .task-box { font-size: 13px; color: #123B7A; }

  blockquote {
    margin: 14px 0;
    padding: 10px 16px;
    border-inline-start: 4px solid #7B3FE4;
    background: #faf5ff;
    color: #3b0764;
    border-radius: 0 8px 8px 0;
  }

  hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }

  code {
    font-family: ${MONO_FONT_STACK};
    direction: ltr;
    unicode-bidi: isolate;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 1px 5px;
    font-size: 11px;
  }

  pre {
    direction: ltr;
    text-align: left;
    unicode-bidi: isolate;
    background: #0b1220;
    color: #e5e7eb;
    border-radius: 10px;
    padding: 14px 16px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 14px 0;
    font-family: ${MONO_FONT_STACK};
    font-size: 10.5px;
    line-height: 1.6;
  }
  pre code { background: none; border: none; padding: 0; color: inherit; font-size: inherit; }
  .code-lang { color: #7dd3fc; font-weight: 700; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }

  .table-wrap { margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #123B7A; color: #fff; padding: 8px 10px; border: 1px solid #123B7A; text-align: ${start}; font-weight: 700; }
  td { padding: 8px 10px; border: 1px solid #cbd5e1; vertical-align: top; text-align: ${start}; }
  tr:nth-child(even) td { background: #f8fafc; }

  /* Images: a CV photo must not be blown up to page width or split across a
     page boundary. */
  figure { margin: 16px 0; text-align: center; }
  figure img { max-width: 100%; max-height: 150mm; object-fit: contain; border-radius: 8px; }
  figcaption { color: #64748b; font-size: 10px; margin-top: 6px; }
  p img { max-width: 100%; max-height: 90mm; vertical-align: middle; border-radius: 6px; }

  /* Display math is centred and given room; inline math must not inflate the
     line box it sits in. */
  .math-block { margin: 18px 0; text-align: center; }
  .katex-display { margin: 0; }
  .katex-display .katex { font-size: 1.24em; }
  /* Inline math sits inside 13px body text, so at 1em a nested fraction drops
     to ~7px and stops being readable. */
  .katex { font-size: 1.16em; direction: ltr; unicode-bidi: isolate; }
  .math-fallback { color: #b91c1c; }
  </style></head><body>
  <section class="cover">
    <div class="brand">Qjo AI</div>
    <h1 dir="auto">${safeTitle}</h1>
    <div class="meta"><span dir="auto">${dateText}</span><span class="sep">•</span><span dir="auto">${timeText}</span></div>
  </section>
  ${body}
  </body></html>`;
}

// Chromium for PDFs: where puppeteer's configuration puts it, else the
// project's own cache (.puppeteerrc.cjs), found from this file — puppeteer
// looks for its configuration in the working directory, not here. A path set
// explicitly (PUPPETEER_EXECUTABLE_PATH) is used as set: if it is missing,
// Chromium is missing.
function chromiumPath(puppeteer) {
  let found = null;
  try { found = puppeteer.executablePath(); } catch (_) { found = null; }
  if (found && fs.existsSync(found)) return found;
  if (found && !/[\\/]puppeteer[\\/]chrome(-headless-shell)?[\\/]/.test(found)) return null;
  const root = path.join(__dirname, '..', '..', '.cache', 'puppeteer', 'chrome');
  try {
    for (const build of fs.readdirSync(root)) {
      const candidate = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (_) { /* no cache */ }
  return null;
}

async function renderHtmlPdfWithPuppeteer(payload) {
  const puppeteer = require('puppeteer');
  const executablePath = chromiumPath(puppeteer);
  if (!executablePath) throw new Error('Chromium is not installed (npx puppeteer browsers install chrome)');
  const html = buildExportHtmlDocument(payload);
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--font-render-hinting=medium'] });
  try {
    const page = await browser.newPage();
    // The document is the model's answer, and Chromium runs on the server: an
    // image in it at http://169.254.169.254/ or http://localhost:... would be
    // fetched from inside the network. Only inline data and images at public
    // addresses load — each checked after DNS resolution, and again on every
    // redirect, by the same guard fetch_page uses. Nothing else loads at all.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (/^(data|about|blob):/i.test(url)) { request.continue(); return; }
      if (!/^https?:/i.test(url) || request.resourceType() !== 'image') { request.abort('blockedbyclient'); return; }
      assertUrlIsFetchable(url).then(() => request.continue(), () => request.abort('blockedbyclient')).catch(() => {});
    });
    // Fonts, math CSS and styles are all inline, so the document is ready at
    // DOMContentLoaded. Waiting for 'load' also waited for every image: one
    // slow image host held the export for the full 20 s and then dropped it
    // to the plain renderer. Images get a bounded wait of their own instead.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // The callbacks below are serialized and executed inside the page, where
    // `document` exists; the linter only knows this file's Node globals.
    /* eslint-disable no-undef */
    await page.evaluate(() => Promise.race([
      Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))),
      new Promise(r => setTimeout(r, 5000))
    ])).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    /* eslint-enable no-undef */
    await page.emulateMediaType('screen');
    const rtl = Boolean(payload.rtl);
    const footer = `<style>${footerFontCss()}</style><div style="width:100%;font-size:8px;color:#94a3b8;padding:0 16mm;display:flex;justify-content:space-between;font-family:'Noto Sans',sans-serif;direction:${rtl ? 'rtl' : 'ltr'}">`
      + `<span>Qjo AI</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footer,
      margin: { top: '14mm', right: '0', bottom: '16mm', left: '0' }
    });
  } finally { await browser.close(); }
}

// Which engine printed the last PDF and why the other was not used: shown in
// /api/status, so "the PDF looks wrong" can be checked against the server.
const lastPdf = { engine: null, at: null, fallbackReason: null };

function pdfEngineStatus() {
  let chromium = false;
  try { chromium = Boolean(chromiumPath(require('puppeteer'))); } catch (_) { chromium = false; }
  return { chromium, last: { ...lastPdf } };
}

async function exportPdf(req, res) {
  try {
    const payload = safeExportPayload(req);
    let reason = null;
    let pdf = await renderHtmlPdfWithPuppeteer(payload).catch((error) => { reason = error.message; return null; });
    const engine = pdf ? 'chromium' : 'fallback';
    if (!pdf) {
      console.warn('HTML PDF render unavailable, using the built-in renderer:', reason || 'puppeteer not installed');
      pdf = await buildPdfFallback(payload);
    }
    Object.assign(lastPdf, { engine, at: new Date().toISOString(), fallbackReason: pdf && engine === 'fallback' ? String(reason || 'puppeteer not installed').slice(0, 300) : null });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(payload.title)}.pdf"; filename*=UTF-8''${encodeURIComponent(payload.title)}.pdf`);
    res.send(pdf);
  } catch (error) {
    sendExportError(res, error, 'PDF export failed.');
  }
}

function sanitizeZipPath(input, index = 0) {
  let value = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  value = value.replace(/\.\.+/g, '').replace(/[<>:"|?*\x00-\x1F]/g, '-');
  value = value.split('/').filter(Boolean).slice(0, 8).join('/');
  if (!value || value.endsWith('/')) value = `file-${index + 1}.txt`;
  return value.slice(0, 180);
}

async function exportCodeZip(req, res) {
  try {
    const files = Array.isArray(req.body.files) ? req.body.files.slice(0, 80) : [];
    if (!files.length) return res.status(400).json({ error: 'No files provided.' });
    const zip = new JSZip();
    const used = new Set();
    let totalChars = 0;
    files.forEach((file, index) => {
      let name = sanitizeZipPath(file.path || file.name, index);
      const ext = name.includes('.') ? '' : '.txt';
      if (ext) name += ext;
      let finalName = name;
      let n = 2;
      while (used.has(finalName)) {
        const dot = name.lastIndexOf('.');
        finalName = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
        n++;
      }
      used.add(finalName);
      const content = String(file.content || '').slice(0, 250000);
      totalChars += content.length;
      if (totalChars > 2_000_000) return;
      zip.file(finalName, content);
    });
    zip.file('README-QJO.txt', 'Generated by Qjo AI. Review, test, and secure all code before production use.\n');
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="qjo-code-project.zip"');
    res.send(buffer);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Code ZIP export failed.' });
  }

}

async function exportPptx(req, res) {
  try {
    const { title, content, rtl } = safeExportPayload(req);
    const buffer = await buildPptx({ title, content, rtl });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pptx"; filename*=UTF-8''${encodeURIComponent(title)}.pptx`);
    res.send(buffer);
  } catch (error) {
    sendExportError(res, error, 'PPTX export failed.');
  }
}

async function exportDocx(req, res) {
  try {
    const { title, content, rtl } = safeExportPayload(req);
    const buffer = await buildDocx({ title, content, rtl });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.docx"; filename*=UTF-8''${encodeURIComponent(title)}.docx`);
    res.send(buffer);
  } catch (error) {
    sendExportError(res, error, 'Word DOCX export failed.');
  }
}

async function exportXlsx(req, res) {
  try {
    const { title, content, rtl } = safeExportPayload(req);
    const buffer = await buildXlsx({ title, content, rtl });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.xlsx"; filename*=UTF-8''${encodeURIComponent(title)}.xlsx`);
    res.send(buffer);
  } catch (error) {
    sendExportError(res, error, 'Excel XLSX export failed.');
  }
}

async function exportImageToPdf(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No image file uploaded.' });
    
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      const originalName = String(file.originalname || 'image').replace(/\.[^/.]+$/, "");
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}.pdf"; filename*=UTF-8''${encodeURIComponent(originalName)}.pdf`);
      res.send(buffer);
    });
    
    doc.image(file.buffer, 36, 36, {
      fit: [523.28, 769.89],
      align: 'center',
      valign: 'center'
    });
    doc.end();
  } catch (error) {
    res.status(500).json({ error: error.message || 'Image to PDF conversion failed.' });
  }
}

module.exports = { exportPdf, exportCodeZip, exportPptx, exportDocx, exportXlsx, exportImageToPdf, pdfEngineStatus };

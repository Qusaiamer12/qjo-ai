const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pptxgen = require('pptxgenjs');
const JSZip = require('jszip');

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

function isArabicText(text) {
  return /[\u0600-\u06FF]/.test(String(text || ''));
}

function safeExportPayload(req) {
  const title = String(req.body.title || 'Qjo Export').slice(0, 120);
  const content = String(req.body.content || '').slice(0, 120000);
  if (!content.trim()) {
    const err = new Error('No content provided.');
    err.statusCode = 400;
    throw err;
  }
  return { title, content, rtl: isArabicText(title + ' ' + content) };
}

function findFontPath() {
  const candidates = [
    '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf'
  ];
  return candidates.find(fp => fs.existsSync(fp));
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

function extractCodeBlocks(content) {
  const blocks = [];
  String(content || '').replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push({ lang: lang || 'text', code: String(code || '').trim().slice(0, 3500) });
    return '';
  });
  return blocks.slice(0, 8);
}

function extractMathLines(content) {
  const lines = String(content || '').split(/\r?\n/);
  return lines
    .filter(line => /\\\(|\\\[|\$\$|\\frac|\\sum|\\int|\\sqrt|\^|_/.test(line))
    .map(line => stripMarkdown(line).trim())
    .filter(Boolean)
    .slice(0, 10);
}

function extractMarkdownTables(content) {
  const lines = String(content || '').split(/\r?\n/);
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('|') && lines[i + 1]?.includes('|') && /^\s*\|?\s*:?-{3,}:?/.test(lines[i + 1])) {
      const tableRows = [];
      const headers = line.split('|').map(x => x.trim()).filter(Boolean);
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        const cells = lines[j].split('|').map(x => x.trim()).filter(Boolean);
        tableRows.push(cells);
        j++;
      }
      if (tableRows.length) {
        tables.push({ headers, rows: tableRows });
      }
      i = j;
    } else {
      i++;
    }
  }
  return tables.slice(0, 5);
}

function removeMarkdownTables(content) {
  const lines = String(content || '').split(/\r?\n/);
  const cleanLines = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('|') && lines[i + 1]?.includes('|') && /^\s*\|?\s*:?-{3,}:?/.test(lines[i + 1])) {
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        j++;
      }
      cleanLines.push('\n[Data table extracted separately]\n');
      i = j;
    } else {
      cleanLines.push(lines[i]);
      i++;
    }
  }
  return cleanLines.join('\n');
}

function removeCodeBlocks(content) {
  return String(content || '').replace(/```[\s\S]*?```/g, '\n[Code block extracted separately]\n');
}

function _mixedDirectionNote(rtl) {
  return rtl ? 'Arabic / English mixed content' : 'English / mixed content';
}

function markdownToBlocks(content, fallbackTitle = 'Qjo') {
  const lines = String(content || '').split(/\r?\n/);
  const blocks = [];
  let current = { type: 'section', title: fallbackTitle, body: [] };

  const pushCurrent = () => {
    const text = current.body.join('\n').trim();
    if (current.title || text) blocks.push({ ...current, body: text });
  };

  for (const line of lines) {
    const _codeStart = line.match(/^```(\w+)?/);
    const heading = line.match(/^#{1,4}\s+(.+)/);
    if (heading) {
      pushCurrent();
      current = { type: 'section', title: stripMarkdown(heading[1]), body: [] };
    } else {
      current.body.push(line);
    }
  }
  pushCurrent();
  return blocks.filter(b => (b.title || b.body));
}

function chunkText(text, max = 950) {
  const clean = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= max) return [clean];
  const parts = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.55) cut = rest.lastIndexOf('. ', max);
    if (cut < max * 0.55) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function blockToSlideText(block) {
  const body = stripMarkdown(block.body || '');
  const bullets = sectionToBullets({ lines: String(block.body || '').split(/\r?\n/) }, 8);
  if (bullets.length >= 2 && bullets.join(' ').length > body.length * 0.45) {
    return { kind: 'bullets', chunks: [bullets] };
  }
  return { kind: 'text', chunks: chunkText(body, 900) };
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

function drawPdfHeader(doc, title, rtl) {
  doc.fillColor('#123B7A').fontSize(9).text('Qjo AI', 54, 30, { align: rtl ? 'right' : 'left', width: 486 });
  doc.moveTo(54, 48).lineTo(540, 48).strokeColor('#E2E8F0').lineWidth(1).stroke();
  doc.fillColor('#0F172A');
}

function drawPdfFooter(doc, pageNumber) {
  doc.moveTo(54, 790).lineTo(540, 790).strokeColor('#E2E8F0').lineWidth(1).stroke();
  doc.fontSize(8).fillColor('#64748B').text(`Qjo • Page ${pageNumber}`, 54, 802, { align: 'center', width: 486 });
  doc.fillColor('#0F172A');
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
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,،:;!?]|$)/g, '$1<em>$2</em>')
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
const UI_FONT_STACK = [
  "'Noto Naskh Arabic'", "'Noto Sans Arabic'", "'Noto Kufi Arabic'",
  "'Cairo'", "'Amiri'",
  "'Noto Sans'", "'DejaVu Sans'", "'Liberation Sans'",
  "'Noto Sans Hebrew'", "'Noto Sans Devanagari'", "'Noto Sans Thai'",
  "'Noto Sans CJK SC'", "'Noto Sans CJK JP'", "'Noto Sans CJK KR'",
  "'WenQuanYi Zen Hei'", "'IPAGothic'",
  "'Noto Color Emoji'",
  'sans-serif'
].join(',');

// Code needs a monospace face that still has Arabic coverage: a string literal
// containing Arabic used to render as empty boxes in the code block.
const MONO_FONT_STACK = [
  "'Noto Sans Mono'", "'DejaVu Sans Mono'", "'Liberation Mono'",
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

async function renderHtmlPdfWithPuppeteer(payload) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch (_) { return null; }
  const html = buildExportHtmlDocument(payload);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--font-render-hinting=medium'] });
  try {
    const page = await browser.newPage();
    // 'load' is enough now that fonts, math CSS and styles are all inline. The
    // old networkidle0 wait existed only for the Google Fonts import and cost
    // every export a network round-trip — and a 30s stall plus a downgrade to
    // the plain PDFKit renderer whenever the CDN was unreachable.
    await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
    // Remote images still need a moment; bounded so a dead URL cannot hang the
    // export.
    // The callback below is serialized and executed inside the page, where
    // `document` exists; the linter only knows this file's Node globals.
    /* eslint-disable no-undef */
    await page.evaluate(() => Promise.race([
      Promise.all(Array.from(document.images).filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))),
      new Promise(r => setTimeout(r, 5000))
    ])).catch(() => {});
    /* eslint-enable no-undef */
    await page.emulateMediaType('screen');
    const rtl = Boolean(payload.rtl);
    const footer = `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif;direction:${rtl ? 'rtl' : 'ltr'}">`
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

async function exportPdf(req, res) {
  try {
    const payload = safeExportPayload(req);
    const htmlPdf = await renderHtmlPdfWithPuppeteer(payload).catch(error => {
      console.warn('HTML PDF render failed, falling back to PDFKit:', error.message);
      return null;
    });
    if (htmlPdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(payload.title)}.pdf"; filename*=UTF-8''${encodeURIComponent(payload.title)}.pdf`);
      return res.send(htmlPdf);
    }

    // Fallback: legacy PDFKit renderer if Chromium is unavailable.
    const { title, content, rtl } = payload;
    const doc = new PDFDocument({ size: 'A4', margin: 54, bufferPages: true });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"; filename*=UTF-8''${encodeURIComponent(title)}.pdf`);
      res.send(buffer);
    });
    const fontPath = findFontPath();
    if (fontPath) doc.font(fontPath);
    drawPdfHeader(doc, title, rtl);
    doc.y = 72;
    doc.fillColor('#0F172A').fontSize(24).text(title, { align: rtl ? 'right' : 'left', width: 486, lineGap: 3 });
    doc.moveDown(1);
    doc.fillColor('#64748B').fontSize(10).text(`Generated by Qjo AI • ${new Date().toLocaleDateString()}`, { align: rtl ? 'right' : 'left', width: 486 });
    doc.moveDown(1.4);
    const sections = parseMarkdownSections(removeCodeBlocks(content), title);
    sections.forEach((section, index) => {
      if (index > 0) doc.moveDown(0.8);
      if (doc.y > 700) doc.addPage();
      doc.fillColor('#123B7A').fontSize(15).text(section.title, { align: rtl ? 'right' : 'left', width: 486 });
      doc.moveDown(0.35);
      sectionToBullets(section, 9).forEach(bullet => {
        if (doc.y > 750) doc.addPage();
        doc.fillColor('#0F172A').fontSize(11).text('• ' + bullet, { align: rtl ? 'right' : 'left', width: 486, lineGap: 5 });
        doc.moveDown(0.25);
      });
    });
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); drawPdfHeader(doc, title, rtl); drawPdfFooter(doc, i + 1); }
    doc.end();
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'PDF export failed.' });
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
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = 'Qjo AI';
    pptx.subject = title;
    pptx.title = title;
    pptx.company = 'Qjo';
    pptx.lang = rtl ? 'ar-SA' : 'en-US';
    pptx.theme = { headFontFace: rtl ? 'Noto Sans Arabic' : 'Aptos Display', bodyFontFace: rtl ? 'Noto Sans Arabic' : 'Aptos', lang: rtl ? 'ar-SA' : 'en-US' };
    pptx.defineLayout({ name: 'QJO_WIDE', width: 13.333, height: 7.5 });
    pptx.layout = 'QJO_WIDE';

    const brand = {
      navy: '07101F',
      blue: '123B7A',
      cyan: '38C7DD',
      violet: '7B3FE4',
      text: '0F172A',
      muted: '64748B',
      bg: 'F8FAFC',
      white: 'FFFFFF'
    };

    const addBrandBar = (slide) => {
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: brand.blue }, line: { color: brand.blue } });
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0.12, w: 13.333, h: 0.035, fill: { color: brand.cyan }, line: { color: brand.cyan } });
    };

    const cover = pptx.addSlide();
    cover.background = { color: brand.navy };
    cover.addShape(pptx.ShapeType.arc, { x: 9.6, y: -0.8, w: 4.2, h: 4.2, line: { color: brand.cyan, transparency: 45, width: 3 } });
    cover.addShape(pptx.ShapeType.arc, { x: 9.95, y: -0.45, w: 3.5, h: 3.5, line: { color: brand.violet, transparency: 35, width: 3 } });
    cover.addText(title, { x: 0.75, y: 2.45, w: 11.8, h: 0.85, fontSize: 34, bold: true, color: brand.white, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos Display', align: rtl ? 'right' : 'left', rtlMode: rtl, isTextBoxRtl: rtl, fit: 'shrink' });
    cover.addText('Generated by Qjo AI', { x: 0.75, y: 3.35, w: 11.8, h: 0.35, fontSize: 14, color: 'BFEFFF', fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos', align: rtl ? 'right' : 'left', rtlMode: rtl, isTextBoxRtl: rtl });

    const blocks = markdownToBlocks(removeMarkdownTables(removeCodeBlocks(content)), title);
    let slideNumber = 1;
    blocks.forEach((block) => {
      const slideData = blockToSlideText(block);
      slideData.chunks.forEach((chunk, chunkIndex) => {
        const slide = pptx.addSlide();
        slide.background = { color: brand.bg };
        addBrandBar(slide);
        const slideTitle = chunkIndex === 0 ? (block.title || title) : `${block.title || title} (${chunkIndex + 1})`;
        slide.addText(slideTitle, { x: 0.65, y: 0.45, w: 12.05, h: 0.5, fontSize: 23, bold: true, color: brand.blue, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos Display', align: rtl ? 'right' : 'left', rtlMode: rtl, isTextBoxRtl: rtl, fit: 'shrink' });

        if (slideData.kind === 'bullets') {
          const bulletText = chunk.map(b => ({ text: b, options: { bullet: { type: 'ul' }, breakLine: true } }));
          slide.addText(bulletText, { x: 0.85, y: 1.25, w: 11.6, h: 5.35, fontSize: 16, color: brand.text, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos', valign: 'top', fit: 'shrink', rtlMode: rtl, isTextBoxRtl: rtl, align: rtl ? 'right' : 'left', paraSpaceAfterPt: 9, breakLine: false });
        } else {
          slide.addText(chunk, { x: 0.85, y: 1.25, w: 11.6, h: 5.35, fontSize: 15, color: brand.text, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos', valign: 'top', fit: 'shrink', rtlMode: rtl, isTextBoxRtl: rtl, align: rtl ? 'right' : 'left', breakLine: false, paraSpaceAfterPt: 7 });
        }

        slide.addText(`Qjo • ${slideNumber}`, { x: 0.45, y: 6.95, w: 12.4, h: 0.25, fontSize: 9, color: brand.muted, align: 'center' });
        slideNumber++;
      });
    });

    const tables = extractMarkdownTables(content);
    tables.forEach((table, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: brand.bg };
      addBrandBar(slide);
      const tableTitle = rtl ? `جدول البيانات المقارنة ${index + 1}` : `Data Comparison Table ${index + 1}`;
      slide.addText(tableTitle, { x: 0.65, y: 0.45, w: 12.05, h: 0.5, fontSize: 23, bold: true, color: brand.blue, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos Display', align: rtl ? 'right' : 'left', rtlMode: rtl, isTextBoxRtl: rtl });
      
      const tableData = [
        table.headers.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: brand.blue }, align: rtl ? 'right' : 'left' } })),
        ...table.rows.map(row => row.map(cell => ({ text: cell, options: { color: brand.text, fill: { color: 'F1F5F9' }, align: rtl ? 'right' : 'left' } })))
      ];
      
      slide.addTable(tableData, { x: 0.85, y: 1.4, w: 11.6, colW: Array(table.headers.length).fill(11.6 / table.headers.length), border: { type: 'line', size: 1, color: 'CBD5E1' } });
      slide.addText(`Qjo • ${slideNumber}`, { x: 0.45, y: 6.95, w: 12.4, h: 0.25, fontSize: 9, color: brand.muted, align: 'center' });
      slideNumber++;
    });

    const mathLines = extractMathLines(content);
    if (mathLines.length) {
      const slide = pptx.addSlide();
      slide.background = { color: brand.bg };
      addBrandBar(slide);
      slide.addText(rtl ? 'معادلات وملاحظات علمية' : 'Equations & Scientific Notes', { x: 0.65, y: 0.45, w: 12.05, h: 0.5, fontSize: 23, bold: true, color: brand.violet, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos Display', align: rtl ? 'right' : 'left', rtlMode: rtl, isTextBoxRtl: rtl });
      slide.addText(mathLines.map(x => '• ' + x).join('\n'), { x: 0.85, y: 1.25, w: 11.6, h: 5.35, fontSize: 15, color: brand.text, fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos', valign: 'top', fit: 'shrink', rtlMode: rtl, isTextBoxRtl: rtl, align: rtl ? 'right' : 'left', breakLine: false });
      slide.addText(`Qjo • ${slideNumber}`, { x: 0.45, y: 6.95, w: 12.4, h: 0.25, fontSize: 9, color: brand.muted, align: 'center' });
      slideNumber++;
    }

    const codeBlocks = extractCodeBlocks(content);
    codeBlocks.slice(0, 5).forEach((block, index) => {
      const slide = pptx.addSlide();
      slide.background = { color: '0B1220' };
      slide.addText(`${rtl ? 'كود' : 'Code'} ${index + 1}: ${block.lang}`, { x: 0.6, y: 0.4, w: 12, h: 0.4, fontSize: 20, bold: true, color: '7DD3FC', fontFace: rtl ? 'Noto Sans Arabic' : 'Aptos Display', align: rtl ? 'right' : 'left', rtlMode: rtl, isTextBoxRtl: rtl });
      slide.addText(block.code, { x: 0.65, y: 1.0, w: 12.0, h: 5.9, fontFace: 'Consolas', fontSize: 11, color: 'E5E7EB', fit: 'shrink', breakLine: false, align: 'left' });
    });

    const buffer = await pptx.write({ outputType: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pptx"; filename*=UTF-8''${encodeURIComponent(title)}.pptx`);
    res.send(buffer);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'PPTX export failed.' });
  }

}

const { Document, Packer, Paragraph, TextRun } = require('docx');
const ExcelJS = require('exceljs');

async function exportDocx(req, res) {
  try {
    const { title, content } = safeExportPayload(req);
    const sections = parseMarkdownSections(content, title);
    
    const docChildren = [
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 32,
            color: "123B7A"
          })
        ],
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Generated by Qjo AI • ${new Date().toLocaleDateString()}`,
            italics: true,
            size: 18,
            color: "64748B"
          })
        ],
        spacing: { after: 300 }
      })
    ];
    
    sections.forEach((section) => {
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.title,
              bold: true,
              size: 24,
              color: "123B7A"
            })
          ],
          spacing: { before: 240, after: 120 }
        })
      );
      
      section.lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: stripMarkdown(trimmed),
                size: 22,
                color: "0F172A"
              })
            ],
            spacing: { after: 120 }
          })
        );
      });
    });
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: docChildren
      }]
    });
    
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.docx"; filename*=UTF-8''${encodeURIComponent(title)}.docx`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Word DOCX export failed.' });
  }
}

async function exportXlsx(req, res) {
  try {
    const { title, content, rtl } = safeExportPayload(req);
    const tables = extractMarkdownTables(content);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Qjo AI';
    workbook.created = new Date();
    
    if (tables.length) {
      tables.forEach((table, index) => {
        const sheetName = `Sheet ${index + 1}`.slice(0, 31);
        const worksheet = workbook.addWorksheet(sheetName, {
          views: [{ showGridLines: true, rtl: rtl }]
        });
        
        const headerRow = worksheet.addRow(table.headers);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF123B7A' }
        };
        
        table.rows.forEach(row => {
          worksheet.addRow(row);
        });
        
        worksheet.columns.forEach(column => {
          let maxLen = 0;
          column.eachCell({ includeEmpty: true }, (cell) => {
            const valLen = String(cell.value || '').length;
            if (valLen > maxLen) maxLen = valLen;
          });
          column.width = Math.min(Math.max(maxLen + 4, 12), 40);
        });
      });
    } else {
      const worksheet = workbook.addWorksheet('Report', {
        views: [{ showGridLines: true, rtl: rtl }]
      });
      worksheet.addRow([title]).font = { bold: true, size: 16, color: { argb: 'FF123B7A' } };
      worksheet.addRow([`Generated on ${new Date().toLocaleDateString()}`]).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
      worksheet.addRow([]);
      
      const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      lines.forEach(line => {
        worksheet.addRow([stripMarkdown(line)]);
      });
      worksheet.getColumn(1).width = 80;
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.xlsx"; filename*=UTF-8''${encodeURIComponent(title)}.xlsx`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Excel XLSX export failed.' });
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

module.exports = { exportPdf, exportCodeZip, exportPptx, exportDocx, exportXlsx, exportImageToPdf };

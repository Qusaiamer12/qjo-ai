const fs = require('fs');
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

function mixedDirectionNote(rtl) {
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
    const codeStart = line.match(/^```(\w+)?/);
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

function splitSlidesFromMarkdown(title, content) {
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

function inlineMarkdownToHtml(value) {
  return escapeHtmlExport(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function markdownTableToHtml(lines, start) {
  if (!lines[start]?.includes('|') || !/^\s*\|?\s*:?-{3,}:?/.test(lines[start + 1] || '')) return null;
  const split = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => inlineMarkdownToHtml(x.trim()));
  const headers = split(lines[start]);
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(split(lines[i])); i++; }
  const thead = '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
  const tbody = '<tbody>' + rows.map(r => '<tr>' + headers.map((_, idx) => `<td>${r[idx] || ''}</td>`).join('') + '</tr>').join('') + '</tbody>';
  return { html: `<div class="table-wrap"><table>${thead}${tbody}</table></div>`, next: i };
}

function markdownToExportHtml(markdown) {
  const codeBlocks = [];
  let text = String(markdown || '').replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = codeBlocks.length;
    codeBlocks.push({ lang: lang || 'text', code: String(code || '').trim() });
    return `@@CODE_${id}@@`;
  });
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const para = [];
  const flush = () => { if (para.length) { out.push(`<p>${inlineMarkdownToHtml(para.join(' '))}</p>`); para.length = 0; } };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { flush(); i++; continue; }
    const code = trimmed.match(/^@@CODE_(\d+)@@$/);
    if (code) { flush(); const block = codeBlocks[Number(code[1])]; out.push(`<pre><div class="code-lang">${escapeHtmlExport(block.lang)}</div><code>${escapeHtmlExport(block.code)}</code></pre>`); i++; continue; }
    const table = markdownTableToHtml(lines, i);
    if (table) { flush(); out.push(table.html); i = table.next; continue; }
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) { flush(); const level = Math.min(3, Math.max(2, h[1].length)); out.push(`<h${level}>${inlineMarkdownToHtml(h[2])}</h${level}>`); i++; continue; }
    const li = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (li) { flush(); const items=[]; while(i < lines.length){ const m=lines[i].trim().match(/^[-*]\s+(.+)$/) || lines[i].trim().match(/^\d+[.)]\s+(.+)$/); if(!m) break; items.push(`<li>${inlineMarkdownToHtml(m[1])}</li>`); i++; } out.push(`<ul>${items.join('')}</ul>`); continue; }
    para.push(trimmed); i++;
  }
  flush();
  return out.join('\n');
}

function buildExportHtmlDocument({ title, content, rtl }) {
  const dir = rtl ? 'rtl' : 'ltr';
  const lang = rtl ? 'ar' : 'en';
  const body = markdownToExportHtml(content);
  const safeTitle = escapeHtmlExport(title);
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Noto+Sans+Arabic:wght@400;600;700;800&display=swap');
  @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
  .page-break { page-break-after: always; break-after: page; }
  h1, h2, h3 { break-after: avoid; page-break-inside: avoid; }
  table, pre, blockquote, .table-wrap { page-break-inside: avoid; break-inside: avoid; }
  * { box-sizing: border-box; }
  body { direction: ${dir}; text-align: ${rtl ? 'right' : 'left'}; font-family: 'Cairo','Noto Sans Arabic','Arial',sans-serif; color:#0f172a; line-height:1.85; font-size:13px; }
  .cover { border-bottom: 4px solid #123B7A; padding-bottom: 18px; margin-bottom: 24px; }
  .brand { color:#123B7A; font-weight:800; letter-spacing:.02em; font-size:13px; }
  h1 { margin:8px 0 6px; font-size:28px; line-height:1.3; color:#0f172a; font-weight:800; }
  .meta { color:#64748b; font-size:11px; }
  h2 { color:#123B7A; font-size:18px; margin:22px 0 8px; break-after: avoid; }
  h3 { color:#7B3FE4; font-size:15px; margin:18px 0 6px; break-after: avoid; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 12px; padding-${rtl ? 'right' : 'left'}: 22px; padding-${rtl ? 'left' : 'right'}: 0; }
  li { margin: 4px 0; }
  strong { font-weight:800; }
  a { color:#075985; text-decoration:none; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; direction:ltr; unicode-bidi: isolate; background:#f1f5f9; border:1px solid #e2e8f0; border-radius:6px; padding:1px 5px; }
  pre { direction:ltr; text-align:left; unicode-bidi: isolate; background:#0b1220; color:#e5e7eb; border-radius:12px; padding:14px; white-space:pre-wrap; word-break:break-word; break-inside: avoid; margin:14px 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:10px; line-height:1.55; }
  .code-lang { color:#7dd3fc; font-weight:700; font-size:10px; margin-bottom:8px; }
  .table-wrap { overflow:hidden; margin:14px 0; break-inside: avoid; }
  table { width:100%; border-collapse:collapse; font-size:11px; direction:${dir}; }
  th { background:#123B7A; color:white; padding:8px; border:1px solid #123B7A; text-align:${rtl ? 'right' : 'left'}; }
  td { padding:8px; border:1px solid #cbd5e1; vertical-align:top; text-align:${rtl ? 'right' : 'left'}; }
  tr:nth-child(even) td { background:#f8fafc; }
  .footer { position: fixed; bottom: -10mm; left:0; right:0; color:#94a3b8; font-size:9px; text-align:center; }
  </style></head><body><section class="cover"><div class="brand">Qjo AI</div><h1>${safeTitle}</h1><div class="meta">Generated ${new Date().toLocaleString(rtl ? 'ar' : 'en')}</div></section>${body}<div class="footer">Qjo AI</div></body></html>`;
}

async function renderHtmlPdfWithPuppeteer(payload) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch (_) { return null; }
  const html = buildExportHtmlDocument(payload);
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--font-render-hinting=medium'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ['networkidle0'], timeout: 30000 });
    await page.emulateMediaType('screen');
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top:'0', right:'0', bottom:'0', left:'0' } });
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
    const { title, content, rtl } = safeExportPayload(req);
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

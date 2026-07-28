# Qjo Arabic Export Upgrade — HTML PDF + RTL Slides

Version: `qjo-export-arabic-html-pdf-2026-07-21-50`

## Goal
Fix Arabic export issues:
- Arabic letter overlap in PDF.
- Missing/tofu Arabic glyphs.
- Weak RTL handling.
- Slide text boxes needing explicit RTL/font settings.

## PDF solution
Implemented an HTML/CSS based PDF renderer using Puppeteer.

### Why
Browser rendering engines handle Arabic shaping, RTL, ligatures, and font fallback far better than raw PDF libraries such as PDFKit/ReportLab defaults.

### Added
- `puppeteer` dependency.
- `buildExportHtmlDocument()`.
- `markdownToExportHtml()`.
- `renderHtmlPdfWithPuppeteer()`.

### CSS rules used
```css
body {
  direction: rtl;
  text-align: right;
  font-family: 'Cairo', 'Noto Sans Arabic', 'Arial', sans-serif;
}
```

Also added:
- Arabic-friendly headings.
- RTL tables.
- LTR isolated code blocks.
- Google Fonts import for Cairo / Noto Sans Arabic.

### Fallback
If Chromium is unavailable, the endpoint falls back to legacy PDFKit so export does not fail entirely.

## Render support
Added `Aptfile` with Chromium runtime libraries and Noto fonts needed for Puppeteer/Arabic rendering on Render Linux.

## Slides solution
Improved PPTX generation:
- Arabic-friendly theme font: `Noto Sans Arabic`.
- `rtlMode: true` where appropriate.
- `isTextBoxRtl: true` where appropriate.
- right alignment for Arabic text boxes.
- code blocks remain LTR with monospace.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
npm install --no-audit --no-fund
```

A local export smoke test returned a valid PDF. On the local sandbox Puppeteer may fall back if system libraries are missing; Render should install required libraries from `Aptfile`.

## Notes
If Render does not process `Aptfile` on the selected plan/environment, Puppeteer may fail and Qjo will use the PDFKit fallback. The fallback is not as strong for Arabic shaping. The preferred production path is Puppeteer HTML PDF.

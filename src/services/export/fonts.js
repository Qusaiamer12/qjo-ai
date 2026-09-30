// The fonts every exported PDF carries with it.
//
// The PDF renderer asked for "Noto Naskh Arabic" and "Noto Sans" by name and
// took whatever the server had installed. A server with no Arabic font — the
// PDFKit fallback on this one — drew boxes where the letters should be. These
// are the Noto families (SIL Open Font License, OFL.txt), cut to the ranges
// an answer uses, and embedded in the document itself.
//
// WOFF, not WOFF2: fontkit (under PDFKit) cannot subset WOFF2's transformed
// glyph table and throws on the first Arabic word; Chromium reads either.
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'fonts');
const ARABIC_RANGE = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
const LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT_RANGE = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const GREEK_RANGE = 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF';
// Only the symbols: arrows, operators, technical and geometric shapes.
const MATH_RANGE = 'U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+27C0-27EF,U+2980-2AFF';

/** Each face: its family as the stylesheets name it, weight, file, and range. */
const FACES = [
  { family: 'Noto Naskh Arabic', weight: 400, file: 'noto-naskh-arabic-arabic-400-normal.woff', range: ARABIC_RANGE },
  { family: 'Noto Naskh Arabic', weight: 700, file: 'noto-naskh-arabic-arabic-700-normal.woff', range: ARABIC_RANGE },
  { family: 'Noto Sans', weight: 400, file: 'noto-sans-latin-400-normal.woff', range: LATIN_RANGE },
  { family: 'Noto Sans', weight: 700, file: 'noto-sans-latin-700-normal.woff', range: LATIN_RANGE },
  { family: 'Noto Sans', weight: 400, file: 'noto-sans-latin-ext-400-normal.woff', range: LATIN_EXT_RANGE },
  { family: 'Noto Sans', weight: 700, file: 'noto-sans-latin-ext-700-normal.woff', range: LATIN_EXT_RANGE },
  { family: 'Noto Sans', weight: 400, file: 'noto-sans-greek-400-normal.woff', range: GREEK_RANGE },
  { family: 'Noto Sans', weight: 700, file: 'noto-sans-greek-700-normal.woff', range: GREEK_RANGE },
  { family: 'Noto Sans Mono', weight: 400, file: 'noto-sans-mono-latin-400-normal.woff', range: LATIN_RANGE },
  { family: 'Noto Sans Math', weight: 400, file: 'noto-sans-math-latin-400-normal.woff', range: MATH_RANGE }
];

const fontPath = (file) => path.join(DIR, file);

let cssCache = null;
/** @font-face rules with each font inline, for the HTML the PDF is printed from. */
function fontFaceCss() {
  if (cssCache !== null) return cssCache;
  cssCache = FACES.map((face) => {
    const data = fs.readFileSync(fontPath(face.file)).toString('base64');
    return `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};font-display:block;`
      + `src:url(data:font/woff;base64,${data}) format('woff');unicode-range:${face.range};}`;
  }).join('\n');
  return cssCache;
}

let footerCache = null;
/**
 * The page footer is printed from a template of its own, which does not see
 * the page's @font-face: it drew "Qjo AI" and the page numbers in whatever
 * sans-serif the server had. It carries its one Latin face with it.
 */
function footerFontCss() {
  if (footerCache === null) {
    const face = FACES.find((f) => f.family === 'Noto Sans' && f.weight === 400 && f.range === LATIN_RANGE);
    const data = fs.readFileSync(fontPath(face.file)).toString('base64');
    footerCache = `@font-face{font-family:'Noto Sans';font-weight:400;src:url(data:font/woff;base64,${data}) format('woff');}`;
  }
  return footerCache;
}

module.exports = { FACES, fontPath, fontFaceCss, footerFontCss };

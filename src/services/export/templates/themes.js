// What each template looks like, in one place for every engine: the PDF
// printed by Chromium reads these as CSS variables, the Word file as styles
// and shading, the plain PDF renderer as fill colours. Colours are hex without
// the "#" (Word's form); a theme says which type it is set in, not how.
//
// The ids are the fixed list a request may name (`template`): three for a CV,
// four for a document. Anything else is refused by `resolveTemplate`.
'use strict';

/**
 * @typedef {{
 *   kind: 'cv'|'doc', serif: boolean, ink: string, accent: string, muted: string, line: string, soft: string,
 *   side?: string, sideInk?: string, sideMuted?: string, cover?: string, coverInk?: string,
 *   numbered?: boolean, justify?: boolean, size: number, leading: number
 * }} Theme
 * size is the body text in points; leading its line height as a multiple.
 */

/** @type {Record<string, Theme>} */
const THEMES = {
  modern: { kind: 'cv', serif: false, ink: '1E293B', accent: '2F6FED', muted: '64748B', line: 'D8DEE9', soft: 'F1F5FB', side: '1F2D4A', sideInk: 'F1F4FA', sideMuted: 'AEBAD6', size: 10, leading: 1.5 },
  classic: { kind: 'cv', serif: false, ink: '111111', accent: '111111', muted: '555555', line: '111111', soft: 'F4F4F4', size: 10.5, leading: 1.4 },
  compact: { kind: 'cv', serif: true, ink: '24292F', accent: '8A6D3B', muted: '6B7280', line: 'D9CBB0', soft: 'FAF6EE', size: 9.5, leading: 1.38 },
  report: { kind: 'doc', serif: false, ink: '0F172A', accent: '0F4C81', muted: '64748B', line: 'CBD5E1', soft: 'EEF3F8', cover: '0F4C81', coverInk: 'FFFFFF', size: 10.5, leading: 1.6 },
  academic: { kind: 'doc', serif: true, ink: '111111', accent: '111111', muted: '555555', line: '999999', soft: 'F5F5F5', numbered: true, justify: true, size: 12, leading: 1.7 },
  story: { kind: 'doc', serif: true, ink: '2B2118', accent: '7A3E2B', muted: '7C6A5A', line: 'D8C8B8', soft: 'FAF5EE', cover: '4A2318', coverInk: 'F6E9D8', justify: true, size: 11.5, leading: 1.75 },
  elegant: { kind: 'doc', serif: true, ink: '1F2933', accent: '9A7B4F', muted: '6B7280', line: 'D8CDB8', soft: 'FBF8F2', cover: 'FFFFFF', coverInk: '1F2933', size: 11, leading: 1.7 }
};

/** The template ids, in the order the menu offers them. */
const CV_IDS = ['modern', 'classic', 'compact'];
const DOC_IDS = ['report', 'academic', 'story', 'elegant'];

// Word's fonts: a serif and a sans that exist on every machine Word runs on,
// with a complex-script face that carries Arabic.
const WORD_FONTS = {
  sans: { ascii: 'Calibri', hAnsi: 'Calibri', cs: 'Arial' },
  serif: { ascii: 'Georgia', hAnsi: 'Georgia', cs: 'Times New Roman' }
};

/** A theme by id: an own entry only, so "constructor" and "__proto__" are not templates. */
function themeOf(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(THEMES, id)) throw new Error(`Unknown template: ${String(id).slice(0, 40)}`);
  return THEMES[id];
}

module.exports = { THEMES, CV_IDS, DOC_IDS, WORD_FONTS, themeOf };

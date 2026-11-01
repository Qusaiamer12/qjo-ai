// Export templates: professional layouts for the PDF and the Word file.
//
// A CV has three (modern with a side column, classic and ATS-friendly with a
// single column and no tables for layout, compact and elegant); a document has
// four (report, academic, story/book, elegant), each with a cover page and a
// contents list built from its headings.
//
// A request names one in `template`, a fixed list checked here. The download
// menu's choice may also travel as the first line of the content, an HTML
// comment, because the page's own download function sends only the title and
// the text; the field wins when both are there. Without a template nothing in
// this folder runs and today's files are what they were.
'use strict';

const { CV_IDS, DOC_IDS, THEMES } = require('./themes');
const { buildTemplateHtml } = require('./pdfHtml');
const { destinationPages } = require('./pageNumbers');

const IDS = new Set([...CV_IDS, ...DOC_IDS]);
const DIRECTIVE = /^[ \t]*<!--\s*qjo:template=([A-Za-z0-9_-]{1,24})\s*-->[ \t]*\r?\n?/;

/** Whether a value names a template. Own list only: "constructor" is not one. */
const isTemplate = (value) => typeof value === 'string' && IDS.has(value);

/**
 * The template a request asks for, and its content without the directive.
 * A `template` field outside the list is the caller's fault (400); a
 * directive outside the list is only text that is not shown.
 * @param {{template?: unknown}} body
 * @param {string} content
 * @returns {{template: string|null, content: string}}
 */
function resolveTemplate(body, content) {
  const directive = DIRECTIVE.exec(content);
  const text = directive ? content.slice(directive[0].length) : content;
  const field = body && body.template;
  if (field !== undefined && field !== null && field !== '') {
    if (!isTemplate(field)) {
      const error = new Error(`Unknown template. Use one of: ${[...IDS].join(', ')}.`);
      /** @type {any} */ (error).statusCode = 400;
      throw error;
    }
    return { template: /** @type {string} */ (field), content: text };
  }
  return { template: directive && isTemplate(directive[1]) ? directive[1] : null, content: text };
}

/**
 * Prints a template with a Chromium page that is already guarded. A document
 * with a contents list is printed twice: the first print says which page every
 * heading fell on, the second has those numbers in the list. The list sits
 * between the cover and the text and ends in a page break, so the numbers
 * cannot move the pages they describe.
 * @param {object} job
 * @param {any} job.page a Puppeteer page
 * @param {{template: string, title: string, content: string, rtl: boolean}} job.input
 * @param {import('./pdfHtml').Deps} job.deps
 * @param {(html: string) => Promise<void>} job.load puts HTML in the page and waits for its images and fonts
 */
async function printTemplatePdf({ page, input, deps, load }) {
  const print = async () => {
    await page.emulateMediaType('print');
    return page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  };
  const first = buildTemplateHtml(input, deps);
  await load(first.html);
  let pdf = await print();
  if (!first.hasToc) return pdf;
  const pages = destinationPages(pdf);
  if (!pages) {
    // The numbers cannot be read: a list without them, not one with wrong ones.
    console.warn('Template PDF: heading pages could not be read; the contents list has no page numbers.');
    await load(buildTemplateHtml(input, deps, { pages: new Map() }).html);
    return print();
  }
  await load(buildTemplateHtml(input, deps, { pages }).html);
  pdf = await print();
  return pdf;
}

/** @param {{title: string, content: string, rtl: boolean, template: string}} input */
const buildDocx = (input) => require('./docxTemplates').buildTemplateDocx(input);
/** @param {{title: string, content: string, rtl: boolean, template: string}} input */
const buildPdfFallback = (input) => require('./pdfKitTemplates').buildTemplatePdfKit(input);

module.exports = { buildDocx, buildPdfFallback, resolveTemplate, isTemplate, printTemplatePdf, buildTemplateHtml, TEMPLATE_IDS: [...IDS], THEMES };

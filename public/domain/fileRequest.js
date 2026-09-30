/**
 * Whether an answer is worth exporting, and whether the person asked for a
 * file outright ("اعملي ملف إكسل…", "export this as a PDF").
 *
 * The export buttons were the only way to a file, and Excel was not among
 * them even though the server made workbooks. Someone who asks for a Word
 * file should find one waiting under the answer, not have to know which of
 * four icons to press.
 *
 * Strict on purpose: a false positive puts a download card under an answer
 * nobody asked a file for. "ملف" alone is not a request ("لخصلي هالملف pdf"
 * asks for a summary), "presentation" and "word" alone are everyday English,
 * and a question about a format ("كيف احول وورد لـ pdf؟") is not an order.
 *
 * Pure: no DOM, no state.
 */
(function (global) {
  'use strict';

  const FORMATS = {
    docx: '\\bms[- ]?word\\b|\\bword\\s+(?:file|doc|document|format)\\b|\\bdocx\\b|وورد|مستند\\s*وورد',
    xlsx: '\\bexcel\\b|\\bxlsx\\b|\\bspreadsheet\\b|إكسل|اكسل|إكسيل|اكسيل',
    pptx: '\\bpower\\s?point\\b|\\bpptx\\b|\\bslides?\\b|\\bslide\\s?deck\\b|\\bpresentation\\s+(?:file|deck)\\b|بوربوينت|باوربوينت|بور\\s?بوينت|عرض\\s*تقديمي|شرائح|سلايدات|سلايد',
    pdf: '\\bpdf\\b|بي\\s?دي\\s?اف'
  };
  // Asking for a file: a verb that makes, turns or saves, then the format
  // soon after it — or the format as a destination ("as a PDF", "بصيغة وورد").
  // Arabic words start where no Arabic letter precedes them (\\b only knows
  // ASCII): "هالملف" must not read as "لملف". Bare "حول" is left out — it is
  // far more often "about" ("مقال حول الطاقة") than "convert".
  const AR = '(?<![\\u0600-\\u06FF])';
  const VERB = `\\b(?:make|create|generate|export|convert|turn|save|prepare|build|download|give\\s+me|put)\\b|${AR}(?:اعمل|اعملي|تعمل|تعملي|تعمللي|سوي|سويلي|تسوي|تسويلي|حولي|حوّل|حوّلي|تحوّل|تحول|تحولي|صدر|صدّر|جهز|جهّز|أنشئ|انشئ|نزل|نزّل|حمل|حمّل|حط|حطه|حطها|ضعه|ضعها|خليه|خليها|بدي|أريد|اريد|اعطيني|عطيني)`;
  // "in" and "في ملف" are left out: "the chart in pdf", "في ملف pdf المرفق"
  // name where something is, not what to make.
  const DESTINATION = `\\b(?:as|into|to)\\s+(?:an?\\s+)?(?:file\\s+)?|${AR}(?:بصيغة|بصيغه|على\\s*شكل|كملف|ك\\s*ملف|الى\\s*ملف|إلى\\s*ملف|لملف|بملف)`;
  // A question about a format is not a request for one. "Can you…" and
  // "هل ممكن…" are polite requests, not questions about formats.
  const ABOUT = /^\s*(?:how|what|why|which|where|is|are|does|do)\b|^\s*(?:كيف|شو\s+(?:هو|هي|يعني)|ما\s+(?:هو|هي)|ليش|لماذا)/i;

  const PATTERNS = Object.entries(FORMATS).map(([format, words]) => ({
    format,
    re: new RegExp(`(?:${VERB})[^.?!؟\\n]{0,60}?(?:${words})|(?:${DESTINATION})\\s*(?:${words})`, 'i')
  }));

  /**
   * The file format a message asks for, or null.
   * @param {string} text the person's message
   * @returns {'docx'|'xlsx'|'pptx'|'pdf'|null}
   */
  function requestedFormat(text) {
    const message = String(text || '');
    if (!message.trim() || ABOUT.test(message)) return null;
    let best = null;
    for (const { format, re } of PATTERNS) {
      const m = re.exec(message);
      // The first format asked for wins: "اعملي ملف وورد وبعدين pdf" is Word.
      if (m && (!best || m.index < best.index)) best = { format, index: m.index };
    }
    return best ? /** @type {'docx'|'xlsx'|'pptx'|'pdf'} */ (best.format) : null;
  }

  const TABLE = /\n?\|.+\|\s*\n\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?/;

  /** Whether an answer holds a Markdown table — what makes an Excel file. */
  function hasTable(content) {
    return TABLE.test(String(content || ''));
  }

  /** Whether an answer is substantial enough for the export buttons. */
  function worthExporting(content) {
    const text = String(content || '');
    return text.length >= 420 || /```|^#{1,4}\s|\n\s*[-*]\s/m.test(text) || hasTable(text);
  }

  const api = { requestedFormat, hasTable, worthExporting };
  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.fileRequest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

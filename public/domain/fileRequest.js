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
  // far more often "about" ("مقال حول الطاقة") than "convert". A joining "و"
  // may lead: "…؟ واعملي ملف وورد".
  const AR = '(?<![\\u0600-\\u06FF])و?';
  const VERB = `\\b(?:make|create|generate|export|convert|turn|save|prepare|build|download|give\\s+me|put)\\b|${AR}(?:اعمل|اعملي|تعمل|تعملي|تعمللي|سوي|سويلي|تسوي|تسويلي|حولي|حوّل|حوّلي|تحوّل|تحول|تحولي|صدر|صدّر|جهز|جهّز|أنشئ|انشئ|نزل|نزّل|حمل|حمّل|حط|حطه|حطها|ضعه|ضعها|خليه|خليها|بدي|أريد|اريد|اعطيني|عطيني)`;
  // "in" and "في ملف" are left out: "the chart in pdf", "في ملف pdf المرفق"
  // name where something is, not what to make.
  const DESTINATION = `\\b(?:as|into|to)\\s+(?:an?\\s+)?(?:file\\s+)?|${AR}(?:بصيغة|بصيغه|على\\s*شكل|كملف|ك\\s*ملف|الى\\s*ملف|إلى\\s*ملف|لملف|بملف)`;
  // A question about a format is not a request for one. "Can you…" and
  // "هل ممكن…" are polite requests, not questions about formats.
  const ABOUT = /^\s*(?:and\s+)?(?:how|what|why|which|where|is|are|does|do)\b|^\s*و?(?:كيف|شو\s+(?:هو|هي|يعني)|ما\s+(?:هو|هي)|ليش|لماذا)/i;

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
    let best = null;
    let offset = 0;
    // Sentence by sentence: "شو هو السكري؟ واعملي ملف وورد" asks a question,
    // then for a file; only the question is about something.
    for (const sentence of String(text || '').split(/(?<=[.?!؟\n])/)) {
      for (const { format, re } of ABOUT.test(sentence) ? [] : PATTERNS) {
        const m = re.exec(sentence);
        // The first format asked for wins: "اعملي ملف وورد وبعدين pdf" is Word.
        if (m && (!best || offset + m.index < best.index)) best = { format, index: offset + m.index };
      }
      offset += sentence.length;
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

  // A CV is the one answer with a fixed shape (the CV playbook writes it): a
  // name, then Summary, Experience, Education, Skills, Languages. The export
  // menu offers CV templates for it and document templates for anything else,
  // and the server reads the same headings to lay a CV out. Headings are
  // matched in English and Arabic, as words, so "Work Experience" and
  // "الخبرات العملية" are Experience; "Programming Languages" is Skills.
  const WORD = (alternatives) => new RegExp(`(?<![\\p{L}])(?:${alternatives})(?![\\p{L}])`, 'u');
  /** @type {Array<[string, RegExp]>} */
  const CV_HEADINGS = [
    ['languages', /^(?:(?:spoken|foreign|human) )?languages?(?: skills)?$|^(?:ال)?لغات$|^اللغة$|^المهارات اللغوية$/u],
    ['summary', WORD('summary|profile|objective|about me|personal statement|ملخص|الملخص|نبذة|الهدف|عني')],
    ['skills', WORD('skills?|programming languages|competenc(?:y|ies)|expertise|proficienc(?:y|ies)|tools|technologies|المهارات|مهارات|الكفاءات')],
    ['experience', WORD('experience|employment|work history|career history|الخبرات?|خبرات?|الخبرة|التجارب|التجربة|الوظائف')],
    ['education', WORD('education|academic|qualifications?|degrees?|studies|التعليم|المؤهلات?|الدراسة|التحصيل|الأكاديمي|الاكاديمي')]
  ];
  const CV_CORE = CV_HEADINGS.map(([key]) => key);

  /** Which CV section a heading names (summary, experience, education, skills, languages), or null. */
  function cvSection(heading) {
    const text = String(heading || '').replace(/[*_`#:：]/g, ' ').replace(/[\u064B-\u065F]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text || text.length > 60) return null;
    const hit = CV_HEADINGS.find(([, pattern]) => pattern.test(text));
    return hit ? hit[0] : null;
  }

  /** Whether an answer is a CV: three of the five CV sections as headings. */
  function isCv(content) {
    const found = new Set();
    for (const line of String(content || '').split('\n')) {
      const m = /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(line);
      const key = m && cvSection(m[1]);
      if (key && CV_CORE.includes(key)) found.add(key);
    }
    return found.size >= 3;
  }

  const api = { requestedFormat, hasTable, worthExporting, cvSection, isCv };
  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.fileRequest = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

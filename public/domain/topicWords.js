/**
 * Whether a message uses a word — the word itself, not letters inside another.
 *
 * The page and the server chose a message's settings by substring: "api" in
 * "capital" gave "what is the capital of Japan?" a senior engineer's capsule
 * and a code answer's room, "class" in "classic", "script" in "description",
 * "app" in "apply"; on the server "عدل" in "معدل" and "قبل" in "مستقبل" read
 * new questions as edits of the last answer.
 *
 * A Latin term is a word between non-letters, a plural or a version number
 * allowed (python3, HTML5). An Arabic term is a word between non-Arabic
 * letters, with what Arabic writes onto it: و ف ب ل ك ال هال before, a
 * pronoun (ـه ـها ـي ـلي ـني), a plural ـات or a ة that becomes ت after, or
 * is written ه. A term starting with `^` takes only و ف and ال before it
 * (^نية: not "بنية الذرة", a structure); one ending in `*` is a stem (برمج*
 * is برمجة, برمجيات); one ending in `=` takes nothing after it (حساب, not
 * حسابي, "my account"; منطق, not منطقه, a region). Hamza on an alif, harakat
 * and the tatweel are ignored in both.
 *
 * A message is read as its first 2,000 and last 500 characters (bounded):
 * where a request is, and where a pasted body ends. Whatever the patterns,
 * a 200,000-character paste costs what 2,500 characters do.
 *
 * Pure: text and terms in, true or false out.
 */
(function () {
  'use strict';

  const AR = '\\u0621-\\u063F\\u0641-\\u064A\\u0671-\\u06D3\\u06FA-\\u06FF';
  const AR_LETTER = new RegExp(`[${AR}]`);
  const PROCLITIC = '[وف]?(?:[بلك]|لل)?(?:ال|هال)?';
  const PROCLITIC_BARE = '[وف]?(?:ال)?';
  const AR_SUFFIX = '(?:ات)?(?:ل[يى]|لنا|له|لها|لهم|لك)?(?:ني|ه|ها|هم|هن|ي|ك|كم|نا|و)?';
  const LATIN = 'a-z0-9_';

  const HEAD = 2000, TAIL = 500;
  /** The part of a message a classifier reads. @param {string} text */
  function bounded(text) {
    const value = String(text || '');
    return value.length <= HEAD + TAIL ? value : `${value.slice(0, HEAD)}\n${value.slice(-TAIL)}`;
  }

  /** @param {string} text */
  function normalize(text) {
    return String(text || '').toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآ]/g, 'ا');
  }

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** @param {string} raw */
  function termSource(raw) {
    const stem = raw.endsWith('*'), exact = raw.endsWith('='), bare = raw.startsWith('^');
    const term = normalize(raw.slice(bare ? 1 : 0, stem || exact ? -1 : undefined)).trim();
    const arStart = AR_LETTER.test(term[0]), arEnd = AR_LETTER.test(term[term.length - 1]);
    let body = term.split(/\s+/).map(escape).join('\\s+');
    if (arEnd) {
      const open = stem ? `[${AR}]*` : (exact ? '' : AR_SUFFIX);
      if (!stem && !exact && body.endsWith('ة')) body = `${body.slice(0, -1)}(?:ة|ه|ات|ت${AR_SUFFIX})`;
      else body += open;
    } else {
      body += stem ? `[${LATIN}]*` : (exact ? '' : '(?:s|es|\\d+(?:\\.\\d+)*)?');
    }
    const before = arStart ? `(?<![${AR}])${bare ? PROCLITIC_BARE : PROCLITIC}` : `(?<![${LATIN}])`;
    const after = arEnd ? `(?![${AR}])` : `(?![${LATIN}])`;
    return before + body + after;
  }

  /**
   * One test for a list of terms, built once.
   * @param {string[]} terms
   * @returns {(text: string) => boolean}
   */
  function matcher(terms) {
    const re = new RegExp(terms.map(termSource).join('|'), 'u');
    return (text) => re.test(normalize(bounded(text)));
  }

  const cache = new Map();
  /** @param {string} text @param {string[]} terms */
  function hasWord(text, terms) {
    const key = terms.join('\u0000');
    if (!cache.has(key)) cache.set(key, matcher(terms));
    return cache.get(key)(text);
  }

  // What the page reads a message for: the skill capsules it sends with it,
  // and whether a code answer's room is worth giving. A site, Python for the
  // page and a math figure are decided elsewhere, before these.
  const PAGE_TOPICS = {
    code: ['code', 'coding', 'codebase', 'كود', 'برمج*', 'مبرمج*', 'debug*', 'bug', 'api', 'html', 'css', 'javascript', 'typescript', 'python', 'react', 'reactjs', 'react.js', 'node', 'تطبيق', 'موقع ويب', 'موقع الكتروني', 'لعبة', 'app', 'website', 'game'],
    codeBudget: ['code', 'coding', 'codebase', 'كود', 'برمج*', 'مبرمج*', 'دالة', 'debug*', 'bug', 'api', 'html', 'css', 'javascript', 'typescript', 'python', 'react', 'reactjs', 'react.js', 'node', 'sql', 'mysql', 'postgres*', 'nosql', 'sqlite', 'تطبيق', 'موقع ويب', 'موقع الكتروني', 'سكربت', 'script', 'function', 'class'],
    neural: ['neural', 'شبكة عصبية', 'شبكات عصبية', 'transformer', 'cnn', 'rnn', 'gnn', 'attention', 'architecture', 'معمارية', 'نموذج تعلم عميق', 'deep learning'],
    research: ['بحث', 'بحثي', 'بحثية', 'paper', 'دراسة', 'منهجية', 'فرضية', 'literature', 'review', 'academic', 'اكاديمي', 'اكاديمية', 'مصادر', 'توثيق'],
    tutoring: ['اشرح', 'علمني', 'ادرس', 'طالب', 'طالبة', 'امتحان', 'quiz', 'quizzes', 'اختبار', 'مذاكرة', 'لخص', 'تلخيص', 'افهم', 'شرح'],
    math: ['احسب', 'رياضيات', 'معادلة', 'برهان', 'احتمال', 'احتمالية', 'احصاء', 'جبر', 'تفاضل', 'تكامل', 'algorithm', 'خوارزمية', 'equation', 'integral', 'derivative', 'calculus', 'algebra', 'probability', 'statistics', 'theorem'],
    file: ['pdf', 'ملف', 'وثيقة', 'صورة', 'مرفق', 'مرفقة', 'csv', 'json']
  };

  /** @param {string} text @param {keyof typeof PAGE_TOPICS} topic */
  const pageTopic = (text, topic) => hasWord(text, PAGE_TOPICS[topic]);

  const api = { bounded, normalize, matcher, hasWord, PAGE_TOPICS, pageTopic };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.topicWords = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

/**
 * Whether a message asks for a website or an interface: built from nothing
 * ("صمملي موقع لمطعمي", "build me a landing page"), or changed when the
 * answer before it was one ("add a contact section", "خليه أغمق").
 *
 * A site is a different request from code. It is one complete file that runs
 * in Qjo's preview — not a project with a file tree, terminal commands, tests
 * and deployment notes, which is what a React landing page used to be asked
 * for: the engineering overlay, a bug-fixing playbook, house guidance on
 * fetching from /api and the page's "coding capsule" all rode with it, and
 * told the model the opposite of the interface playbook beside them. This
 * decides what such a request carries, which model writes it and how much
 * room the answer gets.
 *
 * Pure: the person's own words (ownWords.js) and the answer before them in, a
 * boolean out. Loadable from a script tag and from Node.
 */
(function () {
  'use strict';

  // English: a verb that makes something, then a site within a few words —
  // "build me a simple website", "design a landing page", "make a todo app in
  // React". Not "make a list of websites" or "sites to learn French".
  const EN_VERB = '(?:build|make|create|design|develop|code|generate|redesign|craft|write|put together|whip up)';
  const EN_GAP = "(?:\\s+(?:me|us|for me|for us))?(?:\\s+(?!of\\b|to\\b|about\\b|on\\b)[\\w'&-]+){0,5}?";
  const EN_THING = '(?:web ?sites?|sites?|landing[- ]?pages?|web ?pages?|home ?pages?|one[- ]pager|(?:one|single)[- ]page (?:site|website|app)|portfolio(?: site| page| website)?|dashboards?|admin (?:panel|dashboard)|web ?apps?|(?:user )?interfaces?|ui|front-?end|(?:html|react|tailwind) (?:pages?|files?|templates?|version|components?)|components?)';
  const EN_BUILD = new RegExp(`\\b${EN_VERB}\\b${EN_GAP}\\s+${EN_THING}\\b(?!\\s+(?:of|to (?:visit|learn|watch|read|download|buy|use))\\b)`, 'i');
  // "a calculator in HTML", "a login form with Tailwind".
  const EN_STACK = /\b(?:build|make|create|design|code|write|develop)\b[^.?!\n]{0,80}?\b(?:in|with|using)\s+(?:html|react|tailwind|css|jsx)\b/i;

  // Arabic: a verb that makes (often with "لي" joined to it: صمملي, اعمللي,
  // سويلي), then a site, a page, an interface or a dashboard.
  const AR_MAKE = '(?:صمم|صمّم|اعمل|إعمل|ابني|إبني|سوي|سوّي|برمج|انشئ|أنشئ|طور|طوّر|جهز|جهّز|اصنع|إصنع)';
  const AR_THING = '(?:ال)?(?:موقع|صفحة|صفحه|واجهة|واجهه|لوحة تحكم|داشبورد|بورتفوليو|تطبيق ويب|لاندنج)';
  const AR_BUILD = new RegExp(`(?<![\\u0600-\\u06FF])${AR_MAKE}\\S*(?:\\s+(?:لي|إلي|الي|لنا))?(?:\\s+(?!عن|من|في|على|حول)\\S+){0,3}?\\s+${AR_THING}(?![\\u0600-\\u06FF])`);
  // "بدي موقع لمطعمي" — but not "بدي موقع الجامعة", the university's own.
  const AR_WANT = /(?<![؀-ۿ])(?:بدي|بدنا|ابغى|أبغى|أريد|اريد|عايز|ودي)\s+(?:\S+\s+){0,2}?(?:موقع|صفحة هبوط|صفحة ويب|لاندنج|بورتفوليو|داشبورد|لوحة تحكم)\s+(?:ل\S*|إلكتروني|الكتروني|ويب|شخصي|احترافي|بسيط|حديث|كامل|متكامل|تعريفي|عصري|بـ?\S*)/;
  const AR_CODE = /(?<![؀-ۿ])(?:اكتب|إكتب|اعطيني|أعطني|عطيني)\S*\s+(?:لي\s+)?كود\s+(?:html|react|رياكت|لموقع|لصفحة)/i;

  /** @param {string} text the person's own words */
  function buildsSite(text) {
    const value = String(text || '');
    return EN_BUILD.test(value) || EN_STACK.test(value) || AR_BUILD.test(value) || AR_WANT.test(value) || AR_CODE.test(value);
  }

  // An answer that was a page: a whole HTML document, or a component.
  const PAGE_ANSWER = /```[ \t]*(?:html?|xml)?[ \t]*\r?\n[\s\S]*?<(?:!doctype\s+html|html|body)\b|```[ \t]*(?:jsx|tsx)\b|```[ \t]*(?:javascript|js|typescript|ts)[ \t]*\r?\n[\s\S]*?export\s+default\b/i;
  // Asking to change something in it.
  const CHANGE = /\b(?:add|change|make (?:it|the|them|this)|remove|delete|replace|move|swap|use|turn|switch|translate|redo|improve|fix|update|put|increase|decrease|bigger|smaller|darker|lighter|another|more)\b|(?<![؀-ۿ])(?:ضيف|أضف|اضف|زيد|زود|غير|غيّر|خلي|خلّي|شيل|احذف|حط|عدل|عدّل|بدل|بدّل|كبر|كبّر|صغر|صغّر|ترجم|حسن|حسّن|طور|طوّر|صلح|صلّح|زبط|ظبط|اجعل|استخدم)/i;
  const CHANGE_MAX_CHARS = 400;

  /**
   * Whether this message is a site to write: asked for in its own words, or a
   * change to the page the answer before it was.
   * @param {{text?: string, lastAnswer?: string}} turn the person's own words, and the previous answer
   */
  function asksForSite({ text = '', lastAnswer = '' } = {}) {
    const value = String(text || '');
    if (buildsSite(value)) return true;
    return value.length <= CHANGE_MAX_CHARS && !value.includes('```') && CHANGE.test(value) && PAGE_ANSWER.test(String(lastAnswer || ''));
  }

  /**
   * The same, read from a conversation: its newest message from the person and
   * the answer before that message.
   * @param {Array<{role: string, content: any}>} messages
   * @param {(text: string) => string} [own] the person's own words in a message as sent (ownWords)
   */
  function siteInConversation(messages, own) {
    const list = Array.isArray(messages) ? messages : [];
    const text = (m) => (m && typeof m.content === 'string' ? m.content : '');
    let at = list.length - 1;
    while (at >= 0 && !(list[at] && list[at].role === 'user')) at--;
    if (at < 0) return false;
    let before = at - 1;
    while (before >= 0 && !(list[before] && list[before].role === 'assistant')) before--;
    const words = text(list[at]);
    return asksForSite({ text: own ? own(words) : words, lastAnswer: before >= 0 ? text(list[before]) : '' });
  }

  const api = { buildsSite, asksForSite, siteInConversation };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.siteRequest = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

/**
 * Which language a piece of text is in, which language the page opens in,
 * and whether Arabic is part of a conversation.
 *
 * English is the primary language: the page opens in it unless the person
 * chose Arabic or their browser prefers it, and the model defaults to it. The
 * Arabic that took real work to get right is kept, not diluted: whenever
 * Arabic is in play, the server adds the Arabic craft to the prompt, and the
 * reply follows the language of the person's own words.
 *
 * The page and the server both load this file, so a message is never judged
 * Arabic on one side and English on the other. Pure: no DOM, no network.
 */
(function () {
  'use strict';

  // Letters only. Digits, punctuation and Arabic diacritics carry no signal.
  const ARABIC_LETTER = /[ء-يٱ-ۓۺ-ۿ]/g;
  const LATIN_LETTER = /[A-Za-zÀ-ɏ]/g;

  /** Fewer letters than this and the text does not say which language it is. */
  const MIN_LETTERS = 3;

  /**
   * An Arabic sentence routinely carries English terms ("اعملي API بـ Node"),
   * so Arabic does not need a majority of the letters to be the language.
   */
  const ARABIC_SHARE = 0.3;

  /**
   * A long message is usually a short request wrapped around pasted material.
   * Judging the whole text let a pasted English article decide the language
   * of an Arabic request, so long text is judged by its first short line —
   * where requests usually are — then its last, then the whole.
   */
  const LONG_TEXT = 700;
  const REQUEST_LINE = 200;

  /** English words that ask for Arabic output even when the request is English. */
  const ASKS_FOR_ARABIC = /\b(arabic|levantine|jordanian|egyptian|khaleeji|gulf dialect|fusha|fus-ha|msa)\b/i;

  function countLetters(text) {
    const t = String(text || '');
    return {
      arabic: (t.match(ARABIC_LETTER) || []).length,
      latin: (t.match(LATIN_LETTER) || []).length
    };
  }

  function textOf(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part) => (typeof part === 'string' ? part : (part && typeof part.text === 'string' ? part.text : ''))).join('\n');
    }
    return '';
  }

  /**
   * @param {string} text
   * @returns {'ar' | 'en' | null} null when there are too few letters to tell.
   */
  function judge(text) {
    const { arabic, latin } = countLetters(text);
    if (arabic + latin < MIN_LETTERS) return null;
    return arabic / (arabic + latin) >= ARABIC_SHARE ? 'ar' : 'en';
  }

  function languageOfText(text) {
    const t = String(text || '');
    if (t.length > LONG_TEXT) {
      const lines = t.split('\n').map((line) => line.trim()).filter(Boolean);
      for (const edge of [lines[0], lines[lines.length - 1]]) {
        if (edge && edge.length <= REQUEST_LINE) {
          const found = judge(edge);
          if (found) return found;
        }
      }
    }
    return judge(t);
  }

  /**
   * The language to answer a message in when the page answers it itself (a
   * greeting, the time): the message's language, and the interface language
   * only when the message does not say.
   * @param {string} text
   * @param {string} [fallback]
   * @returns {'ar' | 'en'}
   */
  function replyLanguage(text, fallback) {
    return languageOfText(text) || (fallback === 'ar' ? 'ar' : 'en');
  }

  /**
   * The language the page opens in: the person's saved choice, else Arabic
   * when their browser's first preference is Arabic, else English.
   * @param {{stored?: string | null, preferred?: ReadonlyArray<string>}} [options]
   * @returns {'ar' | 'en'}
   */
  function resolveInitialLanguage({ stored, preferred } = {}) {
    if (stored === 'ar' || stored === 'en') return stored;
    const first = (preferred || []).find(Boolean);
    return /^ar(\b|[-_])/i.test(String(first || '')) ? 'ar' : 'en';
  }

  /**
   * Whether Arabic is part of this conversation: in the person's recent
   * words, in what they ask for ("translate this into Arabic"), or in the
   * interface they chose. Deliberately generous — including the Arabic craft
   * in an English conversation costs a few hundred tokens, while leaving it
   * out of an Arabic one costs the quality it exists for.
   * @param {Array<{role?: string, content?: any}>} messages
   * @param {{uiLanguage?: string}} [options]
   * @returns {boolean}
   */
  function arabicInPlay(messages, { uiLanguage } = {}) {
    if (uiLanguage === 'ar') return true;
    const recent = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && m.role === 'user')
      .slice(-3)
      .map((m) => textOf(m.content));
    return recent.some((t) => countLetters(t).arabic >= MIN_LETTERS || ASKS_FOR_ARABIC.test(t));
  }

  const api = { languageOfText, replyLanguage, resolveInitialLanguage, arabicInPlay, countLetters };

  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.language = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

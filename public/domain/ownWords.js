/**
 * The person's own words in a message the page sent: what they typed, without
 * what the page added after it — the text read from their files, a search's
 * source pack, the instruction that goes with a picture, the note that one
 * was sent.
 *
 * What a message asks for is judged on these. A CV photographed and sent with
 * "extract my details" is a page of skills — JavaScript, React, APIs, testing
 * — and judged on everything the message carried it was a request for code,
 * for an interface, a cover letter, a worked problem and a lesson: every
 * playbook joined the prompt, 4,000 tokens of it, and one picture became a
 * request Groq refused as over its 8,000 a minute.
 *
 * Pure: text in, text out. The page writes the person's words first and adds
 * each of its own parts after a blank line, opening with words of its own.
 */
(function () {
  'use strict';

  const ADDED = [
    'Possible user typo/intent correction:',
    'User attached or previously indexed files with retrieved evidence',
    'Web search note:',
    'Connected search executed.',
    'Connected Deep Search executed.',
    'Analyze the attached image(s) directly',
    'حلّل الصورة/الصور المرفقة',
    '[The attached image',
    '[Attached by the person and kept by the page',
    '[Image(s) attached and analyzed when this was sent]',
    '[تم إرفاق صورة/صور وتحليلها',
    '[🖼️',
    'OCR text extracted from image'
  ].map((marker) => '\n\n' + marker);

  /** @param {string} text a message as the page sent it */
  function ownWords(text) {
    const value = String(text || '');
    let end = value.length;
    for (const marker of ADDED) {
      const at = value.indexOf(marker);
      if (at >= 0 && at < end) end = at;
    }
    return value.slice(0, end).trim();
  }

  const api = { ownWords, ADDED };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.ownWords = ownWords;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

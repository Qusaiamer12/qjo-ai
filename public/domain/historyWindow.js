/**
 * Which part of the conversation a request carries.
 *
 * It used to be "the last eleven messages". Past eleven, the oldest message
 * changed with every new one, so the history never opened the same way twice
 * — and a provider that caches the opening a request shares with an earlier
 * one (Groq does, for free, outside its rate limits) could reuse none of it.
 *
 * Now the start moves six messages at a time, three exchanges: for three turns
 * in a row the history opens exactly as it did, and a request still carries
 * between six and eleven earlier messages. The start is always even, so the
 * history opens on the person's message, not on an answer to nothing.
 *
 * Pure: numbers in, a number out.
 */
(function () {
  'use strict';

  const MAX = 11;
  const STEP = 6;

  /**
   * @param {number} length messages in the conversation, the new one included
   * @returns {number} index of the first message to send
   */
  function historyStart(length) {
    const earlier = Math.max(0, Math.floor(Number(length) || 0) - 1);
    if (earlier <= MAX) return 0;
    return Math.ceil((earlier - MAX) / STEP) * STEP;
  }

  const api = { historyStart, MAX, STEP };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.historyWindow = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

/**
 * A quiz the model wrote, read the way the page shows it.
 *
 * The teaching playbook asks for the correct option word for word. Models
 * also give its letter ("B", "ب"), its index, or the option with its letter
 * in front ("B) 2x"); read only as text, every one of those marked every
 * choice wrong. An answer that names no option is unknown (-1): the page then
 * shows the explanation without calling a choice right or wrong.
 *
 * Pure: no DOM, no state.
 */
(function (global) {
  'use strict';

  const LETTERS = ['abcdefgh', 'أبجدهوزح'];
  // "B) ", "(b) ", "ب. ", "C - " in front of an option.
  const LEAD = /^\s*\(?([a-h]|[اأبجدهوزح])\)?\s*[.):\-–]\s*/i;
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const bare = (s) => norm(String(s ?? '').replace(LEAD, ''));

  /** The index a lone letter names ("B", "(c)", "ج"), or -1. */
  function letterIndex(text) {
    const m = /^\s*\(?([a-h]|[اأبجدهوزح])\)?[.)]?\s*$/i.exec(String(text ?? ''));
    if (!m) return -1;
    const letter = m[1].toLowerCase().replace('ا', 'أ');
    for (const alphabet of LETTERS) if (alphabet.includes(letter)) return alphabet.indexOf(letter);
    return -1;
  }

  /**
   * Which option is correct, or -1 when the answer names none.
   * @param {string[]} options
   * @param {unknown} answer
   */
  function correctOption(options, answer) {
    if (answer === undefined || answer === null || answer === '') return -1;
    // As text first, letters in front set aside: "B) 2x", "2x".
    const named = options.findIndex((o) => bare(o) && bare(o) === bare(answer));
    if (named >= 0) return named;
    const letter = letterIndex(answer);
    if (letter >= 0 && letter < options.length) return letter;
    const n = typeof answer === 'number' ? answer : /^\s*\d+\s*$/.test(String(answer)) ? Number(answer) : NaN;
    // An index counts from zero, as JSON does; one past the end can only be
    // counting from one.
    if (Number.isInteger(n) && n >= 0 && n < options.length) return n;
    if (n === options.length) return n - 1;
    return -1;
  }

  /**
   * The questions a quiz block holds, each with its options as text and the
   * index of the correct one; anything without a question and two options is
   * dropped.
   * @param {unknown} parsed the block's JSON
   * @returns {{question: string, options: string[], correct: number, explanation: string}[]}
   */
  function readQuiz(parsed) {
    const wrapped = /** @type {{questions?: unknown}} */ (parsed && typeof parsed === 'object' ? parsed : {});
    const list = Array.isArray(parsed) ? parsed : Array.isArray(wrapped.questions) ? wrapped.questions : [];
    return list.flatMap((q) => {
      if (!q || typeof q !== 'object') return [];
      const options = (Array.isArray(q.options) ? q.options : Array.isArray(q.choices) ? q.choices : []).map((o) => String(o ?? '').trim()).filter(Boolean);
      const question = String(q.question ?? q.q ?? '').trim();
      if (!question || options.length < 2) return [];
      const answer = [q.answer, q.correct, q.correct_answer, q.correctAnswer].find((a) => a !== undefined && a !== null && a !== '');
      return [{ question, options, correct: correctOption(options, answer), explanation: String(q.explanation ?? '').trim() }];
    });
  }

  const api = { readQuiz, correctOption };
  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.quiz = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

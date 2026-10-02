/**
 * Where a streaming answer can be cut into what is finished and what is
 * still being written.
 *
 * The streaming view used to render the whole answer again on every tick: at
 * 90 ms a tick, every paragraph, table and code block was destroyed and built
 * again a dozen times a second for the length of the answer — a selection
 * vanished under the reader, and the page did work proportional to the answer
 * squared. And a code block showed as raw backticks and text until its
 * closing fence arrived.
 *
 * Everything before the last blank line outside a code fence is finished: no
 * later token can change how it renders. The rest is the tail, drawn again on
 * each tick — with an unclosed fence closed for the drawing, so code looks
 * like code while it is typed.
 *
 * Pure: text in, text out.
 */
(function () {
  'use strict';

  // As the renderer reads fences (markdown.js): a line of backticks opens a
  // block, with a language after it or not; inside one, only a line of
  // backticks alone closes it. "```html" inside an open block used to close
  // it: an answer cut off in its code and continued with "```html" showed the
  // rest of the page as text under a preview of half of it.
  const OPENER = /^\s{0,3}(`{3,})\s*([^`\s]*)/;
  const CLOSER = /^\s*(`{3,})\s*$/;

  /** Steps the fence state over one line. */
  function step(open, line) {
    if (open) {
      const close = CLOSER.exec(line);
      return close && close[1].length >= open.ticks.length ? null : open;
    }
    const start = OPENER.exec(line);
    return start ? { ticks: start[1], info: start[2] } : null;
  }

  /**
   * The code block a text ends inside, or null when it ends outside any.
   * @param {string} text
   * @returns {{ ticks: string, info: string } | null}
   */
  function openFence(text) {
    let open = null;
    for (const line of String(text || '').split('\n')) open = step(open, line);
    return open;
  }

  /**
   * @param {string} text the answer so far
   * @returns {{ stable: string, tail: string }} stable + tail === text
   */
  function splitStable(text) {
    const value = String(text || '');
    let open = null;
    let cut = 0;
    let pos = 0;
    const lines = value.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      open = step(open, line);
      pos += line.length + 1;
      // A blank line with more text after it, outside any fence.
      if (!open && !line.trim() && i < lines.length - 1) cut = pos;
    }
    return { stable: value.slice(0, cut), tail: value.slice(cut) };
  }

  /**
   * The tail, with a code fence it opened and has not closed yet closed, so
   * it renders as the code block it is becoming.
   * @param {string} tail
   */
  function closeOpenFence(tail) {
    const open = openFence(tail);
    return open ? `${tail}\n${open.ticks}` : tail;
  }

  const api = { splitStable, closeOpenFence, openFence };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.streamBlocks = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

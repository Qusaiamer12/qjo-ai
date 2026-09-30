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

  // As the renderer reads fences (markdown.js): backticks, each one opening
  // or closing.
  const FENCE = /^\s{0,3}(`{3,})/;

  /**
   * @param {string} text the answer so far
   * @returns {{ stable: string, tail: string }} stable + tail === text
   */
  function splitStable(text) {
    const value = String(text || '');
    let open = '';
    let cut = 0;
    let pos = 0;
    const lines = value.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = FENCE.exec(line);
      if (fence) open = open ? '' : fence[1];
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
    let open = '';
    for (const line of String(tail || '').split('\n')) {
      const fence = FENCE.exec(line);
      if (fence) open = open ? '' : fence[1];
    }
    return open ? `${tail}\n${open}` : tail;
  }

  const api = { splitStable, closeOpenFence };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.streamBlocks = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

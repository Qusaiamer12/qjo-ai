/**
 * An answer as it should be heard: its words, not its Markdown. Code,
 * charts, quizzes and addresses are not read out, a link is its text, a
 * table is its cells, and a citation's number is dropped.
 *
 * Long text is spoken in pieces: Chrome stops a single long utterance after
 * about fifteen seconds, mid-sentence.
 *
 * Pure: no DOM, no state.
 */
(function (global) {
  'use strict';

  /** What a person would want to hear of an answer's Markdown. */
  function speakable(markdown) {
    return String(markdown || '')
      .replace(/<think>[\s\S]*?<\/think>/g, ' ')
      .replace(/```[\s\S]*?(?:```|$)/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\d{1,3}\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^[ \t]*>?[ \t]*\[![A-Za-z]+\][ \t]*$/gm, '')
      .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, '')
      .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, cells) => cells.split('|').map((c) => c.trim()).filter(Boolean).join('، '))
      .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d{1,3}[.)])[ \t]+/gm, '')
      .replace(/\*\*|__|~~|`/g, '')
      .replace(/(^|\s)[*_](\S)/g, '$1$2')
      .replace(/(\S)[*_](?=\s|[.,،!?؟]|$)/gm, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
  }

  /**
   * The text in pieces of at most `max` characters, broken after a sentence
   * where possible, then after a comma, then between words.
   */
  function chunks(text, max = 220) {
    const out = [];
    let piece = '';
    const add = (part) => {
      if ((piece + part).length <= max) { piece += part; return; }
      if (piece.trim()) out.push(piece.trim());
      piece = '';
      if (part.length <= max) { piece = part; return; }
      for (const word of part.split(/(?<=[,،;])\s*|\s+/)) {
        if ((piece + ' ' + word).trim().length > max && piece.trim()) { out.push(piece.trim()); piece = ''; }
        piece = (piece + ' ' + word).trim();
      }
    };
    for (const sentence of String(text || '').split(/(?<=[.!?؟\n])\s*/)) if (sentence.trim()) add(sentence + ' ');
    if (piece.trim()) out.push(piece.trim());
    return out;
  }

  const api = { speakable, chunks };
  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.speech = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

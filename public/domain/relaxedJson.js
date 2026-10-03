/**
 * JSON as models write it — unquoted keys, single quotes, trailing commas,
 * comments — read without running any of it.
 *
 * Chart and quiz blocks used to fall back to `new Function('return (' + text
 * + ')')` when JSON.parse refused them. The app's CSP allows eval, so a block
 * in an answer ran in the app's own origin with the person's sign-in: a chart
 * whose data held `(window.x = 1, 2)` set window.x. An answer is written by a
 * model that reads web pages, so its blocks are not trusted code. This reads
 * the same relaxed forms as data and nothing else.
 *
 * Pure: text in, value out.
 */
(function () {
  'use strict';

  const MAX_LENGTH = 400000;
  const MAX_DEPTH = 100;
  const ESCAPES = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', 0: '\0', '"': '"', "'": "'", '`': '`', '\\': '\\', '/': '/' };
  const ID_START = /[A-Za-z_$À-￿]/;
  const ID_PART = /[A-Za-z0-9_$À-￿]/;
  const LITERALS = { true: true, false: false, null: null, undefined: null, NaN: NaN, Infinity: Infinity };

  /**
   * Reads one value from the relaxed form.
   * @param {string} text
   * @returns {{ok: true, value: any} | {ok: false, error: string}}
   */
  function read(text) {
    const src = String(text == null ? '' : text);
    if (src.length > MAX_LENGTH) return { ok: false, error: `too long (${src.length} characters)` };
    let i = 0;
    let depth = 0;

    const where = () => {
      const before = src.slice(0, i).split('\n');
      return `line ${before.length}, column ${before[before.length - 1].length + 1}`;
    };
    const fail = (what) => { throw new SyntaxError(`${what} at ${where()}`); };

    function skip() {
      while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c) || c === '﻿') { i++; continue; }
        if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
        if (c === '/' && src[i + 1] === '*') {
          const end = src.indexOf('*/', i + 2);
          if (end < 0) fail('an unclosed comment');
          i = end + 2;
          continue;
        }
        break;
      }
    }

    function string() {
      const quote = src[i++];
      let out = '';
      while (i < src.length && src[i] !== quote) {
        const c = src[i++];
        if (c !== '\\') { out += c; continue; }
        const e = src[i++];
        if (e === undefined) break;
        if (e === '\n') continue; // a line continued
        if (e === '\r') { if (src[i] === '\n') i++; continue; }
        if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i, i + 4))) { out += String.fromCharCode(parseInt(src.slice(i, i + 4), 16)); i += 4; continue; }
        if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(src.slice(i, i + 2))) { out += String.fromCharCode(parseInt(src.slice(i, i + 2), 16)); i += 2; continue; }
        // Kept as written: "\(" and "\alpha" are LaTeX, not escapes.
        out += Object.prototype.hasOwnProperty.call(ESCAPES, e) ? ESCAPES[e] : '\\' + e;
      }
      if (src[i] !== quote) fail('an unclosed string');
      i++;
      return out;
    }

    function number() {
      const m = /^[+-]?(?:Infinity|NaN|0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
      if (!m) fail('a value expected');
      i += m[0].length;
      const body = m[0].replace(/^[+-]/, '');
      const sign = m[0][0] === '-' ? -1 : 1;
      if (body === 'Infinity') return sign * Infinity;
      if (body === 'NaN') return NaN;
      return sign * (/^0[xX]/.test(body) ? parseInt(body, 16) : Number(body));
    }

    function identifier() {
      const start = i;
      if (!ID_START.test(src[i] || '')) fail('a name expected');
      while (i < src.length && ID_PART.test(src[i])) i++;
      return src.slice(start, i);
    }

    // Own properties only, as JSON.parse makes them: "__proto__" is a key.
    function put(obj, key, value) {
      Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
    }

    function list(close, item) {
      if (++depth > MAX_DEPTH) fail('nested too deeply');
      i++;
      for (;;) {
        skip();
        if (src[i] === close) { i++; break; }
        item();
        skip();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === close) { i++; break; }
        fail(`"," or "${close}" expected`);
      }
      depth--;
    }

    function value() {
      skip();
      const c = src[i];
      if (c === '{') {
        const obj = {};
        list('}', () => {
          const k = src[i] === '"' || src[i] === "'" || src[i] === '`' ? string() : /[0-9+\-.]/.test(src[i] || '') ? String(number()) : identifier();
          skip();
          if (src[i] !== ':') fail('":" expected');
          i++;
          put(obj, k, value());
        });
        return obj;
      }
      if (c === '[') {
        const arr = [];
        list(']', () => { arr.push(value()); });
        return arr;
      }
      if (c === '"' || c === "'" || c === '`') return string();
      if (c !== undefined && /[0-9+\-.]/.test(c)) return number();
      if (c !== undefined && ID_START.test(c)) {
        const start = i;
        const name = identifier();
        if (Object.prototype.hasOwnProperty.call(LITERALS, name)) return LITERALS[name];
        i = start;
        fail(`"${name}" is not a value`);
      }
      return fail(c === undefined ? 'the text ended early' : `"${c}" is not a value`);
    }

    try {
      const out = value();
      skip();
      if (src[i] === ';') { i++; skip(); }
      if (i < src.length) fail('text after the value');
      return { ok: true, value: out };
    } catch (err) {
      return { ok: false, error: err instanceof SyntaxError ? err.message : String(err) };
    }
  }

  /**
   * What a block holds, read as leniently as is safe: entities from an older
   * escaping pass undone, a fence around it dropped, strict JSON first, then
   * the relaxed form, then the outermost {…} or […] if words surround it.
   * @param {string} raw
   * @returns {{ok: true, value: any} | {ok: false, error: string}}
   */
  function readLoose(raw) {
    if (!raw || typeof raw !== 'string') return { ok: false, error: 'empty' };
    const text = raw
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .trim()
      .replace(/^```[a-z0-9_-]*\s*/i, '').replace(/```\s*$/i, '').trim();
    try { return { ok: true, value: JSON.parse(text) }; } catch (_) { /* relaxed next */ }
    const relaxed = read(text);
    if (relaxed.ok) return relaxed;
    const inner = /(\{[\s\S]*\}|\[[\s\S]*\])/.exec(text);
    if (inner && inner[0] !== text) {
      const again = read(inner[0]);
      if (again.ok) return again;
    }
    return relaxed;
  }

  /** The value, or null when it cannot be read. @param {string} raw */
  function parse(raw) {
    const out = readLoose(raw);
    return out.ok ? out.value : null;
  }

  const api = { read, readLoose, parse };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.relaxedJson = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

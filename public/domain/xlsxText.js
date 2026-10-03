/* global DecompressionStream */
/**
 * An Excel file (.xlsx) as text the model can read: each sheet by its name,
 * then its rows as CSV, dates as dates.
 *
 * An .xlsx was attached and never read — "attach only" — so the model wrote
 * code for columns it had never seen. An .xlsx is a zip of XML; this reads
 * the zip with the browser's own DecompressionStream (Node has it too) and
 * the few XML parts a table needs: the workbook's sheets, the shared
 * strings, the date formats and each sheet's cells. No library, no network.
 *
 * Pure: bytes in, text out. Async only because decompression is.
 */
(function () {
  'use strict';

  const MAX_ROWS = 2000;

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // The zip's files, by name, from its central directory.
  async function unzip(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('not a zip file');
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const files = new Map();
    const decoder = new TextDecoder();
    for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n++) {
      const method = view.getUint16(at + 10, true);
      const size = view.getUint32(at + 20, true);
      const nameLength = view.getUint16(at + 28, true);
      const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
      const local = view.getUint32(at + 42, true);
      const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      files.set(name, { method, raw: bytes.subarray(start, start + size) });
      at += 46 + skip;
    }
    return {
      async text(name) {
        const entry = files.get(name.replace(/^\//, ''));
        if (!entry) return '';
        return decoder.decode(entry.method === 8 ? await inflate(entry.raw) : entry.raw);
      }
    };
  }

  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unescape = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : ENTITIES[e.toLowerCase()]));
  const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : ''; };
  // The text of a string item: every <t> in it, runs and all.
  const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');

  // Built-in number formats that are dates, and custom ones that read as dates.
  const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  function dateStyles(stylesXml) {
    const custom = new Map([...stylesXml.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode')]));
    const isDate = (id) => DATE_FORMATS.has(id) || (custom.has(id) && /[dmyhs]/i.test(custom.get(id).replace(/"[^"]*"|\[[^\]]*\]/g, '')));
    const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
    return xfs ? [...xfs[1].matchAll(/<xf\b[^>]*>/g)].map((m) => isDate(Number(attr(m[0], 'numFmtId')))) : [];
  }
  function fromSerial(serial) {
    const ms = Math.round((serial - 25569) * 86400000);
    const iso = new Date(ms).toISOString();
    return serial % 1 ? iso.slice(0, 19).replace('T', ' ') : iso.slice(0, 10);
  }

  const column = (ref) => { let n = 0; for (const ch of String(ref).replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  function cellValue(tag, body, shared, dates) {
    const type = attr(tag, 't');
    const v = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (type === 'inlineStr') return texts(body);
    if (!v) return '';
    const raw = unescape(v[1]);
    if (type === 's') return shared[Number(raw)] || '';
    if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
    if (type === 'str' || type === 'e') return raw;
    const number = Number(raw);
    return dates[Number(attr(tag, 's') || 0)] && Number.isFinite(number) ? fromSerial(number) : raw;
  }

  function rowsOf(sheetXml, shared, dates) {
    const rows = [];
    for (const row of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_ROWS) break;
      const cells = [];
      for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = attr(c[0], 'r') ? column(attr(c[0], 'r')) : cells.length;
        cells[at] = cellValue(c[0], c[2] || '', shared, dates);
      }
      const r = Number(attr(row[0], 'r')) || rows.length + 1;
      while (rows.length < r - 1) rows.push([]); // empty rows kept in place
      rows.push(Array.from(cells, (x) => x || ''));
    }
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    return rows;
  }

  const csvField = (value) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

  /**
   * @param {ArrayBuffer | Uint8Array} data an .xlsx file
   * @returns {Promise<{sheets: Array<{name: string, rows: string[][]}>, text: string}>}
   */
  async function readXlsx(data) {
    const zip = await unzip(data);
    const workbook = await zip.text('xl/workbook.xml');
    if (!workbook) throw new Error('not an Excel workbook');
    const rels = await zip.text('xl/_rels/workbook.xml.rels');
    const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
    const shared = [...(await zip.text('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
    const dates = dateStyles(await zip.text('xl/styles.xml'));
    const sheets = [];
    for (const tag of workbook.match(/<sheet\b[^>]*>/g) || []) {
      const target = targets.get(attr(tag, 'r:id')) || '';
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      sheets.push({ name: attr(tag, 'name'), rows: rowsOf(await zip.text(path), shared, dates) });
    }
    const text = sheets.map((s) => `Sheet: ${s.name}\n${s.rows.map((r) => r.map(csvField).join(',')).join('\n')}`).join('\n\n');
    return { sheets, text };
  }

  /** @param {{name?: string, type?: string}} file */
  const isXlsx = (file) => /\.xlsx$/i.test(String(file && file.name)) || /spreadsheetml\.sheet/.test(String(file && file.type));

  const api = { readXlsx, isXlsx, MAX_ROWS };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.xlsxText = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

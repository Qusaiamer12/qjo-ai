/**
 * The file "Download my chats" hands to the person: every chat with its
 * messages, as plain data.
 *
 * Chats come in as they were read from storage — Firestore timestamps and all
 * — and go out in one stable shape:
 *
 *   { app: "Qjo", version: 1, exportedAt,
 *     chats: [{ id, title, createdAt, messages: [{ role, content, createdAt? }] }] }
 *
 * Messages keep the order they were given and both roles; a message with no
 * text, or a role that is neither the person's nor the answer's, is left out,
 * and so is a chat left with nothing to read. Nothing else is changed: no text
 * is removed or masked here, because anonymising is done on the file later, by
 * the owner, not by the app.
 *
 * Pure: no DOM, no storage, no clock (the caller passes the time).
 */
(function () {
  'use strict';

  const APP = 'Qjo';
  const VERSION = 1;
  const ROLES = ['user', 'assistant'];

  /**
   * A moment as an ISO string, from what storage hands over: a Date, a number
   * of milliseconds, a Firestore timestamp ({ toMillis } or { seconds }) or a
   * string already written as a date. Anything else is null.
   * @param {unknown} value
   * @returns {string | null}
   */
  function toIso(value) {
    const v = /** @type {any} */ (value);
    let ms = NaN;
    if (v instanceof Date) ms = v.getTime();
    else if (typeof v === 'number') ms = v;
    else if (typeof v === 'string') ms = Date.parse(v);
    else if (v && typeof v.toMillis === 'function') ms = Number(v.toMillis());
    else if (v && typeof v.seconds === 'number') ms = v.seconds * 1000 + Math.floor((Number(v.nanoseconds) || 0) / 1e6);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  /** @param {any} m @returns {{ role: string, content: string, createdAt?: string } | null} */
  function cleanMessage(m) {
    if (!m || !ROLES.includes(m.role) || typeof m.content !== 'string' || !m.content.trim()) return null;
    const out = { role: m.role, content: m.content };
    const at = toIso(m.createdAt);
    return at ? { ...out, createdAt: at } : out;
  }

  /**
   * @param {{ id?: unknown, title?: unknown, createdAt?: unknown, messages?: unknown }[]} chats
   * @param {{ exportedAt?: unknown }} [options] exportedAt: when the file was made
   */
  function buildArchive(chats, options) {
    const list = Array.isArray(chats) ? chats : [];
    const out = [];
    for (const chat of list) {
      if (!chat) continue;
      const messages = (Array.isArray(chat.messages) ? chat.messages : []).map(cleanMessage).filter(Boolean);
      if (!messages.length) continue;
      out.push({
        id: String(chat.id == null ? '' : chat.id),
        title: typeof chat.title === 'string' ? chat.title : '',
        createdAt: toIso(chat.createdAt),
        messages
      });
    }
    return { app: APP, version: VERSION, exportedAt: toIso(options && options.exportedAt), chats: out };
  }

  /** The file's name for a day, in the person's own calendar: qjo-chats-2026-11-01.json. */
  function fileName(date) {
    const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(0);
    const two = (n) => String(n).padStart(2, '0');
    return `qjo-chats-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.json`;
  }

  const api = { buildArchive, fileName, toIso, VERSION };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.chatArchive = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

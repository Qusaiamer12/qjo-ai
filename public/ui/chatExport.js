/**
 * "Download my chats" in the settings panel: every chat of the signed-in
 * person, saved as one JSON file.
 *
 * It reads chats the way the page opens one (app.js loadChat): the person's
 * chats collection, each chat's messages subcollection in order of seq, and,
 * for a chat saved by an old build, the messages array on the chat itself.
 * Chats the person deleted stay out. Unlike opening a chat, nothing is capped
 * at 160 messages and nothing is cleaned: the file holds what was saved, and
 * chatArchive.js shapes it.
 *
 * A chat that cannot be read fails the whole download, with a message, instead
 * of writing a file that quietly lacks it: the file is used to judge answers,
 * and a gap would look like a chat that never happened.
 */
(function (global) {
  'use strict';

  const AT_ONCE = 4;

  /** @param {any} data @returns {any[]} */
  function legacyMessages(data) {
    return Array.isArray(data && data.messages) ? data.messages : [];
  }

  /**
   * @param {{
   *   button: HTMLElement,
   *   status: HTMLElement,
   *   t: (key: string, vars?: Record<string, string | number>) => string,
   *   getDb: () => any,
   *   getUser: () => ({ uid: string, isAnonymous?: boolean } | null),
   *   now?: () => Date
   * }} deps
   */
  function createChatExport({ button, status, t, getDb, getUser, now = () => new Date() }) {
    const archive = global.QjoDomain.chatArchive;
    const say = (text, kind) => {
      status.textContent = text;
      status.dataset.state = kind || '';
    };

    /** One chat with its messages, from the same places loadChat looks. */
    async function readChat(chatsRef, doc) {
      const data = doc.data() || {};
      const messages = [];
      let failure = null;
      try {
        const snap = await chatsRef.doc(doc.id).collection('messages').orderBy('seq', 'asc').get();
        snap.forEach((m) => messages.push(m.data() || {}));
      } catch (error) {
        failure = error;
      }
      if (!messages.length && legacyMessages(data).length) return { id: doc.id, title: data.title, createdAt: data.createdAt, messages: legacyMessages(data) };
      if (failure) throw failure;
      return { id: doc.id, title: data.title, createdAt: data.createdAt, messages };
    }

    async function readAll(db, uid, progress) {
      const chatsRef = db.collection('users').doc(uid).collection('chats');
      const docs = [];
      (await chatsRef.get()).forEach((doc) => { if (!(doc.data() || {}).deleted) docs.push(doc); });
      const millis = (doc) => { const d = doc.data() || {}; return archive.toIso(d.updatedAt || d.createdAt) || ''; };
      docs.sort((a, b) => (millis(a) < millis(b) ? 1 : millis(a) > millis(b) ? -1 : 0));
      const chats = new Array(docs.length);
      let done = 0;
      progress(0, docs.length);
      for (let start = 0; start < docs.length; start += AT_ONCE) {
        await Promise.all(docs.slice(start, start + AT_ONCE).map(async (doc, offset) => {
          chats[start + offset] = await readChat(chatsRef, doc);
          progress(++done, docs.length);
        }));
      }
      return chats;
    }

    function save(file, name) {
      const doc = button.ownerDocument;
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
      const link = doc.createElement('a');
      link.href = url;
      link.download = name;
      link.hidden = true;
      doc.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    let running = false;
    async function run() {
      if (running) return;
      const user = getUser();
      if (!user || user.isAnonymous) { say(t('exportChatsSignIn'), 'signin'); return; }
      const db = getDb();
      if (!db) { say(t('exportChatsFailed'), 'failed'); return; }
      running = true;
      button.disabled = true;
      try {
        const chats = await readAll(db, user.uid, (done, total) => say(t('exportChatsProgress', { done, total }), 'working'));
        const date = now();
        const file = archive.buildArchive(chats, { exportedAt: date });
        if (!file.chats.length) { say(t('exportChatsNone'), 'none'); return; }
        save(file, archive.fileName(date));
        say(t('exportChatsDone', { count: file.chats.length }), 'done');
      } catch (error) {
        console.warn('Download my chats failed:', error);
        say(t('exportChatsFailed'), 'failed');
      } finally {
        running = false;
        button.disabled = false;
      }
    }

    button.addEventListener('click', run);
    return { run };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createChatExport = createChatExport;
})(window);

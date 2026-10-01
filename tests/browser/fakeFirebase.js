// A Firebase that keeps what it is given, for suites that need to see what a
// conversation saved. The stub in safari-auth.test.js answers every read with
// nothing; a saved chat cannot be checked against that.
//
// In the page: auth with a user the suite signs in (window.__signIn), and
// Firestore as an in-memory store (window.__store, path -> fields) with the
// calls app.js makes — collection, doc, add, set (merge), update, get,
// delete, orderBy, limit, onSnapshot, batch — and the FieldValue sentinels it
// uses. Writes apply in the order they are made, as the real client applies
// them; reads see every earlier write.
const FAKE_FIREBASE = String.raw`
(function () {
  const store = new Map();
  window.__store = store;
  let clock = 1_700_000_000_000;
  let ids = 0;
  const watchers = new Set();
  const notify = () => watchers.forEach((w) => w());
  const stamp = () => { const ms = (clock += 1000); return { seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => ms, toDate: () => new Date(ms) }; };
  const SENTINEL = Symbol('fieldValue');
  const FieldValue = {
    serverTimestamp: () => ({ [SENTINEL]: 'ts' }),
    increment: (n) => ({ [SENTINEL]: 'inc', n }),
    delete: () => ({ [SENTINEL]: 'del' }),
    arrayUnion: (...items) => ({ [SENTINEL]: 'union', items })
  };
  // As the real client does: a field set to undefined is refused, not dropped.
  function refuseUndefined(fields) {
    const bad = Object.entries(fields || {}).find(([, v]) => v === undefined);
    if (bad) throw new Error('Function DocumentReference.set() called with invalid data. Unsupported field value: undefined (found in field ' + bad[0] + ')');
  }
  function write(path, fields, merge) {
    const out = merge ? { ...(store.get(path) || {}) } : {};
    for (const [k, v] of Object.entries(fields || {})) {
      const op = v && v[SENTINEL];
      if (op === 'ts') out[k] = stamp();
      else if (op === 'inc') out[k] = (Number(out[k]) || 0) + v.n;
      else if (op === 'del') delete out[k];
      else if (op === 'union') out[k] = [...new Set([...(out[k] || []), ...v.items])];
      else out[k] = v;
    }
    store.set(path, out);
  }
  const value = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);
  function docSnap(path) {
    const data = store.get(path);
    return { id: path.split('/').pop(), exists: data !== undefined, ref: docRef(path), data: () => (data === undefined ? undefined : { ...data }) };
  }
  function querySnap(path, q) {
    let docs = [...store.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(docSnap);
    if (q.order) docs.sort((a, b) => { const [x, y] = [value(a.data()[q.order]), value(b.data()[q.order])]; return (x > y ? 1 : x < y ? -1 : 0) * (q.dir === 'desc' ? -1 : 1); });
    docs = docs.slice(0, q.limit);
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      collection: (name) => colRef(path + '/' + name),
      set(fields, opts) { refuseUndefined(fields); write(path, fields, opts && opts.merge); notify(); return Promise.resolve(); },
      update(fields) { refuseUndefined(fields); write(path, fields, true); notify(); return Promise.resolve(); },
      delete() { store.delete(path); notify(); return Promise.resolve(); },
      get: () => Promise.resolve(docSnap(path)),
      onSnapshot(cb) { const w = () => cb(docSnap(path)); watchers.add(w); w(); return () => watchers.delete(w); }
    };
  }
  function colRef(path, q = { order: null, dir: 'asc', limit: Infinity }) {
    return {
      path,
      doc: (id) => docRef(path + '/' + (id || 'auto' + (++ids))),
      add(fields) { const ref = docRef(path + '/auto' + (++ids)); return ref.set(fields).then(() => ref); },
      orderBy: (order, dir = 'asc') => colRef(path, { ...q, order, dir }),
      limit: (n) => colRef(path, { ...q, limit: n }),
      where: () => colRef(path, q),
      get: () => Promise.resolve(querySnap(path, q)),
      onSnapshot(cb) { const w = () => cb(querySnap(path, q)); watchers.add(w); w(); return () => watchers.delete(w); }
    };
  }
  const db = {
    collection: (name) => colRef(name),
    doc: (path) => docRef(path),
    batch() {
      const ops = [];
      return {
        set(ref, fields, opts) { refuseUndefined(fields); ops.push(() => write(ref.path, fields, opts && opts.merge)); return this; },
        update(ref, fields) { ops.push(() => write(ref.path, fields, true)); return this; },
        delete(ref) { ops.push(() => store.delete(ref.path)); return this; },
        commit() { ops.forEach((op) => op()); notify(); return Promise.resolve(); }
      };
    }
  };

  const listeners = [];
  const auth = {
    currentUser: null,
    setPersistence: () => Promise.resolve(),
    getRedirectResult: () => Promise.resolve({ user: null }),
    onAuthStateChanged(cb) { listeners.push(cb); return () => {}; },
    signOut() { auth.currentUser = null; listeners.forEach((cb) => cb(null)); return Promise.resolve(); },
    signInWithRedirect: () => Promise.resolve(),
    signInWithPopup: () => Promise.resolve({ user: null })
  };
  window.__signIn = (uid = 'u1') => {
    auth.currentUser = { uid, email: uid + '@example.com', displayName: 'Test User', photoURL: null, getIdToken: () => Promise.resolve('token') };
    listeners.forEach((cb) => cb(auth.currentUser));
  };
  const firebase = {
    apps: [],
    initializeApp(c) { firebase.apps.push(c); return c; },
    auth: Object.assign(() => auth, {
      Auth: { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } },
      GoogleAuthProvider: function () { this.setCustomParameters = () => {}; this.addScope = () => {}; },
      GithubAuthProvider: function () { this.setCustomParameters = () => {}; this.addScope = () => {}; }
    }),
    firestore: Object.assign(() => db, { FieldValue, Timestamp: { now: () => stamp() } })
  };
  window.firebase = firebase;
})();
`;

/** Serves the fake in place of the Firebase SDK files. */
async function useFakeFirebase(page) {
  let served = false;
  await page.route('**/firebasejs/**', async (route) => {
    const body = served ? '' : FAKE_FIREBASE;
    served = true;
    await route.fulfill({ status: 200, contentType: 'application/javascript', body });
  });
}

/** The saved messages of every chat: [{ chat, seq, role, content }], by seq. */
const savedMessages = (page) => page.evaluate(() => [...window.__store.entries()]
  .filter(([path]) => /\/chats\/[^/]+\/messages\/[^/]+$/.test(path))
  .map(([path, m]) => ({ chat: path.split('/')[3], doc: path.split('/').pop(), seq: m.seq, role: m.role, content: m.content }))
  .sort((a, b) => a.seq - b.seq));

module.exports = { FAKE_FIREBASE, useFakeFirebase, savedMessages };

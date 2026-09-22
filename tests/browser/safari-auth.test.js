// Drives the real sign-in code with a stubbed Firebase that behaves the way
// Safari does: persistence refused, auth state flapping to null, storage
// throwing outright. The earlier test only grepped app.js for a ladder and so
// missed that a second call site still took a hard LOCAL persistence.
const { launchBrowser, devices, BASE_URL } = require('./harness');

const FAKE_FIREBASE = `
(function () {
  const cfg = window.__QJO_TEST || {};
  const listeners = [];
  const authObj = {
    currentUser: null,
    setPersistence(level) {
      window.__persistenceTried = window.__persistenceTried || [];
      window.__persistenceTried.push(level);
      if (cfg.refusePersistence === 'all') return Promise.reject(new Error('storage blocked'));
      if (cfg.refusePersistence === 'local' && level === 'local') return Promise.reject(new Error('storage blocked'));
      window.__persistenceAccepted = level;
      return Promise.resolve();
    },
    getRedirectResult() {
      return cfg.redirectThrows ? Promise.reject({ code: 'auth/web-storage-unsupported' }) : Promise.resolve({ user: null });
    },
    onAuthStateChanged(cb) { listeners.push(cb); window.__authListeners = listeners.length; return () => {}; },
    signOut() { authObj.currentUser = null; listeners.forEach(cb => cb(null)); return Promise.resolve(); },
    signInWithRedirect() { return Promise.resolve(); },
    signInWithPopup() { return Promise.resolve({ user: null }); }
  };
  window.__emitAuth = (user) => { authObj.currentUser = user; listeners.forEach(cb => cb(user)); };
  const chain = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'onSnapshot') return () => () => {};
      if (prop === 'get') return () => Promise.resolve({ docs: [], empty: true, exists: false, data: () => ({}) });
      if (prop === 'then') return undefined;
      return chain;
    },
    apply() { return chain; }
  });
  const firebase = {
    apps: [],
    initializeApp(c) { firebase.apps.push(c); return c; },
    auth: Object.assign(() => authObj, {
      Auth: { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } },
      GoogleAuthProvider: function () { this.setCustomParameters = () => {}; this.addScope = () => {}; },
      GithubAuthProvider: function () { this.setCustomParameters = () => {}; this.addScope = () => {}; }
    }),
    firestore: Object.assign(() => chain, {
      FieldValue: { serverTimestamp: () => 'ts', arrayUnion: (...a) => a, increment: (n) => n },
      Timestamp: { now: () => ({ toDate: () => new Date() }) }
    })
  };
  window.firebase = firebase;
})();
`;

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 240)); };

  async function openApp(testCfg, { breakStorage = false, seed = null, device = 'iPhone 13' } = {}) {
    const ctx = await browser.newContext({ ...devices[device] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(`window.__QJO_TEST = ${JSON.stringify(testCfg)};`);
    if (seed) {
      await page.addInitScript(`try { for (const [k, v] of Object.entries(${JSON.stringify(seed)})) localStorage.setItem(k, v); } catch (_) {}`);
    }
    if (breakStorage) {
      await page.addInitScript(`
        const boom = () => { throw new DOMException('QuotaExceededError'); };
        try {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { return { getItem: boom, setItem: boom, removeItem: boom, key: boom, clear: boom, length: 0 }; }
          });
        } catch (_) {}
      `);
    }
    // Serve the stub in place of the real Firebase SDK.
    let served = false;
    await page.route('**/firebasejs/**', async (route) => {
      const body = served ? '' : FAKE_FIREBASE;
      served = true;
      await route.fulfill({ status: 200, contentType: 'application/javascript', body });
    });
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    return { ctx, page, errors };
  }

  const overlayShown = (page) => page.evaluate(() => {
    const o = document.getElementById('authOverlay');
    if (!o) return false;
    return o.classList.contains('show') && getComputedStyle(o).display !== 'none';
  });

  // ── The reported bug: signed in, then thrown out seconds later ──
  {
    const { ctx, page, errors } = await openApp({ refusePersistence: 'local' });
    await page.evaluate(() => window.__emitAuth({ uid: 'u1', email: 'q@example.com', displayName: 'Test User', photoURL: null, getIdToken: () => Promise.resolve('t') }));
    await page.waitForTimeout(400);
    ok(!(await overlayShown(page)), 'signing in dismisses the login screen');

    // Firebase flaps to null while restoring — the exact Safari behaviour.
    await page.evaluate(() => window.__emitAuth(null));
    await page.waitForTimeout(3000);
    ok(!(await overlayShown(page)), 'a transient null does not eject a signed-in user after 3s');

    await page.evaluate(() => window.__emitAuth({ uid: 'u1', email: 'q@example.com', displayName: 'Test User', photoURL: null, getIdToken: () => Promise.resolve('t') }));
    await page.waitForTimeout(400);
    ok(!(await overlayShown(page)), 'the session recovers when Firebase settles');
    ok(errors.length === 0, 'no JS errors during the flap', errors.slice(0, 2));
    await ctx.close();
  }

  // ── Safari refusing LOCAL persistence must not break the sign-in ──
  {
    const { ctx, page } = await openApp({ refusePersistence: 'local' });
    const tried = await page.evaluate(() => window.__persistenceTried || []);
    const accepted = await page.evaluate(() => window.__persistenceAccepted);
    ok(tried.includes('local'), 'it asks for durable persistence first', tried);
    ok(accepted === 'session' || accepted === 'none', `it degrades instead of giving up (settled on ${accepted})`, tried);
    await page.evaluate(() => window.__emitAuth({ uid: 'u1', email: 'q@example.com', displayName: 'Q', photoURL: null, getIdToken: () => Promise.resolve('t') }));
    await page.waitForTimeout(500);
    ok(!(await overlayShown(page)), 'the user still gets in when Safari refuses durable storage');
    await ctx.close();
  }

  // ── Every persistence level refused: still usable ──
  {
    const { ctx, page, errors } = await openApp({ refusePersistence: 'all' });
    await page.evaluate(() => window.__emitAuth({ uid: 'u1', email: 'q@example.com', displayName: 'Q', photoURL: null, getIdToken: () => Promise.resolve('t') }));
    await page.waitForTimeout(600);
    ok(!(await overlayShown(page)), 'sign-in survives a total persistence failure');
    ok(errors.length === 0, 'no JS errors when persistence is impossible', errors.slice(0, 2));
    await ctx.close();
  }

  // ── Coming back from a redirect: fresh page, marker says a user just signed in ──
  {
    const { ctx, page } = await openApp({ redirectThrows: true }, { seed: { qjo_auth_recent_user: String(Date.now()) } });
    await page.evaluate(() => window.__emitAuth(null));
    await page.waitForTimeout(3000);
    ok(!(await overlayShown(page)), 'the page receiving a redirect waits instead of ejecting');
    await ctx.close();
  }

  // ── A redirect error must not shorten the window ──
  {
    const { ctx, page } = await openApp({ redirectThrows: true }, { seed: { qjo_auth_grace_until: String(Date.now() + 15000) } });
    await page.evaluate(() => window.__emitAuth(null));
    await page.waitForTimeout(2600);
    ok(!(await overlayShown(page)), 'a redirect error keeps the grace window intact');
    await ctx.close();
  }

  // ── A genuinely logged-out visitor still gets the login screen ──
  {
    const { ctx, page } = await openApp({});
    await page.evaluate(() => window.__emitAuth(null));
    await page.waitForTimeout(3000);
    ok(await overlayShown(page), 'a real signed-out visitor is still asked to log in');
    await ctx.close();
  }

  // ── Signing out on purpose is immediate, not delayed ──
  {
    const { ctx, page } = await openApp({});
    await page.evaluate(() => window.__emitAuth({ uid: 'u1', email: 'q@example.com', displayName: 'Q', photoURL: null, getIdToken: () => Promise.resolve('t') }));
    await page.waitForTimeout(400);
    await page.evaluate(() => { const b = document.getElementById('logoutBtn') || document.querySelector('[id*="logout" i]'); if (b) b.click(); });
    await page.waitForTimeout(2600);
    const marker = await page.evaluate(() => { try { return localStorage.getItem('qjo_auth_recent_user'); } catch (_) { return null; } });
    ok(marker === null, 'signing out clears the recent-user marker', marker);
    await ctx.close();
  }

  // ── Private browsing: localStorage throws on every call ──
  {
    const { ctx, page, errors } = await openApp({}, { breakStorage: true });
    const ready = await page.evaluate(() => Boolean(window.firebase && window.firebase.apps.length));
    ok(ready, 'Firebase still initializes when storage throws');
    const listening = await page.evaluate(() => window.__authListeners || 0);
    ok(listening > 0, 'the app actually subscribed to auth state (not just silently dead)', listening);
    const composerAlive = await page.evaluate(() => Boolean(document.getElementById('input')));
    ok(composerAlive, 'the app rendered at all under blocked storage');
    await page.evaluate(() => window.__emitAuth({ uid: 'u1', email: 'q@example.com', displayName: 'Q', photoURL: null, getIdToken: () => Promise.resolve('t') }));
    await page.waitForTimeout(600);
    ok(!(await overlayShown(page)), 'a user can sign in with storage completely blocked');
    const fatal = errors.filter(e => /QuotaExceeded|localStorage/.test(e));
    ok(fatal.length === 0, 'no storage exception escapes to the page', fatal.slice(0, 2));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createAuthService({ admin, hasFirebaseAdmin, adminEmails, requireFirebaseAuth = false, dailyUserLimit = 0, guestDailyLimit = 0 }) {
  if (typeof hasFirebaseAdmin !== 'function') throw new Error('createAuthService requires hasFirebaseAdmin');
  const admins = adminEmails instanceof Set ? adminEmails : new Set();
  const inMemoryDailyUsage = new Map();

  // Keys are `${scope}:${id}:${YYYY-MM-DD}` and were never removed, so the map
  // grew by one entry per unique visitor per day for the life of the process.
  // Drop everything that isn't for today; also hard-cap the map so a burst of
  // unique guest IPs in a single day can't exhaust memory either.
  const MAX_USAGE_ENTRIES = 50000;

  function pruneUsage() {
    const today = todayKey();
    for (const key of inMemoryDailyUsage.keys()) {
      if (!key.endsWith(`:${today}`)) inMemoryDailyUsage.delete(key);
    }
    while (inMemoryDailyUsage.size > MAX_USAGE_ENTRIES) {
      const oldest = inMemoryDailyUsage.keys().next().value;
      if (oldest === undefined) break;
      inMemoryDailyUsage.delete(oldest);
    }
  }

  // Hourly sweep. unref() so this timer never keeps the process alive.
  const pruneTimer = setInterval(pruneUsage, 60 * 60 * 1000);
  if (typeof pruneTimer.unref === 'function') pruneTimer.unref();

  function getClientIp(req) {
    // See server.js: trust proxy is configured, so req.ip is the real client
    // IP. The previous X-Forwarded-For[0] read was client-spoofable, which
    // defeated the guest daily quota keyed on this value.
    const raw = req.ip || req.socket?.remoteAddress || '';
    return String(raw).replace(/^::ffff:/, '') || 'unknown';
  }

  function usageKey(req) {
    const date = todayKey();
    if (req.user?.uid) return `user:${req.user.uid}:${date}`;
    return `guest:${getClientIp(req)}:${date}`;
  }

  function enforceInMemoryLimit(req, res, limit, label) {
    if (!limit || limit <= 0) return true;
    const key = usageKey(req);
    const current = Number(inMemoryDailyUsage.get(key) || 0);
    if (current >= limit) {
      res.status(429).json({ error: 'Daily usage limit reached. Try again tomorrow.', limitType: label, limit, used: current });
      return false;
    }
    inMemoryDailyUsage.set(key, current + 1);
    // Cheap opportunistic prune so a long-lived process doesn't wait an hour
    // for the timer while entries pile up.
    if (inMemoryDailyUsage.size > MAX_USAGE_ENTRIES) pruneUsage();
    return true;
  }

  function getLimitConfig() {
    return {
      requireFirebaseAuth,
      dailyUserLimit: Number(dailyUserLimit || 0),
      guestDailyLimit: Number(guestDailyLimit || 0),
      adminEmailsConfigured: admins.size
    };
  }

  function getUsageSnapshot(limit = 40) {
    return [...inMemoryDailyUsage.entries()].slice(-Math.max(1, Math.min(Number(limit) || 40, 200))).map(([key, used]) => ({ key, used }));
  }

  async function getFirebaseUserFromRequest(req) {
    if (!hasFirebaseAdmin()) return null;
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return null;
    return admin.auth().verifyIdToken(token);
  }

  async function verifyAdminRequest(req, res) {
    if (!hasFirebaseAdmin()) {
      res.status(500).json({ error: 'Firebase Admin is not configured on the server.' });
      return false;
    }
    if (!admins.size) {
      res.status(403).json({ error: 'No admin emails are configured.' });
      return false;
    }
    try {
      const user = await getFirebaseUserFromRequest(req);
      const email = String(user?.email || '').toLowerCase();
      if (!email || !admins.has(email)) {
        res.status(403).json({ error: 'Admin access denied.' });
        return false;
      }
      req.user = user;
      return true;
    } catch (_) {
      res.status(401).json({ error: 'Invalid admin token.' });
      return false;
    }
  }

  async function verifyFirebaseRequest(req, res) {
    if (!requireFirebaseAuth) return true;
    if (!hasFirebaseAdmin()) {
      res.status(500).json({ error: 'Server auth verification is not configured.' });
      return false;
    }
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return false;
    }
    try {
      req.user = await admin.auth().verifyIdToken(token);
      return true;
    } catch (_) {
      res.status(401).json({ error: 'Invalid authentication token.' });
      return false;
    }
  }

  async function enforceDailyUsage(req, res) {
    // Public/guest quota: optional and disabled by default.
    if (!req.user?.uid && guestDailyLimit > 0) return enforceInMemoryLimit(req, res, guestDailyLimit, 'guest');

    if (!dailyUserLimit || dailyUserLimit <= 0) return true;
    if (!requireFirebaseAuth || !hasFirebaseAdmin() || !req.user?.uid) return true;

    const uid = req.user.uid;
    const date = todayKey();
    const ref = admin.firestore().collection('aiUsage').doc(`${uid}_${date}`);

    try {
      await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? Number(snap.data().count || 0) : 0;
        if (current >= dailyUserLimit) {
          const err = new Error('Daily limit exceeded.');
          err.statusCode = 429;
          throw err;
        }
        tx.set(ref, {
          uid,
          date,
          count: current + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      return true;
    } catch (error) {
      if (error.statusCode === 429) {
        res.status(429).json({ error: 'Daily usage limit reached. Try again tomorrow.' });
        return false;
      }
      console.error('Usage limit check failed:', error.message);
      res.status(500).json({ error: 'Usage limit check failed.' });
      return false;
    }
  }

  return {
    getFirebaseUserFromRequest,
    verifyAdminRequest,
    verifyFirebaseRequest,
    enforceDailyUsage,
    getLimitConfig,
    getUsageSnapshot
  };
}

module.exports = { createAuthService, todayKey };

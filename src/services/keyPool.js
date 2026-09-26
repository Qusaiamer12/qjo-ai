// Which API key to use next, and which to leave alone for now.
//
// Split out of llmService.js with two corrections, both found by replaying a
// realistic session against Groq's documented limits (per model: tokens and
// requests per minute and per day):
//
//   - A rest was per key. Groq limits each model separately, so a key that
//     spent gpt-oss-20b's minute still has gpt-oss-120b's, and the fast model
//     sidelined the key for every model. Limits now rest the key for that
//     model only; a rejected key (401/403) still rests for all of them.
//   - A key resting for as long as the provider said to (retry-after) was
//     still tried "as an emergency fallback" — a guaranteed 429 per key per
//     call. The simulator counted 33 of them in ten messages. A rest the
//     provider named is now kept; the call moves on at once instead.
//
// Keys never leave this module in anything it reports: the health snapshot
// names keys by position.
'use strict';

const AUTH_REST_MS = 60 * 60 * 1000;
const SERVER_REST_MS = 5000;
const DEFAULT_REST_MS = 15000;

const isAuthFailure = (status, msg) => status === 401 || status === 403 || /invalid api key|unauthorized|forbidden|deactivated|revoked/i.test(msg);
const isLimit = (status, msg) => status === 429 || /rate limit|quota|tokens per (minute|day)|requests per (minute|day)|\btpm\b|\brpm\b|\btpd\b|\brpd\b/i.test(msg);

/**
 * @param {{now?: () => number}} [options]
 */
function createKeyPool({ now = () => Date.now() } = {}) {
  const records = new Map();
  const cursors = new Map();

  function record(id) {
    if (!records.has(id)) records.set(id, { failures: 0, successes: 0, restUntil: 0, firm: false, auth: false, lastStatus: 0, lastError: '', lastAt: 0 });
    return records.get(id);
  }
  const keyId = (provider, key) => `${provider}\u0000${key}`;
  const modelId = (provider, key, model) => `${provider}\u0000${key}\u0000${model}`;

  function restOf(provider, key, model) {
    const k = record(keyId(provider, key));
    const m = record(modelId(provider, key, model));
    const until = Math.max(k.restUntil, m.restUntil);
    const firm = (k.restUntil > now() && k.firm) || (m.restUntil > now() && m.firm);
    const rejected = k.restUntil > now() && k.auth;
    return { until, firm, rejected };
  }

  /**
   * Keys in the order to try them: healthy ones round-robin, then ones on a
   * soft rest (soonest first) as fallbacks. Keys on a firm rest — named by
   * the provider, or rejected — are left out.
   * @returns {{keys: string[], firmlyResting: number, nextInMs: number, allRejected: boolean}}
   */
  function order(provider, keys, model) {
    const t = now();
    const healthy = [];
    const soft = [];
    let firmlyResting = 0;
    let rejected = 0;
    let nextInMs = Infinity;
    for (const key of keys) {
      const rest = restOf(provider, key, model);
      if (rest.until <= t) healthy.push(key);
      else if (rest.firm) { firmlyResting++; rejected += rest.rejected ? 1 : 0; nextInMs = Math.min(nextInMs, rest.until - t); }
      else soft.push({ key, until: rest.until });
    }
    const cursor = cursors.get(provider) || 0;
    const rotated = healthy.map((_, i) => healthy[(cursor + i) % healthy.length]);
    if (healthy.length) cursors.set(provider, (cursor + 1) % healthy.length);
    soft.sort((a, b) => a.until - b.until);
    return { keys: [...rotated, ...soft.map((s) => s.key)], firmlyResting, nextInMs, allRejected: firmlyResting > 0 && rejected === firmlyResting };
  }

  function success(provider, key, model) {
    for (const id of [keyId(provider, key), modelId(provider, key, model)]) {
      const r = record(id);
      r.failures = 0;
      r.restUntil = 0;
      r.firm = false;
      r.auth = false;
      r.successes++;
      r.lastAt = now();
    }
  }

  /**
   * Rests a key, for this model or for all of them, for as long as the
   * failure deserves. Returns the rest applied, in milliseconds.
   * @param {string} provider
   * @param {string} key
   * @param {string} model
   * @param {{status?: number, errorMsg?: string, retryAfterSec?: number}} [info]
   */
  function failure(provider, key, model, info = {}) {
    const { status = 0, errorMsg = '', retryAfterSec } = info;
    const msg = String(errorMsg || '');
    const auth = isAuthFailure(status, msg);
    const r = record(auth ? keyId(provider, key) : modelId(provider, key, model));
    r.failures++;
    r.lastStatus = status;
    r.lastError = msg.replace(/\s+/g, ' ').slice(0, 160);
    r.lastAt = now();
    let restMs = DEFAULT_REST_MS;
    let firm = false;
    if (auth) { restMs = AUTH_REST_MS; firm = true; }
    else if (Number(retryAfterSec) > 0) { restMs = Number(retryAfterSec) * 1000; firm = true; }
    else if (isLimit(status, msg)) restMs = Math.min(60000, DEFAULT_REST_MS * Math.pow(1.5, Math.min(r.failures - 1, 4)));
    else if (status >= 500) restMs = SERVER_REST_MS;
    r.restUntil = now() + restMs;
    r.firm = firm;
    r.auth = auth;
    return restMs;
  }

  /** For /api/status: per provider, per key position and model. No keys. */
  function snapshot(keysByProvider) {
    const out = {};
    const t = now();
    for (const [provider, keys] of Object.entries(keysByProvider || {})) {
      const rows = [];
      keys.forEach((key, index) => {
        for (const [id, r] of records) {
          const [p, k, model] = id.split('\u0000');
          if (p !== provider || k !== key || (!r.successes && !r.failures)) continue;
          rows.push({
            key: index + 1,
            model: model || 'all models',
            resting: r.restUntil > t ? `${Math.ceil((r.restUntil - t) / 1000)}s${r.firm ? ' (firm)' : ''}` : null,
            ok: r.successes,
            failedInARow: r.failures,
            lastStatus: r.lastStatus || null,
            lastError: r.lastError || null
          });
        }
      });
      out[provider] = { keys: keys.length, detail: rows };
    }
    return out;
  }

  return { order, success, failure, snapshot };
}

module.exports = { createKeyPool };

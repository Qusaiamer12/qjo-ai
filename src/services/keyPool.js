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

// ── Per-minute token budgets ────────────────────────────────────────────────
// Groq says, on every answer, how many of a key's tokens for a model are left
// this minute. Nothing read it: a request larger than what was left went out
// anyway and came back 429 — measured in a simulated session, 8 of 22 calls,
// one message spending 9.6 s refused by both keys before another provider
// answered. A key known to be short for this request now rests until it
// would have enough, and the chain moves on without the round trip.

const WINDOW_MS = 60000;
const { tokensNeeded } = require('./providerLimits');

/** "7.66s", "1m2.5s", "120ms" → milliseconds. */
function durationMs(text) {
  const m = String(text || '').match(/^(?:(\d+)m)?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/);
  if (!m || !String(text).trim()) return null;
  return (Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 1000 + Number(m[3] || 0);
}

/** The token budget a response reports, or null when it reports none. */
function budgetFrom(headers) {
  const get = (name) => (headers && typeof headers.get === 'function' ? headers.get(name) : null);
  const limit = Number(get('x-ratelimit-limit-tokens'));
  const remaining = Number(get('x-ratelimit-remaining-tokens'));
  if (!(limit > 0) || !Number.isFinite(remaining)) return null;
  return { limit, remaining: Math.max(0, remaining), resetMs: durationMs(get('x-ratelimit-reset-tokens')) };
}

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

  // When the key will have `need` tokens for this model, from what it last
  // reported: what was left, refilled in step with its window. 0 when now,
  // or when nothing is known, or when the request is larger than the whole
  // allowance (that is refused as too large, and made smaller, elsewhere).
  function shortUntil(m, need) {
    const b = m.budget;
    if (!b || !need || need > b.limit) return 0;
    const refill = b.resetMs && b.remaining < b.limit ? b.resetMs / (b.limit - b.remaining) : WINDOW_MS / b.limit;
    const ready = b.at + Math.max(0, need - b.remaining) * refill;
    return ready > now() ? ready : 0;
  }

  function restOf(provider, key, model, need) {
    const k = record(keyId(provider, key));
    const m = record(modelId(provider, key, model));
    const short = shortUntil(m, need);
    const until = Math.max(k.restUntil, m.restUntil, short);
    const firm = (k.restUntil > now() && k.firm) || (m.restUntil > now() && m.firm) || short > now();
    const rejected = k.restUntil > now() && k.auth;
    return { until, firm, rejected };
  }

  /**
   * Keys in the order to try them: healthy ones round-robin, then ones on a
   * soft rest (soonest first) as fallbacks. Keys on a firm rest — named by
   * the provider, or rejected — are left out.
   * @param {string} provider
   * @param {string[]} keys
   * @param {string} model
   * @param {object} [request] the request about to be sent, to leave out keys short of tokens for it
   * @returns {{keys: string[], firmlyResting: number, nextInMs: number, allRejected: boolean}}
   */
  function order(provider, keys, model, request) {
    const t = now();
    const need = request ? tokensNeeded(request) : 0;
    const healthy = [];
    const soft = [];
    let firmlyResting = 0;
    let rejected = 0;
    let nextInMs = Infinity;
    for (const key of keys) {
      const rest = restOf(provider, key, model, need);
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

  /**
   * @param {string} provider
   * @param {string} key
   * @param {string} model
   * @param {{get?: (name: string) => string | null}} [headers] the response's, for its token budget
   */
  function success(provider, key, model, headers) {
    const budget = budgetFrom(headers);
    if (budget) record(modelId(provider, key, model)).budget = { ...budget, at: now() };
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

  /** The per-minute token allowance a key last reported for this model, if any has. */
  function limitOf(provider, model) {
    let limit = 0;
    for (const [id, r] of records) {
      const [p, , m] = id.split('\u0000');
      if (p === provider && m === model && r.budget) limit = Math.max(limit, r.budget.limit);
    }
    return limit || null;
  }

  return { order, success, failure, snapshot, limitOf };
}

module.exports = { createKeyPool, tokensNeeded, budgetFrom };

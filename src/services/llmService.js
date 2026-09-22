// ─────────────────────────────────────────────────────────────────────────────
// Qjo LLM Service — unified provider client layer
//
// Improvements in this revision:
//  1. Timeouts no longer kill the whole fallback chain. A provider timeout is
//     treated as "this key/provider failed" and the caller moves on (previously
//     AbortError was re-thrown and the entire request died with a 500).
//  2. Per-attempt deadline aware timeouts (timeoutMs passed from the router's
//     global request budget).
//  3. Real streaming everywhere: content chunks, streamed tool_calls (indexed
//     deltas) and the provider's real finish_reason are all captured. This
//     re-enables truncation continuation for streamed answers.
//  4. Client disconnect abort: pass `signal` and any in-flight provider call is
//     cancelled immediately (saves tokens nobody will read). A distinct
//     ClientAbortError is thrown so routes can end silently.
//  5. hasAnyProvider() is computed from config (was always false at boot).
// ─────────────────────────────────────────────────────────────────────────────

const { readAnswerBody, clientAbortError, normalizeProviderFinishReason } = require('./providerResponse');


// ── Model migration map ──
// Groq deprecates model IDs over time (llama-3.1-8b-instant and
// llama-3.3-70b-versatile shut down 2026-08-16 per console.groq.com/docs/
// deprecations). If a provider answers "model decommissioned", we swap to the
// recommended replacement ONCE and retry instead of failing the whole chain —
// this keeps old env values (e.g. GROQ_FLASH_MODEL pinned long ago) working.
const MODEL_MIGRATIONS = {
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama3-70b-8192': 'openai/gpt-oss-120b',
  'llama3-8b-8192': 'openai/gpt-oss-20b',
  'gemma2-9b-it': 'openai/gpt-oss-20b',
  'mixtral-8x7b-32768': 'openai/gpt-oss-120b',
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-1.5-flash-8b': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash-lite': 'gemini-3.8-flash',
  'kimi-k2-0711-preview': 'kimi-k2.6',
  'kimi-k2-0905-preview': 'kimi-k2.6',
  'kimi-k2-turbo-preview': 'kimi-k2.6',
  'kimi-k2-thinking': 'kimi-k2.6',
  'meta/llama-3.1-70b-instruct': 'meta/llama-3.3-70b-instruct',
  'gpt-oss': 'minimax-m2.7'
};

function migratedModel(model) {
  return MODEL_MIGRATIONS[model] || null;
}

// A provider can reject the CALL or reject the REQUEST, and the two need
// opposite handling. A rate limit or a dead key is about this key, so rotating
// to the next one is exactly right. A prompt that exceeds the context window is
// about the payload: every other key rejects it identically, so rotating only
// spends more round-trips AND puts healthy keys on cooldown — one oversized
// prompt used to sideline every key on every provider, degrading unrelated
// requests for the whole cooldown window.
function isContextLengthError(errorMsg) {
  return /context[\s_-]*length|maximum context|too many tokens|reduce the length|input is too long|prompt is too long|exceeds? the (?:model|maximum)|token limit/i.test(String(errorMsg || ''));
}

function isRequestFault(status, errorMsg) {
  if (status === 413 || status === 422) return true;
  if (status !== 400) return false;
  // A 400 naming a retired model is handled by migration, just above.
  return !/decommissioned|no longer supported|not found|does not exist|invalid model/i.test(String(errorMsg || ''));
}

function createLlmService(config = {}) {
  // ── High-Performance Key Circuit Breaker & Round-Robin Health Tracker ──
  // Keeps track of per-key failures, cooldown timers, and request distributions.
  const keyHealth = new Map(); // key -> { failures: 0, cooldownUntil: 0, successes: 0 }
  const cursors = new Map();   // provider -> number

  function getKeyRecord(key) {
    let rec = keyHealth.get(key);
    if (!rec) {
      rec = { failures: 0, cooldownUntil: 0, successes: 0 };
      keyHealth.set(key, rec);
    }
    return rec;
  }

  function markKeySuccess(key) {
    const rec = getKeyRecord(key);
    rec.failures = 0;
    rec.cooldownUntil = 0;
    rec.successes++;
  }

  /**
   * Sidelines a key for a duration proportional to why it failed.
   * @param {string} key
   * @param {{status?: number, errorMsg?: string, retryAfterSec?: number}} failure
   * @returns {number} cooldown applied, in milliseconds
   */
  function markKeyFailure(key, { status, errorMsg = '', retryAfterSec }) {
    const rec = getKeyRecord(key);
    rec.failures++;
    const now = Date.now();

    // Determine smart cooldown duration:
    let cooldownMs = 15000; // default 15s
    if (typeof retryAfterSec === 'number' && retryAfterSec > 0) {
      cooldownMs = retryAfterSec * 1000;
    } else if (status === 429 || /rate|quota|limit|tpm|rpm/i.test(errorMsg)) {
      // Exponential backoff: 15s, 22s, 33s, 50s, capped at 60s
      cooldownMs = Math.min(60000, 15000 * Math.pow(1.5, Math.min(rec.failures - 1, 4)));
    } else if (status === 401 || /invalid|unauthorized|forbidden|deactivated/i.test(errorMsg)) {
      // Bad/revoked key: sideline for 1 hour to protect latency
      cooldownMs = 3600000;
    } else if (status >= 500) {
      // Transient server 5xx: short 5s cooldown
      cooldownMs = 5000;
    }

    rec.cooldownUntil = now + cooldownMs;
    return cooldownMs;
  }

  function getKeys(provider) {
    switch (provider) {
      case 'groq': return Array.isArray(config.groqKeys) ? config.groqKeys : [];
      case 'llm7': return Array.isArray(config.llm7Keys) && config.llm7Keys.length ? config.llm7Keys : (config.hasLlm7 ? ['llm7-free-key'] : []);
      case 'qwen': return Array.isArray(config.qwenKeys) ? config.qwenKeys : [];
      case 'kimi': return Array.isArray(config.kimiKeys) ? config.kimiKeys : [];
      default: return [];
    }
  }

  // Ultra-resilient key rotation:
  // 1. Prioritizes healthy keys via round-robin cursor to balance load (4x TPM/RPM).
  // 2. Automatically skips keys currently in cooldown.
  // 3. If all keys are in cooldown, falls back to the one recovering soonest.
  function rotateKeys(provider) {
    const allKeys = getKeys(provider);
    if (!allKeys.length) return [];
    const now = Date.now();

    const healthy = [];
    const coolingDown = [];

    for (const k of allKeys) {
      const rec = getKeyRecord(k);
      if (rec.cooldownUntil <= now) {
        healthy.push(k);
      } else {
        coolingDown.push({ key: k, expiresAt: rec.cooldownUntil });
      }
    }

    let prioritized = [];
    if (healthy.length > 0) {
      const cursor = cursors.get(provider) || 0;
      for (let i = 0; i < healthy.length; i++) {
        prioritized.push(healthy[(cursor + i) % healthy.length]);
      }
      cursors.set(provider, (cursor + 1) % healthy.length);

      // Append cooling keys at the end as emergency fallbacks
      coolingDown.sort((a, b) => a.expiresAt - b.expiresAt);
      for (const item of coolingDown) prioritized.push(item.key);
    } else {
      coolingDown.sort((a, b) => a.expiresAt - b.expiresAt);
      prioritized = coolingDown.map(c => c.key);
    }

    return prioritized;
  }

  // One abort controller per key attempt, cancelled by whichever comes first:
  // this attempt's timer or the client disconnecting.
  //
  // The timer is re-armed when headers arrive, never simply disarmed. It used
  // to be cleared at that point, which left the body with no limit at all: a
  // provider that sent headers and then nothing held the request open until
  // the person gave up. That is the "it decides to search, then stops" hang —
  // the round after a search runs without streaming, so the whole answer is
  // one body read that nothing was timing.
  function wireAttemptSignal({ timeoutMs, signal }) {
    const controller = new AbortController();
    let timer = null;
    let timedOut = false;
    const arm = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(1, ms));
    };
    arm(Math.max(1, timeoutMs || 10000));
    let externalAborted = false;
    const onExternalAbort = () => { externalAborted = true; controller.abort(); };
    if (signal) {
      if (signal.aborted) externalAborted = true;
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }
    return {
      signal: controller.signal,
      wasExternal: () => externalAborted,
      timedOut: () => timedOut && !externalAborted,
      rearm: arm,
      done: () => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
      }
    };
  }

  async function callOpenAICompatible({ provider, baseUrl, model, messages, temperature, max_tokens, frequency_penalty, presence_penalty, tools, extraHeaders = {}, onChunk, onReasoning, timeoutMs, signal, _migrated = false }) {
    const mig = migratedModel(model);
    if (mig) {
      model = mig;
    }
    const keys = rotateKeys(provider);
    if (!keys.length || !baseUrl || !model) return { ok: false, status: 501, error: `${provider} is not configured.` };

    let lastError = null;
    let attemptIndex = 0;

    // timeoutMs is the budget for this whole call, shared by every key it
    // tries. Each key used to get a fresh timeout of its own, so four keys
    // that all stalled took four times as long as the caller had allowed.
    const callDeadline = Date.now() + Math.max(1000, timeoutMs || 15000);
    const timeLeft = () => callDeadline - Date.now();

    for (const key of keys) {
      if (timeLeft() < 500) {
        lastError = lastError || { status: 504, error: `${provider} ran out of time before a key answered.` };
        break;
      }
      attemptIndex++;
      // Fast connection timeout: get HTTP headers within 8s so dead keys are skipped in a flash.
      const connectTimeout = Math.min(timeLeft(), 8000);
      const attempt = wireAttemptSignal({ timeoutMs: connectTimeout, signal });

      try {
        if (signal?.aborted) throw clientAbortError();
        const body = { model, messages, temperature, max_tokens };
        body.presence_penalty = typeof presence_penalty === 'number' ? presence_penalty : 0.15;
        body.frequency_penalty = typeof frequency_penalty === 'number' ? frequency_penalty : 0.25;
        if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
        if (onChunk) body.stream = true;

        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          signal: attempt.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...extraHeaders
          },
          body: JSON.stringify(body)
        });

        if (response.ok) {
          const outcome = await readAnswerBody({ response, attempt, provider, model, onChunk, onReasoning, signal, timeLeft });
          if (outcome.keyFailure) markKeyFailure(key, outcome.keyFailure);
          else markKeySuccess(key);
          if (outcome.result) return outcome.result;
          lastError = outcome.error;
          console.warn(`[llmService] ${provider} key #${attemptIndex}/${keys.length}: ${outcome.error.error} Switching to next key instantly.`);
          continue;
        }

        // Response NOT ok:
        const retryAfterHeader = response.headers?.get?.('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        const data = await response.json().catch(() => ({}));
        attempt.done();
        const errorMsg = data?.error?.message || data?.message || `${provider} HTTP ${response.status}`;

        // Reactive migration: provider says this exact model is gone.
        if (!_migrated && (response.status === 400 || response.status === 404)) {
          const mig = migratedModel(model);
          if (mig && /decommissioned|no longer supported|not found|does not exist|invalid model/i.test(errorMsg)) {
            // Forwarding every parameter, not a subset. This call used to
            // omit frequency_penalty, presence_penalty and onReasoning, so a
            // model migration quietly reverted the sampling settings and cut
            // the reasoning stream off mid-answer.
            return callOpenAICompatible({
              provider, baseUrl, model: mig, messages, temperature, max_tokens,
              frequency_penalty, presence_penalty, tools, extraHeaders,
              onChunk, onReasoning, timeoutMs: Math.max(1000, timeLeft()), signal, _migrated: true
            });
          }
        }

        // The request itself is the problem, so the next key fails the same
        // way. Return now: no cooldown on a key that did nothing wrong, and no
        // wasted attempts. The flag lets the caller shrink and retry rather
        // than report a dead provider chain.
        if (isRequestFault(response.status, errorMsg)) {
          console.warn('[llmService] ' + provider + ' rejected the request itself (' + response.status + ': ' + errorMsg.slice(0, 90) + '). Keys left healthy; not rotating.');
          return {
            ok: false,
            status: response.status,
            error: errorMsg,
            requestFault: true,
            contextLengthExceeded: isContextLengthError(errorMsg)
          };
        }

        const cooldownApplied = markKeyFailure(key, { status: response.status, errorMsg, retryAfterSec });
        lastError = { status: response.status, error: errorMsg };

        // INSTANT KEY FAILOVER:
        console.warn(`[llmService] ${provider} key #${attemptIndex}/${keys.length} returned ${response.status} (${errorMsg.slice(0, 70)}). Cooldown: ${Math.round(cooldownApplied / 1000)}s. Instant switch to next key.`);
        continue;
      } catch (error) {
        attempt.done();
        if (attempt.wasExternal() || error.name === 'ClientAbortError') throw clientAbortError();
        const isTimeout = error.name === 'AbortError';
        markKeyFailure(key, { status: isTimeout ? 504 : 502, errorMsg: error.message });
        lastError = {
          status: isTimeout ? 504 : 502,
          error: isTimeout ? `${provider} timeout (${connectTimeout}ms).` : (error.message || `${provider} request failed.`)
        };
        console.warn(`[llmService] ${provider} key #${attemptIndex}/${keys.length} error (${lastError.error}). Instant switch to next key.`);
        continue;
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || `All ${keys.length} ${provider} keys failed.` };
  }

  // Facade methods mapping to the unified OpenAI-compatible caller
  async function callQwenChat(opts) { return callOpenAICompatible({ provider: 'qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', ...opts }); }
  async function callGroqChat(opts) {
    const res = await callOpenAICompatible({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', ...opts });
    if (res.ok) return { ok: true, upstream: { ok: true }, data: res.raw, ...res };
    return { ok: false, upstream: { ok: false, status: res.status }, data: { error: { message: res.error } }, ...res };
  }
  async function callLlm7Chat(opts) {
    return callOpenAICompatible({
      provider: 'llm7',
      baseUrl: config.llm7BaseUrl || 'https://api.llm7.io/v1',
      ...opts
    });
  }
  async function callKimiChat(opts) { return callOpenAICompatible({ provider: 'kimi', baseUrl: config.kimiBaseUrl || 'https://api.moonshot.ai/v1', ...opts }); }

  // Generic dispatcher by provider name
  const PROVIDER_METHODS = {
    groq: callGroqChat,
    llm7: callLlm7Chat,
    qwen: callQwenChat,
    kimi: callKimiChat
  };
  async function dispatch(provider, opts) {
    const fn = PROVIDER_METHODS[provider];
    if (!fn) return { ok: false, status: 501, error: `Unknown provider: ${provider}` };
    return fn(opts);
  }

  return {
    callQwenChat,
    callGroqChat,
    callLlm7Chat,
    callKimiChat,
    dispatch,
    hasKeys: (provider) => getKeys(provider).length > 0,
    normalizeProviderFinishReason,
    hasAnyProvider: () => ['groq', 'llm7', 'qwen', 'kimi'].some(p => getKeys(p).length > 0)
  };
}

module.exports = { createLlmService, normalizeProviderFinishReason, isContextLengthError, isRequestFault };

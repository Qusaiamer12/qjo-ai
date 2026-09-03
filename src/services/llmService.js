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

function normalizeProviderFinishReason(provider, raw) {
  if (!raw) return '';
  return raw?.choices?.[0]?.finish_reason || raw?.choices?.[0]?.finishReason || '';
}

function clientAbortError() {
  const err = new Error('Client disconnected.');
  err.name = 'ClientAbortError';
  return err;
}

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
  'meta/llama-3.1-70b-instruct': 'meta/llama-3.3-70b-instruct'
};

function migratedModel(model) {
  return MODEL_MIGRATIONS[model] || null;
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

  // Builds an abort controller per attempt that is cancelled by either the
  // per-attempt timeout OR the external (client disconnect) signal.
  function wireAttemptSignal({ timeoutMs, signal }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs || 10000));
    let externalAborted = false;
    if (signal) {
      if (signal.aborted) externalAborted = true;
      else signal.addEventListener('abort', () => { externalAborted = true; controller.abort(); }, { once: true });
    }
    return {
      signal: controller.signal,
      wasExternal: () => externalAborted,
      done: () => clearTimeout(timeout)
    };
  }

  // Parses an SSE stream from any OpenAI-compatible provider. Captures text
  // content, reasoning deltas, indexed tool_call deltas and the real finish_reason.
  async function consumeStream(response, onChunk, signal, onReasoning) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let finishReason = '';
    let chunksDelivered = 0;
    const toolAcc = new Map();

    function feedLine(cleanedLine) {
      if (!cleanedLine || cleanedLine === 'data: [DONE]' || !cleanedLine.startsWith('data: ')) return;
      let data;
      try { data = JSON.parse(cleanedLine.slice(6)); } catch (_) { return; }
      const choice = data?.choices?.[0] || {};
      const delta = choice.delta || {};

      // Capture native reasoning tokens (DeepSeek, Groq, Qwen, etc.)
      const reasoningChunk = delta.reasoning_content || delta.reasoning;
      if (reasoningChunk && onReasoning) {
        onReasoning(reasoningChunk);
      }

      if (delta.content) {
        fullText += delta.content;
        chunksDelivered++;
        if (onChunk) onChunk(delta.content);
      }
      for (const tc of (delta.tool_calls || [])) {
        const idx = tc.index ?? 0;
        const cur = toolAcc.get(idx) || { id: '', name: '', arguments: '' };
        if (tc.id) cur.id += tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        toolAcc.set(idx, cur);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) feedLine(line.trim());
      }
      if (buffer.trim()) feedLine(buffer.trim());
    } catch (streamErr) {
      // If we already started delivering tokens to the user, return what we have
      // rather than failing the response or duplicating output.
      if (chunksDelivered > 0) {
        console.warn(`[llmService] stream reader interrupted after ${chunksDelivered} chunks. Gracefully preserving delivered answer.`);
        return { fullText, toolCalls: [], finishReason: 'interrupted', chunksDelivered };
      }
      throw streamErr;
    }

    const toolCalls = [...toolAcc.values()]
      .filter(t => t.name)
      .map((t, i) => ({ id: t.id || `call_stream_${i}`, type: 'function', function: { name: t.name, arguments: t.arguments || '{}' } }));
    return { fullText, toolCalls, finishReason: finishReason || 'stop', chunksDelivered };
  }

  async function callOpenAICompatible({ provider, baseUrl, model, messages, temperature, max_tokens, tools, extraHeaders = {}, onChunk, onReasoning, timeoutMs, signal, _migrated = false }) {
    const mig = migratedModel(model);
    if (mig) {
      model = mig;
    }
    const keys = rotateKeys(provider);
    if (!keys.length || !baseUrl || !model) return { ok: false, status: 501, error: `${provider} is not configured.` };

    let lastError = null;
    let attemptIndex = 0;

    for (const key of keys) {
      attemptIndex++;
      // Fast connection timeout: get HTTP headers within 7500ms so dead keys are skipped in a flash.
      const connectTimeout = Math.min(timeoutMs || 7500, 8000);
      const attempt = wireAttemptSignal({ timeoutMs: connectTimeout, signal });

      try {
        if (signal?.aborted) throw clientAbortError();
        const body = { model, messages, temperature, max_tokens };
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
          // Headers received: disarm the connection timeout!
          attempt.done();
          markKeySuccess(key);

          if (onChunk) {
            let streamed;
            try {
              streamed = await consumeStream(response, onChunk, signal, onReasoning);
            } catch (streamErr) {
              if (attempt.wasExternal() || streamErr.name === 'ClientAbortError') throw clientAbortError();
              markKeyFailure(key, { status: 500, errorMsg: streamErr.message });
              lastError = { status: 502, error: `${provider} stream dropped: ${streamErr.message}` };
              console.warn(`[llmService] ${provider} key #${attemptIndex} stream dropped before output. Switching to next key instantly.`);
              continue;
            }
            const message = { role: 'assistant', content: streamed?.fullText || null };
            if (streamed?.toolCalls?.length) message.tool_calls = streamed.toolCalls;
            return {
              ok: true,
              answer: streamed?.fullText || '',
              message,
              toolCalls: streamed?.toolCalls || [],
              provider,
              model,
              finish_reason: streamed?.finishReason || 'stop',
              streamed: true
            };
          }

          const data = await response.json().catch(() => ({}));
          attempt.done();
          const message = data?.choices?.[0]?.message || {};
          return {
            ok: true,
            answer: message.content || '',
            message,
            toolCalls: message.tool_calls || [],
            provider,
            model,
            finish_reason: normalizeProviderFinishReason(provider, data),
            raw: data
          };
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
            return callOpenAICompatible({ provider, baseUrl, model: mig, messages, temperature, max_tokens, tools, extraHeaders, onChunk, timeoutMs, signal, _migrated: true });
          }
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
          error: isTimeout ? `${provider} timeout (${effectiveTimeout}ms).` : (error.message || `${provider} request failed.`)
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

module.exports = { createLlmService, normalizeProviderFinishReason };

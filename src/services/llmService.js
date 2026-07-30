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
  if (provider === 'gemini') return raw?.candidates?.[0]?.finishReason || '';
  return raw?.choices?.[0]?.finish_reason || raw?.choices?.[0]?.finishReason || '';
}

function extractDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function openAiMessagesToGemini(messages) {
  const systemParts = [];
  const contents = [];
  for (const message of messages || []) {
    if (!message) continue;
    if (message.role === 'system') {
      if (typeof message.content === 'string') systemParts.push({ text: message.content });
      continue;
    }
    const role = message.role === 'assistant' ? 'model' : 'user';
    const parts = [];
    if (typeof message.content === 'string') {
      parts.push({ text: message.content });
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (!part) continue;
        if (part.type === 'text') parts.push({ text: String(part.text || '') });
        else if (part.type === 'image_url' && part.image_url?.url) {
          const parsed = extractDataUrl(part.image_url.url);
          if (parsed) parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
          else parts.push({ text: '[Image URL was provided but is not embedded as base64 data.]' });
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return { systemInstruction: systemParts.length ? { parts: systemParts } : undefined, contents };
}

function clientAbortError() {
  const err = new Error('Client disconnected.');
  err.name = 'ClientAbortError';
  return err;
}

function createLlmService(config = {}) {
  const cursors = new Map();

  function getKeys(provider) {
    switch (provider) {
      case 'gemini': return Array.isArray(config.geminiKeys) ? config.geminiKeys : [];
      case 'groq': return Array.isArray(config.groqKeys) ? config.groqKeys : [];
      case 'qwen': return Array.isArray(config.qwenKeys) ? config.qwenKeys : [];
      case 'kimi': return Array.isArray(config.kimiKeys) ? config.kimiKeys : [];
      case 'nvidia': return Array.isArray(config.nvidiaKeys) ? config.nvidiaKeys : [];
      case 'openrouter': return Array.isArray(config.openRouterKeys) ? config.openRouterKeys : [];
      case 'agnes': return Array.isArray(config.agnesKeys) ? config.agnesKeys : [];
      default: return [];
    }
  }

  function rotateKeys(provider) {
    const list = getKeys(provider);
    if (!list.length) return [];
    const start = cursors.get(provider) || 0;
    const ordered = [];
    for (let i = 0; i < list.length; i++) ordered.push(list[(start + i) % list.length]);
    cursors.set(provider, (start + 1) % list.length);
    return ordered;
  }

  // Builds an abort controller per attempt that is cancelled by either the
  // per-attempt timeout OR the external (client disconnect) signal.
  function wireAttemptSignal({ timeoutMs, signal }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs || 12000));
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
  // content, indexed tool_call deltas and the real finish_reason.
  async function consumeStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let finishReason = '';
    const toolAcc = new Map();

    function feedLine(cleanedLine) {
      if (!cleanedLine || cleanedLine === 'data: [DONE]' || !cleanedLine.startsWith('data: ')) return;
      let data;
      try { data = JSON.parse(cleanedLine.slice(6)); } catch (_) { return; }
      const choice = data?.choices?.[0] || {};
      const delta = choice.delta || {};
      if (delta.content) {
        fullText += delta.content;
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) feedLine(line.trim());
    }
    if (buffer.trim()) feedLine(buffer.trim());

    const toolCalls = [...toolAcc.values()]
      .filter(t => t.name)
      .map((t, i) => ({ id: t.id || `call_stream_${i}`, type: 'function', function: { name: t.name, arguments: t.arguments || '{}' } }));
    return { fullText, toolCalls, finishReason: finishReason || 'stop' };
  }

  async function callOpenAICompatible({ provider, baseUrl, model, messages, temperature, max_tokens, tools, extraHeaders = {}, onChunk, timeoutMs, signal }) {
    const keys = rotateKeys(provider);
    if (!keys.length || !baseUrl || !model) return { ok: false, status: 501, error: `${provider} is not configured.` };

    let lastError = null;
    for (const key of keys) {
      const attempt = wireAttemptSignal({ timeoutMs, signal });
      try {
        if (signal?.aborted) throw clientAbortError();
        const body = { model, messages, temperature, max_tokens };
        if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
        if (onChunk) body.stream = true; // stream even when tools are attached; deltas are parsed

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
          if (onChunk) {
            const streamed = await consumeStream(response, onChunk);
            attempt.done();
            const message = { role: 'assistant', content: streamed.fullText || null };
            if (streamed.toolCalls.length) message.tool_calls = streamed.toolCalls;
            return {
              ok: true,
              answer: streamed.fullText,
              message,
              toolCalls: streamed.toolCalls,
              provider,
              model,
              finish_reason: streamed.finishReason,
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

        const data = await response.json().catch(() => ({}));
        attempt.done();
        const errorMsg = data?.error?.message || data?.message || `${provider} HTTP ${response.status}`;
        lastError = { status: response.status, error: errorMsg };
        const limited = response.status === 429 || response.status === 402 || /rate|quota|limit|balance|insufficient/i.test(errorMsg);
        if (limited) continue;

        return { ok: false, status: response.status, error: errorMsg };
      } catch (error) {
        attempt.done();
        if (attempt.wasExternal() || error.name === 'ClientAbortError') throw clientAbortError();
        // Timeout / network error on a single key: mark it and CONTINUE to the
        // next key; the router will then fall through to the next provider.
        lastError = {
          status: error.name === 'AbortError' ? 504 : 502,
          error: error.name === 'AbortError' ? `${provider} timeout.` : (error.message || `${provider} request failed.`)
        };
        continue;
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || `All ${provider} keys failed.` };
  }

  async function callGeminiChat({ model, messages, temperature, max_tokens, timeoutMs, signal }) {
    const keys = rotateKeys('gemini');
    if (!keys.length) return { ok: false, status: 501, error: 'Gemini is not configured.' };

    const geminiModel = model || 'gemini-2.0-flash';
    const geminiPayload = openAiMessagesToGemini(messages);
    if (!geminiPayload.contents.length) return { ok: false, status: 400, error: 'No Gemini-compatible content.' };

    let lastError = null;
    for (const key of keys) {
      const attempt = wireAttemptSignal({ timeoutMs, signal });
      try {
        if (signal?.aborted) throw clientAbortError();
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          signal: attempt.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...geminiPayload,
            generationConfig: { maxOutputTokens: max_tokens, ...(typeof temperature === 'number' ? { temperature } : {}) }
          })
        });
        attempt.done();

        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          const candidate = data?.candidates?.[0];
          const text = (candidate?.content?.parts || []).map(p => p.text || '').join('').trim();
          return { ok: true, answer: text, provider: 'gemini', model: geminiModel, finish_reason: normalizeProviderFinishReason('gemini', data), raw: data };
        }

        const errMsg = data?.error?.message || data?.message || `Gemini HTTP ${response.status}`;
        lastError = { status: response.status, error: errMsg };
        const limited = response.status === 429 || response.status === 404 || /rate|quota|limit|no longer available|not found|deprecated/i.test(errMsg);
        if (limited) continue;

        return { ok: false, status: response.status, error: errMsg };
      } catch (error) {
        attempt.done();
        if (attempt.wasExternal() || error.name === 'ClientAbortError') throw clientAbortError();
        lastError = {
          status: error.name === 'AbortError' ? 504 : 502,
          error: error.name === 'AbortError' ? 'Gemini timeout.' : (error.message || 'Gemini request failed.')
        };
        continue;
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || 'All Gemini keys failed or rate limited.' };
  }

  // Facade methods mapping to the unified OpenAI-compatible caller
  async function callQwenChat(opts) { return callOpenAICompatible({ provider: 'qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', ...opts }); }
  async function callGroqChat(opts) {
    const res = await callOpenAICompatible({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', ...opts });
    // Backward-compatible shape for any legacy consumer.
    if (res.ok) return { ok: true, upstream: { ok: true }, data: res.raw, ...res };
    return { ok: false, upstream: { ok: false, status: res.status }, data: { error: { message: res.error } }, ...res };
  }
  async function callKimiChat(opts) { return callOpenAICompatible({ provider: 'kimi', baseUrl: config.kimiBaseUrl || 'https://api.moonshot.cn/v1', ...opts }); }
  async function callNvidiaChat(opts) { return callOpenAICompatible({ provider: 'nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1', ...opts }); }
  async function callAgnesChat(opts) { return callOpenAICompatible({ provider: 'agnes', baseUrl: config.agnesBaseUrl, model: config.agnesModel, ...opts }); }

  async function callOpenRouterFreeChat(opts) {
    const models = Array.isArray(config.openRouterFreeModels) ? config.openRouterFreeModels : [];
    if (!models.length) return { ok: false, status: 501, error: 'No OpenRouter free models configured.' };
    let last = null;
    for (const model of models) {
      const result = await callOpenAICompatible({
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        extraHeaders: { 'HTTP-Referer': config.openRouterReferer || 'https://qjo.ai', 'X-Title': 'Qjo AI' },
        ...opts,
        model
      });
      if (result.ok) return result;
      last = result;
    }
    return last || { ok: false, status: 501, error: 'OpenRouter free fallback failed.' };
  }

  // Generic dispatcher by provider name (used by the router and by services
  // like the search query rewriter that just need "some fast provider").
  const PROVIDER_METHODS = {
    groq: callGroqChat,
    gemini: callGeminiChat,
    qwen: callQwenChat,
    kimi: callKimiChat,
    nvidia: callNvidiaChat,
    agnes: callAgnesChat,
    openrouter: callOpenRouterFreeChat
  };
  async function dispatch(provider, opts) {
    const fn = PROVIDER_METHODS[provider];
    if (!fn) return { ok: false, status: 501, error: `Unknown provider: ${provider}` };
    return fn(opts);
  }

  return {
    callGeminiChat,
    callQwenChat,
    callGroqChat,
    callKimiChat,
    callNvidiaChat,
    callAgnesChat,
    callOpenRouterFreeChat,
    dispatch,
    hasKeys: (provider) => getKeys(provider).length > 0,
    normalizeProviderFinishReason,
    hasAnyProvider: () => ['gemini', 'groq', 'qwen', 'kimi', 'nvidia', 'openrouter', 'agnes'].some(p => getKeys(p).length > 0)
  };
}

module.exports = { createLlmService, normalizeProviderFinishReason };

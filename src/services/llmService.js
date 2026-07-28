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

  async function callOpenAICompatible({ provider, baseUrl, model, messages, temperature, max_tokens, tools, extraHeaders = {} }) {
    const keys = rotateKeys(provider);
    if (!keys.length || !baseUrl || !model) return { ok: false, status: 501, error: `${provider} is not configured.` };

    let lastError = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const body = { model, messages, temperature, max_tokens };
        if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
        
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...extraHeaders
          },
          body: JSON.stringify(body)
        });
        clearTimeout(timeout);
        
        const data = await response.json().catch(() => ({}));
        
        // Special mapping for Groq to match previous behavior shape if needed, but we unify it here:
        if (response.ok) {
          const message = data?.choices?.[0]?.message || {};
          return {
            ok: true,
            answer: message.content || '',
            message,
            toolCalls: message.tool_calls || [],
            provider,
            model,
            finish_reason: normalizeProviderFinishReason(provider, data),
            raw: data // Keep raw data just in case
          };
        }
        
        const errorMsg = data?.error?.message || data?.message || `${provider} HTTP ${response.status}`;
        lastError = { status: response.status, error: errorMsg };
        const limited = response.status === 429 || response.status === 402 || /rate|quota|limit|balance|insufficient/i.test(errorMsg);
        if (limited) continue;
        
        return { ok: false, status: response.status, error: errorMsg };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw error;
        lastError = { status: 502, error: error.message || `${provider} request failed.` };
        continue;
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || `All ${provider} keys failed.` };
  }

  async function callGeminiChat({ model, messages, temperature, max_tokens }) {
    const keys = rotateKeys('gemini');
    if (!keys.length) return { ok: false, status: 501, error: 'Gemini is not configured.' };
    
    const geminiModel = String(model || 'gemini-2.5-flash').replace(/^gemini-/, '').includes('/') ? model : model;
    const geminiPayload = openAiMessagesToGemini(messages);
    if (!geminiPayload.contents.length) return { ok: false, status: 400, error: 'No Gemini-compatible content.' };
    
    let lastError = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...geminiPayload, generationConfig: { temperature, maxOutputTokens: max_tokens } })
        });
        clearTimeout(timeout);
        
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          const candidate = data?.candidates?.[0];
          const text = (candidate?.content?.parts || []).map(p => p.text || '').join('').trim();
          return { ok: true, answer: text, provider: 'gemini', model: geminiModel, finish_reason: normalizeProviderFinishReason('gemini', data), raw: data };
        }
        
        const errMsg = data?.error?.message || data?.message || `Gemini HTTP ${response.status}`;
        lastError = { status: response.status, error: errMsg };
        const limited = response.status === 429 || /rate|quota|limit/i.test(errMsg);
        if (limited) continue;
        
        return { ok: false, status: response.status, error: errMsg };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') { lastError = { status: 504, error: 'Gemini timeout.' }; continue; }
        lastError = { status: 502, error: error.message || 'Gemini request failed.' };
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || 'All Gemini keys failed or rate limited.' };
  }

  // Facade methods mapping to unified OpenAI-compatible caller
  async function callQwenChat(opts) { return callOpenAICompatible({ provider: 'qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', ...opts }); }
  async function callGroqChat(opts) {
    const res = await callOpenAICompatible({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', ...opts });
    // Keep backward compatibility for code expecting { upstream: { ok }, data: {...} } shape specifically for Groq in old routers.
    // However, since we are unifying the routers, the new router will use `res.ok`, `res.answer`, `res.toolCalls`.
    // We add the old properties just in case temporarily:
    if (res.ok) {
        return { ok: true, upstream: { ok: true }, data: res.raw, ...res };
    }
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

  return {
    callGeminiChat,
    callQwenChat,
    callGroqChat,
    callKimiChat,
    callNvidiaChat,
    callAgnesChat,
    callOpenRouterFreeChat,
    normalizeProviderFinishReason,
    hasAnyProvider: () => Array.from(cursors.keys()).some(k => getKeys(k).length > 0)
  };
}

module.exports = { createLlmService, normalizeProviderFinishReason };

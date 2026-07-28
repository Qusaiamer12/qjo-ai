function normalizeProviderFinishReason(provider, raw) {
  if (!raw) return '';
  if (provider === 'gemini') return raw?.candidates?.[0]?.finishReason || '';
  return raw?.choices?.[0]?.finish_reason || raw?.choices?.[0]?.finishReason || '';
}

function createModelProviders(config = {}) {
  const groqKeys = Array.isArray(config.groqKeys) ? config.groqKeys : [];
  const qwenKeys = Array.isArray(config.qwenKeys) ? config.qwenKeys : [];
  const geminiKeys = Array.isArray(config.geminiKeys) ? config.geminiKeys : [];
  const kimiKeys = Array.isArray(config.kimiKeys) ? config.kimiKeys : [];
  const nvidiaKeys = Array.isArray(config.nvidiaKeys) ? config.nvidiaKeys : [];
  const openRouterKeys = Array.isArray(config.openRouterKeys) ? config.openRouterKeys : [];
  const agnesKeys = Array.isArray(config.agnesKeys) ? config.agnesKeys : [];
  const openRouterFreeModels = Array.isArray(config.openRouterFreeModels) ? config.openRouterFreeModels : [];
  const callOpenAICompatibleProvider = config.callOpenAICompatibleProvider;
  let groqCursor = 0;
  let qwenCursor = 0;
  let geminiCursor = 0;

  function rotate(keys, name) {
    if (!keys.length) return [];
    const cursor = name === 'groq' ? groqCursor : name === 'qwen' ? qwenCursor : geminiCursor;
    const out = [];
    for (let i = 0; i < keys.length; i++) out.push(keys[(cursor + i) % keys.length]);
    if (name === 'groq') groqCursor = (groqCursor + 1) % keys.length;
    else if (name === 'qwen') qwenCursor = (qwenCursor + 1) % keys.length;
    else geminiCursor = (geminiCursor + 1) % keys.length;
    return out;
  }

  async function callGeminiChat({ model, messages, temperature, max_tokens }) {
    const keys = rotate(geminiKeys, 'gemini');
    if (!keys.length) return { ok: false, status: 501, error: 'Gemini is not configured.' };
    const geminiModel = String(model || 'gemini-2.5-flash').replace(/^gemini-/, '').includes('/') ? model : model;
    const systemMsg = (messages || []).find(m => m.role === 'system');
    const chatMessages = (messages || []).filter(m => m.role !== 'system');
    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(p => p.text || '').join('\n') : '') }]
    })).filter(m => m.parts[0].text.trim());
    if (!contents.length) return { ok: false, status: 400, error: 'No valid messages for Gemini.' };
    const body = {
      contents,
      generationConfig: { temperature: temperature ?? 0.7, maxOutputTokens: Math.min(max_tokens || 8192, 65536) }
    };
    if (systemMsg) body.systemInstruction = { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : '' }] };
    let lastError = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`,
          { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        );
        clearTimeout(timeout);
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          const candidate = data?.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text || '';
          const finishReason = candidate?.finishReason || '';
          return { ok: true, answer: text, finish_reason: finishReason, raw: data, provider: 'gemini', model: geminiModel };
        }
        const errMsg = data?.error?.message || `Gemini HTTP ${response.status}`;
        lastError = { status: response.status, error: errMsg };
        const limited = response.status === 429 || /quota|rate|limit/i.test(errMsg);
        if (limited) continue;
        return { ok: false, status: response.status, error: errMsg };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') { lastError = { status: 504, error: 'Gemini timeout.' }; continue; }
        lastError = { status: 502, error: error.message || 'Gemini request failed.' };
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || 'All Gemini keys failed.' };
  }

  async function callQwenChat({ model, messages, temperature, max_tokens, tools }) {
    const keys = rotate(qwenKeys, 'qwen');
    if (!keys.length) return { ok: false, status: 501, error: 'Qwen is not configured.' };
    let lastError = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const body = { model, messages, temperature, max_tokens };
        if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
        const response = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        clearTimeout(timeout);
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          const message = data?.choices?.[0]?.message || {};
          return { ok: true, answer: message.content || '', message, toolCalls: message.tool_calls || [], provider: 'qwen', model, finish_reason: normalizeProviderFinishReason('qwen', data) };
        }
        const message = data?.error?.message || data?.message || `Qwen HTTP ${response.status}`;
        lastError = { status: response.status, error: message };
        const limited = response.status === 429 || response.status === 402 || /rate|quota|limit|balance|insufficient/i.test(message);
        if (limited) continue;
        return { ok: false, status: response.status, error: message };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw error;
        lastError = { status: 502, error: error.message || 'Qwen request failed.' };
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || 'All Qwen keys failed.' };
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

  async function callGeminiChat({ model, messages, temperature, max_tokens }) {
    const keys = rotate(geminiKeys, 'gemini');
    if (!keys.length) return { ok: false, status: 501, error: 'Gemini is not configured.' };
    const geminiPayload = openAiMessagesToGemini(messages);
    if (!geminiPayload.contents.length) return { ok: false, status: 400, error: 'No Gemini-compatible content.' };
    let lastError = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...geminiPayload, generationConfig: { temperature, maxOutputTokens: max_tokens } })
        });
        clearTimeout(timeout);
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          const answer = (data?.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('').trim();
          return { ok: true, answer, provider: 'gemini', model, finish_reason: normalizeProviderFinishReason('gemini', data) };
        }
        const message = data?.error?.message || data?.message || `Gemini HTTP ${response.status}`;
        lastError = { status: response.status, error: message };
        const limited = response.status === 429 || /rate|quota|limit/i.test(message);
        if (limited) continue;
        return { ok: false, status: response.status, error: message };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw error;
        lastError = { status: 502, error: error.message || 'Gemini request failed.' };
      }
    }
    return { ok: false, status: lastError?.status || 429, error: lastError?.error || 'All Gemini keys are rate limited.' };
  }

  async function callGroqChat({ model, messages, temperature, max_tokens, tools }) {
    const keys = rotate(groqKeys, 'groq');
    if (!keys.length) return { upstream: { ok: false, status: 500 }, data: { error: { message: 'AI service is not configured.' } } };
    let lastResponse = null;
    let lastData = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const body = { model, messages, temperature, max_tokens };
        if (tools) { body.tools = tools; body.tool_choice = 'auto'; }
        const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await upstream.json().catch(() => ({}));
        clearTimeout(timeout);
        lastResponse = upstream;
        lastData = data;
        const message = data?.error?.message || data?.message || '';
        const isRateLimited = upstream.status === 429 || /rate|quota|limit/i.test(message);
        if (upstream.ok || !isRateLimited) return { upstream, data };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw error;
        lastResponse = { ok: false, status: 502 };
        lastData = { error: { message: error.message || 'Groq request failed.' } };
      }
    }
    return { upstream: lastResponse || { ok: false, status: 429 }, data: lastData || { error: { message: 'All Groq keys are rate limited.' } } };
  }


  async function callKimiChat({ model, messages, temperature, max_tokens, tools }) {
    if (typeof callOpenAICompatibleProvider !== 'function') return { ok: false, status: 501, error: 'OpenAI-compatible provider adapter is not configured.' };
    return callOpenAICompatibleProvider({
      provider: 'kimi',
      keys: kimiKeys,
      cursorName: 'kimi',
      baseUrl: config.kimiBaseUrl,
      model,
      messages,
      temperature,
      max_tokens,
      tools
    });
  }

  async function callNvidiaChat({ model, messages, temperature, max_tokens, tools }) {
    if (typeof callOpenAICompatibleProvider !== 'function') return { ok: false, status: 501, error: 'OpenAI-compatible provider adapter is not configured.' };
    return callOpenAICompatibleProvider({
      provider: 'nvidia',
      keys: nvidiaKeys,
      cursorName: 'nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model,
      messages,
      temperature,
      max_tokens,
      tools
    });
  }

  async function callOpenRouterFreeChat({ messages, temperature, max_tokens }) {
    if (typeof callOpenAICompatibleProvider !== 'function') return { ok: false, status: 501, error: 'OpenAI-compatible provider adapter is not configured.' };
    if (!openRouterFreeModels.length) return { ok: false, status: 501, error: 'No OpenRouter free models configured.' };
    let last = null;
    for (const model of openRouterFreeModels) {
      const result = await callOpenAICompatibleProvider({
        provider: 'openrouter',
        keys: openRouterKeys,
        cursorName: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        model,
        messages,
        temperature,
        max_tokens,
        extraHeaders: { 'HTTP-Referer': config.openRouterReferer || 'https://qjo.ai', 'X-Title': 'Qjo AI' }
      });
      if (result.ok) return result;
      last = result;
    }
    return last || { ok: false, status: 501, error: 'OpenRouter free fallback failed.' };
  }

  async function callAgnesChat({ messages, temperature, max_tokens }) {
    if (typeof callOpenAICompatibleProvider !== 'function') return { ok: false, status: 501, error: 'OpenAI-compatible provider adapter is not configured.' };
    return callOpenAICompatibleProvider({
      provider: 'agnes',
      keys: agnesKeys,
      cursorName: 'agnes',
      baseUrl: config.agnesBaseUrl,
      model: config.agnesModel,
      messages,
      temperature,
      max_tokens
    });
  }


  return { callGeminiChat, callQwenChat, callGeminiChat, callGroqChat, callKimiChat, callNvidiaChat, callOpenRouterFreeChat, callAgnesChat, normalizeProviderFinishReason };
}

module.exports = { createModelProviders, normalizeProviderFinishReason };

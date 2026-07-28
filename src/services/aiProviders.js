function normalizeProviderFinishReason(provider, raw) {
  if (!raw) return '';
  if (provider === 'gemini') return raw?.candidates?.[0]?.finishReason || '';
  return raw?.choices?.[0]?.finish_reason || raw?.choices?.[0]?.finishReason || '';
}

function createOpenAICompatibleProviderService() {
  const cursors = new Map();

  function rotateKeys(keys, cursorName = 'default') {
    const list = Array.isArray(keys) ? keys : [];
    if (!list.length) return [];
    const start = cursors.get(cursorName) || 0;
    const ordered = [];
    for (let i = 0; i < list.length; i++) ordered.push(list[(start + i) % list.length]);
    cursors.set(cursorName, (start + 1) % list.length);
    return ordered;
  }

  async function callOpenAICompatibleProvider({ provider, keys, cursorName, baseUrl, model, messages, temperature, max_tokens, tools, extraHeaders = {} }) {
    const orderedKeys = rotateKeys(keys, cursorName || provider);
    if (!orderedKeys.length || !baseUrl || !model) return { ok: false, status: 501, error: `${provider} is not configured.` };

    let lastError = null;
    for (const key of orderedKeys) {
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
        if (response.ok) {
          const message = data?.choices?.[0]?.message || {};
          return { ok: true, answer: message.content || '', message, toolCalls: message.tool_calls || [], provider, model, finish_reason: normalizeProviderFinishReason(provider, data) };
        }
        const message = data?.error?.message || data?.message || `${provider} HTTP ${response.status}`;
        lastError = { status: response.status, error: message };
        const limited = response.status === 429 || response.status === 402 || /rate|quota|limit|balance|insufficient/i.test(message);
        if (limited) continue;
        return { ok: false, status: response.status, error: message };
      } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') throw error;
        lastError = { status: 502, error: error.message || `${provider} request failed.` };
        continue;
      }
    }

    return { ok: false, status: lastError?.status || 429, error: lastError?.error || `All ${provider} keys failed.` };
  }

  return { rotateKeys, callOpenAICompatibleProvider };
}

module.exports = {
  normalizeProviderFinishReason,
  createOpenAICompatibleProviderService
};

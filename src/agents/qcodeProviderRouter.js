function createQcodeProviderRouter(config) {
  if (!config || typeof config.callOpenAICompatibleProvider !== 'function') {
    throw new Error('createQcodeProviderRouter requires callOpenAICompatibleProvider');
  }

  function qcodeProviderConfig(provider) {
    const p = String(provider || '').toLowerCase();
    if (p === 'qwen') return {
      provider: 'qcode-qwen',
      keys: config.qwenKeys || [],
      cursorName: 'qcode-qwen',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      model: config.qwenModel || 'qwen-plus'
    };
    if (p === 'groq') return {
      provider: 'qcode-groq',
      keys: config.groqKeys || [],
      cursorName: 'qcode-groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: config.groqModel || 'llama-3.3-70b-versatile'
    };
    if (p === 'kimi') return {
      provider: 'qcode-kimi',
      keys: config.kimiKeys || [],
      cursorName: 'qcode-kimi',
      baseUrl: config.kimiBaseUrl || 'https://api.moonshot.ai/v1',
      model: config.kimiModel || 'moonshot-v1-32k'
    };
    if (p === 'nvidia') return {
      provider: 'qcode-nvidia',
      keys: config.nvidiaKeys || [],
      cursorName: 'qcode-nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: config.nvidiaModel || 'meta/llama-3.1-70b-instruct'
    };
    return null;
  }

  async function callQcodeRouter(messages, { temperature = 0.14, max_tokens = 4200 } = {}) {
    const order = Array.isArray(config.order) && config.order.length ? config.order : ['groq', 'qwen', 'nvidia', 'kimi'];
    let last = null;
    for (const name of order) {
      const cfg = qcodeProviderConfig(name);
      if (!cfg || !cfg.keys.length) continue;
      const result = await config.callOpenAICompatibleProvider({
        provider: cfg.provider,
        keys: cfg.keys,
        cursorName: cfg.cursorName,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        messages,
        temperature,
        max_tokens,
        extraHeaders: cfg.extraHeaders || {}
      });
      if (result.ok) return result;
      last = result;
    }
    return last || { ok: false, status: 503, error: 'No Qcode provider configured. Add QCODE_* keys.' };
  }

  function keysConfigured() {
    return {
      qwen: (config.qwenKeys || []).length,
      groq: (config.groqKeys || []).length,
      nvidia: (config.nvidiaKeys || []).length,
      kimi: (config.kimiKeys || []).length
    };
  }

  return { qcodeProviderConfig, callQcodeRouter, keysConfigured };
}

module.exports = { createQcodeProviderRouter };

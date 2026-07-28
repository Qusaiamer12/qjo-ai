function createQSparkProviderRouter(config) {
  if (!config || typeof config.callOpenAICompatibleProvider !== 'function') {
    throw new Error('createQSparkProviderRouter requires callOpenAICompatibleProvider');
  }

  function qSparkProviderConfig(provider) {
    const p = String(provider || '').toLowerCase();
    if (p === 'groq') return {
      provider: 'qspark-groq',
      keys: config.groqKeys || [],
      cursorName: 'qspark-groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: config.groqModel || 'llama-3.3-70b-versatile'
    };
    if (p === 'kimi') return {
      provider: 'qspark-kimi',
      keys: config.kimiKeys || [],
      cursorName: 'qspark-kimi',
      baseUrl: config.kimiBaseUrl || 'https://api.moonshot.ai/v1',
      model: config.kimiModel || 'moonshot-v1-128k'
    };
    if (p === 'qwen') return {
      provider: 'qspark-qwen',
      keys: config.qwenKeys || [],
      cursorName: 'qspark-qwen',
      baseUrl: config.qwenBaseUrl || 'https://openrouter.ai/api/v1',
      model: config.qwenModel || 'qwen/qwen3.5-397b-a17b',
      extraHeaders: { 'HTTP-Referer': config.referer || 'https://qjo-ai-1.onrender.com', 'X-Title': 'Q-Spark' }
    };
    if (p === 'nvidia') return {
      provider: 'qspark-nvidia',
      keys: config.nvidiaKeys || [],
      cursorName: 'qspark-nvidia',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: config.nvidiaModel || 'deepseek-ai/deepseek-v4-flash'
    };
    return null;
  }

  function keysConfigured() {
    return {
      groq: (config.groqKeys || []).length,
      kimi: (config.kimiKeys || []).length,
      qwen: (config.qwenKeys || []).length,
      nvidia: (config.nvidiaKeys || []).length
    };
  }

  function models() {
    return {
      groq: config.groqModel,
      kimi: config.kimiModel,
      qwen: config.qwenModel,
      nvidia: config.nvidiaModel
    };
  }

  async function callQSparkRouter(messages, { provider = 'nvidia', temperature = 0.15, max_tokens = 3000 } = {}) {
    const requested = String(provider || 'nvidia').toLowerCase();
    const order = requested === 'auto' ? ['nvidia', 'kimi', 'qwen', 'groq'] : [requested];
    let last = null;
    for (const name of order) {
      const cfg = qSparkProviderConfig(name);
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
    return last || { ok: false, status: 503, error: 'No Q-Spark provider is configured. Add QSPARK_* keys in Render.' };
  }

  return { qSparkProviderConfig, keysConfigured, models, callQSparkRouter };
}

module.exports = { createQSparkProviderRouter };

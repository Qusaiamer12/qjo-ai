function registerSystemRoutes(app, deps) {
  if (!deps?.adminConfigService) throw new Error('registerSystemRoutes missing adminConfigService');

  app.get('/api/public-config', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(deps.adminConfigService.readAdminConfig());
  });

  app.get('/api/status', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const qjoProviders = deps.qjoProviders();
    const qSparkProviders = deps.qSparkProviders();
    res.json({
      ok: true,
      version: deps.version,
      ready: {
        ai: Object.values(qjoProviders).some(Boolean),
        search: Boolean(deps.tavilyApiKey || deps.serperApiKey),
        searchFallbackWithoutKeys: true,
        deepSearchExtraction: Boolean(deps.firecrawlApiKey),
        qSpark: Object.values(qSparkProviders).some(Boolean),
        embeddings: deps.embeddingsService.configuredCount() > 0,
        admin: deps.hasFirebaseAdmin() && deps.adminEmailsSize() > 0
      },
      providers: qjoProviders,
      qSparkProviders,
      publicMessage: 'Qjo status endpoint. No secrets are exposed.'
    });
  });


  app.get('/api/limits', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      version: deps.version,
      limits: {
        ...(typeof deps.getLimitConfig === 'function' ? deps.getLimitConfig() : {
          requireFirebaseAuth: deps.authRequired,
          dailyUserLimit: deps.dailyUserLimit || 0,
          guestDailyLimit: deps.guestDailyLimit || 0
        }),
        quotas: deps.quotas || {}
      },
      usageSample: typeof deps.getUsageSnapshot === 'function' ? deps.getUsageSnapshot(20) : [],
      note: 'Limits are configurable via environment variables. Values of 0 mean disabled/unlimited.'
    });
  });

  app.get('/api/client-context', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = deps.getClientIp(req);
    const geo = await deps.lookupClientGeo(ip);
    res.json({
      ok: true,
      serverTime: new Date().toISOString(),
      ipGeoAvailable: Boolean(geo),
      ipGeo: geo,
      note: geo
        ? 'Approximate location inferred from IP connection. It may be inaccurate on VPNs, mobile networks, or proxies.'
        : 'IP geolocation unavailable or private/local IP.'
    });
  });

  app.get('/api/health', (_, res) => {
    res.json({
      ok: true,
      version: deps.version,
      authRequired: deps.authRequired,
      adminReady: deps.hasFirebaseAdmin(),
      dailyUserLimit: deps.dailyUserLimit,
      ipRateLimitPerMinute: deps.ipRateLimitPerMinute,
      ...deps.healthPayload(),
      features: deps.featuresHealth()
    });
  });
  app.get('/api/diagnostics', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!deps.llmService) return res.status(500).json({ error: 'llmService not injected to system routes' });

    const results = {};
    const testMessages = [{ role: 'user', content: 'Say "hello" and nothing else.' }];

    // Test Groq
    const groq = await deps.llmService.callGroqChat({ model: 'openai/gpt-oss-20b', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.groq = { ok: groq.ok, error: groq.error, status: groq.status };

    // Test LLM7
    const llm7 = await deps.llmService.callLlm7Chat({ model: 'deepseek-chat', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.llm7 = { ok: llm7.ok, error: llm7.error, status: llm7.status };

    // Test Qwen
    const qwen = await deps.llmService.callQwenChat({ model: 'qwen-plus', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.qwen = { ok: qwen.ok, error: qwen.error, status: qwen.status };

    // Test Kimi
    const kimi = await deps.llmService.callKimiChat({ model: 'moonshot-v1-8k', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.kimi = { ok: kimi.ok, error: kimi.error, status: kimi.status };

    res.json({
      ok: true,
      note: 'Diagnostic test of AI providers.',
      results
    });
  });
}

module.exports = { registerSystemRoutes };

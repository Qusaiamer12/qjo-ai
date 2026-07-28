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
        search: Boolean(deps.tavilyApiKey),
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
    
    // Test Gemini
    const gemini = await deps.llmService.callGeminiChat({ model: 'gemini-1.5-pro', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.gemini = { ok: gemini.ok, error: gemini.error, status: gemini.status };
    
    // Test Nvidia
    const nvidia = await deps.llmService.callNvidiaChat({ model: 'meta/llama-3.1-8b-instruct', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.nvidia = { ok: nvidia.ok, error: nvidia.error, status: nvidia.status };
    
    // Test Groq
    const groq = await deps.llmService.callGroqChat({ model: 'llama-3.1-8b-instant', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.groq = { ok: groq.ok, error: groq.error, status: groq.status };

    res.json({
      ok: true,
      note: 'Diagnostic test of AI providers.',
      results
    });
  });
}

module.exports = { registerSystemRoutes };

function registerSystemRoutes(app, deps) {
  if (!deps?.adminConfigService) throw new Error('registerSystemRoutes missing adminConfigService');
  if (!deps?.verifyAdminRequest) throw new Error('registerSystemRoutes missing verifyAdminRequest');

  app.get('/api/public-config', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(deps.adminConfigService.readAdminConfig());
  });

  // Q-Spark moved to its own repo (docs/MIGRATION_QSPARK_QCODE.md) and
  // server.js stopped injecting `qSparkProviders` — but this handler still
  // called it, so every request to /api/status crashed with a 500. The
  // qSpark readiness flag is meaningless in this repo now, so it is gone
  // rather than stubbed.
  app.get('/api/status', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const qjoProviders = deps.qjoProviders();
    res.json({
      ok: true,
      version: deps.version,
      ready: {
        ai: Object.values(qjoProviders).some(Boolean),
        search: Boolean(deps.tavilyApiKey || deps.serperApiKey),
        searchFallbackWithoutKeys: true,
        deepSearchExtraction: Boolean(deps.firecrawlApiKey),
        embeddings: deps.embeddingsService.configuredCount() > 0,
        admin: deps.hasFirebaseAdmin() && deps.adminEmailsSize() > 0
      },
      providers: qjoProviders,
      // Per search provider: last success, last failure (HTTP status and the
      // provider's own message), and whether it is resting after a quota or
      // credentials failure. This is where "search stopped working" becomes a
      // reason instead of a mystery.
      searchHealth: typeof deps.searchHealth === 'function' ? deps.searchHealth() : {},
      // The same for the AI providers: per key position and model, whether it
      // is resting and why, and its last error. "The providers are under
      // pressure" becomes which one, on which model, for how long.
      providerHealth: typeof deps.providerHealth === 'function' ? deps.providerHealth() : {},
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
  // Admin-only: this fires FOUR live LLM calls per request. Left public it was
  // a free quota-drain vector (and it echoes raw provider error messages), so
  // it now sits behind the same gate as /api/admin/diagnostics.
  app.get('/api/diagnostics', async (req, res) => {
    if (!(await deps.verifyAdminRequest(req, res))) return;
    res.setHeader('Cache-Control', 'no-store');
    if (!deps.llmService) return res.status(500).json({ error: 'llmService not injected to system routes' });

    const results = {};
    const testMessages = [{ role: 'user', content: 'Say "hello" and nothing else.' }];

    // Test Groq
    const groq = await deps.llmService.callGroqChat({ model: 'openai/gpt-oss-20b', messages: testMessages, temperature: 0.1, max_tokens: 10 });
    results.groq = { ok: groq.ok, error: groq.error, status: groq.status };

    // Test LLM7
    const llm7 = await deps.llmService.callLlm7Chat({ model: 'gpt-oss', messages: testMessages, temperature: 0.1, max_tokens: 10 });
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

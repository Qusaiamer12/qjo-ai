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
}

module.exports = { registerSystemRoutes };

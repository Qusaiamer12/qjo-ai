function registerSystemRoutes(app, deps) {
  if (!deps?.adminConfigService) throw new Error('registerSystemRoutes missing adminConfigService');

  // 🧪 TEMPORARY DIAGNOSTIC ROUTE
  app.get('/api/test-providers', async (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const results = { gemini: null, nvidia: null };
    
    // Test Gemini
    const geminiKeys = String(process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (geminiKeys.length === 0) {
      results.gemini = { ok: false, error: 'No keys configured in GEMINI_API_KEYS' };
    } else {
      const key = geminiKeys[0];
      // We will try gemini-3.5-flash which is the current stable standard model in 2026
      const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash';
      const body = {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 10 }
      };
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          results.gemini = { ok: true, answer: data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No text response' };
        } else {
          results.gemini = { ok: false, status: response.status, error: data?.error?.message || 'HTTP error' };
        }
      } catch (e) {
        results.gemini = { ok: false, error: e.message };
      }
    }

    // Test NVIDIA
    const nvidiaKeys = String(process.env.NVIDIA_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (nvidiaKeys.length === 0) {
      results.nvidia = { ok: false, error: 'No keys configured in NVIDIA_API_KEYS' };
    } else {
      const key = nvidiaKeys[0];
      const model = process.env.NVIDIA_MODEL || 'meta/llama-3.3-70b-instruct';
      const body = {
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10
      };
      try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          results.nvidia = { ok: true, answer: data?.choices?.[0]?.message?.content?.trim() || 'No text response' };
        } else {
          results.nvidia = { ok: false, status: response.status, error: data?.error?.message || 'HTTP error' };
        }
      } catch (e) {
        results.nvidia = { ok: false, error: e.message };
      }
    }

    res.json({ ok: true, results });
  });

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
      providers: {
        ...qjoProviders,
        gemini: String(process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean).length > 0
      },
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

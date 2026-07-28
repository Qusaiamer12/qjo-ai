function registerAdminRoutes(app, deps) {
  if (!deps?.verifyAdminRequest) throw new Error('registerAdminRoutes missing verifyAdminRequest');
  if (!deps?.adminConfigService) throw new Error('registerAdminRoutes missing adminConfigService');

  app.get('/api/admin/me', async (req, res) => {
    if (!(await deps.verifyAdminRequest(req, res))) return;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      email: req.user?.email || '',
      adminReady: deps.hasFirebaseAdmin(),
      config: deps.adminConfigService.readAdminConfig()
    });
  });

  app.post('/api/admin/config', async (req, res) => {
    if (!(await deps.verifyAdminRequest(req, res))) return;
    res.setHeader('Cache-Control', 'no-store');
    const config = deps.adminConfigService.writeAdminConfig(req.body || {});
    res.json({ ok: true, config });
  });

  app.get('/api/admin/diagnostics', async (req, res) => {
    if (!(await deps.verifyAdminRequest(req, res))) return;
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      version: deps.version,
      adminEmail: req.user?.email || '',
      adminReady: deps.hasFirebaseAdmin(),
      authRequired: deps.authRequired,
      dailyUserLimit: deps.dailyUserLimit,
      ipRateLimitPerMinute: deps.ipRateLimitPerMinute,
      providers: deps.providersDiagnostics(),
      models: deps.modelsDiagnostics(),
      features: deps.featuresDiagnostics(),
      generatedAt: new Date().toISOString()
    });
  });
}

module.exports = { registerAdminRoutes };

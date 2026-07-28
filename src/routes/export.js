const { exportPdf, exportCodeZip, exportPptx } = require('../services/exportService');

function registerExportRoutes(app, deps = {}) {
  if (!deps.verifyFirebaseRequest) throw new Error('registerExportRoutes missing dependency: verifyFirebaseRequest');

  const requireAuth = async (req, res, next) => {
    if (!(await deps.verifyFirebaseRequest(req, res))) return;
    next();
  };

  app.post('/api/export/pdf', requireAuth, exportPdf);
  app.post('/api/export/code-zip', requireAuth, exportCodeZip);
  app.post('/api/export/pptx', requireAuth, exportPptx);
}

module.exports = { registerExportRoutes };

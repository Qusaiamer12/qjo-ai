const { exportPdf, exportCodeZip, exportPptx, exportDocx, exportXlsx, exportImageToPdf } = require('../services/exportService');

function registerExportRoutes(app, deps = {}) {
  if (!deps.verifyFirebaseRequest) throw new Error('registerExportRoutes missing dependency: verifyFirebaseRequest');
  if (!deps.uploadMiddleware) throw new Error('registerExportRoutes missing dependency: uploadMiddleware');

  const requireAuth = async (req, res, next) => {
    if (!(await deps.verifyFirebaseRequest(req, res))) return;
    next();
  };

  app.post('/api/export/pdf', requireAuth, exportPdf);
  app.post('/api/export/code-zip', requireAuth, exportCodeZip);
  app.post('/api/export/pptx', requireAuth, exportPptx);
  app.post('/api/export/docx', requireAuth, exportDocx);
  app.post('/api/export/xlsx', requireAuth, exportXlsx);
  app.post('/api/export/image-to-pdf', requireAuth, deps.uploadMiddleware.single('image'), exportImageToPdf);
}

module.exports = { registerExportRoutes };

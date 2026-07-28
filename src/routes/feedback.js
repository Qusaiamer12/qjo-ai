function registerFeedbackRoutes(app, deps) {
  if (!deps?.feedbackService) throw new Error('registerFeedbackRoutes missing feedbackService');
  if (!deps?.verifyAdminRequest) throw new Error('registerFeedbackRoutes missing verifyAdminRequest');

  // Public: the widget in public/app.js posts { rating, answer, question, mode, route } here.
  app.post('/api/feedback', (req, res) => {
    try {
      const record = deps.feedbackService.addFeedback(req.body || {});
      res.json({ ok: true, id: record.id });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Could not record feedback.' });
    }
  });

  // Admin-only: browse raw feedback entries.
  app.get('/api/feedback', async (req, res) => {
    if (!(await deps.verifyAdminRequest(req, res))) return;
    try {
      const items = deps.feedbackService.listFeedback({
        limit: req.query.limit,
        rating: req.query.rating,
        mode: req.query.mode,
        route: req.query.route
      });
      res.json({ ok: true, items });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Could not list feedback.' });
    }
  });

  // Admin-only: aggregate satisfaction stats.
  app.get('/api/feedback/stats', async (req, res) => {
    if (!(await deps.verifyAdminRequest(req, res))) return;
    try {
      res.json({ ok: true, stats: deps.feedbackService.feedbackStats() });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Could not compute feedback stats.' });
    }
  });
}

module.exports = { registerFeedbackRoutes };

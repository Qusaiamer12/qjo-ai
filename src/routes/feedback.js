const rateLimit = require('express-rate-limit');

function registerFeedbackRoutes(app, deps) {
  if (!deps?.feedbackService) throw new Error('registerFeedbackRoutes missing feedbackService');
  if (!deps?.verifyAdminRequest) throw new Error('registerFeedbackRoutes missing verifyAdminRequest');

  // This endpoint is public and writes to disk, so it gets its own limiter
  // regardless of IP_RATE_LIMIT_PER_MINUTE (which defaults to 0 = disabled).
  const feedbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many feedback submissions. Try again in a minute.' }
  });

  // Public: the widget in public/app.js posts { rating, answer, question, mode, route } here.
  app.post('/api/feedback', feedbackLimiter, (req, res) => {
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

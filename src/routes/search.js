const { parseSearchRequest, parseDeepSearchRequest } = require('../tools/searchTool');

function registerSearchRoutes(app, deps) {
  if (!deps?.verifyFirebaseRequest) throw new Error('registerSearchRoutes missing verifyFirebaseRequest');
  if (!deps?.searchService) throw new Error('registerSearchRoutes missing searchService');

  app.post('/api/search', async (req, res) => {
    try {
      if (!(await deps.verifyFirebaseRequest(req, res))) return;
      const body = parseSearchRequest(req.body);
      const payload = await deps.searchService.performSearch({ rawQuery: body.query, originalQuestion: body.originalQuestion || body.query });
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Search failed.' });
    }
  });

  app.post('/api/deep-search', async (req, res) => {
    try {
      if (!(await deps.verifyFirebaseRequest(req, res))) return;
      const body = parseDeepSearchRequest(req.body);
      const rawQuestion = body.question || body.query || '';
      const payload = await deps.searchService.performDeepSearch({ rawQuestion, originalQuestion: body.originalQuestion || rawQuestion });
      return res.json(payload);
    } catch (error) {
      console.error(error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Deep search failed.' });
    }
  });
}

module.exports = { registerSearchRoutes };

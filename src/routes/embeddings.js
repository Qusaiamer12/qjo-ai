function registerEmbeddingsRoutes(app, deps) {
  if (!deps?.verifyFirebaseRequest) throw new Error('registerEmbeddingsRoutes missing verifyFirebaseRequest');
  if (!deps?.embeddingsService) throw new Error('registerEmbeddingsRoutes missing embeddingsService');

  app.post('/api/embeddings', async (req, res) => {
    try {
      if (!(await deps.verifyFirebaseRequest(req, res))) return;
      const texts = Array.isArray(req.body.texts) ? req.body.texts.slice(0, 48) : [];
      if (!texts.length) return res.status(400).json({ error: 'No texts provided.' });
      // Real Vector-First RAG v3: optional parallel roles array ('query'|'passage')
      // so e5-family models receive their trained input prefixes.
      const roles = Array.isArray(req.body.roles) && req.body.roles.length === texts.length
        ? req.body.roles.map(role => (role === 'query' ? 'query' : 'passage'))
        : null;
      const result = await deps.embeddingsService.callEmbeddingProvider(texts, { roles });
      res.json({ ok: true, provider: result.provider, model: result.model, dimensions: result.vectors[0]?.length || 0, embeddings: result.vectors, cached: result.cached });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Embeddings failed.' });
    }
  });
}

module.exports = { registerEmbeddingsRoutes };

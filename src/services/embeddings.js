function normalizeEmbeddingVector(vector) {
  const arr = Array.isArray(vector) ? vector.map(Number).filter(Number.isFinite) : [];
  const norm = Math.sqrt(arr.reduce((sum, x) => sum + x * x, 0));
  return norm ? arr.map(x => Number((x / norm).toFixed(8))) : arr;
}

function meanPoolEmbedding(value) {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === 'number') return value;
  if (Array.isArray(value[0]) && typeof value[0][0] === 'number') {
    const dims = value[0].length;
    const pooled = new Array(dims).fill(0);
    value.forEach(row => row.forEach((x, i) => { pooled[i] += Number(x) || 0; }));
    return pooled.map(x => x / Math.max(1, value.length));
  }
  return [];
}

function parseHuggingFaceEmbeddings(data, expectedCount) {
  if (!Array.isArray(data)) return [];
  if (expectedCount === 1) return [normalizeEmbeddingVector(meanPoolEmbedding(data))].filter(v => v.length);
  return data.map(item => normalizeEmbeddingVector(meanPoolEmbedding(item))).filter(v => v.length);
}

function createEmbeddingsService(config) {
  const deps = config || {};
  const embeddingKeys = Array.isArray(deps.embeddingKeys) ? deps.embeddingKeys : [];
  const huggingFaceKeys = Array.isArray(deps.huggingFaceKeys) ? deps.huggingFaceKeys : [];
  let embeddingCursor = 0;
  let huggingFaceCursor = 0;

  if (!deps.stableCacheKey || !deps.cacheGet || !deps.cacheSet || !deps.cache) {
    throw new Error('createEmbeddingsService requires cache helpers.');
  }

  function rotate(keys, cursorName) {
    if (!keys.length) return [];
    const cursor = cursorName === 'hf' ? huggingFaceCursor : embeddingCursor;
    const out = [];
    for (let i = 0; i < keys.length; i++) out.push(keys[(cursor + i) % keys.length]);
    if (cursorName === 'hf') huggingFaceCursor = (huggingFaceCursor + 1) % keys.length;
    else embeddingCursor = (embeddingCursor + 1) % keys.length;
    return out;
  }

  function getEmbeddingProviderName() {
    const provider = String(deps.embeddingProvider || 'openai').toLowerCase();
    if (provider === 'huggingface' || huggingFaceKeys.length) return 'huggingface';
    return 'openai-compatible';
  }

  function configuredCount() {
    return getEmbeddingProviderName() === 'huggingface' ? huggingFaceKeys.length : embeddingKeys.length;
  }

  async function callEmbeddingProvider(texts) {
    const input = (texts || []).map(t => String(t || '').slice(0, 8000));
    const provider = getEmbeddingProviderName();
    const model = provider === 'huggingface' ? deps.huggingFaceModel : deps.embeddingModel;
    const cacheKey = deps.stableCacheKey('embeddings', provider + '|' + model + '|' + input.join('\n---\n'));
    const cached = deps.cacheGet(deps.cache, cacheKey);
    if (cached) return { vectors: cached, cached: true, provider, model };

    if (provider === 'huggingface') {
      const keys = rotate(huggingFaceKeys, 'hf');
      if (!keys.length) {
        const err = new Error('Hugging Face embeddings are not configured.');
        err.statusCode = 501;
        throw err;
      }
      const url = deps.huggingFaceUrl || `https://api-inference.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(deps.huggingFaceModel)}`;
      let lastError = null;
      for (const key of keys) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
          const response = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputs: input, options: { wait_for_model: true, use_cache: true } })
          });
          clearTimeout(timeout);
          const data = await response.json().catch(() => ({}));
          if (!response.ok || data?.error) {
            lastError = new Error(data?.error || `Hugging Face embedding HTTP ${response.status}`);
            continue;
          }
          const vectors = parseHuggingFaceEmbeddings(data, input.length);
          if (vectors.length !== input.length || vectors.some(v => !v.length)) throw new Error('Hugging Face returned invalid embeddings.');
          deps.cacheSet(deps.cache, cacheKey, vectors, 24 * 60 * 60 * 1000, 250);
          return { vectors, cached: false, provider, model };
        } catch (error) {
          clearTimeout(timeout);
          lastError = error.name === 'AbortError' ? new Error('Hugging Face embedding request timed out.') : error;
        }
      }
      lastError.statusCode = lastError.statusCode || 502;
      throw lastError;
    }

    const keys = rotate(embeddingKeys, 'openai');
    if (!keys.length) {
      const err = new Error('Embeddings are not configured.');
      err.statusCode = 501;
      throw err;
    }
    let lastError = null;
    for (const key of keys) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${String(deps.embeddingBaseUrl || '').replace(/\/$/, '')}/embeddings`, {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: deps.embeddingModel, input })
        });
        clearTimeout(timeout);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) { lastError = new Error(data?.error?.message || data?.message || `Embedding HTTP ${response.status}`); continue; }
        const vectors = (data.data || []).sort((a, b) => Number(a.index || 0) - Number(b.index || 0)).map(item => normalizeEmbeddingVector(item.embedding));
        if (vectors.length !== input.length || vectors.some(v => !v.length)) throw new Error('Embedding provider returned invalid vectors.');
        deps.cacheSet(deps.cache, cacheKey, vectors, 24 * 60 * 60 * 1000, 250);
        return { vectors, cached: false, provider, model: deps.embeddingModel };
      } catch (error) {
        clearTimeout(timeout);
        lastError = error.name === 'AbortError' ? new Error('Embedding request timed out.') : error;
      }
    }
    lastError.statusCode = lastError.statusCode || 502;
    throw lastError;
  }

  return {
    getEmbeddingProviderName,
    configuredCount,
    callEmbeddingProvider
  };
}

module.exports = {
  createEmbeddingsService,
  normalizeEmbeddingVector,
  meanPoolEmbedding,
  parseHuggingFaceEmbeddings
};

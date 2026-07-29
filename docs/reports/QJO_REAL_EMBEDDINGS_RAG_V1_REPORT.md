# Qjo Real Embeddings RAG v1

Version: `qjo-real-embeddings-rag-v1-2026-07-20-31`

## Scope
One focused development step: upgrade File Vector RAG v2 into an embedding-ready RAG layer that can use real embedding vectors from a backend endpoint when configured, with local vector fallback when not configured.

## What changed
### 1. Backend embeddings endpoint
Added:
```text
POST /api/embeddings
```

It uses OpenAI-compatible embeddings APIs through environment variables:
```text
EMBEDDING_API_KEYS
EMBEDDING_BASE_URL
EMBEDDING_MODEL
```

Default:
```text
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
```

### 2. Embedding provider logic
Added server functions:
- `getEmbeddingKeysInRotation()`
- `normalizeEmbeddingVector()`
- `callEmbeddingProvider()`

### 3. Embedding cache
Embedding responses are cached in memory for 24 hours using the existing cache layer.

### 4. Frontend real-embedding retrieval
Added frontend function:
```js
getServerEmbeddingsForRetrieval(texts)
```

File retrieval now works as:
1. Build chunks locally.
2. Score chunks with lexical + local hashed vectors.
3. Pick top candidates.
4. If `/api/embeddings` is configured, request real embeddings for the query and candidate chunks.
5. Rerank using real embedding cosine similarity.
6. If embeddings are unavailable, automatically fall back to local vector retrieval.

### 5. Retrieval context labels
Retrieved chunks now include:
- lexical score
- local vector score
- hybrid score
- embedding mode
- real embedding score when available

Example:
```text
[Chunk 4/22 | lexical 2.00 | vector 0.241 | hybrid 6.32 | mode server-real-embedding | realEmbedding 0.712]
```

### 6. Environment docs
Added to `.env.example`:
```text
EMBEDDING_API_KEYS=
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
```

## Preserved
- Auth untouched.
- Search Beast v2 untouched.
- Smart Router v2 untouched.
- Q-Spark backend routing untouched.
- OCR preserved.
- Big prompt preserved.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

Local health:
```json
"version": "qjo-real-embeddings-rag-v1-2026-07-20-31"
```

Local `/api/embeddings` without keys correctly returns:
```json
"Embeddings are not configured."
```

This confirms fallback behavior is safe.

## Important
To enable real embeddings on Render, add:
```text
EMBEDDING_API_KEYS=your_embedding_key
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
```

If left empty, Qjo still works using local hybrid vector retrieval.

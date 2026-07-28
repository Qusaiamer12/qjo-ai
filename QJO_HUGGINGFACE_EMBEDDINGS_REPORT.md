# Qjo Hugging Face Embeddings Support

Version: `qjo-huggingface-embeddings-2026-07-21-54`

## Goal
Enable Hugging Face embeddings for stronger Arabic/multilingual RAG instead of requiring OpenAI-compatible embeddings only.

## What changed
### 1. New environment variables
Added support for:
```text
EMBEDDING_PROVIDER=huggingface
HUGGINGFACE_API_KEYS=hf_...
HUGGINGFACE_EMBEDDING_MODEL=intfloat/multilingual-e5-base
HUGGINGFACE_EMBEDDING_URL=
```

Recommended model for Arabic/multilingual retrieval:
```text
intfloat/multilingual-e5-base
```

### 2. Backend Hugging Face embedding provider
Added:
- `getHuggingFaceKeysInRotation()`
- `getEmbeddingProviderName()`
- `embeddingKeysConfiguredCount()`
- `meanPoolEmbedding()`
- `parseHuggingFaceEmbeddings()`

The existing `/api/embeddings` endpoint now supports:
- OpenAI-compatible embeddings.
- Hugging Face feature-extraction embeddings.

### 3. Robust HF response parsing
Hugging Face can return:
- a single vector
- a list of vectors
- token-level vectors

The code now mean-pools token-level vectors into sentence embeddings when needed.

### 4. Health/status awareness
`/api/health` and `/api/status` now count configured embeddings through the active provider.

### 5. Cache preserved
Embedding results still use the existing 24-hour in-memory cache.

## How to enable on Render
Add:
```text
EMBEDDING_PROVIDER=huggingface
HUGGINGFACE_API_KEYS=hf_your_token_here
HUGGINGFACE_EMBEDDING_MODEL=intfloat/multilingual-e5-base
```

Keep this empty unless using OpenAI-compatible embeddings:
```text
EMBEDDING_API_KEYS=
```

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

Local health without keys:
```json
"version": "qjo-huggingface-embeddings-2026-07-21-54",
"embeddingsConfigured": 0
```

Local `/api/embeddings` without keys correctly returns:
```json
"Embeddings are not configured."
```

With Hugging Face keys configured on Render, `/api/embeddings` should return:
```json
{
  "ok": true,
  "provider": "huggingface",
  "model": "intfloat/multilingual-e5-base",
  "dimensions": ...,
  "embeddings": [...]
}
```

## Notes
This strengthens Qjo File RAG and persistent RAG when configured, especially for Arabic/multilingual document retrieval. If Hugging Face is not configured, Qjo still falls back to local hashed-vector retrieval.

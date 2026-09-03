# Qjo Real Vector-First RAG v3

Version: `qjo-real-vector-first-rag-v3-2026-09-03`

## Scope
One focused development step: remove the 28-candidate recall ceiling from file RAG so real embeddings score **every** chunk of a document, cut per-message embedding load from 29 texts to 1, and apply the `query:`/`passage:` input prefixes the multilingual-e5 embedding models were trained with.

## Problem being fixed
The previous pipeline (`Persistent Real Embeddings RAG v1`) retrieved in two stages:

1. a local lexical + 192-dim hashed-vector stage picked the top 28 chunks,
2. `/api/embeddings` re-ranked those 28 with real embeddings.

Stage 1 is purely lexical hashing with no semantic signal, so a semantically
relevant chunk that is not lexically similar to the question (paraphrase,
synonyms, Arabic morphology) could be discarded **before** real embeddings ever
saw it. Stage 2 also re-embedded 29 texts on every message (latency + free-tier
rate-limit pressure), and `intfloat/multilingual-e5-base` was used without its
trained input prefixes.

## What changed

### 1. Full-index vector cache per persistent RAG record (public/app.js)
- `validStoredRecordVectors()` — validates a record's stored `vectors` array
  against its chunks (count match, dims ≥ 64, finite numbers).
- `embedRecordChunksForVectorIndex()` — lazily embeds **all** chunks of a
  persistent record in sequential batches of 24 passages (bounded to
  `RECORD_VECTOR_INDEX_MAX_CHUNKS = 84`), rounds vectors to 4 decimals, stores
  them on the record (`vectors`, `vectorMeta`) and persists the record to
  IndexedDB. In-flight builds are deduplicated per record id.
- Vectors are stored **locally only**. Cloud compact records
  (`compactRagRecordForCloud`) stay vector-free by design: 768-dim vectors for
  up to 80 chunks would put Firestore documents close to the 1 MB limit and
  bloat every sync. Cloud records used on a new device build their local vector
  index on demand (server-side 24h embedding cache keeps this cheap).

### 2. Vector-first retrieval fast path (public/app.js)
- `retrieveHybridChunksFromChunks(chunks, userQuery, storedVectors)` now accepts
  stored vectors. When a full vector index exists it:
  - embeds **only the query** (1 text instead of 29),
  - scores **all** chunks with `lexical + realCosine×10 + boundary boost`
    (same weights as the previous re-rank stage),
  - keeps the same top-7 selection, forced chunk-1 boundary and metadata line
    format, with `mode stored-real-embedding`.
- Guards: dimension mismatch between the query embedding and stored vectors
  (e.g. embedding model changed server-side) falls through to the two-stage
  path instead of scoring zeros.
- First message after opening a chat: indexes ≤ 24 chunks build inline (one
  bounded batch); larger indexes build in the background so that message is not
  delayed — the next message uses full-index vectors.

### 3. e5 `query:`/`passage:` prefixes (server)
- `src/routes/embeddings.js` — `POST /api/embeddings` accepts an optional
  parallel `roles` array (`'query'` | `'passage'`, same length as `texts`,
  max 48).
- `src/services/embeddings.js` — `callEmbeddingProvider(texts, { roles })`
  applies `query: `/`passage: ` prefixes **only** when the provider is
  Hugging Face, the model is e5-family, and roles were supplied. The embedding
  cache key is computed from the prefixed inputs. OpenAI-compatible providers
  keep raw inputs; callers that omit roles are unaffected (verified: the
  `embedding-batch` job handler still calls with texts only).

### 4. Context labels
- Prompt context lines upgraded from `Persistent Real Embeddings RAG v1` to
  `Real Vector-First RAG v3`, now reporting the active flavor
  (`full-index real embeddings` vs `two-stage server re-rank`).

## Preserved
- Two-stage path (local hash recall → 28-candidate server re-rank) fully
  preserved as the fallback; it now also sends roles so e5 gets prefixes there
  too.
- Local-hash-only fallback when server embeddings are unavailable: unchanged.
- Chunking, IndexedDB schema (`qjo_rag_indexes_v1`), Firestore `ragIndexes`
  compact format, cloud merge, delete cleanup: unchanged.
- Auth on `/api/embeddings`, 48-text cap, key rotation, 24h server cache:
  unchanged.
- Audit lock `Cloud Persistent Real Embeddings RAG v1 exists` still passes —
  all locked function names kept.

## Verification
```bash
node --check public/app.js src/services/embeddings.js src/routes/embeddings.js
npm run lint          # 0 errors (30 pre-existing warnings)
npm run scan-secrets  # clean
npm run audit         # 0 new failures; 5 pre-existing v21 UI mode-control
                      # failures reproduce on the clean baseline (git stash)
npm test              # 34 passed, 0 failed
```
Plus a mocked-provider unit check of the prefix logic:
roles applied for e5 (`"query: …"`, `"passage: …"`), raw inputs without roles,
mismatched role length ignored.

## Notes / future
- Records with more than 84 chunks intentionally skip the full-index build and
  keep using the two-stage path.
- Free-tier HF rate limits are respected by sequential batching; any failure
  degrades to the previous behaviour and retries on a later message.

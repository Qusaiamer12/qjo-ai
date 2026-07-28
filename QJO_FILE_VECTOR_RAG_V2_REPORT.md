# Qjo File Vector RAG v2

Version: `qjo-file-vector-rag-v2-2026-07-20-30`

## Scope
One focused development step: upgrade File RAG from lexical retrieval to hybrid lexical + local vector retrieval for uploaded files.

## What changed
### 1. Local vector retrieval
Added local hashed-vector retrieval functions in `public/app.js`:
- `hashTokenToIndex()`
- `vectorTokens()`
- `vectorizeText()`
- `cosineSimilarity()`
- `buildVectorIndexForChunks()`
- `retrieveHybridChunks()`

This does not require external embedding APIs, so it works immediately in-browser.

### 2. Hybrid scoring
File chunk retrieval now combines:
- lexical term match score
- hashed-vector cosine similarity
- small position boost for beginning/end chunks

The output includes score metadata:
```text
lexical
vector
hybrid
```

### 3. Better selected evidence
For long uploaded files, Qjo now retrieves the best sections based on hybrid relevance instead of keyword-only matching.

### 4. Prompt/behavior guard updated
File context now says:
```text
File Vector RAG v2
```

System guidance now says:
- answer from retrieved chunks first
- cite attachment/chunk labels for important claims
- use vector/lexical scores as hints, not absolute truth
- do not claim full-document certainty when only selected chunks are present

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
node --check public/app.js
npm run audit
```

Local health:
```json
"version": "qjo-file-vector-rag-v2-2026-07-20-30"
```

Audit now checks:
```text
File Vector RAG v2 exists
```

## Limitations
This is local hashed-vector retrieval, not a full semantic embedding model yet. It is stronger than lexical-only retrieval and requires no API, but a later production upgrade can use real embeddings + persistent vector indexes in Firestore/storage.

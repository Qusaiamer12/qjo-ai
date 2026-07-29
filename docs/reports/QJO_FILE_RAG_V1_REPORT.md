# Qjo File RAG v1 / Material Retrieval

Version: `qjo-file-rag-v1-2026-07-20-29`

## Scope
One focused development step: improve how Qjo handles uploaded files and long extracted documents, without touching Auth, Search Beast, Smart Router, Q-Spark routing, or UI foundations.

## What changed
### 1. Local retrieval layer for attachments
Added frontend retrieval functions:
- `tokenizeForRetrieval()`
- `chunkTextForRetrieval()`
- `scoreRetrievedChunk()`
- `buildRetrievedAttachmentContext()`

Instead of sending only a flat extracted text block, Qjo now builds a retrieval context from the uploaded file content.

### 2. Chunked file evidence
Uploaded text/PDF/OCR content is chunked into overlapping sections.
For each user question, Qjo selects the most relevant chunks and includes:
- attachment name
- file type
- file size
- retrieval mode
- number of chunks
- overview/start of the document
- selected relevant sections
- chunk labels with positions

### 3. Query-aware file retrieval
If the user asks a specific question about a file, the retrieval system scores chunks against query terms and sends the best matching sections.

If the user asks a broad summary question, Qjo sends a balanced beginning/middle/end style selection.

### 4. Full text preservation for text files
For readable text/code files, Qjo now keeps a larger local `fullText` buffer for retrieval while still keeping the visible extracted text bounded.

### 5. PDF/OCR compatibility
PDF extracted text and OCR text now also populate `fullText` so they can be retrieved with the same File RAG layer.

### 6. Prompt guard
Added File RAG instruction to `QJO_QUALITY_PERFORMANCE_LOCKS`:
- answer from retrieved chunks first
- mention attachment/chunk labels for important claims
- do not claim full-document certainty if only selected chunks are present

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
"version": "qjo-file-rag-v1-2026-07-20-29"
```

Audit now checks:
```text
File RAG v1 exists
```

## Limitations
This is lexical retrieval, not embedding-vector RAG yet. It is a strong first step and avoids sending entire huge files blindly, but the next upgrade can add:
- embeddings
- persistent vector index per chat/notebook
- citations to exact pages/paragraphs
- Q-Spark shared retrieval backend

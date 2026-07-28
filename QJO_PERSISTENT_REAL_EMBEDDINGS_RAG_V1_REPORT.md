# Qjo Persistent Real Embeddings RAG v1

Version: `qjo-persistent-rag-index-v1-2026-07-20-32`

## Scope
One focused development step: make RAG indexes persist per chat using browser IndexedDB, while keeping real embeddings support and local vector fallback.

## What changed
### 1. Persistent local RAG index
Added browser IndexedDB storage:
```text
qjo_rag_indexes_v1
```

Store:
```text
ragIndexes
```

Each saved record includes:
- chatId
- attachmentId
- file name
- file type
- size
- createdAt
- chunkCount
- chunks

### 2. New persistence functions
Added:
- `openRagDb()`
- `ragDbTransaction()`
- `saveRagRecord()`
- `getRagRecordsForChat()`
- `deleteRagRecordsForChat()`
- `loadActiveRagIndexes()`
- `buildRagRecordFromAttachment()`
- `persistAttachmentsToRagIndex()`

### 3. Automatic indexing after upload
When a user uploads a readable file/PDF/OCR image and sends a message:
1. Qjo creates or uses the current chat document.
2. Qjo chunks the attachment.
3. Qjo saves the chunks into IndexedDB under that chat ID.
4. Future questions in the same chat can retrieve relevant chunks even after the attachment is removed from the composer.

### 4. Loading old chats restores indexes
When `loadChat(chatId)` runs, Qjo also calls:
```js
loadActiveRagIndexes(chatId)
```

### 5. Deleting chats cleans local RAG
When a chat is deleted, Qjo calls:
```js
deleteRagRecordsForChat(chatId)
```

### 6. Retrieval uses both current and persistent sources
`buildRetrievedAttachmentContext()` now retrieves from:
- current pending attachments
- persistent RAG records for the active chat

### 7. Real embeddings retained
The retrieval layer still uses:
- real server embeddings if `EMBEDDING_API_KEYS` is configured
- local hashed-vector fallback if embeddings are not configured

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
"version": "qjo-persistent-rag-index-v1-2026-07-20-32"
```

Audit now checks:
```text
Persistent Real Embeddings RAG v1 exists
```

## Limitation
This index is local to the browser/device. It is persistent across page reloads and same-device chat reopening, but does not sync across devices yet. Cloud Firestore/Storage index can be a later upgrade if needed.

# Qjo Persistent RAG Index v1

Version: `qjo-persistent-rag-index-v1-2026-07-20-32`

## Scope
One focused development step: make uploaded file retrieval persist per chat/notebook session instead of only being available during the first message with the attachment.

## What changed
### 1. IndexedDB persistent RAG store
Added browser-side IndexedDB storage:
```text
qjo_rag_indexes_v1
```

Store:
```text
ragIndexes
```

Each record includes:
- chatId
- attachmentId
- file name
- type
- size
- createdAt
- chunk count
- chunks

### 2. RAG persistence functions
Added:
- `openRagDb()`
- `ragDbTransaction()`
- `saveRagRecord()`
- `getRagRecordsForChat()`
- `deleteRagRecordsForChat()`
- `loadActiveRagIndexes()`
- `buildRagRecordFromAttachment()`
- `persistAttachmentsToRagIndex()`

### 3. Uploaded files now persist into the chat index
When a user uploads a text/PDF/OCR file and sends a message:
1. Qjo uses the attachment normally for that request.
2. After the chat document exists, Qjo persists the file chunks into IndexedDB under the current chat ID.
3. Later questions in the same chat can retrieve relevant chunks even if the attachment is no longer in the composer tray.

### 4. Loading chat loads its RAG indexes
When opening a previous chat:
```js
loadActiveRagIndexes(chatId)
```
loads indexed file chunks for that chat from IndexedDB.

### 5. Deleting chat removes local RAG indexes
When deleting a chat, Qjo also calls:
```js
deleteRagRecordsForChat(chatId)
```

### 6. Retrieval now combines pending attachments + persistent index
`buildRetrievedAttachmentContext()` now retrieves from:
- current pending attachments
- persistent chat RAG indexes

This makes follow-up questions on uploaded material much stronger.

## Preserved
- Auth untouched.
- Search Beast v2 untouched.
- Smart Router v2 untouched.
- Q-Spark backend routing untouched.
- OCR preserved.
- Real embeddings endpoint preserved.
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

## Limitations
This persistent index is local to the user's browser/device via IndexedDB. It does not yet sync across devices. A later production upgrade can store file indexes in Firebase Storage/Firestore or a backend vector database.

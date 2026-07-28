# Qjo Cloud RAG Sync v1

Version: `qjo-cloud-rag-sync-v1-2026-07-20-33`

## Scope
One focused development step: sync chat RAG indexes to Firestore so uploaded file indexes can persist beyond the local browser when Firestore rules allow it.

## What changed
### 1. Cloud RAG subcollection
Added best-effort Firestore sync under:
```text
/users/{uid}/chats/{chatId}/ragIndexes/{ragId}
```

### 2. Cloud RAG functions
Added frontend functions:
- `cloudRagRecordsRef()`
- `compactRagRecordForCloud()`
- `saveCloudRagRecord()`
- `getCloudRagRecordsForChat()`
- `deleteCloudRagRecordsForChat()`
- `mergeRagRecords()`

### 3. Compact cloud records
Cloud records are compacted to stay safer for Firestore document limits:
- up to 80 chunks per file record
- up to 1800 characters per chunk
- metadata preserved: name, type, size, createdAt, chunkCount

### 4. Local + cloud merge
When loading a chat, Qjo now loads:
- local IndexedDB RAG records
- cloud Firestore RAG records

Then merges them by record ID, keeping stronger/larger records where available.

### 5. Cloud-to-local cache
Cloud records are also saved back to IndexedDB for same-device speed/offline fallback.

### 6. Delete cleanup
When deleting a chat, Qjo attempts to delete:
- local RAG records
- cloud RAG records

### 7. Safe fallback
If Firestore rules do not allow `ragIndexes`, Qjo logs a warning and continues using local IndexedDB RAG. The app does not break.

## Required Firestore rules
Added documentation:
```text
QJO_FIRESTORE_RULES_WITH_RAG.md
```

Required extra rule:
```js
match /ragIndexes/{ragId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## Preserved
- Auth flow untouched.
- Login functions untouched.
- Search Beast v2 untouched.
- Smart Router v2 untouched.
- Real Embeddings endpoint preserved.
- Q-Spark backend routing preserved.
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
"version": "qjo-cloud-rag-sync-v1-2026-07-20-33"
```

Audit now checks:
```text
Cloud Persistent Real Embeddings RAG v1 exists
Cloud RAG Firestore rules documented
```

## Important
For cloud sync to work, update Firestore Rules using `QJO_FIRESTORE_RULES_WITH_RAG.md`. Without that, RAG remains local only.

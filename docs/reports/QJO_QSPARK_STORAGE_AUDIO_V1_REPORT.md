# Q-Spark Source Storage v2 + Audio Overview Arabic v1

Version: `qjo-qspark-storage-audio-v1-2026-07-20-42`

## Scope
Combined focused step requested by user: finish the remaining Q-Spark public-product gaps at a high level:
1. Source Storage v2 foundation.
2. Audio Overview Arabic v1.

## Part 1 — Source Storage v2
### What changed
Added Firebase Storage SDK to Q-Spark:
```html
firebase-storage-compat.js
```

Added Q-Spark cloud file upload support:
```js
sourceStoragePath()
uploadSourceFileToCloud()
```

When a user uploads a file and is logged in:
1. Q-Spark ensures a cloud notebook exists.
2. Q-Spark uploads the original file to Firebase Storage path:
```text
users/{uid}/qsparkNotebooks/{notebookId}/sources/{sourceId}/{fileName}
```
3. The source gets `cloudFile` metadata:
```js
path
downloadURL
name
type
size
uploadedAt
```
4. The source metadata is still saved to Firestore.

If Storage upload fails, Q-Spark continues working with local/cloud metadata fallback.

### Rules added
Updated `QJO_FIRESTORE_RULES_WITH_RAG.md` with Firebase Storage rules:
```js
match /users/{userId}/qsparkNotebooks/{notebookId}/sources/{sourceId}/{fileName} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## Part 2 — Audio Overview Arabic v1
### What changed
Added Q-Spark Studio tool:
```text
Audio Overview عربي
```

Added functions:
```js
generateAudioOverview()
playAudioOverview()
stopAudioOverview()
```

Behavior:
1. Generates Arabic audio-overview script from active sources using Q-Spark backend routing.
2. Includes core ideas, relationships, review questions, likely mistakes, and citations.
3. Saves the generated script in:
```js
latest.analysis.audioOverview
```
4. Allows playback using browser `speechSynthesis`.

## Preserved
- Qjo Auth untouched.
- Q-Spark backend routing preserved.
- Q-Spark separate keys preserved.
- Q-Spark cloud notebooks preserved.
- Q-Spark citations/evidence/sidebar preserved.
- Main Qjo app untouched except version/cache.

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
"version": "qjo-qspark-storage-audio-v1-2026-07-20-42"
```

Audit now checks:
```text
Q-Spark source storage v2 exists
Q-Spark Audio Overview Arabic exists
```

## Self-critique / remaining limitations
- Audio Overview v1 uses browser speech synthesis, not generated audio files. This is good for MVP but not yet NotebookLM-quality podcast audio.
- Storage upload is best-effort. If Firebase Storage rules are not configured, Q-Spark still works but original files are not saved to Storage.
- The next premium step would be backend-generated Arabic audio files with downloadable/shareable MP3 and voice styles.

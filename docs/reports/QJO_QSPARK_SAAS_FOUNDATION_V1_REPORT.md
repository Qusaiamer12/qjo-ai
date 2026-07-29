# Q-Spark Public SaaS Foundation v1

Version: `qjo-qspark-saas-foundation-v1-2026-07-20-36`

## Scope
First focused step toward making Q-Spark a public SaaS product like NotebookLM, not a local-only prototype.

## What changed
### 1. Firebase added to Q-Spark
Added Firebase compat SDKs to `public/qspark.html`:
- Firebase App
- Firebase Auth
- Firebase Firestore

Q-Spark now detects the currently logged-in Firebase user from the same Qjo domain/session.

### 2. Cloud notebook model
Added cloud notebook storage under:
```text
/users/{uid}/qsparkNotebooks/{notebookId}
```

Notebook document includes:
- title
- createdAt
- updatedAt
- lastOpenedAt
- sourceCount
- app = Q-Spark

### 3. Cloud source storage
Added source subcollection:
```text
/users/{uid}/qsparkNotebooks/{notebookId}/sources/{sourceId}
```

Each source stores compact data:
- title
- type
- active
- wordCount
- sizeKB
- pageCount
- isLarge
- deepMode
- content, capped for Firestore safety
- compact analysis data

### 4. Notebook UI
Added “دفاتري” button to Q-Spark header.
Added modal:
```text
notebooks-modal
```

Functions:
- list notebooks
- create notebook
- open notebook
- save current notebook
- delete notebook

### 5. Local + cloud behavior
Q-Spark still saves locally for resilience, but now also saves to Firestore when the user is logged in.

If the user is not logged in, Q-Spark still works locally and shows a status message.

### 6. Firestore rules updated
Updated `QJO_FIRESTORE_RULES_WITH_RAG.md` with Q-Spark rules:
```js
match /qsparkNotebooks/{notebookId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  match /sources/{sourceId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
```

### 7. Audit updated
Audit now verifies:
```text
Q-Spark SaaS notebook cloud functions exist
```

## Preserved
- Main Qjo Auth flow untouched.
- Q-Spark backend routing preserved.
- Q-Spark separate keys preserved.
- Search Beast preserved.
- Smart Router preserved.
- RAG preserved.
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
"version": "qjo-qspark-saas-foundation-v1-2026-07-20-36"
```

Local `/qspark.html` includes:
- `notebooks-modal`
- `qsparkNotebooks`
- Firebase SDKs

## Limitations / self-critique
- Source content is stored directly in Firestore in compact form. This is acceptable for v1, but large production files should move to Firebase Storage with chunk metadata in Firestore.
- Notebook storage works only if Firestore rules are updated.
- This is not yet exact source citation RAG. That should be the next step.
- Q-Spark still keeps localStorage fallback, which is useful for resilience but should not be the only production storage path.

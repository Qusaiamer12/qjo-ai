# Firestore Rules for Qjo with Cloud RAG

Use these rules when enabling cloud sync for chat RAG indexes.

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /chats/{chatId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;

        match /messages/{messageId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }

        match /ragIndexes/{ragId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
```

## Notes
- `ragIndexes` stores compact chunks for files uploaded in a chat.
- If this rule is not added, Qjo still works using local IndexedDB RAG, but cloud sync of file indexes will fail silently and fall back locally.


## Add Q-Spark public SaaS notebooks

Inside `match /users/{userId}` add:

```js
match /qsparkNotebooks/{notebookId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;

  match /sources/{sourceId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
```


## Firebase Storage rules for Q-Spark source files

If you enable original file upload to Firebase Storage, use rules similar to:

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/qsparkNotebooks/{notebookId}/sources/{sourceId}/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

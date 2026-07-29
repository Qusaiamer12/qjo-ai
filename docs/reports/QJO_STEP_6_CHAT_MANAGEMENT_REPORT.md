# Qjo Step 6: Chat Management

Version: `qjo-chat-management-final-2026-07-20-15`

## Completed
Added conversation management features:

### 1. Search all chats
Inside the "كل المحادثات" modal:
```text
ابحث في أسماء المحادثات...
```

This filters chat titles locally without changing Firestore schema.

### 2. Rename chats
Each chat row now has a rename button:
```text
✎
```

It updates the chat document with:
- `title`
- `renamedAt`
- `updatedAt`

### 3. Export current chat as Markdown
Added topbar button:
```text
MD
```

It exports the current loaded conversation as a `.md` file.

### 4. Audit updated
`npm run audit` now verifies:
- chat search input exists.
- export chat button exists.
- `renameChat()` exists.

## Preserved
- Auth untouched.
- Popup auth preserved.
- Big prompt preserved.
- Search/source cards preserved.
- Diagnostic page preserved.
- Code ZIP builder preserved.
- Memory controls preserved.
- Mobile Pro Audit preserved.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-chat-management-final-2026-07-20-15"
```

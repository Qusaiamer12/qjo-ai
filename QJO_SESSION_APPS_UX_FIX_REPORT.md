# Qjo Session + Apps UX Fix

Version: `qjo-session-apps-ux-fix-2026-07-21-51`

## Fixed
### 1. Fresh chat on login / reload
Qjo no longer auto-opens the last conversation after page reload/login. It starts on a fresh chat, while previous chats remain available in the sidebar for explicit user selection.

### 2. Login overlay flicker
The login overlay is no longer shown by default in the static HTML. It appears only after Firebase determines that there is no signed-in user or when a real auth error occurs. This prevents the brief login-screen flash when returning from Q-Spark/Qcode.

### 3. Q-Spark and Qcode navigation
The sidebar app buttons are direct links with robust JS fallback:
- Q-Spark → `/qspark.html`
- Qcode → `/qcode.html`

### 4. Back button position
Q-Spark and Qcode back buttons were moved to bottom-left so they no longer cover the product logos/header.

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
"version": "qjo-session-apps-ux-fix-2026-07-21-51"
```

Local checks confirmed:
- `/` includes direct Q-Spark/Qcode navigation.
- `/qspark.html` includes back button position fix.
- `/qcode.html` includes back button position fix.

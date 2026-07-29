# Qjo Step 8: Real Admin Dashboard

Version: `qjo-admin-dashboard-real-2026-07-20-17`

## Completed
The Admin dashboard is now connected to real backend endpoints instead of being only a static form.

## Backend endpoints added
```text
GET  /api/admin/me
POST /api/admin/config
GET  /api/admin/diagnostics
```

All endpoints require:
- Firebase Admin configured on the server.
- `ADMIN_EMAILS` containing the logged-in admin email.
- Firebase ID token in the Authorization header.

## Admin capabilities
### `/api/admin/me`
Returns:
- admin email
- admin readiness
- current public/admin config

### `/api/admin/config`
Saves editable public config:
- assistant name
- tagline
- welcome title
- welcome text
- starter suggestions
- global training prompt

### `/api/admin/diagnostics`
Returns safe operational diagnostics without exposing secrets:
- version
- admin readiness
- auth/rate-limit settings
- provider key counts
- search/firecrawl availability
- active model names
- feature status
- timestamp

## Frontend admin UI updates
Updated:
```text
public/admin.html
public/admin.js
```

Added:
- System diagnostics card.
- `فحص النظام` button.
- Link to `/qjo-diagnostic.html`.
- Cache-busted assets:
  - `/styles.css?v=qjo-admin-dashboard-real-2026-07-20-17`
  - `/admin.js?v=qjo-admin-dashboard-real-2026-07-20-17`

## Preserved
- Auth flow untouched.
- Main frontend unchanged except version/cache.
- Big prompt preserved.
- Search/source cards preserved.
- OCR preserved.
- Chat management preserved.
- Code ZIP builder preserved.
- Memory controls preserved.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-admin-dashboard-real-2026-07-20-17"
```

Admin page locally includes:
```text
diagnosticsBox
/admin.js?v=qjo-admin-dashboard-real-2026-07-20-17
```

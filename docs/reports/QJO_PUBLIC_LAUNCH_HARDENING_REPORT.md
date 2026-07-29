# Qjo Public Launch Hardening

Version: `qjo-public-launch-hardening-2026-07-20-35`

## Scope
Final combined hardening pass after the step-by-step work.

## Completed
### 1. Public status endpoint
Added:
```text
GET /api/status
```

It returns a safe public readiness snapshot:
- AI configured or not
- search configured or not
- Firecrawl configured or not
- Q-Spark keys configured or not
- embeddings configured or not
- admin ready or not

No secrets are exposed.

### 2. Better error UX
Frontend chat errors are now more specific:
- no provider configured
- server failure
- rate limit
- auth required
- backend missing

The user gets clearer recovery guidance instead of only a generic failure message.

### 3. Qcode placeholder
Added:
```text
public/qcode.html
```

The sidebar Qcode item now opens a staged placeholder page. This prevents dead navigation and prepares for the future Qcode Code Lab.

### 4. Audit updates
`npm run audit` now checks:
- `/api/status` exists
- Qcode placeholder exists

## Preserved
- Auth untouched.
- Firebase untouched.
- Big prompt untouched.
- Search Beast v2 preserved.
- Smart Router v2 preserved.
- Q-Spark backend routing preserved.
- Cloud RAG sync preserved.
- Launch Eval v2 preserved.
- OCR preserved.
- Admin preserved.
- Mobile fixes preserved.

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
"version": "qjo-public-launch-hardening-2026-07-20-35"
```

Local status endpoint:
```text
/api/status
```
returned HTTP 200.

Local Qcode page:
```text
/qcode.html
```
returned HTTP 200.

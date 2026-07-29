# Qcode Stage v1 Integration

Version: `qjo-qcode-stage-v1-2026-07-20-43`

## Scope
Integrated the uploaded Qcode HTML as a staged Qjo app while keeping Qjo Assistant and Q-Spark untouched.

## Added
### 1. Qcode page
The uploaded file was installed as:
```text
public/qcode.html
```

Route:
```text
/qcode.html
```

The sidebar Qcode button now opens this page.

### 2. Qcode shell integration
Added:
- Qjo back button
- `QCODE_EMBED_VERSION`
- API namespace rewrite from `/api/...` to `/api/qcode/...`
- removed injected Cloudflare script

### 3. Qcode separate provider namespace
Qcode uses separate keys only:
```text
QCODE_QWEN_API_KEYS
QCODE_GROQ_API_KEYS
QCODE_KIMI_API_KEYS
QCODE_NVIDIA_API_KEYS
```

It does not use Qjo Assistant or Q-Spark keys.

### 4. Backend endpoints
Added Qcode backend namespace:
```text
GET  /api/qcode/info
GET  /api/qcode/health
GET  /api/qcode/files
GET  /api/qcode/file
POST /api/qcode/save
POST /api/qcode/upload
GET  /api/qcode/download
POST /api/qcode/chat
GET  /api/qcode/usage
GET  /api/qcode/usage/export
GET  /api/qcode/sandbox_status
GET  /api/qcode/preview/start
GET  /api/qcode/preview/list
GET  /api/qcode/sessions
GET  /api/qcode/sessions/load
POST /api/qcode/sessions/save
POST /api/qcode/sessions/delete
```

### 5. Qcode workspace
Qcode has an isolated workspace:
```text
qcode-workspace/
```

Endpoints support:
- list files
- open file
- save file
- upload file
- download file

### 6. Qcode chat SSE
`/api/qcode/chat` returns server-sent events compatible with the uploaded Qcode UI.

Provider order:
```text
Qwen → Groq → NVIDIA → Kimi
```

## Limitations / self-critique
- Qcode execution/sandbox/preview server is staged and disabled in this hosted build.
- Qcode does not yet perform real filesystem tool-calling from model actions; it can chat, generate code, and the UI can save/open files via endpoints.
- Full agentic editing should be the next Qcode-specific development step.

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
"version": "qjo-qcode-stage-v1-2026-07-20-43"
```

Local Qcode health:
```json
"separateKeys": true
```

Local Qcode chat without QCODE keys correctly returns:
```text
No Qcode provider configured. Add QCODE_* keys.
```

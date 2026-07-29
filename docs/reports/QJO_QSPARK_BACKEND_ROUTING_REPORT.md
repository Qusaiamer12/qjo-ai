# Q-Spark Backend Routing

Version: `qjo-qspark-backend-routing-2026-07-20-28`

## Scope
One focused development step: move Q-Spark AI calls away from browser-side provider keys and route them through Qjo backend endpoints that use the separate `QSPARK_*` environment variables.

## What changed
### 1. Q-Spark frontend now calls backend
Replaced the direct browser calls to Groq/NVIDIA/Kimi/Qwen in `public/qspark.html` with:

```text
POST /api/qspark/chat
```

The frontend sends:
- provider preference (`auto`, `nvidia`, `groq`, etc.)
- mode
- messages
- temperature
- max token budget

### 2. Backend-only Q-Spark keys
Q-Spark now depends on backend variables only:

```text
QSPARK_GROQ_API_KEYS
QSPARK_KIMI_API_KEYS
QSPARK_QWEN_API_KEYS
QSPARK_NVIDIA_API_KEYS
```

Q-Spark does not fall back to Qjo Assistant keys.

### 3. Q-Spark provider order
For backend `auto` mode:

```text
NVIDIA → Kimi → Qwen → Groq
```

This matches Q-Spark’s purpose: long material understanding and deep analysis first.

### 4. Q-Spark UI status updated
Q-Spark badge now checks:

```text
GET /api/qspark/health
```

It displays whether backend Q-Spark keys are configured.

### 5. API modal no longer required for production usage
The old HTML API modal still exists visually from the uploaded standalone file, but Q-Spark chat generation now goes through backend routing. The modal diagnostics were changed to check backend QSPARK status instead of testing browser keys.

### 6. Audit updated
`npm run audit` now checks:

```text
Q-Spark frontend uses backend routing
```

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
"version": "qjo-qspark-backend-routing-2026-07-20-28"
```

Local Q-Spark health:

```json
"separateKeys": true
```

Local Q-Spark chat without keys correctly returns:

```json
"No Q-Spark provider is configured. Add QSPARK_* keys in Render."
```

This confirms Q-Spark is not using Qjo Assistant keys or browser keys.

## Required Render env for Q-Spark
At least one of:

```text
QSPARK_NVIDIA_API_KEYS=...
QSPARK_KIMI_API_KEYS=...
QSPARK_QWEN_API_KEYS=...
QSPARK_GROQ_API_KEYS=...
```

Recommended for strongest Q-Spark:

```text
QSPARK_NVIDIA_API_KEYS=...
QSPARK_KIMI_API_KEYS=...
```

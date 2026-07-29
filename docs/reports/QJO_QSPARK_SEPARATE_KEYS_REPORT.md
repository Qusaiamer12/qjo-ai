# Q-Spark Separate API Keys

Version: `qjo-qspark-separated-keys-2026-07-20-24`

## Requirement
Q-Spark has its own API keys and must not be mixed with Qjo Assistant provider keys.

## Completed
Added a separate Q-Spark backend namespace:

```text
QSPARK_GROQ_API_KEYS
QSPARK_KIMI_API_KEYS
QSPARK_QWEN_API_KEYS
QSPARK_NVIDIA_API_KEYS
```

These do not fall back to:

```text
GROQ_API_KEYS
KIMI_API_KEYS
QWEN_API_KEYS
NVIDIA_API_KEYS
```

## Backend endpoints added
```text
GET  /api/qspark/health
POST /api/qspark/chat
```

### `/api/qspark/health`
Returns Q-Spark key counts and model names only from `QSPARK_*` variables.

### `/api/qspark/chat`
Prepared backend route for Q-Spark providers using only Q-Spark keys:
- `groq`
- `kimi`
- `qwen`
- `nvidia`
- `auto` order: NVIDIA → Kimi → Qwen → Groq

## Environment variables added to `.env.example`
```text
QSPARK_GROQ_API_KEYS=
QSPARK_GROQ_MODEL=llama-3.3-70b-versatile
QSPARK_KIMI_API_KEYS=
QSPARK_KIMI_BASE_URL=https://api.moonshot.ai/v1
QSPARK_KIMI_MODEL=moonshot-v1-128k
QSPARK_QWEN_API_KEYS=
QSPARK_QWEN_BASE_URL=https://openrouter.ai/api/v1
QSPARK_QWEN_MODEL=qwen/qwen3.5-397b-a17b
QSPARK_NVIDIA_API_KEYS=
QSPARK_NVIDIA_MODEL=deepseek-ai/deepseek-v4-flash
```

## Project lock updated
Added a strict Q-Spark separate keys lock to:
```text
QJO_PROJECT_LOCKS.md
```

## Prompt/system context updated
Qjo now knows that Q-Spark must use separate API keys and must not mix with Qjo Assistant provider keys.

## Audit updated
`npm run audit` now checks:
- Q-Spark separate API endpoints.
- Q-Spark separate key namespace.
- Q-Spark key docs in `.env.example` and project locks.

## Verification
Passed:
```bash
npm run audit
```

Local `/api/health`:
```json
"version": "qjo-qspark-separated-keys-2026-07-20-24"
```

Local `/api/qspark/health`:
```json
"separateKeys": true
```

## Important note
The staged standalone `qspark.html` still contains its original browser-side key modal. The backend separation is now prepared and locked. Next hardening step, if desired, is refactoring the Q-Spark HTML calls to `/api/qspark/chat` so keys never live in the browser.

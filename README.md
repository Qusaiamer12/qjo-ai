# Qjo Production Ready Package

Node.js + Express backend for **Qjo**, the AI chat assistant.
Deployment target is Render (`render.yaml`).

**Q-Spark** (notebook/research) and **Qcode** (agentic coding workspace) were
split into their own repositories — [`qspark-ai`](https://github.com/Qusaiamer12/qspark-ai)
and [`qcode-ai`](https://github.com/Qusaiamer12/qcode-ai) — so this repo can ship
the first product alone. They still appear in the sidebar with a "Soon" badge.
See `docs/MIGRATION_QSPARK_QCODE.md`.

## What is included

- Secure backend proxy for 4 free AI providers — Groq (primary, fastest),
  LLM7 (free aggregator, keyless-capable), Kimi (moonshot free slot) and Qwen
  (Arabic/code/vision fallback) — with key rotation and fallback chains.
  Gemini / NVIDIA / OpenRouter / Agnes are parsed but out of every chain
  (free-only policy).
- No provider API key is ever exposed to the browser.
- Firebase Authentication support (`REQUIRE_FIREBASE_AUTH`), enforced on
  `/api/chat`, `/api/search`, `/api/export/*`, `/api/embeddings`, `/api/jobs`.
- Firestore chat history with subcollections:
  - `users/{uid}/chats/{chatId}`
  - `users/{uid}/chats/{chatId}/messages/{messageId}`
- Image compression before sending to vision model.
- PDF text extraction in browser using PDF.js.
- Strict model whitelist plus runtime migration of decommissioned model IDs.
- Per-attempt request timeouts and client-disconnect cancellation.
- Optional IP rate limiting, plus a dedicated limiter on public `/api/feedback`.
- Helmet security headers with a CSP allowlist.
  > Note: `script-src` currently includes `'unsafe-inline'` and `'unsafe-eval'`
  > because the Firebase SDK, MathJax and Tailwind CDN builds require them.
  > This weakens CSP's XSS protection and is a known open item.
- Optional daily per-user and per-guest request limits.
- Export to PDF, PPTX, DOCX, XLSX and code ZIP.

## Install

```bash
npm install
```

## Verify

```bash
npm run scan-secrets  # blocks credentials from reaching a commit
npm run lint          # ESLint (0 errors expected)
npm test              # boots the server and asserts security/behaviour invariants
npm run audit         # static stability audit of routes, frontend and CSS locks
```

Enable the pre-commit secret scan once per clone:

```bash
git config core.hooksPath .githooks
```

A ready-to-use GitHub Actions pipeline running all three lives in
`docs/ci/github-actions-ci.yml` — copy it to `.github/workflows/ci.yml` to
activate it (see `docs/ci/README.md`).

## Run locally without server-side Firebase verification

Good for local testing only:

```bash
GROQ_API_KEY="gsk_..." npm start
```

Windows PowerShell:

```powershell
$env:GROQ_API_KEY="gsk_..."
npm start
```

Open:

```text
http://localhost:3000
```

## Recommended production-like run

Enable Firebase token verification and daily user limits:

```bash
GROQ_API_KEY="gsk_..." \
REQUIRE_FIREBASE_AUTH=true \
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
DAILY_USER_LIMIT=0 \
npm start
```

Windows PowerShell example:

```powershell
$env:GROQ_API_KEY="gsk_..."
$env:REQUIRE_FIREBASE_AUTH="true"
$env:FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
$env:DAILY_USER_LIMIT="120"
npm start
```

## Firebase Web Config

The Firebase client config is still pasted from the hidden admin panel in the UI. It is not a private secret, but only Firebase Auth + Firestore rules make it safe.

## Firestore Rules

Use these rules:

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
      }
    }
  }
}
```

The backend Admin SDK writes usage counters to `aiUsage`, which bypasses Firestore client rules.

## Environment variables

| Variable | Required | Description |
|---|---:|---|
| `GROQ_API_KEY` | Yes | GroqCloud API key. Must stay server-side. |
| `PORT` | No | Defaults to `3000`. |
| `REQUIRE_FIREBASE_AUTH` | Recommended | Set to `true` in production to require Firebase login for AI calls. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | If auth verification enabled | Firebase Admin service account JSON as one-line string. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternative | Path to service account file. |
| `DAILY_USER_LIMIT` | No | `0` means unlimited. Set a number later if you want daily per-user limits. |
| `TAVILY_API_KEY` | Optional | Enables web search for current information. |
| `GUEST_DAILY_LIMIT` | No | `0` means unlimited. Per-IP daily cap for anonymous users. |
| `IP_RATE_LIMIT_PER_MINUTE` | No | `0` disables the global IP limiter. |
| `TRUST_PROXY` | No | Reverse-proxy hop count. Unset = `1` on Render (auto-detected), `0` locally. Set to `2` if Cloudflare sits in front of Render, otherwise `X-Forwarded-For` can be forged and per-IP quotas bypassed. |
| `EXPORT_MAX_UPLOAD_MB` | No | Upload ceiling for `/api/export/image-to-pdf`. Defaults to `10`. |
| `ADMIN_EMAILS` | Optional | Comma-separated emails allowed into `/api/admin/*` and the admin dashboard. |

See `.env.example` for the full list.

## Known open items

Tracked in `docs/reports/QJO_FULL_REPO_SCAN_REPORT.md` (full repo scan + fix log):

- CSP still needs `'unsafe-inline'` / `'unsafe-eval'` for CDN dependencies.
- In-memory state (job queue, caches, guest quotas) means a single instance
  only — horizontal scaling would need Redis or similar.
- Remaining `npm audit` findings sit in transitive deps of `firebase-admin`
  and `puppeteer` and need major upgrades.
- `public/app.js` (~4.2k lines) should be split into modules.
- Move Firebase web config to `/api/public-config` instead of duplicating it
  across five frontend files.
- Add billing/subscriptions if this will be paid.
- Add OCR pipeline for scanned PDFs.


## Optional Web Search

To enable current web search, create a Tavily API key and set:

```text
TAVILY_API_KEY=tvly_...
```

If this key is not set, Qjo will not guess current facts; it will state that live search is not configured when needed.


## Deep Search Engine

When `TAVILY_API_KEY` is configured, Qjo supports two levels of search:

- `/api/search`: fast single-query search.
- `/api/deep-search`: multi-query search for complex/current questions.

In Max mode or for complex questions, the frontend automatically uses Deep Search, deduplicates sources server-side, and sends source summaries to Qjo.


## Calculator Tool

The backend includes a deterministic `calculate` tool powered by mathjs. The AI can call it through tool calling for precise arithmetic, statistics, powers, roots, trigonometry, and matrix-like calculations. This reduces hallucinated math answers.


## Admin Dashboard

Admin dashboard is available at `/admin`. It requires Firebase Admin verification on the server. Set:

```text
ADMIN_EMAILS=your@email.com
FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

Hidden shortcuts like Ctrl+Shift+K are disabled.


## Removing usage limits / avoiding Groq rate limits

Qjo no longer has a per-user daily limit by default:

```text
DAILY_USER_LIMIT=0
```

IP rate limiting is also disabled by default:

```text
IP_RATE_LIMIT_PER_MINUTE=0
```

Provider limits from Groq may still happen. To reduce this, you can provide multiple Groq keys:

```text
GROQ_API_KEYS=gsk_key1,gsk_key2,gsk_key3
```

The backend will rotate keys and automatically try the next key if one is rate-limited. If Max/Code hits a limit, the server also attempts a temporary fallback to the lighter Flash model.


# Optional model overrides. Use 70B only if your Groq plan can handle it.
GROQ_FLASH_MODEL=openai/gpt-oss-20b
GROQ_TEXT_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct


# Gemini + Groq AI Router
LLM7_ENABLED=true
LLM7_API_KEYS=
LLM7_BASE_URL=https://api.llm7.io/v1
LLM7_FLASH_MODEL=llama-3.3-70b-instruct
LLM7_TEXT_MODEL=deepseek-chat


# Qwen fallback provider
QWEN_API_KEYS=sk_your_qwen_key_here
QWEN_FLASH_MODEL=qwen-plus
QWEN_TEXT_MODEL=qwen-plus
QWEN_CODE_MODEL=qwen-plus


## FINAL ROUTER: Groq primary + Qwen fallback

This build intentionally uses:

```text
GROQ_API_KEYS=gsk_...
QWEN_API_KEYS=...
```

Order:

```text
Groq -> Qwen
```

Gemini is intentionally not used in this final build.


# Additional fallback providers
NVIDIA_API_KEYS=nvapi_your_key_here
NVIDIA_FLASH_MODEL=meta/llama-3.1-8b-instruct
NVIDIA_TEXT_MODEL=meta/llama-3.3-70b-instruct

# OpenRouter fallback uses FREE models only; every model must include :free
OPENROUTER_API_KEYS=sk-or-your_key_here
OPENROUTER_FREE_MODELS=qwen/qwen3-235b-a22b:free,meta-llama/llama-3.3-70b-instruct:free,mistralai/mistral-7b-instruct:free

# Agnes AI generic OpenAI-compatible fallback; requires base URL and model from Agnes docs
AGNES_API_KEYS=sk-your_agnes_key_here
AGNES_BASE_URL=https://YOUR_AGNES_OPENAI_COMPATIBLE_BASE_URL/v1
AGNES_MODEL=YOUR_AGNES_MODEL


# Optional: strengthens Deep Search by extracting page contents
FIRECRAWL_API_KEY=fc_your_firecrawl_key_here


## PDF and Slides Export

Qjo includes backend endpoints:

```text
POST /api/export/pdf
POST /api/export/pptx
```

Assistant responses show PDF and Slides buttons. PDF generation uses pdfkit; PPTX generation uses pptxgenjs.

## Evaluation Kit

This project includes a basic evaluation kit in `evals/`:

- `golden-dataset.json`
- `run-eval.js`
- `README.md`

Run:

```bash
QJO_BASE_URL=http://localhost:3000 node evals/run-eval.js
```

The eval reports average score and latency and writes a JSON report.


# Kimi / Moonshot fallback provider
KIMI_API_KEYS=sk-your_kimi_key_here
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_FLASH_MODEL=moonshot-v1-8k
KIMI_TEXT_MODEL=moonshot-v1-8k
KIMI_CODE_MODEL=moonshot-v1-8k

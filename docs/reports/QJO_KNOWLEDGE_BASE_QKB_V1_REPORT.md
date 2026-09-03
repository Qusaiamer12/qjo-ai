# Qjo Knowledge Base (Q-KB v1) + Model Refresh

Version: `qjo-knowledge-base-v1-2026-09-03`

Two focused development steps shipped together:
1. **Q-KB v1** — curated Arabic task-craft knowledge base injected into the
   chat system prompt (the "recipe book" that keeps Qjo's answer standard on
   every model, especially small fallback ones).
2. **Model refresh** — replace dead/legacy model IDs (Gemini 1.5/2.0, Kimi
   moonshot-v1, NVIDIA llama-3.1-70b) with current generations and make the
   migration map cross-provider.

---

## Part 1 — Q-KB v1

### Why
The modular system prompt (`systemPrompt.js`, ~1.8k tokens) fixed the old
12k-token monolith problem but dropped the per-task depth (examples, formats,
house standards). Small fallback models (OpenRouter `:free` tier) drift
without exemplars. Q-KB restores that depth **selectively**: only the
guidance matching the current message, only when similarity clears a
threshold, capped in size.

### What was added

```text
knowledge/qkb-v1.json            46 curated Arabic entries across 6 domains
src/services/knowledgeBase.js    KB service: load / embed / search / inject
src/routes/chat.js               lookup + system-prompt injection (best-effort)
scripts/kb-sync.js               npm run kb:sync — populate Qdrant collection
server.js                        service wiring (optional env, silent degrade)
.env.example                     QKB_ENABLED / QDRANT_URL / QDRANT_API_KEY /
                                  QDRANT_KB_COLLECTION
```

### Domains (user-selected)
coding (8) · writing/generation (8) · summarization/analysis (8) ·
explanation/QA (8) · editing/transform (7) · math/logic (7) = **46 entries**

Each entry: `id`, `domain`, `triggers` (Arabic intent phrasings), `keywords`,
`guidance` (Qjo house standard for that task), `example` (compact exemplar).
Guidance encodes Qjo-specific rules — calculator enforcement for math, chunk
citations for summaries, patch-over-rewrite for code, tables ≤5 columns,
backtick isolation of English terms — not generic writing advice.

### Storage modes (auto-selected)
- **memory** (default, zero setup): entries embedded once per process via
  `embeddingsService` (e5 passages), cosine search in-process.
- **qdrant**: when `QDRANT_URL` + `QDRANT_API_KEY` are set and the collection
  exists. `npm run kb:sync` creates/updates it (`--recreate` rebuilds).
  Embeddings use the same provider/model as File RAG v3 (e5 with
  `query:`/`passage:` prefixes from the v3 work).

### Safety properties
- `lookup()` never throws: embeddings down / Qdrant down / 2.5s timeout →
  `{ found: false }`, chat proceeds without KB.
- Chitchat guard: greetings and <10-char non-questions skip retrieval
  (mirrors the web_search anti-robot rule).
- Threshold 0.42 cosine, top-2 hits, ≤1200-char injected block, entries embed
  triggers/keywords (matching signal) while payloads carry guidance/example.
- Injection phrased "اتبعها فقط إن كانت ذات صلة بالسؤال" so KB guidance can
  never override the user's explicit request.
- `QKB_ENABLED=false` kills it entirely.

### Retrieval flow
`POST /api/chat` → last user message → `knowledgeBaseService.lookup()` →
1 query embedding (roles `['query']`) → search (Qdrant `query()` or in-process
cosine) → hits ≥ threshold → `<qjo_knowledge_base>` block appended below the
core system prompt. Auth/limits/routing untouched.

---

## Part 2 — Model refresh (current as of 2026-09)

| Slot | Old | New |
|---|---|---|
| GEMINI_FLASH/TEXT/VISION | gemini-1.5-flash (dead) / 2.0-flash default | `gemini-3.8-flash` |
| KIMI_FLASH/TEXT | moonshot-v1-8k (legacy) | `kimi-k2.6` |
| KIMI_CODE | moonshot-v1-8k | `kimi-k2.7-code` |
| NVIDIA_TEXT | meta/llama-3.1-70b-instruct | `meta/llama-3.3-70b-instruct` |

- `MODEL_MIGRATIONS` in `llmService.js` is now **cross-provider** (was
  Groq-only): added Gemini 1.5/2.0 → 3.8-flash, moonshot-v1-\* and retired
  kimi-k2 previews → kimi-k2.6, llama-3.1-70b → llama-3.3-70b.
- Proactive migration now applies on every OpenAI-compatible provider (IDs
  are unambiguous), and `callGeminiChat` gained proactive migration + the new
  default.
- Updated defaults in `server.js`, `.env.example`, `README.md`, and
  `docs/DEPLOYMENT_GUIDE.md` (including dead Groq IDs still shown in docs).
- Sources: ai.google.dev/gemini-api/docs/models (Gemini 3.8 Flash = current
  stable Flash), Moonshot platform model list (kimi-k2.6 general /
  kimi-k2.7-code current generation).

## Preserved
- Fallback chain, key rotation, streaming, auth, rate limits: untouched.
- File RAG v3 (Real Vector-First): untouched — KB reuses its e5 role prefixes.
- Audit locks: all previously passing checks still pass.

## Verification
```bash
node --check server.js src/routes/chat.js src/services/knowledgeBase.js \
             src/services/llmService.js scripts/kb-sync.js public/app.js  # OK
npm run lint          # 0 errors (30 pre-existing warnings)
npm test              # 34 passed, 0 failed (boots server with KB wired)
npm run audit         # 0 new failures (5 pre-existing v21 UI failures,
                      # reproduce on clean baseline)
npm run scan-secrets  # clean
node scripts/kb-sync.js  # friendly guidance message without QDRANT_URL
```
Plus a 7-scenario unit test of the KB service with a mocked embedder:
memory init (46 entries), summarize hit + block format, chitchat skip,
coding hit, unrelated query below threshold, embedder-down → silent
`found:false` + mode `disabled`, `QKB_ENABLED=false` → disabled.

## Next steps (user actions, ~2 minutes)
1. Create a free cluster at cloud.qdrant.io (1GB free tier).
2. Set `QDRANT_URL` + `QDRANT_API_KEY` in Render (or locally).
3. Run `npm run kb:sync` once. Without these, everything already works in
   in-memory mode.

## Bilingual update (v1.1, same day)
- All 46 entries now carry **English triggers + keywords** alongside the
  Arabic ones (`qkb-v1.1-bilingual`), so English queries retrieve reliably.
- The injected `<qjo_knowledge_base>` block is **language-aware**: when the
  user message is Latin-dominant, the header note explicitly tells the model
  to apply the (Arabic-authored) house standard but **answer in English**.
- Fixed a greeting-guard bug: the old regex used `\b`, which is ASCII-only in
  JS, so longer Arabic greetings ("السلام عليكم ورحمة الله…") slipped past
  token detection. Replaced with a token-prefix Set check (AR + EN).
- Verified with bilingual unit tests: AR/EN summarize/code/math/editing hits,
  English language note present, long Arabic + English greetings skipped.
  `npm run lint` 0 errors, `npm test` 34/34.

## Future
- Add domains (Jordanian knowledge, product FAQ) by editing
  `knowledge/qkb-v1.json` only — no code change, then re-run `kb:sync`.
- A/B the KB with `npm run ai-quality-eval` / `launch-eval` (QKB_ENABLED
  on/off) to quantify the quality lift.

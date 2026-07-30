# Qjo Chat v2 — Quality & Speed Upgrade
**Date:** 2026-07-31 · **Scope:** Qjo Chat only (`/api/chat`, routing, search pipeline, app.js glue) · **Status:** implemented + 14 smoke tests passing.

## Why
Users reported slow, weak, inaccurate chat despite strong API keys. Root causes found in code:
1. The router answered most chats with **llama-3.1-8b** (weakest model, weak Arabic) while strong providers sat as fallbacks.
2. A single provider **timeout killed the whole fallback chain** (`AbortError` re-throw → instant 500).
3. Image requests were routed only to **text-only** models (vision slot never used).
4. The client's explicit `model` choice (Max mode) was **ignored** by the server router.
5. Every request carried the full **12k-token** monolith prompt + a duplicate client prompt.
6. Geo-IP lookup blocked every message up to 2.5s; cached answers re-typed with artificial delay (~30s worst case).
7. Search: regex query mangling, Tavily always `topic:general`, no freshness window, 650-char evidence excerpts, DuckDuckGo instant-answer as fallback.

## What changed (file by file)

### `src/agents/RoutingEngine.js` (rewritten)
- **Pipeline architecture** (`PIPELINES`) keyed by mode/intent:
  `lite`, `flash`, `maxAr`, `maxEn`, `code`, `vision` — providers without configured keys/models are skipped automatically; Arabic-heavy text prefers Qwen/Kimi on the max track.
- **Explicit model honoured**: a client-chosen `model` (e.g. Max → 70B) is attempted first, then the pipeline continues on failure.
- **Vision branch**: any message with `image_url` routes to vision-capable slots first (`groq:vision → gemini:vision → qwen:vision → nvidia:vision`). Vision never silently falls back to a text model.
- **Global deadline** per request (chat 40s): per-attempt timeout = min(per-provider cap, remaining budget). Slow providers shrink others' time instead of killing the chain.
- **Tools with all providers**: calculator attached on math intent; `web_search` attached when freshness is plausible and no client source pack exists (no more double search). Tool loop runs on the same provider; streamed tool_calls are supported.
- Non-streaming providers (Gemini) emit their full answer as one instant SSE chunk.
- Truncation continuation bounded to one pass and works for streamed answers too (real `finish_reason` now captured).

### `src/services/llmService.js` (rewritten)
- Provider timeout/network failure = **continue to next key** (never kills the chain). Distinct `ClientAbortError` for client disconnects.
- Real SSE parsing: content deltas, indexed `tool_calls` deltas, real `finish_reason`.
- `timeoutMs` per attempt + external cancellation `signal` on every call.
- New `dispatch(provider, opts)` + fixed `hasAnyProvider()` (was always false at boot).
- Wire format of callGroqChat kept backward compatible.

### `src/services/systemPrompt.js` (NEW)
- Modular prompt builder: compact **core (~1.4k tokens)** + mode overlay (flash/max/code) + conditional overlays (search, files) + runtime line. ~75–85% smaller than the legacy 12k monolith, which still powers Q-Spark unchanged.
- Preserves: Qjo identity rules, Jordanian tone/context (JOD, JU/JUST), truthfulness/citation rules, math-tool enforcement, injection defense (unified Arabic refusal), Bidi/formatting guardrails.

### `src/routes/chat.js` (rewritten)
- Auth → then **parallel** usage enforcement + geo resolution. Geo now uses a **per-IP LRU cache (24h)** and never blocks more than ~1.2s; slow lookups warm the cache for the next message.
- **Cache**: key now includes mode, language and country bucket; cached answers stream **instantly** (no fake re-typing).
- **Client disconnect aborts upstream calls** (token waste eliminated).
- Streaming chunks pass through `sanitizeMathNotation`.
- History trimmed to last 12 messages / 12k chars each server-side.
- Prompt builder used with mode + need overlays (legacy full prompt fallback preserved for evals).

### `src/services/searchService.js` (rewritten)
- **Tavily fully utilized**: `topic: 'news'` for news mode, `days: 7/30` freshness windows for news/pricing/market, `country: 'jo'` boost.
- **Brave Search API** is now a real fallback (`BRAVE_API_KEY`), ahead of DuckDuckGo.
- **LLM query rewriter**: one tiny bounded call (≤150 tokens, ≤4.5s) to the fastest configured provider converts dialect questions into native + English queries; cached 24h; regex distillation automatic fallback.
- Query sets = LLM-rewritten (native+English) ∪ heuristic plan, deduped, validated tolerantly.
- Results carry `publishedDate`.

### `src/search/searchCore.js`
- **Freshness scoring** in ranking for news/pricing/market (up to +0.6 same-day, decaying over ~30 days) — fresh sources finally outrank 2019 blogs.

### `server.js`
- New env slots: `QWEN_VISION_MODEL` (default `qwen-vl-plus`), `NVIDIA_VISION_MODEL` (off by default), `BRAVE_API_KEY`.
- Router models map now includes all slots (`*Code`, `*Vision`).
- Health payload exposes `routerVersion: 'pipelines-v2'` + exact pipelines; admin model diagnostics show vision models.
- `pickQueryRewriter()` chooses the fastest available provider for the rewriter.

### `public/app.js`
- Evidence excerpts per source: 650/950 → **1400/2000 chars**, plus a `Published:` line when dates exist.
- History sent to the server: last 20 → **last 12**.

### `.env.example`
- Documents `BRAVE_API_KEY`, `QWEN_VISION_MODEL`, `NVIDIA_VISION_MODEL`.

## Configure (recommended)
```bash
# Quality depends on these defaults — refresh stale names for your plan:
GROQ_FLASH_MODEL=llama-3.1-8b-instant        # check current Groq flash name
GROQ_TEXT_MODEL=llama-3.3-70b-versatile
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GEMINI_FLASH_MODEL=gemini-2.0-flash
GEMINI_TEXT_MODEL=gemini-2.0-flash
QWEN_TEXT_MODEL=qwen-plus
KIMI_TEXT_MODEL=moonshot-v1-8k
# Optional but valuable:
BRAVE_API_KEY=...            # real fallback search
TAVILY_API_KEY=...           # primary search (topic/news/days now active)
```

## Verification
- `node --check` passes on all touched files.
- 14 smoke tests (`smoke-test.js` companion — no network, stub providers) cover: pipeline order per mode, Arabic/English max track, vision routing, explicit-model priority, fallback chain resilience (timeout+429), tool loop, truncation continuation, prompt sizes, Tavily params, LLM rewriter integration, Brave fallback, `hasAnyProvider`.

## Expected impact
- First token: 4–15s → **1.5–4s** typical; no more timeout-500s.
- Max mode actually uses your 70B/plus-class keys; Arabic answers improve via Qwen/Kimi preference.
- Search: mode-aware (news/pricing), fresh, bilingual queries, thicker evidence.
- Token cost per request: **~60% lower**.

## Known follow-ups (not in scope)
- Q-Spark routes still call the router with shared Qjo models (the `QSPARK_*_MODEL` values remain unused — latent bug to fix in the Q-Spark phase).
- Client-side `buildSystemPrompt()` still sends its own small prompt; making the server the single source of truth is a follow-up cleanup.
- Per-user Qcode workspace isolation + child-process env scrub (security) — from previous security review, still pending.

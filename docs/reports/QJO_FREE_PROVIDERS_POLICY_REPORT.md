# Qjo Free-Only Provider Policy (4 Providers)

Version: `qjo-free-providers-policy-2026-09-03`

## Scope
Confine the LLM fallback chains to exactly **four free providers**, per the
product decision. Gemini, NVIDIA, OpenRouter and Agnes are out of every chain
(their modules stay in the codebase, dormant — setting their keys has no
effect until re-enabled in `RoutingEngine`).

## The four active providers

| # | Provider | Role | Models (defaults) | Auth |
|---|---|---|---|---|
| 1 | **Groq** | Primary, fastest | `openai/gpt-oss-20b` (flash) · `openai/gpt-oss-120b` (text/code) · `meta-llama/llama-4-scout-17b-16e-instruct` (vision) | `GROQ_API_KEY(S)` |
| 2 | **LLM7.io** | Free aggregator | `llama-3.3-70b-instruct` (flash) · `deepseek-chat` (text) | `LLM7_API_KEY(S)` — **works keyless** (`Bearer unused`, ~30 RPM; free token from token.llm7.io raises limits) |
| 3 | **Kimi (Moonshot)** | Free slot | `moonshot-v1-8k` on `https://api.moonshot.ai/v1` | `KIMI_API_KEY(S)` |
| 4 | **Qwen** | Arabic/code/vision fallback | `qwen-plus` · `qwen-vl-plus` (vision) | `QWEN_API_KEY(S)` |

## Chains (`src/agents/RoutingEngine.js`, pipelines-v3-free)
```text
lite:   groq:flash → llm7:flash → qwen:flash → kimi:flash
flash:  groq:flash → llm7:flash → qwen:flash → kimi:text
maxAr:  qwen:text  → kimi:text  → llm7:text  → groq:text
maxEn:  groq:text  → llm7:text  → qwen:text  → kimi:text
code:   groq:text  → qwen:code  → llm7:text  → kimi:text
vision: groq:vision → qwen:vision
```
Arabic-heavy Max puts Qwen first (pinned Arabic-quality fallback); English Max
puts Groq `gpt-oss-120b` first.

## What changed
- **`src/services/llmService.js`**
  - New `callLlm7Chat` (OpenAI-compatible, `https://api.llm7.io/v1`) wired
    into `getKeys` (defaults to `['unused']` when no key — keyless mode),
    `PROVIDER_METHODS`, `dispatch` and exports.
  - Kimi fallback base URL corrected to `api.moonshot.ai` (was `.cn`).
  - **moonshot-v1-\* removed from the migration map**: the free slot is
    pinned deliberately; auto-swapping to the paid `kimi-k2.*` generation
    would violate the free-only policy. If Moonshot retires `moonshot-v1-8k`
    upstream, the call fails and the chain moves on gracefully.
- **`src/agents/RoutingEngine.js`** — `PIPELINES` rewritten to the four
  providers; `locateExplicitModel` scans `groq/llm7/qwen/kimi` only.
- **`server.js`** — LLM7 constants (`LLM7_ENABLED/BASE_URL/API_KEYS/FLASH/TEXT`),
  Kimi defaults pinned to `moonshot-v1-8k` (all three slots), engine
  `keys`/`models` trimmed to the four providers, `hasAnyAiProvider` now true
  whenever LLM7 is enabled (**Qjo answers out of the box with zero keys**),
  health payload reports `pipelines-v3-free` + per-provider key counts
  (`llm7KeysConfigured: 'keyless'` when no token).
- **`.env.example` / `README.md`** — provider docs rewritten for the 4-provider
  layout; NVIDIA/OpenRouter/Agnes marked dormant with empty key samples.

## Verification
```bash
node --check server.js src/agents/RoutingEngine.js src/services/llmService.js
npm run lint          # 0 errors (30 pre-existing warnings)
npm test              # 34 passed, 0 failed
npm run audit         # 0 new failures (5 pre-existing v21 UI failures)
npm run scan-secrets  # clean
```
Unit tests (mocked fetch):
- keyless LLM7 → `https://api.llm7.io/v1/chat/completions` with
  `Authorization: Bearer unused` ✓
- token LLM7 → `Bearer <token>` ✓
- Kimi dispatch keeps `moonshot-v1-8k` (no paid migration) on
  `api.moonshot.ai` ✓
Boot check with **zero provider keys**: server starts, `/api/health` reports
`pipelines-v3-free` chains and `llm7: keyless` — chat is functional with no
configuration at all.

## Risks / notes
- `moonshot-v1-8k` is a legacy model family; if Moonshot decommissions it the
  Kimi slot will start failing (HTTP 400/404) and traffic silently shifts to
  Qwen/LLM7 — acceptable under the free-only policy, but worth monitoring in
  logs (`[llmService]` warnings).
- LLM7 keyless rate is ~30 RPM shared; recommended to set a free
  `LLM7_API_KEY` token (120 RPM) in Render.
- Vision now relies on Groq Scout + Qwen VL only; NVIDIA vision slot stays
  dormant with the rest.

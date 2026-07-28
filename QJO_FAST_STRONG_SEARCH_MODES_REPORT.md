# Qjo Fast + Strong Search / Modes Upgrade

Version: `qjo-fast-strong-search-modes-2026-07-20-25`

## Goal
User requested:
- stronger search quality
- faster search
- Max should stop overthinking / being slow
- Flash search should stop being weak/generic
- best result in shortest time

## Changes
### 1. Search is fast by default
`/api/search` now uses the faster path:
- Tavily basic depth instead of advanced for normal search
- 7 results
- Firecrawl enrichment reduced to only top 1 source
- Tavily timeout reduced:
  - basic: 9 seconds
  - advanced: 18 seconds

This makes normal/current questions much faster.

### 2. Deep Search is reserved for real deep tasks
Frontend no longer triggers Deep Search just because Max mode is selected.
Deep Search now triggers for:
- explicit deep search / بحث عميق
- source-heavy / report / research tasks
- comparisons / alternatives / market analysis
- long complex queries

This prevents Max from becoming slow on normal questions.

### 3. Deep Search fanout reduced
Deep Search was heavy. It now:
- uses up to 6 queries instead of 10
- requests 8 results per query instead of 10
- keeps top 18 deduped results instead of 28
- Firecrawl enriches 3–4 pages instead of 6–8

This keeps quality but reduces latency.

### 4. Flash search is stronger
Flash now has explicit behavior:
- fast but not shallow
- direct answer first
- source citations when search is used
- compact, high-signal answer
- cite 2–4 strong links when available

### 5. Max is faster
Max now performs a quick internal self-check instead of slow overthinking:
- assumptions
- weak logic
- hallucination risk
- edge cases

Then it answers with concise expert structure.

### 6. Token budgets optimized
Reduced unnecessary output length:
- Flash: 700 tokens
- Max: 3000 tokens
- Code: 4200 tokens

This improves latency while preserving capability.

### 7. Quality/performance lock updated
Added fast-search override in `QJO_QUALITY_PERFORMANCE_LOCKS`:
- Search must be fast by default.
- Deep Search reserved for explicit/deep/comparative/research tasks.
- Flash search must cite strong sources when available.
- Max should not overthink.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-fast-strong-search-modes-2026-07-20-25"
```

Local smoke tests (without provider env keys) showed endpoints return quickly using fallback. On Render with Tavily/Firebase env vars, Tavily will be used.

## Important env note
For strong search on Render, `TAVILY_API_KEY` must be configured. Without it, Qjo falls back to DuckDuckGo instant-answer API, which is much weaker.

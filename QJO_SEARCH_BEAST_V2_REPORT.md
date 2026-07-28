# Qjo Search Beast v2

Version: `qjo-search-beast-v2-2026-07-20-26`

## Scope
One focused development step: improve search quality and source ranking without touching Auth, UI foundations, Q-Spark, or unrelated features.

## What changed
### 1. Search planning
Added a server-side search planner:
- `buildSearchBeastPlan(question, deep)`

It classifies the query and creates targeted search queries depending on task type:
- technical/docs
- academic/research
- pricing/plans
- news
- comparisons
- sports/events
- general reliable sources

### 2. Source relevance scoring
Added:
- `searchBeastTerms()`
- `searchBeastRelevance()`

This extracts useful query terms and scores how relevant each source is to the actual question.

### 3. Combined ranking
Added:
- `rankSearchBeastResults()`

Each result is ranked using:
- source reliability
- source kind
- relevance to question
- Firecrawl enrichment bonus

This is better than sorting only by provider score or generic reliability.

### 4. `/api/search` upgraded
Normal search now:
- generates a compact search plan
- runs up to 3 targeted queries
- deduplicates URLs
- ranks by final score
- enriches top sources only
- returns a `plan` object for diagnostics

### 5. `/api/deep-search` upgraded
Deep Search now:
- uses the same planner with deeper mode
- runs targeted multi-query retrieval
- deduplicates and ranks with relevance
- enriches top sources
- returns plan metadata

## Preserved
- Auth untouched.
- Big prompt untouched.
- Q-Spark separate keys untouched.
- Q-Spark dark polish untouched.
- Mobile fixes untouched.
- Admin dashboard untouched.
- OCR untouched.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

Audit result:
```text
Audit passed with 0 warning(s)
```

Local smoke tests showed `/api/search` and `/api/deep-search` return plan metadata and ranked results.

## Important
Search quality depends heavily on `TAVILY_API_KEY`. Without Tavily, the system falls back to DuckDuckGo instant answers, which is weaker by nature.

# Qjo Search Engine Upgrade

Version: `qjo-perplexity-search-sources-2026-07-19-10`

## Goal
Make Qjo's search answers feel like Perplexity or better: direct answer, evidence synthesis, sources, and clickable links.

## Preserved
- Firebase/Auth untouched.
- `signInWithPopup` remains 2.
- `signInWithRedirect` remains 0.
- Big prompt preserved: 55,846 chars / 568 lines.
- Mode power/dropdown fix preserved.
- Mobile Pro Audit preserved.

## Backend search upgrades
### `/api/search`
- Now requests 8 results instead of 6.
- Uses Tavily advanced depth when Tavily is configured.
- Firecrawl enrichment increased from 3 pages to 4 pages.
- Response includes `generatedAt`.

### `/api/deep-search`
- Each planned query now requests 10 results.
- Deduplicated result pool increased to 28 results.
- Firecrawl enrichment increased:
  - 8 pages for academic/technical.
  - 6 pages for other deep-search modes.
- Response includes `generatedAt`.

### Tavily
- `search_depth` now respects advanced mode.
- `include_answer: true`.
- `include_raw_content: true` for advanced.
- Keeps snippets and raw content trimmed so the AI gets stronger evidence without drowning in noise.

## Frontend/search prompt upgrades
Added source-pack formatting for AI context:
- Source ID.
- Title.
- URL.
- Domain.
- Source kind.
- Reliability score.
- Query used.
- Evidence excerpt.

Search answers are now instructed to:
- Start with the direct answer.
- Use only the source pack for current claims.
- Cite key claims using Markdown links like `[1](URL)`.
- End with a short section titled `المصادر` or `Sources`.
- Compare conflicting claims and mention uncertainty.
- Avoid dumping all sources; use the strongest ones.

## Foundation prompt upgrade
The search layer now explicitly says Qjo should feel like Perplexity or better for search:
- Direct answer first.
- Evidence synthesis.
- Source links.
- Deep Search for Max/research-like tasks.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
```

Local health returned:
```json
"version": "qjo-perplexity-search-sources-2026-07-19-10"
```

Cache-busted assets:
```html
/styles.css?v=qjo-perplexity-search-sources-2026-07-19-10
/app.js?v=qjo-perplexity-search-sources-2026-07-19-10
```

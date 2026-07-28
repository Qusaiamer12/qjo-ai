# Qjo Step 9: Performance + Quality Upgrade

Version: `qjo-performance-quality-upgrade-2026-07-20-18`

## Completed
Raised performance and quality across the current stack without touching Auth.

## Backend performance
### 1. Compression
Added dependency:
```json
"compression": "^1.7.4"
```

Enabled middleware:
```js
app.use(compression({ threshold: 1024 }));
```

This improves transfer size for large JS/CSS/API responses where the platform/browser supports compression.

### 2. Search caching
Added in-memory TTL caches:
- `memoryCaches.search`
- `memoryCaches.deepSearch`
- `memoryCaches.firecrawl`

Added helpers:
- `cacheGet()`
- `cacheSet()`
- `stableCacheKey()`

Caching behavior:
- `/api/search`: 10 minutes.
- `/api/deep-search`: 10 minutes.
- Firecrawl page scrape cache: 12 hours.

This reduces repeated Tavily/Firecrawl calls, speeds repeated questions, and lowers provider usage.

### 3. Tavily timeout protection
Tavily now uses AbortController:
- Basic: 18 seconds.
- Advanced: 30 seconds.

This prevents search from hanging too long.

## Quality upgrade
Added:
```js
QJO_QUALITY_PERFORMANCE_LOCKS
```

This final behavior layer improves:
- high-signal answers.
- less filler.
- source quality.
- code output quality.
- file analysis structure.
- natural Arabic.
- precise uncertainty handling.

## Audit updates
`npm run audit` now verifies:
- compression dependency.
- compression middleware.
- search/cache layer.
- quality/performance lock.

## Preserved
- Auth untouched.
- Big prompt preserved.
- Admin dashboard preserved.
- OCR preserved.
- Code ZIP preserved.
- Search/source cards preserved.
- Chat management preserved.
- Memory controls preserved.
- Diagnostic page preserved.
- Mobile Pro Audit preserved.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-performance-quality-upgrade-2026-07-20-18"
```

Search cache smoke test:
- First request: `cached: false`
- Second same request: `cached: true`

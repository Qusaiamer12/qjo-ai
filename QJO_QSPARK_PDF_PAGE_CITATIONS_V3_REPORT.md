# Q-Spark PDF Page Citations v3

Version: `qjo-qspark-pdf-page-citations-v3-2026-07-20-39`

## Scope
Focused Q-Spark citation refinement: improve PDF page-grounding so evidence citations can use real PDF page markers instead of only estimated character-based pages.

## What changed
### 1. PDF extraction now inserts page markers
During Q-Spark PDF ingestion, each extracted PDF page is now stored with a marker:
```text
[PAGE 1]
[PAGE 2]
...
```

This preserves page boundaries in the source content.

### 2. Citation chunks now detect real pages
Added:
```js
pageForChar(text, start)
```

It checks for the latest `[PAGE N]` marker before the chunk start and uses that as the citation page. If no marker exists, it falls back to estimated page from character position.

### 3. Citation panel uses actual stored page
The citation chips and evidence modal now prefer the page stored in the citation map instead of estimating from chunk number.

### 4. Citation rule strengthened
Q-Spark now tells the model:
```text
Use real [PAGE N] labels when present, otherwise use estimated page/chunk labels.
```

## Preserved
- Qjo Auth untouched.
- Q-Spark notebook cloud storage preserved.
- Q-Spark backend routing preserved.
- Q-Spark exact citation panel preserved.
- Main Qjo app untouched except version/cache.

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
"version": "qjo-qspark-pdf-page-citations-v3-2026-07-20-39"
```

Audit now checks:
```text
Q-Spark PDF page citation markers exist
```

## Self-critique / remaining limitation
This improves page-level grounding for newly uploaded PDFs. Existing notebooks uploaded before this version may not have `[PAGE N]` markers unless re-uploaded or migrated. A future migration tool could reprocess older sources.

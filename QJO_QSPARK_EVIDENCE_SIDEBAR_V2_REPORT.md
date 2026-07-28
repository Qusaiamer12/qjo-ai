# Q-Spark Citation v2 / Evidence Sidebar

Version: `qjo-qspark-evidence-sidebar-v2-2026-07-20-38`

## Scope
Focused Q-Spark step: improve NotebookLM-style citations by adding an evidence modal/sidebar with exact quote excerpts for citation labels.

## What changed
### 1. Citation evidence map
Q-Spark now stores a runtime citation map:
```js
lastCitationMap
```

Each citation such as `[S1:C2]` maps to:
- source object
- source number
- chunk number
- estimated page
- character range
- retrieved chunk text
- short quote excerpt

### 2. Exact quote extraction
`chunkForCitations()` now creates a `quote` field from each retrieved chunk. This quote is a compact excerpt used by the evidence modal.

### 3. Evidence modal
Added:
```text
citation-modal
```

When a user clicks a citation chip, Q-Spark opens a modal showing:
- citation label
- source title
- estimated page
- chunk number
- character range
- exact quote excerpt
- button to open the source preview
- button to copy the quote

### 4. Citation chips now open evidence
The citation panel no longer only opens a source preview. It now opens the evidence modal first, giving users NotebookLM-like source grounding.

## Preserved
- Auth untouched.
- Q-Spark notebook cloud storage preserved.
- Q-Spark backend routing preserved.
- Q-Spark separate keys preserved.
- Qjo main app untouched except version/cache.
- Search Beast / Smart Router / RAG untouched.

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
"version": "qjo-qspark-evidence-sidebar-v2-2026-07-20-38"
```

Local `/qspark.html` contains:
```text
citation-modal
openCitationEvidence
lastCitationMap
```

## Self-critique / remaining limitation
This is evidence sidebar v2, but citations are still estimated page/chunk references derived from text positions. The next stronger version would preserve exact PDF page text chunks at ingestion time and jump directly to page/paragraph anchors.

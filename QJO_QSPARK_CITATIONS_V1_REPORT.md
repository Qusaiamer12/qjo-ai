# Q-Spark Source RAG + Exact Citations v1

Version: `qjo-qspark-citations-v1-2026-07-20-37`

## Scope
Focused Q-Spark step: improve NotebookLM-style source grounding and citations.

## What changed
### 1. Source citation labels
Q-Spark now builds source/chunk labels like:
```text
[S1:C1]
[S2:C3]
```

Where:
- `S1` = source number in the active notebook context
- `C1` = retrieved chunk number

### 2. Citation-aware retrieval context
`buildMultiSourceContext()` now produces:
- source map
- retrieved evidence chunks
- estimated page/chunk labels
- strict citation rules

The model is instructed to cite important factual claims using bracket citations like:
```text
[S1:C2]
```

### 3. Multi-source grounding
For multiple active sources, Q-Spark now sends a clear source map:
```text
[S1] Source title
[S2] Source title
```

Then it sends retrieved chunks for each source.

### 4. Conflict handling
Q-Spark now explicitly instructs the model:
- if sources agree, synthesize them
- if sources conflict, mention the conflict and cite both sides
- if the answer is not supported by the uploaded sources, say that clearly

### 5. Citation panel in UI
After Q-Spark answers, it detects citations like:
```text
[S1:C2]
```

and renders a small citation panel under the answer with clickable source chips that open the relevant source preview.

### 6. Audit updated
`npm run audit` now verifies:
```text
Q-Spark exact citations exist
```

## Preserved
- Main Qjo Auth untouched.
- Q-Spark notebook cloud storage preserved.
- Q-Spark backend routing preserved.
- Q-Spark separate keys preserved.
- Main Search Beast / Router / RAG untouched.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-qspark-citations-v1-2026-07-20-37"
```

Local `/qspark.html` includes:
```text
citationPanelHtml
STRICT CITATION RULES
QSPARK_EMBED_VERSION='qjo-qspark-citations-v1-2026-07-20-37'
```

## Self-critique / remaining limitation
This is citation v1. Citations point to source+chunk and open the source preview. They are not yet exact page-level anchors inside a rendered PDF viewer. A later v2 can store exact page/paragraph coordinates and scroll directly to the evidence chunk.

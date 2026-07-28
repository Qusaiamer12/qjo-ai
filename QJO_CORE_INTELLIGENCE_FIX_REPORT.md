# Qjo Core Intelligence / Modes / Search Fix

Version: `qjo-core-intelligence-mode-fix-2026-07-19-08`

## What was wrong
- The full 55k prompt was restored, but the active runtime layer still allowed modes to feel too similar.
- Max and Code were still using the same frontend text model as Flash: `llama-3.1-8b-instant`, which made deeper reasoning/code feel weak.
- Mode UI needed a more robust event handler to prevent mobile/dropdown click issues.
- Local small-talk replies bypassed the model and were too dry compared with the intended casual emoji/tone behavior.

## What was fixed
### Preserved
- Firebase/Auth untouched.
- `signInWithPopup` remains active; `signInWithRedirect` count is 0.
- Big Qjo prompt preserved: 55,846 chars / 568 lines.
- Mobile Pro Audit patch preserved.

### Intelligence layer
Added `QJO_FOUNDATION_LOCKS` after the full prompt as a high-priority behavior layer for:
- Deep reasoning.
- Search/Deep Search discipline.
- Distinct Flash / Max / Code behavior.
- Emoji and tone rules.
- Tables/formatting rules.
- Product foundation rules.

### Models and generation
- Flash remains fast on `llama-3.1-8b-instant`.
- Max/Code now request `llama-3.3-70b-versatile` from the frontend.
- Increased token budgets:
  - Flash: 900
  - Max: 5000
  - Code: 5200
- Lowered Max/Code temperature for more reliable reasoning.

### Mode buttons
- Added body mode state: `document.body.dataset.qjoMode`.
- Added delegated `modeDropdown` click handling using `data-mode`.
- Added validation so only `normal`, `advanced`, or `code` can be saved.

### Search
The foundation layer now explicitly forces:
- Current info/search/source/news/prices/schedules/docs/model/API questions to use search context when available.
- Max/research-like requests to synthesize like Deep Search.
- Search result URLs/source names to be used for current claims.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
```

Local health returned:
```json
"version": "qjo-core-intelligence-mode-fix-2026-07-19-08"
```

Served assets include:
```html
/styles.css?v=qjo-core-intelligence-mode-fix-2026-07-19-08
/app.js?v=qjo-core-intelligence-mode-fix-2026-07-19-08
```

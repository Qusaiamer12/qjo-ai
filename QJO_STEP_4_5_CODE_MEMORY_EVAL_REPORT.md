# Qjo Steps 4–5: Code Project Builder + Memory Controls + Eval Script

Version: `qjo-memory-code-eval-tools-2026-07-20-14`

## Step 4 — Code Project Builder
Added backend endpoint:
```text
POST /api/export/code-zip
```

Purpose:
- Takes generated project files from Code mode.
- Returns a downloadable ZIP file.

Added dependency:
```json
"jszip": "^3.10.1"
```

Added frontend tools:
- `extractProjectFiles()`
- `downloadCodeZip()`
- ZIP button under assistant answers when code blocks are detected.

The button appears like:
```text
ZIP (number of files)
```

Code mode is also instructed to label multi-file projects clearly using file paths before code blocks so Qjo can export them cleanly.

## Step 5 — Memory Controls
Added local memory management inside user settings:
- Shows local Qjo correction memory.
- Allows deleting individual memory notes.
- Allows clearing all local memory on the current device.

Added UI elements:
- `memoryList`
- `refreshMemoryBtn`
- `clearMemoryBtn`

Added frontend functions:
- `renderMemoryList()`
- `clearLocalMemory()`

## Eval Script Registration
Registered:
```json
"eval": "node evals/run-eval.js"
```

So the project now supports:
```bash
npm run eval
```

## Audit Updated
`npm run audit` now checks:
- `jszip` dependency.
- `/api/export/code-zip` endpoint.
- Code ZIP frontend functions.
- Memory controls.
- Eval script registration.

## Preserved
- Auth untouched.
- `signInWithPopup = 2`.
- `signInWithRedirect = 0`.
- Big prompt preserved.
- Search/source cards preserved.
- Diagnostic page preserved.
- Mobile Pro Audit preserved.

## Verification
Passed:
```bash
npm run audit
```

Local `/api/health`:
```json
"version": "qjo-memory-code-eval-tools-2026-07-20-14"
```

Local code ZIP smoke test returned HTTP 200 and a valid ZIP.

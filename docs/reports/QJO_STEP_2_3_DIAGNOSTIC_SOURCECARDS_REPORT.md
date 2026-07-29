# Qjo Steps 2–3: Diagnostic Page + Search Source Cards

Version: `qjo-diagnostic-sourcecards-2026-07-20-12`

## Completed in this step

### Step 2 — Diagnostic Page
Added:
```text
public/qjo-diagnostic.html
```

Open it after deploy at:
```text
https://qjo-ai-1.onrender.com/qjo-diagnostic.html
```

It checks from the browser:
- `/api/health`
- frontend `app.js` version
- network state
- Firebase SDK load
- Firebase app init
- Auth current user
- Auth persistence
- Firestore read when logged in
- `/api/client-context`
- browser timezone/time
- `/api/search`
- `/api/deep-search`
- `/api/chat`

It also prints a raw JSON report for debugging.

### Step 3 — Search Source Cards
Search answers now get visual clickable source cards after the assistant message.

Added frontend logic:
- `lastSearchSources`
- `appendSourceCards()`
- Search status labels:
  - `Qjo يبحث في المصادر...`
  - `Qjo يعمل بحثًا عميقًا في المصادر...`
  - `Qjo يحلل النتائج ويجهز الرد...`

Added CSS:
- `.source-cards`
- `.source-card`
- mobile horizontal source cards

Search source cards are separate from the model answer, so even if the model summarizes sources, the UI still shows clickable source links.

## Audit upgrade
Updated `scripts/audit.js` to also verify:
- `public/qjo-diagnostic.html` exists.
- source card renderer exists.
- source card CSS exists.

## Preserved
- Auth untouched.
- `signInWithPopup = 2`.
- `signInWithRedirect = 0`.
- Big prompt preserved.
- Search Perplexity upgrade preserved.
- Mobile Pro Audit preserved.
- Mode power/dropdown fix preserved.
- Location/time awareness preserved.

## Verification
Passed:
```bash
npm run audit
```

Audit result:
```text
Audit passed with 0 warning(s).
```

Local `/api/health` returned:
```json
"version": "qjo-diagnostic-sourcecards-2026-07-20-12"
```

Diagnostic page returned HTTP 200 locally:
```text
/qjo-diagnostic.html
```

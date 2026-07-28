# Qjo Smart Model Router v2

Version: `qjo-smart-router-v2-2026-07-20-27`

## Scope
One focused development step: improve model/provider routing so Qjo behaves more like a serious multi-model AI product, not a single-model chatbot.

## What changed
### 1. Request classification
Added server-side request classification:
```js
classifyQjoRequest({ messages, mode })
```

It detects:
- search/source synthesis
- research tasks
- long files / PDFs / OCR / file analysis
- code tasks
- math/calculation tasks
- Max reasoning tasks
- image tasks

### 2. Search/research routing
For source-grounded search and research synthesis, Qjo now prioritizes stronger synthesis providers before fast chat:
1. Qwen
2. Kimi
3. NVIDIA
4. then normal Groq/fallback flow

This is intended to make search answers less generic and more analytical when the keys are configured.

### 3. File/long-context routing
For uploaded files, OCR, PDFs, and long context, Qjo now tries long-context/synthesis providers before fast chat:
1. Kimi
2. Qwen
3. NVIDIA
4. then normal fallback

### 4. Code routing preserved and strengthened
Code mode still tries Qwen first:
```js
QWEN_CODE_MODEL
```
then falls back normally.

### 5. Max reasoning routing
For Max reasoning tasks that do not need calculator/tool behavior, Qjo tries Qwen first for stronger synthesis.

### 6. Math/calculator preserved
Math/calculation tasks are not rerouted away from Groq before calculator support, preserving calculator tool behavior.

### 7. Health/audit
Health now includes:
```js
smartRouterV2: true
```

Audit now checks:
```text
Smart Router v2 exists
```

## Preserved
- Auth untouched.
- Firebase untouched.
- Search Beast v2 preserved.
- Q-Spark separate keys preserved.
- OCR preserved.
- Mobile/UI preserved.
- Big prompt preserved.

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
"version": "qjo-smart-router-v2-2026-07-20-27"
```

## Important
Smart Router v2 only becomes powerful when provider env vars are configured:
```text
QWEN_API_KEYS
KIMI_API_KEYS
NVIDIA_API_KEYS
GROQ_API_KEYS
```

If only Groq is configured, routing still works but has fewer choices.

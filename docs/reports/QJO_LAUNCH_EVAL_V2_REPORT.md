# Qjo Launch Evaluation Suite v2

Version: `qjo-launch-eval-v2-2026-07-20-34`

## Scope
One focused development step: create a public-launch evaluation suite that measures Qjo quality, not just code structure.

## What was added
### 1. Launch dataset
Added:
```text
evals/launch-dataset-v2.json
```

The dataset currently covers:
- Arabic social tone
- current search with sources
- typo robustness in search
- Max reasoning
- Code project generation
- exact math
- safety refusal
- Q-Spark awareness

### 2. Launch evaluator
Added:
```text
evals/launch-eval-v2.js
```

It checks:
- `/api/health`
- `/api/qspark/health`
- `/api/client-context`
- `/api/search` when needed
- `/api/chat` responses

It produces:
- JSON report
- Markdown report
- average score out of 5 and 10
- category scores
- per-case notes

### 3. NPM script
Added:
```json
"launch-eval": "node evals/launch-eval-v2.js"
```

Run locally or against deployed Render:
```bash
npm run launch-eval
QJO_BASE_URL=https://qjo-ai-1.onrender.com npm run launch-eval
```

### 4. Audit integration
`npm run audit` now checks:
- launch evaluator exists
- launch dataset exists
- `launch-eval` script is registered

## Verification
Passed:
```bash
node --check evals/launch-eval-v2.js
npm run audit
```

Local health returned:
```json
"version": "qjo-launch-eval-v2-2026-07-20-34"
```

## Important
The full launch eval requires provider keys on the target server. If no AI provider keys are configured locally, `/api/chat` cases will fail, which is expected. Run against the deployed Render service after environment variables are configured.

## Suggested launch gate
Do not publicly launch unless:
```text
npm run audit = pass
npm run launch-eval averageScore10 >= 8.0
Search category >= 8.0
Code category >= 8.0
Safety category >= 9.0
```

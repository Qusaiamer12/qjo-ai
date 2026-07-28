# Qjo Evaluation Kit

## Run basic evaluation

Start Qjo locally or use deployed URL, then:

```bash
QJO_BASE_URL=http://localhost:3000 node evals/run-eval.js
```

Against deployed Render:

```bash
QJO_BASE_URL=https://YOUR_DOMAIN.onrender.com node evals/run-eval.js
```

## Judge modes

Heuristic mode:

```bash
JUDGE_MODE=heuristic node evals/run-eval.js
```

LLM judge mode:

```bash
JUDGE_MODE=llm node evals/run-eval.js
```

## Expand dataset

Add more cases to `golden-dataset.json`:

- real user questions
- ideal answer summary
- rubric points
- category

Recommended target: 100-500 cases.

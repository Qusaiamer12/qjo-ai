# Qcode Project Knowledge Integration

Version: `qjo-qcode-project-knowledge-v1-2026-07-20-45`

## Input
User provided:
```text
PROJECT_OVERVIEW.md
```

## What was added
### 1. Knowledge file
Added:
```text
QCODE_PROJECT_KNOWLEDGE.md
```

This preserves the uploaded Qcode reference as a project knowledge document.

### 2. Runtime Qcode system context
Added to `server.js`:
```js
QCODE_PROJECT_KNOWLEDGE_CONTEXT
```

It summarizes the intended mature Qcode architecture:
- `brain.py` Reason→Plan→Act→Verify→Reflect loop
- `tools.py` with 32 tools
- `providers.py` with 8 providers
- `router.py` smart routing/fallback
- `agents.py` planner/coder/tester/reviewer
- sandbox, safety, snapshots, rollback
- MCP, RAG, memory, skills, i18n
- Flask API endpoints
- preview/background/sessions/usage/rules
- target quality standards and roadmap

### 3. Qcode model prompt updated
`/api/qcode/chat` system prompt now includes the project knowledge context so Qcode understands its own intended roadmap and architecture.

### 4. Audit updated
`npm run audit` now verifies:
```text
Qcode project knowledge exists
```

## Preserved
- Main Qjo Auth untouched.
- Q-Spark untouched.
- Qcode existing endpoints/tools preserved.
- No provider key changes.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

## Next recommended Qcode step
Based on the uploaded project overview, the next logical development step is:
```text
Qcode Snapshots + Rollback v2
```

Then:
```text
Safe Command Runner
Test/Build Loop
Preview Server
Sessions persistence
```

# Qcode Agent Tools v1

Version: `qjo-qcode-agent-tools-v1-2026-07-20-44`

## Scope
Focused Qcode step: move Qcode from a code-chat UI toward a real coding agent by adding backend file tools and SSE tool events.

## What changed
### 1. Backend file tools
Added server-side safe workspace tools:
- `list_files`
- `read_file`
- `write_file`
- `edit_file`
- `search_files`

Implemented functions:
- `readQcodeFileSafe()`
- `writeQcodeFileSafe()`
- `editQcodeFileSafe()`
- `searchQcodeFiles()`
- `qcodeWorkspaceSummary()`
- `runQcodeAction()`

All paths are constrained to:
```text
qcode-workspace/
```

### 2. Structured model action protocol
`/api/qcode/chat` now instructs the model to return strict JSON when file operations are needed:

```json
{
  "answer": "short user-facing summary",
  "actions": [
    { "tool": "write_file", "path": "src/App.jsx", "content": "..." },
    { "tool": "edit_file", "path": "x.js", "find": "old", "replace": "new" },
    { "tool": "read_file", "path": "package.json" },
    { "tool": "search_files", "query": "TODO" }
  ]
}
```

### 3. Tool execution events
Qcode now emits SSE events compatible with the uploaded Qcode UI:
- `tool_start`
- `tool_end`
- `file_changed`
- `routing`
- `phase`
- `assistant`
- `assistant_full`

### 4. Qcode chat provider order
Still uses separate QCODE keys only:
```text
Qwen → Groq → NVIDIA → Kimi
```

### 5. Safety constraints
- No access outside Qcode workspace.
- No shell execution yet.
- No preview server execution yet.
- File edits require exact text matching for `edit_file`.

## Preserved
- Main Qjo Auth untouched.
- Qjo Assistant untouched.
- Q-Spark untouched.
- Qcode separate keys preserved.
- Qcode UI preserved.

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
"version": "qjo-qcode-agent-tools-v1-2026-07-20-44"
```

Local Qcode health:
```json
"separateKeys": true
```

Local Qcode chat without keys correctly returns:
```text
No Qcode provider configured. Add QCODE_* keys.
```

## Self-critique / remaining limitations vs Claude Code
This is a major step, but not yet Claude Code level.
Still missing:
- safe command runner
- real test/build execution
- preview server
- patch review UI
- multi-step repair loop
- git diff/rollback integration

Next recommended step:
```text
Qcode Safe Command Runner + Test Loop v2
```

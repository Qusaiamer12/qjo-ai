# Qcode Max Agent Final

Version: `qjo-qcode-max-agent-final-2026-07-20-47`

## Scope
Final Qcode hardening pass based on comparison with Claude Code / Cursor / Replit Agent.

## Completed
### 1. Agent file tools
Qcode supports:
- `list_files`
- `read_file`
- `write_file`
- `edit_file`
- `search_files`
- `project_map`
- `create_snapshot`
- `run_command`
- `rollback_snapshot`

### 2. Snapshots + rollback
Added:
- `createQcodeSnapshot()`
- `listQcodeSnapshots()`
- `rollbackQcodeSnapshot()`

Endpoints:
```text
GET  /api/qcode/snapshots
POST /api/qcode/snapshot/create
POST /api/qcode/rollback
```

All write/edit operations create snapshots before changes.

### 3. Safe command runner
Added:
```text
POST /api/qcode/run
```

Runs only inside:
```text
qcode-workspace/
```

Allowed commands:
```text
npm, node, python, python3, pytest, npx, ls, pwd, cat
```

Blocks dangerous patterns:
- `rm -rf /`
- `cat .env`
- `printenv`
- `sudo`
- `ssh/scp`
- `chmod 777`
- `curl | sh`
- `wget | bash`
- `netcat`

### 4. Test/build repair loop v1
If a `run_command` action fails, Qcode makes a repair attempt:
1. Sends stdout/stderr back to model.
2. Requests corrective file actions.
3. Applies safe file actions.
4. Reports repair results.

### 5. Project map
Added:
```text
GET /api/qcode/project-map
```

Returns:
- file list
- framework guess
- package manager
- scripts
- dependencies
- suggested test command
- suggested build command

### 6. Diff / apply edit
Added:
```text
POST /api/qcode/diff
POST /api/qcode/apply-edit
```

Allows previewing an exact text replacement and applying it.

### 7. Static preview
Added:
```text
GET /api/qcode/preview/start
GET /api/qcode/preview/file
GET /api/qcode/preview/list
```

Supports previewing static `index.html` inside the workspace.

### 8. Sessions persistence
Added local JSON session persistence:
```text
GET  /api/qcode/sessions
GET  /api/qcode/sessions/load?id=
POST /api/qcode/sessions/save
POST /api/qcode/sessions/delete
```

### 9. Usage tracking foundation
Qcode now has a `qcodeUsage` object and `/api/qcode/usage` + CSV export endpoints.

### 10. Qcode project knowledge
Integrated uploaded `PROJECT_OVERVIEW.md` into:
```text
QCODE_PROJECT_KNOWLEDGE.md
QCODE_PROJECT_KNOWLEDGE_CONTEXT
```

Qcode now knows its target architecture and roadmap.

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

Local smoke tests passed:
```text
/api/health
/api/qcode/run
/api/qcode/diff
/api/qcode/usage
```

## Current comparison vs Claude Code
Qcode is now meaningfully closer:
- has file tools
- has snapshots/rollback
- has safe command runner
- has first repair loop
- has project map
- has static preview
- has sessions

Still behind Claude Code in:
- full multi-iteration autonomous loop
- rich diff UI
- git integration
- Vite/React live dev preview
- mature command sandboxing
- repository-scale context optimization

## Recommended next step
If continuing Qcode development:
```text
Qcode Multi-Iteration Agent Loop v3 + Rich Diff Review UI
```

# Qcode Full Agent v2

Version: `qjo-qcode-full-agent-v2-2026-07-20-46`

## Scope
Focused Qcode step: address the core weaknesses identified against Claude Code/Cursor/Replit Agent.

## Completed
### 1. Snapshots + Rollback
Added workspace snapshots:
- `createQcodeSnapshot()`
- `listQcodeSnapshots()`
- `rollbackQcodeSnapshot()`

Endpoints:
```text
GET  /api/qcode/snapshots
POST /api/qcode/snapshot/create
POST /api/qcode/rollback
```

`write_file` and `edit_file` automatically create snapshots before modifying files.

### 2. Safe Command Runner
Added:
```text
POST /api/qcode/run
```

Allowlisted commands:
```text
npm, node, python, python3, pytest, npx, ls, pwd, cat
```

Blocked dangerous patterns:
- `rm -rf /`
- `cat .env`
- `printenv`
- `sudo`
- `ssh/scp`
- `chmod 777`
- pipe-to-shell curl/wget
- netcat

All commands run inside:
```text
qcode-workspace/
```

### 3. Agent Tool Expansion
Qcode model tool protocol now supports:
- `list_files`
- `read_file`
- `write_file`
- `edit_file`
- `search_files`
- `project_map`
- `create_snapshot`
- `run_command`
- `rollback_snapshot`

### 4. Test/Build Repair Loop v1
If a `run_command` action fails, Qcode makes one automatic repair attempt:
- sends command output back to model
- requests corrective file actions
- applies safe file actions
- reports repair results

### 5. Project Map
Added:
```text
GET /api/qcode/project-map
```

Returns:
- files
- framework guess
- package manager
- scripts
- dependencies
- suggested test command
- suggested build command

### 6. Static Preview v1
Added static preview support:
```text
GET /api/qcode/preview/start
GET /api/qcode/preview/file
GET /api/qcode/preview/list
```

This supports previewing an `index.html` file from the Qcode workspace.

### 7. Sessions Persistence
Added real session persistence to local JSON files:
```text
GET  /api/qcode/sessions
GET  /api/qcode/sessions/load?id=
POST /api/qcode/sessions/save
POST /api/qcode/sessions/delete
```

## Preserved
- Main Qjo Auth untouched.
- Qjo Assistant untouched.
- Q-Spark untouched.
- Qcode separate keys preserved.
- Existing Qcode UI preserved.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

Local endpoint smoke tests passed:
- `/api/qcode/health`
- `/api/qcode/project-map`
- `/api/qcode/run` with `pwd`
- `/api/qcode/snapshot/create`
- `/api/qcode/snapshots`

## Self-critique / remaining gap vs Claude Code
Qcode is now much closer, but still not fully Claude Code level:
- Command runner is safe but limited.
- Repair loop is one-pass, not a full multi-iteration autonomous loop.
- Preview is static HTML only, not Vite/React dev server yet.
- No git integration yet.
- Patch review UI is not yet a dedicated diff screen, though snapshots protect changes.

Next premium step:
```text
Qcode Diff/Patch Review UI + Multi-Iteration Test Loop v3
```

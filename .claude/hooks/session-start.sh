#!/bin/bash
# Cloud sessions start from a fresh clone: without this, every suite fails on
# "Cannot find module 'express'" and real Python on a missing Pyodide cache.
# Installs what CI installs (.github/workflows), idempotently.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund --ignore-scripts
npm install --prefix tests/browser --no-audit --no-fund --ignore-scripts
# Real Pyodide and its packages, hash-checked; skipped when already cached.
node tests/browser/fetch-pyodide.js

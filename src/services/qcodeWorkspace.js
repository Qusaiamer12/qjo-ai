const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { validateQcodeActions } = require('../tools/fileEditorTool');

function createQcodeWorkspaceService({ workspaceDir, snapshotDir, sessionsDir, allowNetworkCommands = false }) {
  if (!workspaceDir || !snapshotDir || !sessionsDir) throw new Error('createQcodeWorkspaceService requires workspaceDir, snapshotDir, sessionsDir');

  const networkCommandsAllowed = allowNetworkCommands === true;

  // Child processes get a MINIMAL environment. Spreading process.env here used
  // to hand every provider API key (GROQ_*, QWEN_*, FIREBASE_SERVICE_ACCOUNT_JSON,
  // ...) to any code the agent runs via `node`/`python`, which made the
  // `cat .env` / `printenv` blocks in isDangerousCommand purely cosmetic.
  function buildChildEnv() {
    return {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME || workspaceDir,
      LANG: process.env.LANG || 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR || '/tmp',
      NODE_ENV: 'development'
    };
  }

  // Commands that reach the network (package installs, remote npx fetches).
  // Gated by QCODE_ALLOW_NETWORK_COMMANDS, which server.js already advertises
  // through /api/health and /api/diagnostics but which was silently dropped
  // by this factory's destructuring until now.
  function isNetworkCommand(args) {
    const bin = String(args[0] || '').toLowerCase();
    const sub = String(args[1] || '').toLowerCase();
    if (bin === 'npx') return true;
    if (bin === 'npm') return ['install', 'i', 'ci', 'add', 'update', 'up', 'exec', 'publish', 'audit'].includes(sub);
    if (bin === 'pip' || bin === 'pip3') return sub === 'install' || sub === 'download';
    if ((bin === 'python' || bin === 'python3') && sub === '-m' && String(args[2] || '').toLowerCase() === 'pip') return true;
    return false;
  }

  function assertNetworkAllowed(args) {
    if (!networkCommandsAllowed && isNetworkCommand(args)) {
      throw new Error('Network commands are disabled. Set QCODE_ALLOW_NETWORK_COMMANDS=true to enable them.');
    }
  }

  function ensureQcodeWorkspace() {
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(snapshotDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  function safeQcodePath(input = '') {
    const cleaned = String(input || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.+/g, '').trim();
    const target = path.resolve(workspaceDir, cleaned || '.');
    if (target !== workspaceDir && !target.startsWith(workspaceDir + path.sep)) throw new Error('Invalid path.');
    return target;
  }

  function relativeQcodePath(abs) { return path.relative(workspaceDir, abs).replace(/\\/g, '/'); }

  function copyDirRecursive(src, dest, depth = 0) {
    if (depth > 8 || !fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDirRecursive(s, d, depth + 1);
      else if (entry.isFile()) {
        const st = fs.statSync(s);
        if (st.size <= 2 * 1024 * 1024) fs.copyFileSync(s, d);
      }
    }
  }

  function createQcodeSnapshot(label = 'snapshot') {
    ensureQcodeWorkspace();
    const id = `${Date.now()}-${String(label || 'snapshot').replace(/[^\w.-]+/g, '-').slice(0, 40)}`;
    const dir = path.join(snapshotDir, id);
    copyDirRecursive(workspaceDir, dir);
    const meta = { id, label, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, '_snapshot.json'), JSON.stringify(meta, null, 2));
    return meta;
  }

  function listQcodeSnapshots() {
    ensureQcodeWorkspace();
    return fs.readdirSync(snapshotDir, { withFileTypes: true })
      .filter(x => x.isDirectory())
      .map(x => {
        const metaPath = path.join(snapshotDir, x.name, '_snapshot.json');
        try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); }
        catch { return { id: x.name, label: x.name, createdAt: '' }; }
      })
      .sort((a,b) => String(b.id).localeCompare(String(a.id)))
      .slice(0, 50);
  }

  function rollbackQcodeSnapshot(id) {
    ensureQcodeWorkspace();
    const cleanedId = String(id || '').replace(/[\\/]/g, '').replace(/\.\.+/g, '').trim();
    const snap = path.resolve(snapshotDir, cleanedId);
    if (!cleanedId || (snap !== snapshotDir && !snap.startsWith(snapshotDir + path.sep)) || !fs.existsSync(snap)) throw new Error('Snapshot not found.');
    createQcodeSnapshot('before-rollback');
    for (const entry of fs.readdirSync(workspaceDir)) {
      const abs = path.join(workspaceDir, entry);
      fs.rmSync(abs, { recursive: true, force: true });
    }
    copyDirRecursive(snap, workspaceDir);
    fs.rmSync(path.join(workspaceDir, '_snapshot.json'), { force: true });
    return { ok: true, rolledBackTo: id };
  }

  function isDangerousCommand(command) {
    const c = String(command || '').toLowerCase();
    const bad = [/rm\s+-rf\s+\//, /rm\s+-rf\s+\.\./, /cat\s+.*\.env/, /printenv/, /sudo\b/, /ssh\b/, /scp\b/, /chmod\s+777/, /mkfs/, /dd\s+if=/, /curl\s+.*\|\s*(sh|bash)/, /wget\s+.*\|\s*(sh|bash)/, /nc\b|netcat\b/];
    return bad.some(rx => rx.test(c));
  }

  function parseCommand(command) {
    const parts = String(command || '').match(/(?:"[^"]*"|'[^']*'|\S+)/g) || [];
    return parts.map(p => p.replace(/^['"]|['"]$/g, ''));
  }

  function runQcodeCommand(command, timeoutMs = 30000) {
    ensureQcodeWorkspace();
    const args = parseCommand(command);
    if (!args.length) throw new Error('Missing command.');
    const bin = args[0];
    const allowed = new Set(['npm','node','python','python3','pytest','npx','ls','pwd','cat']);
    if (!allowed.has(bin)) throw new Error(`Command not allowed: ${bin}`);
    if (isDangerousCommand(command)) throw new Error('Command blocked by Qcode safety policy.');
    assertNetworkAllowed(args);
    if (bin === 'cat') {
      const target = args[1] || '';
      if (!target || target.includes('.env')) throw new Error('cat target blocked.');
      return Promise.resolve({ command, code: 0, stdout: readQcodeFileSafe(target, 20000), stderr: '' });
    }
    return new Promise((resolve) => {
      const child = spawn(bin, args.slice(1), { cwd: workspaceDir, shell: false, env: buildChildEnv() });
      let stdout = '', stderr = '';
      const cap = s => String(s || '').slice(-40000);
      child.stdout.on('data', d => { stdout = cap(stdout + d.toString()); });
      child.stderr.on('data', d => { stderr = cap(stderr + d.toString()); });
      const timer = setTimeout(() => { child.kill('SIGKILL'); stderr += '\n[Qcode timeout]'; }, Math.min(Math.max(timeoutMs, 1000), 60000));
      child.on('close', code => { clearTimeout(timer); resolve({ command, code, stdout, stderr }); });
      child.on('error', err => { clearTimeout(timer); resolve({ command, code: 127, stdout, stderr: err.message }); });
    });
  }

  function listQcodeFiles(dir = workspaceDir, base = workspaceDir, depth = 0) {
    ensureQcodeWorkspace();
    if (depth > 4) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(base, abs).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        out.push({ name: entry.name, path: rel, type: 'dir' });
        out.push(...listQcodeFiles(abs, base, depth + 1));
      } else {
        out.push({ name: entry.name, path: rel, type: 'file', size: fs.statSync(abs).size });
      }
      if (out.length > 300) break;
    }
    return out;
  }

  function readQcodeFileSafe(filePath, maxChars = 60000) {
    const abs = safeQcodePath(filePath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error(`File not found: ${filePath}`);
    return fs.readFileSync(abs, 'utf8').slice(0, maxChars);
  }

  function writeQcodeFileSafe(filePath, content) {
    const snapshot = createQcodeSnapshot(`before-write-${path.basename(String(filePath||'file'))}`);
    const abs = safeQcodePath(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, String(content || ''), 'utf8');
    return { path: relativeQcodePath(abs), bytes: Buffer.byteLength(String(content || ''), 'utf8'), snapshot };
  }


  function buildUnifiedDiff(before, after, context = 2) {
    const a = String(before || '').split(/\r?\n/);
    const b = String(after || '').split(/\r?\n/);
    const rows = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
      if (a[i] === b[i]) {
        if (rows.length && rows[rows.length - 1].type !== 'ctx-gap') rows.push({ type: 'ctx', line: i + 1, text: a[i] || '' });
      } else {
        if (a[i] !== undefined) rows.push({ type: 'del', line: i + 1, text: a[i] });
        if (b[i] !== undefined) rows.push({ type: 'add', line: i + 1, text: b[i] });
      }
    }
    const interesting = rows.map((r, i) => r.type !== 'ctx' ? i : -1).filter(i => i >= 0);
    if (!interesting.length) return [];
    const keep = new Set();
    for (const idx of interesting) for (let i = Math.max(0, idx - context); i <= Math.min(rows.length - 1, idx + context); i++) keep.add(i);
    const out = [];
    let last = -2;
    [...keep].sort((x,y)=>x-y).forEach(i => {
      if (i > last + 1) out.push({ type: 'gap', text: '...' });
      out.push(rows[i]);
      last = i;
    });
    return out.slice(0, 800);
  }

  function editQcodeFileSafe(filePath, find, replace) {
    const snapshot = createQcodeSnapshot(`before-edit-${path.basename(String(filePath||'file'))}`);
    const abs = safeQcodePath(filePath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error(`File not found: ${filePath}`);
    const original = fs.readFileSync(abs, 'utf8');
    const needle = String(find || '');
    if (!needle) throw new Error('Missing find text for edit_file.');
    if (!original.includes(needle)) throw new Error(`Find text not found in ${filePath}`);
    const updated = original.replace(needle, String(replace || ''));
    fs.writeFileSync(abs, updated, 'utf8');
    return {
      path: relativeQcodePath(abs),
      replaced: true,
      beforeBytes: Buffer.byteLength(original),
      afterBytes: Buffer.byteLength(updated),
      before: original.slice(0, 80000),
      after: updated.slice(0, 80000),
      unifiedDiff: buildUnifiedDiff(original, updated),
      snapshot
    };
  }

  function searchQcodeFiles(query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    const files = listQcodeFiles().filter(x => x.type === 'file').slice(0, 120);
    const hits = [];
    for (const file of files) {
      try {
        const content = readQcodeFileSafe(file.path, 80000);
        const idx = content.toLowerCase().indexOf(q);
        if (idx >= 0 || file.path.toLowerCase().includes(q)) hits.push({ path: file.path, index: idx, excerpt: idx >= 0 ? content.slice(Math.max(0, idx - 120), idx + 240) : '' });
      } catch (_) {}
      if (hits.length >= 30) break;
    }
    return hits;
  }

  function qcodeWorkspaceSummary() {
    const files = listQcodeFiles().filter(x => x.type === 'file').slice(0, 60);
    return files.map(f => `${f.path} (${Math.round((f.size || 0)/1024)}KB)`).join('\n') || 'No files yet.';
  }

  function qcodeProjectMap() {
    ensureQcodeWorkspace();
    const files = listQcodeFiles().filter(x => x.type === 'file');
    const has = name => files.some(f => f.path.endsWith(name));
    let packageJson = null;
    try { if (has('package.json')) packageJson = JSON.parse(readQcodeFileSafe('package.json', 60000)); } catch {}
    return {
      files: files.slice(0, 200),
      framework: packageJson?.dependencies?.react || packageJson?.devDependencies?.vite ? 'frontend-js' : has('requirements.txt') ? 'python' : 'unknown',
      packageManager: has('package.json') ? 'npm' : has('requirements.txt') ? 'pip' : 'unknown',
      scripts: packageJson?.scripts || {},
      dependencies: packageJson ? Object.keys({ ...(packageJson.dependencies||{}), ...(packageJson.devDependencies||{}) }).slice(0, 80) : [],
      suggestedTestCommand: packageJson?.scripts?.test ? 'npm test' : has('pytest.ini') || files.some(f => f.path.startsWith('tests/')) ? 'pytest' : '',
      suggestedBuildCommand: packageJson?.scripts?.build ? 'npm run build' : ''
    };
  }

  // ---- Verification loop: after a build, actually check the result instead
  // of just trusting the model's JSON "answer" text. Syntax-checks changed
  // files and, if the project has a package.json test script, runs it once
  // with a bounded timeout. ----
  async function verifyWorkspace(changedPaths = []) {
    ensureQcodeWorkspace();
    const checks = [];
    const jsExt = new Set(['.js', '.jsx', '.mjs', '.cjs']);
    const pyExt = new Set(['.py']);
    const uniquePaths = [...new Set(changedPaths)].slice(0, 15);

    for (const rel of uniquePaths) {
      const ext = path.extname(rel).toLowerCase();
      const abs = safeQcodePath(rel);
      if (!fs.existsSync(abs)) continue;
      if (jsExt.has(ext)) {
        try {
          execFileSync(process.execPath, ['--check', abs], { timeout: 8000, stdio: ['ignore', 'pipe', 'pipe'] });
          checks.push({ path: rel, type: 'syntax', ok: true });
        } catch (error) {
          checks.push({ path: rel, type: 'syntax', ok: false, error: String(error.stderr || error.message || 'syntax error').slice(-1500) });
        }
      } else if (pyExt.has(ext)) {
        const result = await runQcodeCommand(`python3 -m py_compile ${rel}`, 8000).catch(() => null);
        if (result) checks.push({ path: rel, type: 'syntax', ok: result.code === 0, error: result.code === 0 ? undefined : String(result.stderr || '').slice(-1500) });
      }
    }

    let testRun = null;
    try {
      const pkgPath = path.join(workspaceDir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.test && !/no test specified/i.test(pkg.scripts.test)) {
          const result = await runQcodeCommand('npm test', 25000);
          testRun = { ok: result.code === 0, stdout: String(result.stdout || '').slice(-3000), stderr: String(result.stderr || '').slice(-3000) };
        }
      }
    } catch (_) { /* no usable test script — not a failure, just nothing to verify */ }

    const ok = checks.every(c => c.ok) && (!testRun || testRun.ok);
    return { ok, checks, testRun };
  }

  function extractJsonObject(text) {
    const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/,'').trim();
    try { return JSON.parse(raw); } catch (_) {}
    const firstObj = raw.indexOf('{');
    const lastObj = raw.lastIndexOf('}');
    if (firstObj >= 0 && lastObj > firstObj) { try { return JSON.parse(raw.slice(firstObj, lastObj + 1)); } catch (_) {} }
    return null;
  }

  // ---- Git (dedicated, tightly-scoped: init/add/commit only — never routed
  // through the general run_command allowlist, which deliberately excludes git) ----
  function runGitCommand(args, timeoutMs = 15000) {
    ensureQcodeWorkspace();
    try {
      const out = execFileSync('git', args, { cwd: workspaceDir, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: buildChildEnv() });
      return { ok: true, stdout: out };
    } catch (error) {
      return { ok: false, error: String(error.stderr || error.message || 'git command failed').slice(-4000) };
    }
  }

  function gitInit() {
    const result = runGitCommand(['init']);
    if (!result.ok) throw new Error(result.error);
    runGitCommand(['config', 'user.email', 'qcode@qjo.local']);
    runGitCommand(['config', 'user.name', 'Qcode']);
    return { ok: true };
  }

  function gitCommit(message) {
    const add = runGitCommand(['add', '-A']);
    if (!add.ok) throw new Error(add.error);
    const commit = runGitCommand(['commit', '-m', String(message || 'Qcode commit').slice(0, 200)]);
    if (!commit.ok) {
      if (/nothing to commit/i.test(commit.error)) return { ok: true, nothingToCommit: true };
      throw new Error(commit.error);
    }
    return { ok: true, output: commit.stdout };
  }

  // ---- ZIP project import (zip-slip safe: every entry path is resolved
  // through safeQcodePath, which strips ".." and rejects escapes) ----
  async function importZipToWorkspace(buffer, { maxFiles = 400, maxFileBytes = 2 * 1024 * 1024 } = {}) {
    ensureQcodeWorkspace();
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(buffer);
    const saved = [];
    const skipped = [];
    for (const entry of Object.values(zip.files)) {
      if (saved.length + skipped.length >= maxFiles) { skipped.push({ path: entry.name, reason: 'limit' }); continue; }
      if (entry.dir) continue;
      if (/(^|\/)node_modules\/|(^|\/)\.git\//.test(entry.name)) { skipped.push({ path: entry.name, reason: 'ignored' }); continue; }
      try {
        const content = await entry.async('nodebuffer');
        if (content.length > maxFileBytes) { skipped.push({ path: entry.name, reason: 'too-large' }); continue; }
        const abs = safeQcodePath(entry.name);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
        saved.push(relativeQcodePath(abs));
      } catch (error) {
        skipped.push({ path: entry.name, reason: error.message });
      }
    }
    return { saved, skipped };
  }

  // ---- Project / semantic index (lightweight, regex-based — not a full
  // AST parser, but enough to give the UI real symbols/imports/stats) ----
  function buildProjectIndex() {
    const map = qcodeProjectMap();
    const files = map.files;
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const byExtension = {};
    for (const f of files) {
      if (f.type !== 'file') continue;
      const ext = (path.extname(f.path) || '(no ext)').toLowerCase();
      byExtension[ext] = (byExtension[ext] || 0) + 1;
    }
    const importantNames = ['package.json', 'README.md', 'requirements.txt', 'index.html', 'server.js', 'main.py', 'app.py', '.env.example'];
    const important = files.filter(f => importantNames.includes(path.basename(f.path))).map(f => f.path);
    return {
      totalFiles: files.filter(f => f.type === 'file').length,
      totalBytes,
      framework: map.framework,
      packageManager: map.packageManager,
      scripts: map.scripts,
      dependencies: map.dependencies,
      important,
      byExtension
    };
  }

  function buildSemanticIndex(query) {
    const files = listQcodeFiles().filter(x => x.type === 'file' && /\.(js|jsx|ts|tsx|py|html|css|json|md)$/i.test(x.path)).slice(0, 150);
    const symbolRx = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^\s*(?:export\s+)?class\s+([A-Za-z0-9_$]+)|^\s*def\s+([A-Za-z0-9_]+)\s*\(|^\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/;
    const importRx = /^\s*(import\s+.+from\s+['"].+['"];?|const\s+.+=\s*require\(['"].+['"]\)|from\s+\S+\s+import\s+.+|import\s+\S+)/;
    const symbols = [];
    const imports = [];
    outer:
    for (const file of files) {
      let content;
      try { content = readQcodeFileSafe(file.path, 40000); } catch (_) { continue; }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sm = line.match(symbolRx);
        if (sm) {
          const name = sm[1] || sm[2] || sm[3] || sm[4];
          if (name) symbols.push({ path: file.path, line: i + 1, name });
        }
        if (importRx.test(line)) imports.push({ path: file.path, line: i + 1, statement: line.trim().slice(0, 160) });
        if (symbols.length > 400 || imports.length > 400) break outer;
      }
    }
    const entries = query ? searchQcodeFiles(query).map(h => ({ path: h.path, excerpt: h.excerpt })) : [];
    return { symbols: symbols.slice(0, 400), imports: imports.slice(0, 400), entries };
  }

  // ---- Dev server (start/stop/status): a single tracked child process per
  // workspace. Restricted to the same safe binaries as run_command's allowlist. ----
  let devServerProc = null;
  let devServerState = { running: false, command: '', url: '', pid: null, code: null, stdout: '', stderr: '' };

  function startDevServer(command) {
    ensureQcodeWorkspace();
    if (devServerProc) throw new Error('Dev server already running. Stop it first.');
    const cmd = String(command || 'npm run dev').trim();
    const args = parseCommand(cmd);
    const bin = args[0];
    const allowedDevBins = new Set(['npm', 'node', 'npx', 'python', 'python3']);
    if (!allowedDevBins.has(bin)) throw new Error(`Command not allowed: ${bin}`);
    if (isDangerousCommand(cmd)) throw new Error('Command blocked by Qcode safety policy.');
    assertNetworkAllowed(args);
    devServerProc = spawn(bin, args.slice(1), { cwd: workspaceDir, shell: false, env: buildChildEnv() });
    devServerState = { running: true, command: cmd, url: '', pid: devServerProc.pid, code: null, stdout: '', stderr: '' };
    const cap = s => String(s || '').slice(-8000);
    devServerProc.stdout.on('data', d => {
      devServerState.stdout = cap(devServerState.stdout + d.toString());
      const m = devServerState.stdout.match(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?[^\s]*/i);
      if (m && !devServerState.url) devServerState.url = m[0];
    });
    devServerProc.stderr.on('data', d => { devServerState.stderr = cap(devServerState.stderr + d.toString()); });
    devServerProc.on('close', code => { devServerState = { ...devServerState, running: false, code }; devServerProc = null; });
    devServerProc.on('error', err => { devServerState = { ...devServerState, running: false, stderr: err.message }; devServerProc = null; });
    return devServerState;
  }

  function stopDevServer() {
    if (devServerProc) { devServerProc.kill('SIGTERM'); devServerProc = null; }
    devServerState = { ...devServerState, running: false };
    return devServerState;
  }

  function getDevServerStatus() { return devServerState; }

  function normalizeQcodeActions(actions) {
    return validateQcodeActions(actions).map((a, index) => ({
      id: `qctool-${Date.now()}-${index}`,
      tool: String(a.tool || '').trim(),
      path: String(a.path || '').trim(),
      content: a.content == null ? '' : String(a.content),
      find: a.find == null ? '' : String(a.find),
      replace: a.replace == null ? '' : String(a.replace),
      query: a.query == null ? '' : String(a.query),
      command: a.command == null ? '' : String(a.command),
      snapshotId: a.snapshotId == null ? '' : String(a.snapshotId)
    }));
  }

  function runQcodeAction(action) {
    if (action.tool === 'list_files') return { items: listQcodeFiles().slice(0, 200) };
    if (action.tool === 'read_file') return { path: action.path, content: readQcodeFileSafe(action.path) };
    if (action.tool === 'write_file') return writeQcodeFileSafe(action.path, action.content);
    if (action.tool === 'edit_file') return editQcodeFileSafe(action.path, action.find, action.replace);
    if (action.tool === 'search_files') return { query: action.query, hits: searchQcodeFiles(action.query) };
    if (action.tool === 'project_map') return qcodeProjectMap();
    if (action.tool === 'create_snapshot') return createQcodeSnapshot(action.query || 'manual');
    if (action.tool === 'rollback_snapshot') return rollbackQcodeSnapshot(action.snapshotId || action.query);
    if (action.tool === 'run_command') return { pending: true, command: action.command };
    throw new Error(`Unsupported tool: ${action.tool}`);
  }

  function qcodeSessionPath(id) {
    const clean = String(id || '').replace(/[^\w.-]/g, '').slice(0, 80);
    return path.join(sessionsDir, `${clean}.json`);
  }

  return {
    networkCommandsAllowed,
    ensureQcodeWorkspace,
    safeQcodePath,
    relativeQcodePath,
    createQcodeSnapshot,
    listQcodeSnapshots,
    rollbackQcodeSnapshot,
    runQcodeCommand,
    listQcodeFiles,
    readQcodeFileSafe,
    writeQcodeFileSafe,
    editQcodeFileSafe,
    searchQcodeFiles,
    qcodeWorkspaceSummary,
    qcodeProjectMap,
    extractJsonObject,
    verifyWorkspace,
    normalizeQcodeActions,
    runQcodeAction,
    buildUnifiedDiff,
    qcodeSessionPath,
    gitInit,
    gitCommit,
    runGitCommand,
    importZipToWorkspace,
    buildProjectIndex,
    buildSemanticIndex,
    startDevServer,
    stopDevServer,
    getDevServerStatus
  };
}

module.exports = { createQcodeWorkspaceService };

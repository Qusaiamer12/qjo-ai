function registerQcodeRoutes(app, deps) {
  const required = [
    'ensureQcodeWorkspace', 'workspaceDir', 'tools', 'uploadMiddleware', 'usage', 'agent', 'verifyFirebaseRequest', 'http', 'learning'
  ];
  for (const key of required) if (deps[key] === undefined || deps[key] === null) throw new Error(`registerQcodeRoutes missing dependency: ${key}`);
  const t = deps.tools;

  app.use('/api/qcode', async (req, res, next) => {
    if (!(await deps.verifyFirebaseRequest(req, res))) return;
    next();
  });

  app.get('/api/qcode/info', (_, res) => {
    deps.ensureQcodeWorkspace();
    res.json({ ok: true, ready: true, workspace: deps.workspaceDir, separateKeys: true });
  });

  app.get('/api/qcode/health', (_, res) => {
    res.json({ ok: true, separateKeys: true, keysConfigured: { routingEngine: true }, workspaceReady: true });
  });

  app.get('/api/qcode/files', (_, res) => {
    try { res.json({ ok: true, items: t.listQcodeFiles() }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/qcode/file', (req, res) => {
    try {
      const abs = t.safeQcodePath(req.query.path || '');
      if (!deps.fs.existsSync(abs) || !deps.fs.statSync(abs).isFile()) return res.status(404).json({ error: 'File not found.' });
      res.json({ ok: true, path: t.relativeQcodePath(abs), content: deps.fs.readFileSync(abs, 'utf8') });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/qcode/save', (req, res) => {
    try {
      const abs = t.safeQcodePath(req.body.path || 'untitled.txt');
      deps.fs.mkdirSync(deps.path.dirname(abs), { recursive: true });
      deps.fs.writeFileSync(abs, String(req.body.content || ''), 'utf8');
      res.json({ ok: true, path: t.relativeQcodePath(abs) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/qcode/upload', deps.uploadMiddleware.array('files', 20), (req, res) => {
    try {
      deps.ensureQcodeWorkspace();
      const saved = [];
      for (const file of req.files || []) {
        const abs = t.safeQcodePath(file.originalname || 'upload.bin');
        deps.fs.mkdirSync(deps.path.dirname(abs), { recursive: true });
        deps.fs.writeFileSync(abs, file.buffer);
        saved.push(t.relativeQcodePath(abs));
      }
      res.json({ ok: true, saved });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/api/qcode/download', (req, res) => {
    try {
      const abs = t.safeQcodePath(req.query.path || '');
      if (!deps.fs.existsSync(abs)) return res.status(404).json({ error: 'Not found.' });
      res.download(abs);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/api/qcode/usage', (_, res) => res.json({
    ...deps.usage,
    total_calls: deps.usage.calls,
    last_call: deps.usage.last_call || null
  }));
  app.get('/api/qcode/usage/export', (_, res) => {
    const rows = ['provider,calls,tokens,cost_usd'];
    for (const [provider, info] of Object.entries(deps.usage.by_provider || {})) rows.push(`${provider},${info.calls || 0},${info.tokens || 0},${Number(info.cost || 0).toFixed(6)}`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(rows.join('\n'));
  });

  app.get('/api/qcode/learning', (_, res) => res.json({
    ok: true,
    instincts: deps.learning.getTopInstincts(20, 2),
    sessions: deps.learning.sessionStats(),
    recentSessions: deps.learning.recentSessions(10)
  }));

  app.get('/api/qcode/sandbox_status', (_, res) => res.json({
    ok: true,
    separateKeys: true,
    sandbox: {
      mode: 'soft-allowlist',
      blocked_patterns: 11,
      safe_commands: 9,
      docker_available: false
    },
    mcp: {
      node_available: true,
      active_clients: [],
      configured: [],
      available_servers: { filesystem: 'Read/write files outside the Qcode workspace', github: 'Search and manage GitHub repos' }
    }
  }));

  // ---- Git (dedicated safe subset: init + add -A + commit only) ----
  app.post('/api/qcode/git/init', (_, res) => {
    try { res.json({ ok: true, result: t.gitInit() }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/qcode/git/commit', (req, res) => {
    try { res.json({ ok: true, result: t.gitCommit(req.body?.message) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/qcode/git/status', (_, res) => {
    const r = t.runGitCommand(['status']);
    r.ok ? res.json({ ok: true, result: r }) : res.status(400).json({ error: r.error });
  });
  app.get('/api/qcode/git/diff', (_, res) => {
    const r = t.runGitCommand(['diff']);
    r.ok ? res.json({ ok: true, result: r }) : res.status(400).json({ error: r.error });
  });
  app.get('/api/qcode/git/history', (_, res) => {
    const r = t.runGitCommand(['log', '--oneline', '-20']);
    r.ok ? res.json({ ok: true, result: r }) : res.status(400).json({ error: r.error });
  });

  // ---- ZIP project import ----
  app.post('/api/qcode/import/zip', deps.uploadMiddleware.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
      const result = await t.importZipToWorkspace(req.file.buffer);
      res.json({ ok: true, ...result });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---- Project / semantic index ----
  app.get('/api/qcode/project-index', (_, res) => {
    try { res.json({ ok: true, index: t.buildProjectIndex() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/qcode/semantic-index', (req, res) => {
    try { res.json({ ok: true, index: t.buildSemanticIndex(req.query.q || '') }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ---- Dev server ----
  app.post('/api/qcode/dev-server/start', (req, res) => {
    try { res.json({ ok: true, status: t.startDevServer(req.body?.command) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/qcode/dev-server/stop', (_, res) => {
    try { res.json({ ok: true, status: t.stopDevServer() }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/qcode/dev-server/status', (_, res) => res.json({ ok: true, status: t.getDevServerStatus() }));

  // Best-effort reverse proxy so an <iframe> can preview whatever the dev
  // server is serving on localhost, without exposing that port directly.
  app.get('/api/qcode/dev-server/proxy/*', (req, res) => {
    const status = t.getDevServerStatus();
    if (!status.running || !status.url) return res.status(503).send('Dev server is not running.');
    let target;
    try { target = new URL(status.url); } catch (_) { return res.status(500).send('Dev server URL is invalid.'); }
    const subPath = '/' + (req.params[0] || '');
    const proxyReq = deps.http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: subPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''),
      method: req.method,
      headers: { ...req.headers, host: target.host }
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => { if (!res.headersSent) res.status(502).send('Dev server proxy failed.'); });
    req.pipe(proxyReq);
  });

  app.get('/api/qcode/preview/start', (req, res) => {
    try {
      const target = req.query.path || req.query.target || 'index.html';
      const abs = t.safeQcodePath(target);
      if (!deps.fs.existsSync(abs)) return res.status(404).json({ error: 'Preview file not found.' });
      const fileAbs = deps.fs.statSync(abs).isDirectory() ? deps.path.join(abs, 'index.html') : abs;
      if (!deps.fs.existsSync(fileAbs) || !deps.fs.statSync(fileAbs).isFile()) return res.status(404).json({ error: 'Preview file not found.' });
      const rel = t.relativeQcodePath(fileAbs);
      res.json({ ok: true, name: deps.path.basename(rel), kind: 'static-html', path: rel, url: '/api/qcode/preview/file?path=' + encodeURIComponent(rel) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/api/qcode/preview/file', (req, res) => {
    try {
      const abs = t.safeQcodePath(req.query.path || 'index.html');
      if (!deps.fs.existsSync(abs) || !deps.fs.statSync(abs).isFile()) return res.status(404).send('Not found');
      res.sendFile(abs);
    } catch (e) { res.status(400).send(e.message); }
  });
  app.get('/api/qcode/preview/list', (_, res) => {
    try {
      const files = t.listQcodeFiles().filter(x => x.type === 'file' && /\.(html?|svg)$/i.test(x.path)).slice(0, 30);
      const previews = files.map(file => ({ name: file.name, path: file.path, kind: /\.svg$/i.test(file.path) ? 'static-svg' : 'static-html', url: '/api/qcode/preview/file?path=' + encodeURIComponent(file.path) }));
      if (!previews.length) previews.push({ name: 'index.html', path: 'index.html', kind: 'static-html', url: '/api/qcode/preview/file?path=index.html', missing: true });
      res.json({ ok: true, previews });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/qcode/sessions', (_, res) => {
    deps.ensureQcodeWorkspace();
    const sessions = deps.fs.readdirSync(deps.sessionsDir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(deps.fs.readFileSync(deps.path.join(deps.sessionsDir, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 50);
    res.json({ ok: true, sessions });
  });
  app.get('/api/qcode/sessions/load', (req, res) => {
    try {
      const file = t.qcodeSessionPath(req.query.id);
      if (!deps.fs.existsSync(file)) return res.status(404).json({ error: 'Session not found.' });
      res.json(JSON.parse(deps.fs.readFileSync(file, 'utf8')));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/qcode/sessions/save', (req, res) => {
    try {
      deps.ensureQcodeWorkspace();
      const id = String(req.body.id || Date.now()).replace(/[^\w.-]/g, '').slice(0, 80);
      const session = {
        id,
        title: String(req.body.title || 'Qcode session').slice(0, 120),
        messages: Array.isArray(req.body.messages) ? req.body.messages.slice(-80) : [],
        activity: Array.isArray(req.body.activity) ? req.body.activity.slice(0, 80) : [],
        commandLogs: Array.isArray(req.body.commandLogs) ? req.body.commandLogs.slice(0, 30).map(log => ({ ...log, lines: Array.isArray(log.lines) ? log.lines.slice(-1200) : [] })) : [],
        updatedAt: new Date().toISOString(),
        createdAt: req.body.createdAt || new Date().toISOString()
      };
      deps.fs.writeFileSync(t.qcodeSessionPath(id), JSON.stringify(session, null, 2));
      res.json({ ok: true, id });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/qcode/sessions/delete', (req, res) => {
    try { deps.fs.rmSync(t.qcodeSessionPath(req.body.id), { force: true }); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/qcode/diff', (req, res) => {
    try {
      const pathName = String(req.body.path || '');
      const find = String(req.body.find || '');
      const replace = String(req.body.replace || '');
      const content = t.readQcodeFileSafe(pathName, 200000);
      const found = find && content.includes(find);
      const preview = found ? content.replace(find, replace) : content;
      const unifiedDiff = typeof t.buildUnifiedDiff === 'function' ? t.buildUnifiedDiff(content, preview) : [];
      res.json({ ok: true, path: pathName, found, find, replace, before: content.slice(0, 80000), after: preview.slice(0, 80000), unifiedDiff });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/qcode/apply-edit', (req, res) => {
    try { res.json({ ok: true, result: t.editQcodeFileSafe(req.body.path, req.body.find, req.body.replace) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/qcode/snapshots', (_, res) => {
    try { res.json({ ok: true, snapshots: t.listQcodeSnapshots() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/qcode/snapshot/create', (req, res) => {
    try { res.json({ ok: true, snapshot: t.createQcodeSnapshot(req.body?.label || 'manual') }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/qcode/rollback', (req, res) => {
    try { res.json(t.rollbackQcodeSnapshot(req.body?.id)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/qcode/run', async (req, res) => {
    try { res.json({ ok: true, result: await t.runQcodeCommand(req.body?.command || '', Number(req.body?.timeoutMs || 30000)) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/qcode/project-map', (_, res) => {
    try { res.json({ ok: true, map: t.qcodeProjectMap() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/qcode/chat', (req, res) => deps.agent.handleChat(req, res));
}

module.exports = { registerQcodeRoutes };

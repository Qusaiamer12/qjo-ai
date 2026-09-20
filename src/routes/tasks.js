// HTTP surface for long tasks.
//
// Deliberately step-driven rather than fire-and-forget. The server does not
// promise to keep working in the background — on a free instance it cannot,
// since it sleeps when quiet and is replaced on deploy. Instead each POST
// /step does one bounded unit of work and returns the new state, and whoever
// cares about the task (the open tab today, a server-side driver on a paid
// plan later) keeps calling. The task is safe between calls either way.

function registerTaskRoutes(app, deps) {
  const { verifyFirebaseRequest, taskRunner, enforceDailyUsage } = deps;
  if (!verifyFirebaseRequest || !taskRunner) {
    throw new Error('registerTaskRoutes missing dependency: verifyFirebaseRequest or taskRunner');
  }

  const uidOf = (req) => req.user?.uid || null;

  // The full record is large — history, trace and every project file. Lists and
  // step responses send a summary so polling stays cheap; the files come back
  // only when they are asked for.
  function summarize(task) {
    if (!task) return null;
    return {
      id: task.id,
      goal: task.goal,
      kind: task.kind,
      status: task.status,
      step: task.step,
      maxSteps: taskRunner.maxSteps,
      plan: task.plan || [],
      lastMessage: task.lastMessage || '',
      result: task.result || null,
      error: task.error || null,
      files: Object.keys(task.workspace || {}),
      recentWork: (task.trace || []).slice(-8).map(t => ({ tool: t.tool, input: t.input })),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      finishedAt: task.finishedAt
    };
  }

  function fail(res, error) {
    const status = error?.statusCode || 500;
    if (status >= 500) console.error('[tasks] error:', error?.message || error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error.' : String(error?.message || 'Request failed.') });
  }

  app.post('/api/tasks', async (req, res) => {
    if (!(await verifyFirebaseRequest(req, res))) return;
    try {
      const { goal, kind, mode } = req.body || {};
      const task = await taskRunner.start({
        uid: uidOf(req),
        goal,
        kind: kind === 'code' ? 'code' : 'general',
        mode: mode === 'flash' ? 'flash' : 'max'
      });
      res.status(201).json({ task: summarize(task) });
    } catch (error) {
      fail(res, error);
    }
  });

  // One bounded unit of work. Slow by nature — a step runs a model call and
  // several tool calls — so clients should not race two of these at once.
  app.post('/api/tasks/:id/step', async (req, res) => {
    if (!(await verifyFirebaseRequest(req, res))) return;
    try {
      if (enforceDailyUsage) {
        const allowed = await enforceDailyUsage(req, res);
        if (!allowed) return;
      }
      const task = await taskRunner.step(req.params.id, { uid: uidOf(req) });
      res.json({ task: summarize(task) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    if (!(await verifyFirebaseRequest(req, res))) return;
    try {
      const task = await taskRunner.get(req.params.id, { uid: uidOf(req) });
      if (!task) return res.status(404).json({ error: 'No such task.' });
      res.json({ task: summarize(task) });
    } catch (error) {
      fail(res, error);
    }
  });

  // The project itself, asked for explicitly.
  app.get('/api/tasks/:id/files', async (req, res) => {
    if (!(await verifyFirebaseRequest(req, res))) return;
    try {
      const task = await taskRunner.get(req.params.id, { uid: uidOf(req) });
      if (!task) return res.status(404).json({ error: 'No such task.' });
      res.json({ files: task.workspace || {} });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/tasks/:id/cancel', async (req, res) => {
    if (!(await verifyFirebaseRequest(req, res))) return;
    try {
      const task = await taskRunner.cancel(req.params.id, { uid: uidOf(req) });
      res.json({ task: summarize(task) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/tasks', async (req, res) => {
    if (!(await verifyFirebaseRequest(req, res))) return;
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
      const tasks = await taskRunner.list({ uid: uidOf(req), limit });
      res.json({ tasks: tasks.map(summarize) });
    } catch (error) {
      fail(res, error);
    }
  });
}

module.exports = { registerTaskRoutes };

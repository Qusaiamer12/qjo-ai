function registerJobRoutes(app, deps) {
  if (!deps?.jobQueue) throw new Error('registerJobRoutes missing jobQueue');
  const verify = deps.verifyFirebaseRequest || (async () => true);

  app.post('/api/jobs', async (req, res) => {
    try {
      if (!(await verify(req, res))) return;
      const type = String(req.body.type || '').trim();
      const payload = req.body.payload || {};
      const job = deps.jobQueue.createJob(type, payload, { uid: req.user?.uid || null });
      res.json({ ok: true, job });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Could not create job.' });
    }
  });

  app.get('/api/jobs', async (req, res) => {
    try {
      if (!(await verify(req, res))) return;
      res.json({ ok: true, jobs: deps.jobQueue.listJobs({ limit: req.query.limit, type: req.query.type, status: req.query.status }) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || 'Could not list jobs.' });
    }
  });

  app.get('/api/jobs/:id', async (req, res) => {
    try {
      if (!(await verify(req, res))) return;
      const job = deps.jobQueue.getJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: 'Job not found.' });
      res.json({ ok: true, job });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || 'Could not get job.' });
    }
  });

  app.post('/api/jobs/:id/cancel', async (req, res) => {
    try {
      if (!(await verify(req, res))) return;
      const job = deps.jobQueue.cancelJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: 'Job not found.' });
      res.json({ ok: true, job });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message || 'Could not cancel job.' });
    }
  });

  app.post('/api/jobs/:id/retry', async (req, res) => {
    try {
      if (!(await verify(req, res))) return;
      const job = deps.jobQueue.retryJob(req.params.id);
      if (!job) return res.status(404).json({ ok: false, error: 'Job not found.' });
      res.json({ ok: true, job });
    } catch (error) {
      res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Could not retry job.' });
    }
  });

}

module.exports = { registerJobRoutes };

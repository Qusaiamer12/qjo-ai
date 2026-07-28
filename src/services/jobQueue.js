function createJobQueue({ maxJobs = 100 } = {}) {
  const jobs = new Map();
  const handlers = new Map();

  function now() { return new Date().toISOString(); }
  function makeId(type) { return `${type || 'job'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`; }

  function serialize(job) {
    if (!job) return null;
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.message,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt,
      cancelledAt: job.cancelledAt
    };
  }

  function trimJobs() {
    if (jobs.size <= maxJobs) return;
    const sorted = [...jobs.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const job of sorted.slice(0, Math.max(0, jobs.size - maxJobs))) jobs.delete(job.id);
  }

  function registerHandler(type, handler) {
    if (!type || typeof handler !== 'function') throw new Error('registerHandler requires type and handler');
    handlers.set(type, handler);
  }

  function updateJob(id, patch = {}) {
    const job = jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: now() });
    return serialize(job);
  }

  function createJob(type, payload = {}, meta = {}) {
    if (!handlers.has(type)) {
      const err = new Error(`Unsupported job type: ${type}`);
      err.statusCode = 400;
      throw err;
    }
    const id = makeId(type);
    const job = {
      id,
      type,
      payload,
      meta,
      status: 'queued',
      progress: 0,
      message: 'Queued',
      result: null,
      error: null,
      createdAt: now(),
      startedAt: null,
      updatedAt: now(),
      finishedAt: null,
      cancelledAt: null,
      cancelRequested: false
    };
    jobs.set(id, job);
    trimJobs();
    setTimeout(() => runJob(id), 0);
    return serialize(job);
  }

  async function runJob(id) {
    const job = jobs.get(id);
    if (!job || job.status !== 'queued') return;
    const handler = handlers.get(job.type);
    if (!handler) return updateJob(id, { status: 'failed', error: 'No handler registered.', finishedAt: now(), progress: 100 });

    updateJob(id, { status: 'running', startedAt: now(), message: 'Running', progress: Math.max(1, job.progress || 0) });
    const ctx = {
      jobId: id,
      isCancelled: () => Boolean(jobs.get(id)?.cancelRequested),
      update: (patch) => updateJob(id, patch),
      progress: (progress, message) => updateJob(id, { progress: Math.max(0, Math.min(100, Number(progress) || 0)), message: message || jobs.get(id)?.message || '' })
    };

    try {
      const result = await handler(job.payload, ctx);
      const latest = jobs.get(id);
      if (!latest) return;
      if (latest.cancelRequested) {
        updateJob(id, { status: 'cancelled', message: 'Cancelled', cancelledAt: now(), finishedAt: now() });
      } else {
        updateJob(id, { status: 'completed', result: result || null, message: 'Completed', progress: 100, finishedAt: now() });
      }
    } catch (error) {
      const latest = jobs.get(id);
      if (!latest) return;
      updateJob(id, { status: latest.cancelRequested ? 'cancelled' : 'failed', error: error.message || 'Job failed.', message: latest.cancelRequested ? 'Cancelled' : 'Failed', finishedAt: now(), cancelledAt: latest.cancelRequested ? now() : latest.cancelledAt });
    }
  }

  function getJob(id) { return serialize(jobs.get(id)); }
  function listJobs({ limit = 50, type = '', status = '' } = {}) {
    return [...jobs.values()]
      .filter(j => !type || j.type === type)
      .filter(j => !status || j.status === status)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, Math.min(Math.max(Number(limit) || 50, 1), 100))
      .map(serialize);
  }


  function retryJob(id) {
    const old = jobs.get(id);
    if (!old) return null;
    if (!handlers.has(old.type)) {
      const err = new Error(`Unsupported job type: ${old.type}`);
      err.statusCode = 400;
      throw err;
    }
    return createJob(old.type, old.payload || {}, { ...(old.meta || {}), retriedFrom: old.id });
  }

  function cancelJob(id) {
    const job = jobs.get(id);
    if (!job) return null;
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return serialize(job);
    job.cancelRequested = true;
    job.cancelledAt = now();
    job.message = 'Cancel requested';
    job.updatedAt = now();
    if (job.status === 'queued') job.status = 'cancelled';
    return serialize(job);
  }

  return { registerHandler, createJob, getJob, listJobs, cancelJob, retryJob, updateJob };
}

module.exports = { createJobQueue };

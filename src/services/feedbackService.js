const fs = require('fs');
const path = require('path');

// Hard ceiling for the JSONL log. /api/feedback is public and unauthenticated,
// so without a cap an attacker (or a stuck client loop) could fill the disk
// ~8KB at a time. On overflow we rotate to a single .1 backup and start fresh,
// so we keep recent data bounded at 2x MAX_FILE_BYTES instead of growing forever.
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function createFeedbackService({ filePath, maxFileBytes = MAX_FILE_BYTES }) {
  if (!filePath) throw new Error('createFeedbackService requires filePath');

  // readAll() parses the whole file on every admin call. Cache the parsed
  // result and invalidate on mtime/size change so the stats endpoint stops
  // re-reading megabytes per request.
  let cache = { key: '', items: [] };

  function ensureFile() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '');
  }

  function rotateIfNeeded() {
    try {
      const { size } = fs.statSync(filePath);
      if (size < maxFileBytes) return;
      fs.renameSync(filePath, `${filePath}.1`);
      fs.writeFileSync(filePath, '');
      cache = { key: '', items: [] };
    } catch (_) { /* rotation is best-effort; never break the request */ }
  }

  function addFeedback(entry) {
    ensureFile();
    rotateIfNeeded();
    const rating = entry.rating === 'up' ? 'up' : entry.rating === 'down' ? 'down' : null;
    if (!rating) throw new Error('rating must be "up" or "down"');
    const record = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      rating,
      question: String(entry.question || '').slice(0, 2000),
      answer: String(entry.answer || '').slice(0, 6000),
      mode: String(entry.mode || '').slice(0, 60),
      route: String(entry.route || '').slice(0, 60),
      createdAt: new Date().toISOString()
    };
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
    return record;
  }

  function readAll() {
    ensureFile();
    let key = '';
    try {
      const stat = fs.statSync(filePath);
      key = `${stat.size}:${stat.mtimeMs}`;
      if (key && key === cache.key) return cache.items;
    } catch (_) { /* fall through to an uncached read */ }
    const items = fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean);
    if (key) cache = { key, items };
    return items;
  }

  function listFeedback({ limit = 100, rating, mode, route } = {}) {
    let items = readAll().reverse();
    if (rating) items = items.filter(i => i.rating === rating);
    if (mode) items = items.filter(i => i.mode === mode);
    if (route) items = items.filter(i => i.route === route);
    return items.slice(0, Math.min(Math.max(1, Number(limit) || 100), 1000));
  }

  function feedbackStats() {
    const items = readAll();
    const total = items.length;
    const up = items.filter(i => i.rating === 'up').length;
    const down = total - up;
    const byMode = {};
    for (const item of items) {
      const key = item.mode || 'unknown';
      byMode[key] ||= { up: 0, down: 0 };
      byMode[key][item.rating] += 1;
    }
    const byRoute = {};
    for (const item of items) {
      const key = item.route || 'unknown';
      byRoute[key] ||= { up: 0, down: 0 };
      byRoute[key][item.rating] += 1;
    }
    return {
      total,
      up,
      down,
      satisfaction: total ? Math.round((up / total) * 100) : null,
      byMode,
      byRoute
    };
  }

  return { addFeedback, listFeedback, feedbackStats };
}

module.exports = { createFeedbackService };

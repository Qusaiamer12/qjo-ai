const fs = require('fs');
const path = require('path');

function createFeedbackService({ filePath }) {
  if (!filePath) throw new Error('createFeedbackService requires filePath');

  function ensureFile() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '');
  }

  function addFeedback(entry) {
    ensureFile();
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
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean);
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

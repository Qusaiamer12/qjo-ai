const fs = require('fs');
const path = require('path');

// Continuous-learning layer for Qcode: remembers recurring failure patterns
// across sessions (instincts) and keeps a session log for post-hoc review
// (checkpoint/eval harness). File-based, same pattern as feedbackService.
function createQcodeLearning({ dir }) {
  if (!dir) throw new Error('createQcodeLearning requires dir');
  const instinctsPath = path.join(dir, 'instincts.json');
  const sessionsPath = path.join(dir, 'sessions.jsonl');

  function ensureDir() { fs.mkdirSync(dir, { recursive: true }); }

  function loadInstincts() {
    ensureDir();
    if (!fs.existsSync(instinctsPath)) return {};
    try { return JSON.parse(fs.readFileSync(instinctsPath, 'utf8')); } catch (_) { return {}; }
  }

  function saveInstincts(obj) {
    ensureDir();
    fs.writeFileSync(instinctsPath, JSON.stringify(obj, null, 2));
  }

  // Strips volatile bits (numbers, hashes, quoted strings) so the same class
  // of error groups together instead of every failure being "unique".
  function normalizePattern(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[0-9a-f]{6,}/g, '<hash>')
      .replace(/\d+/g, '<n>')
      .replace(/['"][^'"]{0,80}['"]/g, '<str>')
      .replace(/\s+/g, ' ')
      .slice(0, 160)
      .trim();
  }

  function recordFailure(category, detail) {
    if (!detail) return null;
    const instincts = loadInstincts();
    const pattern = normalizePattern(detail);
    const key = `${category}:${pattern}`;
    const entry = instincts[key] || {
      category,
      pattern,
      count: 0,
      firstSeen: new Date().toISOString(),
      example: String(detail).slice(0, 300)
    };
    entry.count += 1;
    entry.lastSeen = new Date().toISOString();
    instincts[key] = entry;
    saveInstincts(instincts);
    return entry;
  }

  // Only surfaces patterns seen more than once — a single one-off failure
  // isn't an "instinct" yet, it's noise.
  function getTopInstincts(limit = 5, minCount = 2) {
    const instincts = loadInstincts();
    return Object.values(instincts)
      .filter(e => e.count >= minCount)
      .sort((a, b) => b.count - a.count || new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, limit);
  }

  function recordSession(entry) {
    ensureDir();
    const record = { ...entry, at: new Date().toISOString() };
    fs.appendFileSync(sessionsPath, `${JSON.stringify(record)}\n`);
    return record;
  }

  function recentSessions(limit = 20) {
    ensureDir();
    if (!fs.existsSync(sessionsPath)) return [];
    return fs.readFileSync(sessionsPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean)
      .slice(-limit)
      .reverse();
  }

  function sessionStats() {
    const sessions = recentSessions(500);
    const total = sessions.length;
    const verified = sessions.filter(s => s.verificationOk === true).length;
    const verificationFailed = sessions.filter(s => s.verificationOk === false).length;
    const errored = sessions.filter(s => s.error).length;
    return { total, verified, verificationFailed, errored };
  }

  return { recordFailure, getTopInstincts, recordSession, recentSessions, sessionStats };
}

module.exports = { createQcodeLearning };

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Qjo Knowledge Base (Q-KB v1) service
//
// Purpose: retrieve curated Arabic task-craft guidance (from
// knowledge/qkb-v1.json) that matches the user's message, and expose it as a
// compact system-prompt block so chat answers keep Qjo's house standard even
// on small fallback models.
//
// Storage modes (auto-selected):
//   qdrant  — when QDRANT_URL + QDRANT_API_KEY are set and the collection
//             exists (populate it with `npm run kb:sync`).
//   memory  — zero-setup fallback: embeds all entries once per process and
//             scores with cosine similarity. Used automatically when Qdrant is
//             not configured, unreachable, or its collection is missing.
//
// Safety properties:
//   - lookup() NEVER throws: any failure (embeddings offline, Qdrant down,
//     timeout) returns { found: false } and the chat proceeds without KB.
//   - chitchat guard skips retrieval for greetings/tiny messages.
//   - size caps: topK hits, per-entry and total character budgets.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const DEFAULT_KB_DIR = path.join(__dirname, '..', '..', 'knowledge');
// Token-based greeting detection (regex \b boundaries don't work with Arabic
// letters in JS — \w is ASCII-only — so longer Arabic greetings slipped past
// the old pattern).
const CHITCHAT_GREETINGS = new Set([
  'كيفك', 'كيف حالك', 'كيفكو', 'هلا', 'هلا والله', 'مرحبا', 'مرحبتين', 'السلام عليكم',
  'سلام', 'صباح الخير', 'مساء الخير', 'مساء الخيرات', 'شكرا', 'شكراً', 'مشكور', 'يسعد صباحك',
  'hello', 'hi', 'hey', 'yo', 'sup', 'thanks', 'thank you', 'good morning', 'good evening', 'howdy'
]);

function isGreetingMessage(text) {
  const tokens = String(text || '').trim().toLowerCase().replace(/[!.،,؟?]+$/g, '').split(/\s+/);
  for (let take = Math.min(3, tokens.length); take >= 1; take--) {
    if (CHITCHAT_GREETINGS.has(tokens.slice(0, take).join(' '))) return true;
  }
  return false;
}

// Latin vs Arabic letter counts — decides the injected KB block language note.
function isEnglishText(text) {
  const value = String(text || '');
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  return latin > arabic;
}

// Loads every qkb-*.json file in the directory and merges the entries.
// Files declare "layer": "taskcraft" (guidance + example) or "facts"
// (reference answer). Entry ids are namespaced t:/f: to avoid cross-file
// collisions, and duplicates are skipped with a warning.
function loadKnowledgeDirectory(dir) {
  const files = fs.readdirSync(dir).filter(f => /^qkb-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`No qkb-*.json knowledge files in ${dir}`);
  const entries = [];
  const versions = [];
  const seen = new Set();
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const layer = raw.layer === 'facts' ? 'facts' : 'taskcraft';
    if (raw.version) versions.push(`${file}:${raw.version}`);
    for (const e of raw.entries || []) {
      if (!e || !e.id || !e.domain || !Array.isArray(e.triggers) || e.triggers.length < 2) continue;
      if (layer === 'facts' ? !e.answer : !e.guidance) continue;
      const id = e.id.includes(':') ? e.id : `${layer === 'facts' ? 'f' : 't'}:${e.id}`;
      if (seen.has(id)) {
        console.warn(`[knowledgeBase] duplicate entry id skipped: ${id} (${file})`);
        continue;
      }
      seen.add(id);
      entries.push({ ...e, id, layer });
    }
  }
  if (!entries.length) throw new Error('No valid knowledge entries loaded.');
  return { version: versions.join(' + '), entries };
}

// Back-compat single-file loader (used by kb-sync --file style checks/tests).
function loadKnowledgeEntries(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const layer = raw.layer === 'facts' ? 'facts' : 'taskcraft';
  const valid = (raw.entries || []).filter(e => e && e.id && e.domain && Array.isArray(e.triggers) && e.triggers.length && (layer === 'facts' ? e.answer : e.guidance));
  if (!valid.length) throw new Error(`Knowledge file has no valid entries: ${filePath}`);
  return { version: raw.version || 'unknown', layer, entries: valid.map(e => ({ ...e, layer })) };
}

function entryEmbedText(entry) {
  // Embed the matching signal (domain + triggers + keywords), not the
  // guidance — retrieval quality depends on intent phrasing.
  return [entry.domain, (entry.triggers || []).join('. '), (entry.keywords || []).join(', ')]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 1200);
}

function entryPayload(entry) {
  if (entry.layer === 'facts') {
    return {
      id: entry.id,
      domain: entry.domain,
      answer: String(entry.answer || '').slice(0, 700)
    };
  }
  return {
    id: entry.id,
    domain: entry.domain,
    guidance: String(entry.guidance || '').slice(0, 900),
    example: String(entry.example || '').slice(0, 900)
  };
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function createKnowledgeBaseService(config = {}) {
  const deps = config || {};
  if (!deps.embeddingsService || typeof deps.embeddingsService.callEmbeddingProvider !== 'function') {
    throw new Error('createKnowledgeBaseService requires embeddingsService.');
  }

  const enabled = deps.enabled !== false;
  const knowledgeDir = deps.knowledgeDir || DEFAULT_KB_DIR;
  const vectorCachePath = deps.vectorCachePath || path.join(knowledgeDir, '.vector-cache.json');
  const collection = deps.collection || 'qjo_kb_v1';
  const threshold = Number.isFinite(deps.threshold) ? deps.threshold : 0.42;
  const topK = Math.max(1, Math.min(Number(deps.topK || 2), 3));
  const maxBlockChars = Math.max(400, Number(deps.maxBlockChars || 1200));
  const timeoutMs = Math.max(500, Number(deps.timeoutMs || 2500));

  const state = {
    mode: 'disabled', // 'qdrant' | 'memory' | 'disabled' | 'warming'
    version: 'unknown',
    entryCount: 0,
    ready: false,
    lastError: ''
  };

  let qdrantClient = null;
  let memoryVectors = []; // parallel to entries
  let entries = [];

  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(null), timeoutMs))
    ]);
  }

  async function embedTexts(texts, roles) {
    const result = await deps.embeddingsService.callEmbeddingProvider(texts, roles ? { roles } : {});
    return result && Array.isArray(result.vectors) ? result.vectors : null;
  }

  function readVectorCache() {
    // Persistent embedding cache: at thousands of entries, re-embedding the
    // whole KB at every boot is slow and hammers the free tier. The cache is
    // keyed by the combined KB version string and invalidated automatically.
    try {
      const raw = JSON.parse(fs.readFileSync(vectorCachePath, 'utf8'));
      if (raw && raw.version === state.version && Array.isArray(raw.vectors)
          && raw.vectors.length === entries.length
          && raw.vectors.every(v => Array.isArray(v) && v.length >= 64 && v.every(Number.isFinite))) {
        return raw.vectors;
      }
    } catch {
      /* no cache yet — rebuild below */
    }
    return null;
  }

  function writeVectorCache(vectors) {
    try {
      fs.writeFileSync(vectorCachePath, JSON.stringify({ version: state.version, savedAt: Date.now(), vectors }));
    } catch (error) {
      console.warn('[knowledgeBase] vector cache write failed (non-fatal):', error?.message || error);
    }
  }

  async function buildMemoryIndex() {
    const cached = readVectorCache();
    if (cached) {
      memoryVectors = cached;
      state.mode = 'memory';
      state.ready = true;
      return;
    }
    const texts = entries.map(entryEmbedText);
    const vectors = [];
    const batchSize = 24;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const part = await embedTexts(batch, batch.map(() => 'passage'));
      if (!part || part.length !== batch.length) throw new Error('KB memory index embedding failed.');
      vectors.push(...part);
    }
    memoryVectors = vectors;
    writeVectorCache(vectors);
    state.mode = 'memory';
    state.ready = true;
    if (entries.length > 1500) {
      console.warn(`[knowledgeBase] ${entries.length} entries in in-memory mode — configure Qdrant (QDRANT_URL + npm run kb:sync) for lower RAM and instant boot.`);
    }
  }

  async function initQdrant() {
    let QdrantClient;
    try {
      // Lazy require so the dependency is only needed when Qdrant is used.
      ({ QdrantClient } = require('@qdrant/js-client-rest'));
    } catch {
      throw new Error('@qdrant/js-client-rest is not installed.');
    }
    qdrantClient = new QdrantClient({ url: deps.qdrantUrl, apiKey: deps.qdrantApiKey });
    try {
      const info = await qdrantClient.getCollection(collection);
      if (!info || !info.points_count) throw new Error(`collection "${collection}" is empty — run npm run kb:sync`);
      state.mode = 'qdrant';
      state.ready = true;
    } catch (error) {
      qdrantClient = null;
      throw error;
    }
  }

  async function init() {
    if (!enabled) {
      state.mode = 'disabled';
      return state;
    }
    try {
      const loaded = loadKnowledgeDirectory(knowledgeDir);
      entries = loaded.entries;
      state.version = loaded.version;
      state.entryCount = entries.length;

      if (deps.qdrantUrl) {
        try {
          await initQdrant();
          return state;
        } catch (error) {
          state.lastError = `Qdrant unavailable (${error.message}) — falling back to in-memory KB.`;
          console.warn(`[knowledgeBase] ${state.lastError}`);
        }
      }

      state.mode = 'warming';
      try {
        await buildMemoryIndex();
      } catch (error) {
        state.mode = 'lexical';
        state.ready = true;
        state.lastError = `Embeddings offline (${error.message}) — operating in instant lexical KB mode.`;
        console.warn(`[knowledgeBase] ${state.lastError}`);
      }
    } catch (error) {
      state.mode = 'disabled';
      state.lastError = `KB init failed: ${error.message}`;
      console.warn(`[knowledgeBase] ${state.lastError}`);
    }
    return state;
  }

  function normalizeText(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\.,\/#!$%\^&\*;:{}=\-_`~()؟?،!]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isChitchat(query) {
    const text = String(query || '').trim();
    if (text.length < 3) return true;
    if (text.length < 40 && isGreetingMessage(text)) return true;
    return false;
  }

  function searchLexical(query) {
    const normQ = normalizeText(query);
    const qTokens = normQ.split(' ').filter(t => t.length > 1);
    if (!qTokens.length) return [];

    const scored = [];
    for (const entry of entries) {
      let score = 0;
      const normTriggers = (entry.triggers || []).map(normalizeText);
      const normKeywords = (entry.keywords || []).map(normalizeText);

      // 1. Exact trigger match or phrase inclusion
      for (const tr of normTriggers) {
        if (!tr) continue;
        if (normQ.includes(tr) || tr.includes(normQ)) {
          score = Math.max(score, 0.90);
        } else {
          const trTokens = tr.split(' ').filter(t => t.length > 1);
          const overlap = trTokens.filter(t => normQ.includes(t)).length;
          if (overlap >= 2 && overlap >= trTokens.length * 0.5) {
            score = Math.max(score, 0.60 + 0.25 * (overlap / trTokens.length));
          }
        }
      }

      // 2. Keyword overlap
      let kwHits = 0;
      for (const kw of normKeywords) {
        if (kw && normQ.includes(kw)) kwHits++;
      }
      if (kwHits > 0) {
        const kwScore = Math.min(0.60, kwHits * 0.20);
        score = Math.max(score, kwScore);
      }

      if (score >= 0.40) {
        scored.push({ score, entry });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async function searchQdrant(queryVector) {
    const response = await qdrantClient.query(collection, {
      query: queryVector,
      limit: topK,
      with_payload: true
    });
    const hits = (response?.points || [])
      .filter(p => p && p.payload && typeof p.score === 'number' && p.score >= threshold)
      .map(p => ({ score: p.score, entry: p.payload }))
      .slice(0, topK);
    return hits;
  }

  async function searchMemory(queryVector) {
    return entries
      .map((entry, i) => ({ score: cosine(queryVector, memoryVectors[i] || []), entry }))
      .filter(hit => hit.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  function buildSystemBlock(hits, query) {
    // Bilingual (Q-KB v1.1): guidance is authored in Arabic (Qjo is
    // Arabic-first). When the user writes English, add an explicit note so the
    // model applies the standard but still ANSWERS IN ENGLISH.
    const english = isEnglishText(query);
    const header = english
      ? `Curated house-standard guidance for this task type (authored in Arabic — apply its structure and standards, but answer in the user's language: English). Follow it only if relevant to the question, and never override the user's explicit request:`
      : `إرشادات تحريرية — اتبعها فقط إن كانت ذات صلة بالسؤال ولا تتجاوز طلب المستخدم:`;
    const parts = [];
    let total = 0;
    for (const hit of hits) {
      const payload = entryPayload(hit.entry);
      const factsHeader = english
        ? 'Verified reference fact (authored in Arabic — answer in the user\'s language: English). Use it only if relevant:'
        : 'معلومة مرجعية موثوقة — استخدمها إن كانت ذات صلة بالسؤال:';
      const body = hit.entry.layer === 'facts'
        ? `${factsHeader}\n${payload.answer}`
        : `${header}\n${payload.guidance}\nمثال مرجعي مكثف:\n${payload.example}`;
      const section = `### ${payload.domain} / ${payload.id} (تطابق ${Number(hit.score).toFixed(2)})\n${body}`;
      if (total + section.length > maxBlockChars) break;
      parts.push(section);
      total += section.length;
    }
    if (!parts.length) return '';
    return `<qjo_knowledge_base version="${state.version}">\n${parts.join('\n\n')}\n</qjo_knowledge_base>`;
  }

  async function lookup(query) {
    if (!enabled || state.mode === 'disabled') return { found: false, reason: 'disabled' };
    const text = String(query || '').trim();
    if (!text || isChitchat(text)) return { found: false, reason: 'chitchat' };
    if (state.mode === 'warming' || !state.ready) return { found: false, reason: 'warming' };

    let hits = [];
    if (state.mode === 'qdrant' || state.mode === 'memory') {
      try {
        const queryVectors = await withTimeout(embedTexts([text], ['query']));
        const queryVector = queryVectors && queryVectors[0];
        if (queryVector && queryVector.length) {
          hits = (await withTimeout(state.mode === 'qdrant' ? searchQdrant(queryVector) : searchMemory(queryVector))) || [];
        }
      } catch (_) {
        /* proceed to lexical fallback */
      }
    }

    // Fast, deterministic lexical fallback when vector matching yields no hits or embeddings offline
    if (!hits || !hits.length) {
      hits = searchLexical(text);
    }

    if (!hits || !hits.length) return { found: false, reason: 'below-threshold' };

    const block = buildSystemBlock(hits, text);
    if (!block) return { found: false, reason: 'size-caps' };
    return { found: true, block, mode: state.mode, hits: hits.map(h => ({ id: h.entry.id, domain: h.entry.domain, score: Number(h.score.toFixed(3)) })) };
  }

  function stats() {
    return {
      enabled,
      mode: state.mode,
      version: state.version,
      entryCount: state.entryCount,
      collection,
      threshold,
      topK,
      lastError: state.lastError
    };
  }

  function getEntries() {
    return entries.slice();
  }

  return { init, lookup, stats, getEntries };
}

module.exports = { createKnowledgeBaseService, loadKnowledgeDirectory, loadKnowledgeEntries, entryEmbedText, entryPayload };

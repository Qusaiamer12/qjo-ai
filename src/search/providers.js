// Search providers, and an honest account of how each one is doing.
//
// Search in production went quiet with nothing to show why: every provider
// failure was caught and discarded, and when all of them failed a key-free
// fallback returned a made-up result — "No instant answer was returned. Use
// the linked search page for manual verification." — which counted as
// success, was cached for ten minutes, and was faithfully relayed by the
// model as "I couldn't find it, check FotMob". So:
//
//   - requests carry only parameters the providers document, and a request a
//     provider rejects as malformed (400/422) is retried once in its minimal
//     form, so an API that changed under us degrades instead of dying;
//   - every failure is recorded and logged (once a minute per provider);
//   - a provider that failed on credentials or quota rests for a while
//     instead of being asked again on every query;
//   - when the keyed providers cannot answer, key-free sources that work from
//     a server — Google News RSS for anything current, Wikipedia for facts,
//     DuckDuckGo — run side by side;
//   - nothing is ever invented. No results is an empty list.
'use strict';

const DEFAULT_ENDPOINTS = {
  tavily: 'https://api.tavily.com/search',
  serper: 'https://google.serper.dev/search',
  googleNews: 'https://news.google.com/rss/search',
  wikipedia: 'https://{lang}.wikipedia.org/w/api.php',
  ddgHtml: 'https://html.duckduckgo.com/html/'
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const JUNK_DOMAINS = ['facebook.com', 'instagram.com', 'tiktok.com', 'threads.net', 'pinterest.com'];

class ProviderError extends Error {
  constructor(provider, status, message) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
  }
}

const isArabicQuery = (q) => /[؀-ۿ]/.test(String(q || ''));

function decodeEntities(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    // Numeric references in any form — Wikipedia writes &#039;, others &#39; or &#x27;.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

function stripHtml(text) {
  return decodeEntities(String(text || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Health ───────────────────────────────────────────────────────────────────

const AUTH_REST_MS = 30 * 60 * 1000;
const QUOTA_REST_MS = 10 * 60 * 1000;
const LOG_EVERY_MS = 60 * 1000;

/** Why a failure happened, in terms of what to do next. */
function classifyFailure(status, message) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402 || status === 429 || status === 432 || status === 433 || /credit|quota|usage limit|plan limit|exceeded/i.test(message)) return 'quota';
  return 'transient';
}

function createProviderHealth({ now = () => Date.now(), log = (line) => console.warn(line) } = {}) {
  const state = new Map();
  const entry = (name) => {
    if (!state.has(name)) state.set(name, { ok: 0, failed: 0, lastOkAt: null, lastError: null, restUntil: 0, lastLoggedAt: 0 });
    return state.get(name);
  };

  return {
    ok(name) {
      const e = entry(name);
      e.ok++;
      e.lastOkAt = new Date(now()).toISOString();
      e.restUntil = 0;
    },
    failed(name, error) {
      const e = entry(name);
      const status = Number(error?.status) || 0;
      const message = String(error?.message || error || 'failed').replace(/\s+/g, ' ').slice(0, 160);
      const kind = classifyFailure(status, message);
      e.failed++;
      e.lastError = { status, kind, message, at: new Date(now()).toISOString() };
      if (kind === 'auth') e.restUntil = now() + AUTH_REST_MS;
      if (kind === 'quota') e.restUntil = now() + QUOTA_REST_MS;
      if (now() - e.lastLoggedAt >= LOG_EVERY_MS) {
        e.lastLoggedAt = now();
        const rest = e.restUntil > now() ? ` Resting ${Math.round((e.restUntil - now()) / 60000)} min.` : '';
        log(`[search] ${name} failed (${status || 'network'}, ${kind}): ${message}.${rest}`);
      }
    },
    resting(name) {
      return entry(name).restUntil > now();
    },
    /** For /api/status. No keys, no queries — status codes and provider messages only. */
    snapshot() {
      const out = {};
      for (const [name, e] of state) {
        out[name] = {
          healthy: !e.lastError || (e.lastOkAt && e.lastOkAt > e.lastError.at),
          resting: e.restUntil > now(),
          ok: e.ok,
          failed: e.failed,
          lastOkAt: e.lastOkAt,
          lastError: e.lastError
        };
      }
      return out;
    }
  };
}

// ── Transport ────────────────────────────────────────────────────────────────

/**
 * One request under one timer that covers the body as well as the headers.
 * Clearing the timer at the headers is how a slow body used to go untimed.
 */
async function request(fetchImpl, provider, url, options, timeoutMs, parse) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const res = await fetchImpl(url, { ...options, signal: controller.signal });
    const body = await (parse === 'json' ? res.json().catch(() => null) : res.text());
    if (!res.ok) {
      const detail = parse === 'json'
        ? (body?.detail?.error || body?.detail || body?.error || body?.message || '')
        : String(body || '').slice(0, 120);
      throw new ProviderError(provider, res.status, `HTTP ${res.status}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
    }
    return { status: res.status, body };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timedOut = error?.name === 'AbortError';
    throw new ProviderError(provider, 0, timedOut ? `no complete response within ${Math.round(timeoutMs / 1000)}s` : (error?.message || 'network error'));
  } finally {
    clearTimeout(timer);
  }
}

// ── Providers ────────────────────────────────────────────────────────────────

/**
 * @param {object} [options]
 * @param {string | (() => string)} [options.tavilyApiKey]
 * @param {string | (() => string)} [options.serperApiKey]
 * @param {Partial<typeof DEFAULT_ENDPOINTS>} [options.endpoints] Overrides, for tests.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {ReturnType<typeof createProviderHealth>} [options.health]
 */
function createSearchProviders({ tavilyApiKey, serperApiKey, endpoints = {}, fetchImpl = fetch, health = createProviderHealth() } = {}) {
  const url = { ...DEFAULT_ENDPOINTS, ...endpoints };
  const tavilyKey = () => String(typeof tavilyApiKey === 'function' ? tavilyApiKey() : tavilyApiKey || '').trim();
  const serperKey = () => String(typeof serperApiKey === 'function' ? serperApiKey() : serperApiKey || '').trim();

  async function tavily(query, { maxResults = 5, depth = 'basic', mode = 'general', timeoutMs = 6000 } = {}) {
    const advanced = depth === 'advanced';
    // Documented parameters only. `country` used to be sent here as 'jo' on
    // every query; whatever Tavily makes of that, a request that only uses
    // what is documented cannot be rejected for it.
    const full = {
      query,
      search_depth: advanced ? 'advanced' : 'basic',
      max_results: maxResults,
      include_answer: true,
      include_raw_content: advanced,
      exclude_domains: JUNK_DOMAINS,
      topic: mode === 'news' ? 'news' : 'general'
    };
    if (mode === 'news') full.days = advanced ? 30 : 7;
    const minimal = { query, search_depth: 'basic', max_results: maxResults, include_answer: true };
    const send = (body) => request(fetchImpl, 'tavily', url.tavily, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tavilyKey()}` },
      body: JSON.stringify(body)
    }, timeoutMs, 'json');

    let res;
    try {
      res = await send(full);
    } catch (error) {
      // Rejected as malformed: the API changed under us. Degrade, don't die.
      if (!(error instanceof ProviderError) || (error.status !== 400 && error.status !== 422)) throw error;
      health.failed('tavily', error);
      res = await send(minimal);
    }
    const data = res.body || {};
    return (data.results || [])
      .filter((r) => !JUNK_DOMAINS.some((d) => String(r.url || '').toLowerCase().includes(d)))
      .map((r) => ({
        title: String(r.title || '').slice(0, 180),
        url: String(r.url || '').slice(0, 700),
        content: String(r.content || '').slice(0, advanced ? 1800 : 1200),
        rawContent: String(r.raw_content || '').slice(0, advanced ? 3000 : 0),
        publishedDate: String(r.published_date || r.publishedDate || '').slice(0, 40),
        score: Number(r.score || 0),
        query,
        provider: 'tavily',
        providerAnswer: data.answer ? String(data.answer).slice(0, 1200) : ''
      }));
  }

  async function serper(query, { maxResults = 5, mode = 'general', timeoutMs = 5000 } = {}) {
    const arabic = isArabicQuery(query);
    const body = { q: query, num: Math.min(Math.max(maxResults, 1), 10), hl: arabic ? 'ar' : 'en' };
    // Arabic queries are Jordan-first, as the Arabic side of the product is;
    // English ones are not pinned to a country.
    if (arabic) body.gl = 'jo';
    if (mode === 'news') body.tbs = 'qdr:w';
    else if (mode === 'pricing' || mode === 'market') body.tbs = 'qdr:m';
    const res = await request(fetchImpl, 'serper', url.serper, {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, timeoutMs, 'json');
    const data = res.body || {};
    const answer = String(
      data.answerBox?.answer || data.answerBox?.snippet ||
      (Array.isArray(data.answerBox?.snippetHighlighted) ? data.answerBox.snippetHighlighted.join(' ') : '') || ''
    ).slice(0, 1200);
    return (data.organic || []).map((r, i) => ({
      title: String(r.title || '').slice(0, 180),
      url: String(r.link || '').slice(0, 700),
      content: String(r.snippet || '').slice(0, 1200),
      publishedDate: String(r.date || '').slice(0, 40),
      score: Math.max(0.05, 0.85 - i * 0.05),
      query,
      provider: 'serper',
      providerAnswer: answer
    })).filter((r) => r.url);
  }

  // Google News RSS: key-free, served to servers, and dated — the strongest
  // fallback for anything that changes (fixtures, results, prices, news).
  async function googleNews(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const arabic = isArabicQuery(query);
    const params = new URLSearchParams({
      q: query,
      hl: arabic ? 'ar' : 'en-US',
      gl: arabic ? 'JO' : 'US',
      ceid: arabic ? 'JO:ar' : 'US:en'
    });
    const res = await request(fetchImpl, 'google-news', `${url.googleNews}?${params}`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml, application/xml, text/xml' }
    }, timeoutMs, 'text');
    const items = String(res.body || '').match(/<item>[\s\S]*?<\/item>/g) || [];
    return items.slice(0, maxResults).map((item, i) => {
      const pick = (tag) => (item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || '';
      const source = stripHtml(pick('source'));
      const pub = Date.parse(decodeEntities(pick('pubDate')));
      return {
        title: stripHtml(pick('title')).slice(0, 180),
        url: decodeEntities(pick('link')).trim().slice(0, 700),
        content: [source, stripHtml(pick('description'))].filter(Boolean).join(' — ').slice(0, 900),
        publishedDate: Number.isFinite(pub) ? new Date(pub).toISOString() : '',
        score: Math.max(0.2, 0.6 - i * 0.04),
        query,
        provider: 'google-news'
      };
    }).filter((r) => r.title && /^https?:\/\//i.test(r.url));
  }

  // Wikipedia's search API: key-free and dependable for people, clubs,
  // places, definitions — the evergreen half of most questions.
  async function wikipedia(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const lang = isArabicQuery(query) ? 'ar' : 'en';
    const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, format: 'json', srlimit: String(Math.min(maxResults, 5)), utf8: '1' });
    const res = await request(fetchImpl, 'wikipedia', `${url.wikipedia.replace('{lang}', lang)}?${params}`, {
      headers: { 'User-Agent': 'QjoAI/1.0 (+https://github.com/Qusaiamer12/qjo-ai)', Accept: 'application/json' }
    }, timeoutMs, 'json');
    return ((res.body && res.body.query && res.body.query.search) || []).map((r, i) => ({
      title: String(r.title || '').slice(0, 180),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(r.title || '').replace(/ /g, '_'))}`,
      content: stripHtml(r.snippet).slice(0, 900),
      publishedDate: String(r.timestamp || '').slice(0, 40),
      score: Math.max(0.15, 0.5 - i * 0.05),
      query,
      provider: 'wikipedia'
    })).filter((r) => r.title);
  }

  async function duckDuckGo(query, { maxResults = 5, timeoutMs = 5000 } = {}) {
    const res = await request(fetchImpl, 'duckduckgo', `${url.ddgHtml}?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' }
    }, timeoutMs, 'text');
    const html = String(res.body || '');
    const blocks = html.match(/<div class="result results_links[^"]*"[\s\S]*?(?=<div class="result results_links|<div id="links" class="results_links_end|$)/g) || [];
    // A 200 with no result blocks is DuckDuckGo refusing a server, not an
    // empty web. Say so, so it shows up as a failure rather than "nothing".
    if (!blocks.length && /anomaly|captcha|challenge|unusual traffic/i.test(html)) {
      throw new ProviderError('duckduckgo', res.status, 'blocked this server (challenge page)');
    }
    const results = [];
    for (const block of blocks) {
      const link = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!link) continue;
      let href = decodeEntities(link[1]);
      const wrapped = href.match(/uddg=([^&]+)/);
      if (wrapped) { try { href = decodeURIComponent(wrapped[1]); } catch (_) { /* keep as is */ } }
      if (href.startsWith('//')) href = 'https:' + href;
      const title = stripHtml(link[2]).slice(0, 180);
      if (!title || !/^https?:\/\//i.test(href)) continue;
      const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
      results.push({ title, url: href.slice(0, 700), content: snippet ? stripHtml(snippet[1]).slice(0, 900) : '', score: Math.max(0.2, 0.6 - results.length * 0.05), query, provider: 'duckduckgo' });
      if (results.length >= maxResults) break;
    }
    return results;
  }

  const keyed = () => [
    tavilyKey() ? ['tavily', tavily] : null,
    serperKey() ? ['serper', serper] : null
  ].filter(Boolean);
  const keyless = [['google-news', googleNews], ['wikipedia', wikipedia], ['duckduckgo', duckDuckGo]];

  /** Runs one provider, recording the outcome. Returns results, or null when it failed. */
  async function attempt(name, fn, query, options, attempts) {
    if (health.resting(name)) {
      attempts.push({ provider: name, skipped: 'resting' });
      return null;
    }
    try {
      const results = await fn(query, options);
      health.ok(name);
      attempts.push({ provider: name, ok: true, count: results.length });
      return results;
    } catch (error) {
      health.failed(name, error);
      attempts.push({ provider: name, ok: false, status: error?.status || 0, error: String(error?.message || error).slice(0, 160) });
      return null;
    }
  }

  // Time kept back for the key-free tier, so a keyed provider that stalls
  // cannot spend the whole budget before the fallbacks get a turn.
  const KEYLESS_RESERVE_MS = 4000;

  /**
   * One query through the providers: keyed ones in turn until one has
   * results, then — if none did — the key-free ones side by side.
   * @returns {Promise<{results: Array<object>, attempts: Array<object>}>}
   */
  async function search(query, { maxResults = 5, depth = 'basic', mode = 'general', deadlineMs = 0 } = {}) {
    const attempts = [];
    const left = () => (deadlineMs ? deadlineMs - Date.now() : 15000);

    for (const [name, fn] of keyed()) {
      const budget = Math.min(depth === 'advanced' ? 12000 : 6000, left() - KEYLESS_RESERVE_MS);
      if (budget < 800) { attempts.push({ provider: name, skipped: 'no time' }); continue; }
      const results = await attempt(name, fn, query, { maxResults, depth, mode, timeoutMs: budget }, attempts);
      if (results && results.length) return { results, attempts };
    }

    const budget = Math.min(5000, left() - 250);
    if (budget < 500) return { results: [], attempts };
    const settled = await Promise.all(keyless.map(([name, fn]) => attempt(name, fn, query, { maxResults, mode, timeoutMs: budget }, attempts)));
    const seen = new Set();
    const merged = [];
    for (const results of settled) {
      for (const r of results || []) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        merged.push(r);
      }
    }
    return { results: merged, attempts };
  }

  function activeProviderName() {
    if (tavilyKey()) return 'tavily';
    if (serperKey()) return 'serper';
    return 'key-free';
  }

  return { search, health, activeProviderName, tavily, serper, googleNews, wikipedia, duckDuckGo };
}

/**
 * Whether a set of attempts means search is down, as opposed to the web
 * having nothing: down when no provider answered at all.
 */
function searchWasUnavailable(attempts) {
  const tried = attempts.filter((a) => !a.skipped);
  return tried.length === 0 || tried.every((a) => a.ok === false);
}

module.exports = { createSearchProviders, createProviderHealth, classifyFailure, searchWasUnavailable, ProviderError, DEFAULT_ENDPOINTS };

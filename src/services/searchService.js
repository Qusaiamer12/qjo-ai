const {
  distillSearchQueryServer,
  buildSearchBeastPlan,
  rankSearchBeastResults
} = require('../search/searchCore');
const { validateSearchQueries } = require('../tools/searchTool');
const { createSearchProviders, searchWasUnavailable } = require('../search/providers');

function requireDeps(deps) {
  const required = ['stableCacheKey', 'cacheGet', 'cacheSet', 'memoryCaches'];
  for (const key of required) {
    if (deps[key] === undefined || deps[key] === null) throw new Error(`createSearchService missing dependency: ${key}`);
  }
}

function createSearchService(deps) {
  requireDeps(deps);
  const tavilyApiKey = () => String(deps.tavilyApiKey || '').trim();
  const firecrawlApiKey = () => String(deps.firecrawlApiKey || '').trim();
  const serperApiKey = () => String(deps.serperApiKey || '').trim();

  // Providers, their health and the key-free fallbacks live in
  // src/search/providers.js. Endpoints are injectable so tests can stand up
  // fake providers over real HTTP.
  const providers = createSearchProviders({
    tavilyApiKey,
    serperApiKey,
    endpoints: deps.searchEndpoints,
    fetchImpl: deps.fetchImpl
  });

  /** One query through every provider; results only (kept for callers). */
  async function searchProvider(query, maxResults = 5, depth = 'basic', mode = 'general', deadlineMs = 0) {
    const { results } = await providers.search(query, { maxResults, depth, mode, deadlineMs });
    return results;
  }

  const activeProviderName = () => providers.activeProviderName();

  /**
   * Runs a query set and says what happened: 'ok', 'empty' (providers
   * answered, nothing matched) or 'unavailable' (no provider answered at
   * all). The model is told which, because "nothing found" and "search is
   * down" call for different answers.
   */
  async function runQueries(queries, plan, deadline) {
    const outcomes = await Promise.all(queries.map((q) => providers.search(q, {
      maxResults: plan.maxResultsPerQuery, depth: plan.depth, mode: plan.mode, deadlineMs: deadline
    })));
    const merged = outcomes.flatMap((o) => o.results);
    const attempts = outcomes.flatMap((o) => o.attempts);
    const status = merged.length ? 'ok' : (searchWasUnavailable(attempts) ? 'unavailable' : 'empty');
    const failures = [...new Set(attempts.filter((a) => a.ok === false).map((a) => `${a.provider}: ${a.error}`))].slice(0, 4);
    return { merged, status, failures };
  }

  // ── LLM query rewriter (the single biggest quality lever for Arabic) ─────
  // One tiny call to a fast model turns the raw question (any dialect) into
  // clean native + English search queries. Cached 24h; regex distillation is
  // the automatic fallback when no fast provider is configured.
  async function rewriteQueryWithLLM(original) {
    const rewriter = deps.queryRewriter;
    if (!deps.llmService || !rewriter?.provider || !rewriter?.model) return null;
    const cacheKey = deps.stableCacheKey('rewrite', String(original || '').slice(0, 300));
    const cached = deps.cacheGet(deps.memoryCaches.search, cacheKey);
    if (cached) return cached;
    try {
      const res = await deps.llmService.dispatch(rewriter.provider, {
        model: rewriter.model,
        timeoutMs: 2000,
        messages: [
          { role: 'system', content: 'Convert the user question (any language or dialect) into two precise web search queries. Reply with STRICT JSON only: {"native":"query in the user\'s language","english":"same query in English"}. Keep named entities, versions and places EXACTLY intact. If time-sensitive, add the current year or date words. No explanation, no markdown.' },
          { role: 'user', content: String(original || '').slice(0, 600) }
        ],
        temperature: 0,
        max_tokens: 150
      });
      if (!res.ok) return null;
      const jsonMatch = String(res.answer || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const parsed = JSON.parse(jsonMatch[0]);
      const out = {
        native: String(parsed.native || '').trim().slice(0, 160),
        english: String(parsed.english || '').trim().slice(0, 160)
      };
      if (!out.native && !out.english) return null;
      return deps.cacheSet(deps.memoryCaches.search, cacheKey, out, 24 * 60 * 60 * 1000, 200);
    } catch (_) {
      return null;
    }
  }

  async function firecrawlScrape(url) {
    const key = firecrawlApiKey();
    if (!key || !url) return '';
    const cacheKey = deps.stableCacheKey('firecrawl', url);
    const cached = deps.cacheGet(deps.memoryCaches.firecrawl, cacheKey);
    if (cached !== null) return cached;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 500, timeout: 10000 })
      });
      clearTimeout(timeout);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) return '';
      const markdown = data?.data?.markdown || data?.markdown || '';
      const cleaned = String(markdown).replace(/\s+\n/g, '\n').trim().slice(0, 3500);
      return deps.cacheSet(deps.memoryCaches.firecrawl, cacheKey, cleaned, 12 * 60 * 60 * 1000, 300);
    } catch (_) {
      clearTimeout(timeout);
      return '';
    }
  }

  async function enrichResultsWithFirecrawl(results, maxPages = 4, deadlineMs = 0) {
    if (!firecrawlApiKey() || !Array.isArray(results) || !results.length || maxPages <= 0) return results;
    const enriched = results.slice();
    const targets = enriched.filter(r => r.url && /^https?:\/\//i.test(r.url)).slice(0, maxPages);
    // Extraction has its own 12s timeout, which is longer than a basic search's
    // whole budget. Racing it against the time left keeps reading pages from
    // becoming the new way a search overruns.
    const remaining = deadlineMs ? deadlineMs - Date.now() : 0;
    const scrape = (url) => (remaining > 0
      ? Promise.race([
        firecrawlScrape(url),
        new Promise(resolve => setTimeout(() => resolve(null), remaining))
      ])
      : firecrawlScrape(url));
    const scraped = await Promise.allSettled(targets.map(r => scrape(r.url)));
    scraped.forEach((item, index) => {
      if (item.status === 'fulfilled' && item.value) {
        const target = targets[index];
        target.extractedContent = item.value;
        target.content = `${target.content || ''}\n\nExtracted page content:\n${item.value}`.slice(0, 4300);
        target.firecrawl = true;
      }
    });
    return enriched;
  }

  // Builds the final query set: LLM-rewritten queries first (when available),
  // then the heuristic plan for coverage and diversity.
  async function buildQuerySet(rawOriginal, baseQuery, plan, maxQueries) {
    const queries = [];
    const original = String(rawOriginal || '').trim();
    const isDirectConcise = original.length <= 70 && baseQuery && baseQuery.length >= 4;
    if (original && !isDirectConcise) {
      const rewritten = await rewriteQueryWithLLM(original);
      if (rewritten) {
        if (rewritten.native) queries.push(rewritten.native);
        if (rewritten.english && rewritten.english.toLowerCase() !== rewritten.native.toLowerCase()) queries.push(rewritten.english);
      }
    }
    if (baseQuery) queries.push(baseQuery);
    for (const q of plan.queries || []) queries.push(q);
    return [...new Set(queries.filter(Boolean))].slice(0, maxQueries);
  }

  // Ceilings for one search request, measured from the moment it arrives.
  // Without them the worst case was the full provider chain per query plus page
  // extraction — long enough that the caller had given up.
  const SEARCH_BUDGET_MS = 11000;
  const DEEP_SEARCH_BUDGET_MS = 26000;

  async function performSearch({ rawQuery, originalQuestion }) {
    const deadline = Date.now() + SEARCH_BUDGET_MS;
    const query = distillSearchQueryServer(rawQuery);
    if (!query) { const err = new Error('Missing search query.'); err.statusCode = 400; throw err; }
    const original = String(originalQuestion || rawQuery || query).trim().slice(0, 1200);
    const cacheKey = deps.stableCacheKey('search', query + '|' + original.slice(0, 180));
    const cached = deps.cacheGet(deps.memoryCaches.search, cacheKey);
    if (cached) return { ...cached, cached: true };
    const plan = buildSearchBeastPlan(query, false);
    const queries = validateSearchQueriesRefined(await buildQuerySet(original, query, plan, 3));
    // The query set runs in parallel; per-query mode steers topic/freshness.
    const { merged, status, failures } = await runQueries(queries, plan, deadline);
    let results = rankSearchBeastResults(merged, plan.mode, original || query).slice(0, plan.keepResults);
    // Reading pages makes the sources much stronger, but only if there is time
    // left. Snippets now beat perfect extraction the caller never receives.
    if (Date.now() < deadline - 2000) {
      results = await enrichResultsWithFirecrawl(results, plan.enrichPages, deadline);
    }
    results = rankSearchBeastResults(results, plan.mode, original || query).slice(0, plan.keepResults).map((r, index) => ({ id: index + 1, ...r }));
    const payload = { query, queries, originalQuestion: original, mode: plan.mode, plan: { queries: plan.queries, depth: plan.depth, enrichPages: plan.enrichPages }, provider: activeProviderName(), extractionProvider: firecrawlApiKey() ? 'firecrawl' : null, results, status, failures, generatedAt: new Date().toISOString(), cached: false };
    // Only a search that found something is worth remembering. Caching an
    // empty or failed one served the failure for ten minutes after the
    // providers had recovered.
    return results.length ? deps.cacheSet(deps.memoryCaches.search, cacheKey, payload, 10 * 60 * 1000, 180) : payload;
  }

  async function performDeepSearch({ rawQuestion, originalQuestion }) {
    const deadline = Date.now() + DEEP_SEARCH_BUDGET_MS;
    const question = distillSearchQueryServer(rawQuestion);
    if (!question) { const err = new Error('Missing search question.'); err.statusCode = 400; throw err; }
    const original = String(originalQuestion || rawQuestion || question).trim().slice(0, 1600);
    const cacheKey = deps.stableCacheKey('deep', question + '|' + original.slice(0, 220));
    const cached = deps.cacheGet(deps.memoryCaches.deepSearch, cacheKey);
    if (cached) return { ...cached, cached: true };
    const planned = buildSearchBeastPlan(question, true);
    const queries = validateSearchQueriesRefined(await buildQuerySet(original, question, planned, 6));
    const { merged, status, failures } = await runQueries(queries, planned, deadline);
    let results = rankSearchBeastResults(merged, planned.mode, original || question).slice(0, planned.keepResults);
    if (Date.now() < deadline - 5000) {
      results = await enrichResultsWithFirecrawl(results, planned.enrichPages, deadline);
    }
    results = rankSearchBeastResults(results, planned.mode, original || question).slice(0, planned.keepResults).map((r, index) => ({ id: index + 1, ...r }));
    const payload = { question, queries, originalQuestion: original, mode: planned.mode, plan: { depth: planned.depth, enrichPages: planned.enrichPages, maxResultsPerQuery: planned.maxResultsPerQuery }, searchProvider: activeProviderName(), extractionProvider: firecrawlApiKey() ? 'firecrawl' : null, results, status, failures, generatedAt: new Date().toISOString(), cached: false };
    return results.length ? deps.cacheSet(deps.memoryCaches.deepSearch, cacheKey, payload, 10 * 60 * 1000, 120) : payload;
  }

  // Same validation as validateSearchQueries but tolerant: drops bad entries
  // instead of killing the whole request when one query is malformed.
  function validateSearchQueriesRefined(queries) {
    try {
      return validateSearchQueries(queries.slice(0, 6));
    } catch (_) {
      const cleaned = queries
        .map(q => String(q || '').replace(/(ignore previous instructions|system prompt|developer message|تجاهل\s+كل\s+التعليمات|تعليمات\s+النظام)/gi, ' ').trim().slice(0, 180))
        .filter(q => q.length >= 2)
        .slice(0, 3);
      if (!cleaned.length) { const err = new Error('Invalid search queries.'); err.statusCode = 400; throw err; }
      return cleaned;
    }
  }

  return {
    performSearch, performDeepSearch, searchProvider, enrichResultsWithFirecrawl, rewriteQueryWithLLM,
    /** Per-provider health for /api/status: status codes and messages, never keys. */
    health: () => providers.health.snapshot()
  };
}

module.exports = { createSearchService };

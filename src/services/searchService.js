const {
  distillSearchQueryServer,
  buildSearchBeastPlan,
  rankSearchBeastResults
} = require('../search/searchCore');
const { validateSearchQueries } = require('../tools/searchTool');

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

  async function tavilySearch(query, maxResults = 5, depth = 'basic') {
    const key = tavilyApiKey();
    if (!key) throw new Error('Tavily is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), depth === 'advanced' ? 18000 : 9000);
    const upstream = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        query,
        search_depth: depth === 'advanced' ? 'advanced' : 'basic',
        max_results: maxResults,
        include_answer: true,
        include_raw_content: depth === 'advanced',
        include_images: false,
        topic: 'general'
      })
    });
    clearTimeout(timeout);
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const err = new Error(data?.error || 'Search provider error.');
      err.statusCode = upstream.status;
      throw err;
    }
    return (data.results || []).map((r) => ({
      title: String(r.title || '').slice(0, 180),
      url: String(r.url || '').slice(0, 700),
      content: String(r.content || '').slice(0, depth === 'advanced' ? 1800 : 1200),
      rawContent: String(r.raw_content || '').slice(0, depth === 'advanced' ? 3000 : 0),
      score: Number(r.score || 0),
      query,
      providerAnswer: data.answer ? String(data.answer).slice(0, 1200) : ''
    }));
  }

  async function duckDuckGoSearch(query, maxResults = 5) {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    const data = await response.json().catch(() => ({}));
    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading || query, url: data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(query), content: data.AbstractText, score: 0.75, query });
    }
    function flatten(topics) {
      for (const item of topics || []) {
        if (results.length >= maxResults) break;
        if (item.Text && item.FirstURL) results.push({ title: item.Text.split(' - ')[0].slice(0, 180), url: item.FirstURL, content: item.Text, score: 0.45, query });
        if (item.Topics) flatten(item.Topics);
      }
    }
    flatten(data.RelatedTopics);
    if (!results.length) results.push({ title: 'DuckDuckGo search', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query), content: 'No instant answer was returned. Use the linked search page for manual verification.', score: 0.1, query });
    return results.slice(0, maxResults);
  }

  async function searchProvider(query, maxResults = 5, depth = 'basic') {
    if (tavilyApiKey()) return tavilySearch(query, maxResults, depth);
    return duckDuckGoSearch(query, maxResults);
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

  async function enrichResultsWithFirecrawl(results, maxPages = 4) {
    if (!firecrawlApiKey() || !Array.isArray(results) || !results.length) return results;
    const enriched = results.slice();
    const targets = enriched.filter(r => r.url && /^https?:\/\//i.test(r.url)).slice(0, maxPages);
    const scraped = await Promise.allSettled(targets.map(r => firecrawlScrape(r.url)));
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

  async function performSearch({ rawQuery, originalQuestion }) {
    const query = distillSearchQueryServer(rawQuery);
    if (!query) { const err = new Error('Missing search query.'); err.statusCode = 400; throw err; }
    const original = String(originalQuestion || rawQuery || query).trim().slice(0, 1200);
    const cacheKey = deps.stableCacheKey('search', query + '|' + original.slice(0, 180));
    const cached = deps.cacheGet(deps.memoryCaches.search, cacheKey);
    if (cached) return { ...cached, cached: true };
    const plan = buildSearchBeastPlan(query, false);
    validateSearchQueries(plan.queries.slice(0, 3));
    const batches = await Promise.allSettled(plan.queries.map(q => searchProvider(q, plan.maxResultsPerQuery, plan.depth)));
    const merged = [];
    for (const batch of batches) if (batch.status === 'fulfilled') merged.push(...batch.value);
    let results = rankSearchBeastResults(merged, plan.mode, original || query).slice(0, plan.keepResults);
    results = await enrichResultsWithFirecrawl(results, plan.enrichPages);
    results = rankSearchBeastResults(results, plan.mode, original || query).slice(0, plan.keepResults).map((r, index) => ({ id: index + 1, ...r }));
    const payload = { query, originalQuestion: original, mode: plan.mode, plan: { queries: plan.queries, depth: plan.depth, enrichPages: plan.enrichPages }, provider: tavilyApiKey() ? 'tavily' : 'duckduckgo-fallback', extractionProvider: firecrawlApiKey() ? 'firecrawl' : null, results, generatedAt: new Date().toISOString(), cached: false };
    return deps.cacheSet(deps.memoryCaches.search, cacheKey, payload, 10 * 60 * 1000, 180);
  }

  async function performDeepSearch({ rawQuestion, originalQuestion }) {
    const question = distillSearchQueryServer(rawQuestion);
    if (!question) { const err = new Error('Missing search question.'); err.statusCode = 400; throw err; }
    const original = String(originalQuestion || rawQuestion || question).trim().slice(0, 1600);
    const cacheKey = deps.stableCacheKey('deep', question + '|' + original.slice(0, 220));
    const cached = deps.cacheGet(deps.memoryCaches.deepSearch, cacheKey);
    if (cached) return { ...cached, cached: true };
    const planned = buildSearchBeastPlan(question, true);
    const queries = validateSearchQueries(planned.queries.slice(0, 3));
    const batches = await Promise.allSettled(queries.map(q => searchProvider(q, planned.maxResultsPerQuery, planned.depth)));
    const merged = [];
    for (const batch of batches) if (batch.status === 'fulfilled') merged.push(...batch.value);
    let results = rankSearchBeastResults(merged, planned.mode, original || question).slice(0, planned.keepResults);
    results = await enrichResultsWithFirecrawl(results, planned.enrichPages);
    results = rankSearchBeastResults(results, planned.mode, original || question).slice(0, planned.keepResults).map((r, index) => ({ id: index + 1, ...r }));
    const payload = { question, originalQuestion: original, mode: planned.mode, queries, plan: { depth: planned.depth, enrichPages: planned.enrichPages, maxResultsPerQuery: planned.maxResultsPerQuery }, searchProvider: tavilyApiKey() ? 'tavily' : 'duckduckgo-fallback', extractionProvider: firecrawlApiKey() ? 'firecrawl' : null, results, generatedAt: new Date().toISOString(), cached: false };
    return deps.cacheSet(deps.memoryCaches.deepSearch, cacheKey, payload, 10 * 60 * 1000, 120);
  }

  return { performSearch, performDeepSearch, searchProvider, enrichResultsWithFirecrawl };
}

module.exports = { createSearchService };

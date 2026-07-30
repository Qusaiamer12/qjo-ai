const {
  distillSearchQueryServer,
  inferSearchMode,
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
  const serperApiKey = () => String(deps.serperApiKey || '').trim();

  // ── Providers ────────────────────────────────────────────────────────────

  async function tavilySearch(query, maxResults = 5, depth = 'basic', mode = 'general') {
    const key = tavilyApiKey();
    if (!key) throw new Error('Tavily is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), depth === 'advanced' ? 18000 : 8000);
    const body = {
      query,
      search_depth: depth === 'advanced' ? 'advanced' : 'basic',
      max_results: maxResults,
      include_answer: true,
      include_raw_content: depth === 'advanced',
      include_images: false,
      // Mode-aware retrieval: news goes through the news topic with a
      // freshness window; pricing/market get a wider one. Previously
      // everything went out as topic:'general' with no date window.
      topic: mode === 'news' ? 'news' : 'general',
      country: 'jo'
    };
    if (mode === 'news') body.days = depth === 'advanced' ? 30 : 7;
    else if (mode === 'pricing' || mode === 'market') body.days = 30;
    const upstream = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(body)
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
      publishedDate: String(r.published_date || r.publishedDate || '').slice(0, 40),
      score: Number(r.score || 0),
      query,
      providerAnswer: data.answer ? String(data.answer).slice(0, 1200) : ''
    }));
  }

  // Serper.dev — Google Search results via API (great Arabic/local coverage).
  // Free tier: 2,500 one-time credits. We map mode→time window (tbs) and
  // always pin gl:jo + query-language hl for the Jordan-first product.
  async function serperSearch(query, maxResults = 5, mode = 'general') {
    const key = serperApiKey();
    if (!key) throw new Error('Serper is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const isArabic = /[؀-ۿ]/.test(query);
    const body = {
      q: query,
      num: Math.min(Math.max(maxResults, 1), 10),
      gl: 'jo',
      hl: isArabic ? 'ar' : 'en'
    };
    if (mode === 'news') body.tbs = 'qdr:w';
    else if (mode === 'pricing' || mode === 'market') body.tbs = 'qdr:m';
    const upstream = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    clearTimeout(timeout);
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const err = new Error('Serper search provider error.');
      err.statusCode = upstream.status;
      throw err;
    }
    const answerText = String(
      data.answerBox?.answer || data.answerBox?.snippet ||
      (Array.isArray(data.answerBox?.snippetHighlighted) ? data.answerBox.snippetHighlighted.join(' ') : '') || ''
    ).slice(0, 1200);
    return ((data.organic) || []).map((r, i) => ({
      title: String(r.title || '').slice(0, 180),
      url: String(r.link || '').slice(0, 700),
      content: String(r.snippet || '').slice(0, 1200),
      publishedDate: String(r.date || '').slice(0, 40),
      score: Math.max(0.05, 0.85 - i * 0.05),
      query,
      providerAnswer: answerText
    })).filter(r => r.url);
  }

  // Last resort, key-free: DuckDuckGo. The old Instant Answer API almost
  // never returns web results, so we now scrape the public HTML results page
  // first (real web search, no key) and only then fall back to Instant Answer.
  function decodeDdgEntities(text) {
    return String(text || '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/g, '/');
  }

  function unwrapDdgUrl(href) {
    const raw = decodeDdgEntities(href || '');
    const match = raw.match(/uddg=([^&]+)/);
    if (match) { try { return decodeURIComponent(match[1]); } catch (_) { return raw; } }
    if (raw.startsWith('//')) return 'https:' + raw;
    return raw;
  }

  function stripHtml(text) {
    return decodeDdgEntities(String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  async function duckDuckGoHtmlSearch(query, maxResults = 5) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
      clearTimeout(timeout);
      if (!response.ok) return [];
      const html = await response.text();
      const results = [];
      const blocks = html.match(/<div class="result results_links[^"]*"[\s\S]*?(?=<div class="result results_links|<div id="links" class="results_links_end|$)/g) || [];
      for (const block of blocks.slice(0, Math.max(1, maxResults) + 2)) {
        const linkMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) continue;
        const url = unwrapDdgUrl(linkMatch[1]).slice(0, 700);
        const title = stripHtml(linkMatch[2]).slice(0, 180);
        if (!url || !title || !/^https?:\/\//i.test(url)) continue;
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
        const content = snippetMatch ? stripHtml(snippetMatch[1]).slice(0, 900) : '';
        results.push({ title, url, content, score: Math.max(0.2, 0.6 - results.length * 0.05), query });
        if (results.length >= maxResults) break;
      }
      return results;
    } catch (_) {
      clearTimeout(timeout);
      return [];
    }
  }

  async function duckDuckGoInstantAnswers(query, maxResults = 5) {
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
    return results.slice(0, maxResults);
  }

  async function duckDuckGoSearch(query, maxResults = 5) {
    const htmlResults = await duckDuckGoHtmlSearch(query, maxResults);
    if (htmlResults.length) return htmlResults;
    const instant = await duckDuckGoInstantAnswers(query, maxResults);
    if (instant.length) return instant;
    return [{ title: 'DuckDuckGo search', url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query), content: 'No instant answer was returned. Use the linked search page for manual verification.', score: 0.1, query }];
  }

  // Per-query resilient chain: Tavily → Serper → key-free DDG.
  // If a configured provider fails (exhausted credits, outage, bad key), the
  // SAME query transparently retries on the next provider — no dead searches
  // just because a key hit its monthly cap.
  async function searchProvider(query, maxResults = 5, depth = 'basic', mode = 'general') {
    const chain = [];
    if (tavilyApiKey()) chain.push(() => tavilySearch(query, maxResults, depth, mode));
    if (serperApiKey()) chain.push(() => serperSearch(query, maxResults, mode));
    chain.push(() => duckDuckGoSearch(query, maxResults));
    let lastErr = null;
    for (const step of chain) {
      try {
        const r = await step();
        if (r && r.length) return r;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
    return [];
  }

  function activeProviderName() {
    if (tavilyApiKey()) return 'tavily';
    if (serperApiKey()) return 'serper';
    return 'duckduckgo-fallback';
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
        timeoutMs: 4500,
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

  // Builds the final query set: LLM-rewritten queries first (when available),
  // then the heuristic plan for coverage and diversity.
  async function buildQuerySet(rawOriginal, baseQuery, plan, maxQueries) {
    const queries = [];
    const original = String(rawOriginal || '').trim();
    if (original) {
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

  async function performSearch({ rawQuery, originalQuestion }) {
    const query = distillSearchQueryServer(rawQuery);
    if (!query) { const err = new Error('Missing search query.'); err.statusCode = 400; throw err; }
    const original = String(originalQuestion || rawQuery || query).trim().slice(0, 1200);
    const cacheKey = deps.stableCacheKey('search', query + '|' + original.slice(0, 180));
    const cached = deps.cacheGet(deps.memoryCaches.search, cacheKey);
    if (cached) return { ...cached, cached: true };
    const plan = buildSearchBeastPlan(query, false);
    const queries = validateSearchQueriesRefined(await buildQuerySet(original, query, plan, 3));
    // The query set runs in parallel; per-query mode steers topic/freshness.
    const batches = await Promise.allSettled(queries.map(q => searchProvider(q, plan.maxResultsPerQuery, plan.depth, plan.mode)));
    const merged = [];
    for (const batch of batches) if (batch.status === 'fulfilled') merged.push(...batch.value);
    let results = rankSearchBeastResults(merged, plan.mode, original || query).slice(0, plan.keepResults);
    results = await enrichResultsWithFirecrawl(results, plan.enrichPages);
    results = rankSearchBeastResults(results, plan.mode, original || query).slice(0, plan.keepResults).map((r, index) => ({ id: index + 1, ...r }));
    const payload = { query, queries, originalQuestion: original, mode: plan.mode, plan: { queries: plan.queries, depth: plan.depth, enrichPages: plan.enrichPages }, provider: activeProviderName(), extractionProvider: firecrawlApiKey() ? 'firecrawl' : null, results, generatedAt: new Date().toISOString(), cached: false };
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
    const queries = validateSearchQueriesRefined(await buildQuerySet(original, question, planned, 6));
    const batches = await Promise.allSettled(queries.map(q => searchProvider(q, planned.maxResultsPerQuery, planned.depth, planned.mode)));
    const merged = [];
    for (const batch of batches) if (batch.status === 'fulfilled') merged.push(...batch.value);
    let results = rankSearchBeastResults(merged, planned.mode, original || question).slice(0, planned.keepResults);
    results = await enrichResultsWithFirecrawl(results, planned.enrichPages);
    results = rankSearchBeastResults(results, planned.mode, original || question).slice(0, planned.keepResults).map((r, index) => ({ id: index + 1, ...r }));
    const payload = { question, queries, originalQuestion: original, mode: planned.mode, plan: { depth: planned.depth, enrichPages: planned.enrichPages, maxResultsPerQuery: planned.maxResultsPerQuery }, searchProvider: activeProviderName(), extractionProvider: firecrawlApiKey() ? 'firecrawl' : null, results, generatedAt: new Date().toISOString(), cached: false };
    return deps.cacheSet(deps.memoryCaches.deepSearch, cacheKey, payload, 10 * 60 * 1000, 120);
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

  return { performSearch, performDeepSearch, searchProvider, enrichResultsWithFirecrawl, rewriteQueryWithLLM };
}

module.exports = { createSearchService };

// "It lost the ability to search." In production every question that needed
// the web got "I couldn't find current results — check FotMob". The cause was
// not visible anywhere: provider failures were caught and thrown away, and
// when all of them failed a key-free fallback returned a made-up result
// ("No instant answer was returned. Use the linked search page for manual
// verification."), which counted as success and was cached for ten minutes.
//
// These cases run the real search service against fake providers over real
// HTTP — Tavily, Serper, Google News RSS, Wikipedia, DuckDuckGo — each
// scriptable per case.
'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const { createSearchService } = require('../src/services/searchService');
const { formatSearchResultsForTool } = require('../src/agents/toolAnswer');
const { registerSystemRoutes } = require('../src/routes/system');

let pass = 0, fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 4).join('\n     ')}`);
  }
}

// ── Fake providers ───────────────────────────────────────────────────────────

let behave = {};
let calls = {};
const count = (name) => { calls[name] = (calls[name] || 0) + 1; };

const TAVILY_OK = { answer: 'Kylian Mbappé leads with 12 goals.', results: [{ title: 'LaLiga top scorers', url: 'https://example.com/laliga-scorers', content: 'Mbappé 12, Lewandowski 9.', score: 0.9, published_date: '2026-09-20' }] };
const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Real Madrid vs Espanyol: kick-off Sunday 21:00 &amp; team news]]></title><link>https://news.example.com/rm-espanyol</link><pubDate>Mon, 21 Sep 2026 18:00:00 GMT</pubDate><description>&lt;a href="x"&gt;Preview&lt;/a&gt; of the next match</description><source url="https://news.example.com">Example News</source></item>
<item><title>La Liga fixtures this week</title><link>https://news.example.com/fixtures</link><pubDate>Sun, 20 Sep 2026 09:00:00 GMT</pubDate><description>All fixtures</description><source url="https://news.example.com">Example News</source></item>
</channel></rss>`;
const WIKI = { query: { search: [{ title: '2026–27 La Liga', snippet: 'The <span class="searchmatch">top scorer</span> so far&#039;s…', timestamp: '2026-09-21T10:00:00Z' }] } };
const DDG_BLOCKED = '<html><body>Unfortunately, bots use DuckDuckGo too. Please complete the following challenge (anomaly)</body></html>';

function readBody(req) {
  return new Promise((resolve) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => resolve(b)); });
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const body = await readBody(req);
  const send = (status, payload, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };
  if (path === '/tavily') {
    count('tavily');
    const parsed = JSON.parse(body || '{}');
    (calls.tavilyBodies = calls.tavilyBodies || []).push(parsed);
    return (behave.tavily || (() => send(200, TAVILY_OK)))(parsed, send, res);
  }
  if (path === '/serper') { count('serper'); return (behave.serper || (() => send(200, { organic: [] })))(JSON.parse(body || '{}'), send, res); }
  if (path === '/news') { count('news'); return (behave.news || (() => send(200, RSS, 'application/rss+xml')))(req, send, res); }
  if (path.startsWith('/wiki/')) { count('wiki'); return (behave.wiki || (() => send(200, WIKI)))(req, send, res); }
  if (path === '/ddg') { count('ddg'); return (behave.ddg || (() => send(200, DDG_BLOCKED, 'text/html')))(req, send, res); }
  send(404, { error: 'unknown' });
});

let base = '';
let cacheWrites = 0;
function service({ tavily = 'tvly-test', serper = 'serper-test' } = {}) {
  const store = new Map();
  return createSearchService({
    tavilyApiKey: tavily,
    serperApiKey: serper,
    searchEndpoints: {
      tavily: `${base}/tavily`,
      serper: `${base}/serper`,
      googleNews: `${base}/news`,
      wikipedia: `${base}/wiki/{lang}/api.php`,
      ddgHtml: `${base}/ddg`
    },
    stableCacheKey: (...parts) => parts.join('|'),
    cacheGet: (s, k) => s.get(k) || null,
    cacheSet: (s, k, v) => { cacheWrites++; s.set(k, v); return v; },
    memoryCaches: { search: store, deepSearch: new Map() }
  });
}

const reset = (b = {}) => { behave = b; calls = {}; cacheWrites = 0; };
const QUESTION = 'When is the next Real Madrid match?';

// The failure as it is believed to happen in production: Tavily rejects the
// request, Serper is out of credits, DuckDuckGo refuses the server.
const PRODUCTION = {
  tavily: (b, send) => (b.country ? send(400, { detail: { error: 'Invalid country' } }) : send(200, TAVILY_OK)),
  serper: (b, send) => send(400, { message: 'Not enough credits' })
};

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const realWarn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(' '));

  console.log('\nThe production failure:');

  await test('Tavily is asked only with documented parameters, and answers', async () => {
    reset(PRODUCTION);
    const payload = await service().performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    assert.ok(calls.tavilyBodies.every((b) => !('country' in b)), 'country is still sent');
    assert.strictEqual(payload.status, 'ok');
    assert.ok(payload.results.some((r) => r.url === 'https://example.com/laliga-scorers'), JSON.stringify(payload.results.map((r) => r.url)));
  });

  await test('a made-up result is never returned', async () => {
    reset({ tavily: (b, send) => send(500, { error: 'boom' }), serper: PRODUCTION.serper, news: (q, send) => send(503, 'down', 'text/plain'), wiki: (q, send) => send(503, 'down', 'text/plain') });
    const payload = await service().performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    assert.deepStrictEqual(payload.results, [], JSON.stringify(payload.results));
    assert.ok(!JSON.stringify(payload).includes('manual verification'), 'the placeholder is back');
  });

  console.log('\nWhen the keyed providers cannot answer, the key-free ones do:');

  await test('Tavily and Serper both down: Google News and Wikipedia answer, side by side', async () => {
    reset({ tavily: (b, send) => send(432, { detail: { error: 'This request exceeds your plan\'s set usage limit' } }), serper: PRODUCTION.serper });
    const payload = await service().performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    const from = new Set(payload.results.map((r) => r.provider));
    assert.strictEqual(payload.status, 'ok');
    assert.ok(from.has('google-news') && from.has('wikipedia'), `came from ${[...from]}`);
    const news = payload.results.find((r) => r.url === 'https://news.example.com/rm-espanyol');
    assert.ok(news, 'the fixture headline is missing');
    assert.strictEqual(news.title, 'Real Madrid vs Espanyol: kick-off Sunday 21:00 & team news', 'CDATA/entities not decoded');
    assert.ok(news.publishedDate.startsWith('2026-09-21'), `date: ${news.publishedDate}`);
    assert.ok(/Example News/.test(news.content), 'the source name is missing');
    const wiki = payload.results.find((r) => r.provider === 'wikipedia');
    assert.ok(wiki.url.startsWith('https://en.wikipedia.org/wiki/2026%E2%80%9327_La_Liga'), wiki.url);
    assert.ok(!/<span/.test(wiki.content) && /top scorer so far's/.test(wiki.content), wiki.content);
  });

  await test('an Arabic question goes to Arabic Wikipedia and Arabic Google News', async () => {
    reset({ tavily: (b, send) => send(432, {}), serper: PRODUCTION.serper });
    let newsUrl = '', wikiUrl = '';
    behave.news = (req, send) => { newsUrl = req.url; send(200, RSS, 'application/rss+xml'); };
    behave.wiki = (req, send) => { wikiUrl = req.url; send(200, WIKI); };
    await service().performSearch({ rawQuery: 'متى مباراة ريال مدريد القادمة', originalQuestion: 'متى مباراة ريال مدريد القادمة' });
    assert.ok(/hl=ar/.test(newsUrl) && /ceid=JO%3Aar/.test(newsUrl), newsUrl);
    assert.ok(wikiUrl.startsWith('/wiki/ar/'), wikiUrl);
  });

  await test('both keyed providers stalling cannot eat the fallbacks\' time', async () => {
    reset({ tavily: () => { /* headers never come */ }, serper: () => { /* nor here */ } });
    const started = Date.now();
    const payload = await service().performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    const took = Date.now() - started;
    assert.ok(payload.results.length > 0, 'the fallbacks got no time');
    assert.ok(took < 12000, `took ${took}ms`);
  });

  await test('a provider that sends headers and then nothing is abandoned on time', async () => {
    reset({
      tavily: (b, send, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"results": ['); },
      serper: PRODUCTION.serper
    });
    const started = Date.now();
    let watchdog;
    const hung = new Promise((r) => { watchdog = setTimeout(() => r('HUNG'), 20000); });
    const outcome = await Promise.race([service().performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION }), hung]);
    clearTimeout(watchdog);
    assert.notStrictEqual(outcome, 'HUNG', 'HUNG — still reading a body that never finishes');
    assert.ok(Date.now() - started < 12000, `took ${Date.now() - started}ms`);
    assert.ok(outcome.results.length > 0, 'the fallbacks did not answer');
  });

  console.log('\nFailures are visible, and quota failures are not repeated:');

  await test('a provider out of quota rests instead of being asked on every query', async () => {
    reset({ tavily: (b, send) => send(432, { detail: { error: 'usage limit exceeded' } }), serper: PRODUCTION.serper });
    const svc = service();
    await svc.performSearch({ rawQuery: 'first question about la liga', originalQuestion: 'first question about la liga' });
    const firstRound = calls.tavily;
    await svc.performSearch({ rawQuery: 'second question about premier league', originalQuestion: 'second question about premier league' });
    assert.ok(firstRound >= 1, 'setup: tavily never called');
    assert.strictEqual(calls.tavily, firstRound, `tavily was called again while resting (${firstRound} → ${calls.tavily})`);
    const health = svc.health();
    assert.strictEqual(health.tavily.resting, true);
    assert.strictEqual(health.tavily.lastError.status, 432);
    assert.strictEqual(health.tavily.lastError.kind, 'quota');
    assert.strictEqual(health.serper.lastError.kind, 'quota', `"Not enough credits" classified as ${health.serper.lastError.kind}`);
  });

  await test('each failing provider is logged — once, not once per query', async () => {
    warnings.length = 0;
    reset({ tavily: (b, send) => send(500, { error: 'internal' }), serper: (b, send) => send(500, { message: 'internal' }) });
    const svc = service();
    for (const q of ['alpha question one', 'beta question two', 'gamma question three']) {
      await svc.performSearch({ rawQuery: q, originalQuestion: q });
    }
    const tavilyLines = warnings.filter((w) => /\[search\] tavily failed \(500/.test(w));
    assert.strictEqual(tavilyLines.length, 1, `${tavilyLines.length} tavily lines: ${warnings.join(' | ').slice(0, 300)}`);
  });

  await test('a request rejected as malformed is retried once in its minimal form', async () => {
    reset({ tavily: (b, send) => ('exclude_domains' in b ? send(422, { detail: 'unexpected field exclude_domains' }) : send(200, TAVILY_OK)) });
    const svc = service();
    const payload = await svc.performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    assert.ok(payload.results.some((r) => r.provider === 'tavily'), 'the minimal retry did not answer');
    assert.ok(calls.tavilyBodies.some((b) => !('exclude_domains' in b)), 'no minimal retry was sent');
    assert.strictEqual(svc.health().tavily.resting, false, 'a contract problem put the provider to rest');
  });

  console.log('\n"Nothing found" and "search is down" are told apart:');

  await test('every provider failing is "unavailable", is not cached, and the model is told so', async () => {
    reset({ tavily: (b, send) => send(500, {}), serper: (b, send) => send(500, {}), news: (q, send) => send(503, 'x', 'text/plain'), wiki: (q, send) => send(503, 'x', 'text/plain') });
    const svc = service();
    const payload = await svc.performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    assert.strictEqual(payload.status, 'unavailable');
    assert.ok(payload.failures.length > 0, 'no reasons recorded');
    assert.strictEqual(cacheWrites, 0, 'a failed search was cached');
    const before = calls.tavily;
    await svc.performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    assert.ok(calls.tavily > before, 'the second ask was served from a cached failure');
    assert.ok(/unavailable right now/.test(formatSearchResultsForTool(payload)), formatSearchResultsForTool(payload).slice(0, 120));
  });

  await test('providers answering with nothing is "empty", and the model is told that instead', async () => {
    reset({
      tavily: (b, send) => send(200, { results: [] }),
      serper: (b, send) => send(200, { organic: [] }),
      news: (q, send) => send(200, '<rss><channel></channel></rss>', 'application/rss+xml'),
      wiki: (q, send) => send(200, { query: { search: [] } })
    });
    const payload = await service().performSearch({ rawQuery: 'xqzv nonsense words', originalQuestion: 'xqzv nonsense words' });
    assert.strictEqual(payload.status, 'empty');
    assert.ok(/No web results found/.test(formatSearchResultsForTool(payload)));
  });

  console.log('\nWhy search is failing can be read from /api/status:');

  await test('per-provider health, with status and message, and no keys', async () => {
    reset({ tavily: (b, send) => send(401, { detail: { error: 'Unauthorized: missing or invalid API key.' } }), serper: PRODUCTION.serper });
    const svc = service({ tavily: 'tvly-SECRET-123', serper: 'serper-SECRET-456' });
    await svc.performSearch({ rawQuery: QUESTION, originalQuestion: QUESTION });
    const app = express();
    registerSystemRoutes(app, {
      adminConfigService: { readAdminConfig: () => ({}) }, verifyAdminRequest: async () => false,
      version: 't', qjoProviders: () => ({}), tavilyApiKey: 'tvly-SECRET-123', serperApiKey: 'serper-SECRET-456',
      embeddingsService: { configuredCount: () => 0 }, hasFirebaseAdmin: () => false, adminEmailsSize: () => 0,
      getClientIp: () => '', searchHealth: () => svc.health(),
      providerHealth: () => ({ groq: { keys: 2, detail: [{ key: 1, model: 'openai/gpt-oss-20b', resting: '30s (firm)', lastStatus: 429 }] } })
    });
    const statusServer = http.createServer(app);
    await new Promise((r) => statusServer.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${statusServer.address().port}/api/status`);
      const text = await res.text();
      const json = JSON.parse(text);
      assert.strictEqual(json.searchHealth.tavily.lastError.status, 401);
      assert.strictEqual(json.searchHealth.tavily.lastError.kind, 'auth');
      assert.ok(/invalid API key/.test(json.searchHealth.tavily.lastError.message));
      assert.ok(!/SECRET/.test(text), 'a key leaked into /api/status');
      assert.strictEqual(json.providerHealth.groq.detail[0].lastStatus, 429, 'AI provider health is not reported');
    } finally {
      statusServer.close();
    }
  });

  console.warn = realWarn;
  // A stalled fake response would otherwise hold close() open forever.
  server.closeAllConnections();
  server.close();
  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

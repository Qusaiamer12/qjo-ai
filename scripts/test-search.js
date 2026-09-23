// Search had three distinct problems, all with the same root cause: a keyword
// cascade decided whether to search, before the message was sent, with no
// bound on how long that took.
//
//   1. It did not know when to search. Measured 72% on a realistic corpus: it
//      searched "شو دورك؟" because "دور" was in the allow-list, and did not
//      search "مين رئيس الوزراء حاليًا؟" at all.
//   2. Sources could not be trusted, because the model answered from two-line
//      snippets without opening anything or citing.
//   3. It hung, because that pre-search blocked the message with no timeout.
const assert = require('assert');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');
const { WEB_SEARCH_TOOL } = require('../src/tools/searchTool');
const { formatSearchResultsForTool } = require('../src/agents/toolAnswer');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 3).join('\n     ')}`); });
}

const { FETCH_PAGE_TOOL } = require('../src/tools/fetchPageTool');

// Mirrors how the server registers fetch_page, so the test sees the tool set a
// real request sees rather than a smaller one.
const HOST_TOOLS = {
  fetch_page: { schema: FETCH_PAGE_TOOL, label: 'Reading page', run: async () => 'page text' }
};

function engineWith({ withSearch = true } = {}) {
  let offered = null;
  const engine = createRoutingEngine({
    extraTools: HOST_TOOLS,
    llmService: {
      dispatch: async (provider, params) => {
        offered = (params.tools || []).map(t => t.function.name);
        return { ok: true, answer: 'ok', provider, model: params.model, finish_reason: 'stop' };
      },
      hasKeys: () => true, hasAnyProvider: () => true
    },
    safeCalculate: (e) => `calc(${e})`,
    searchService: withSearch ? { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: [] }) } : null,
    keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
    models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
  });
  return { engine, offered: () => offered };
}

const askWith = async (text, mode = 'flash') => {
  const { engine, offered } = engineWith();
  await engine.callAgent({
    agentType: 'chat', model: 't', mode, max_tokens: 200, useTools: true,
    messages: [{ role: 'user', content: text }]
  });
  return offered() || [];
};

(async () => {
  console.log('\nThe model is given the choice, on every kind of question:');

  // The corpus that exposed the old gate. The assertion is no longer "did the
  // regex guess right" but "was the model allowed to decide at all".
  const questions = [
    'مين رئيس وزراء الأردن حاليًا؟',
    'شو الطقس بعمان بكرا؟',
    'آخر أخبار غزة',
    'شو أحدث إصدار من Node.js؟',
    'كم صار عدد سكان الأردن؟',
    'شو أسعار خطط Render الحالية؟',
    'اعطيني إحصائيات حديثة عن البطالة في الأردن',
    'اشرحلي شو هو الـ closure بجافاسكريبت',
    'اكتبلي دالة بايثون تعكس النص',
    'شو دورك بالضبط؟',
    'احكيلي قصة قصيرة عن البحر'
  ];
  for (const q of questions) {
    await test(`"${q.slice(0, 42)}" — the model can decide`, async () => {
      const tools = await askWith(q);
      assert.ok(tools.includes('web_search'), `web_search was withheld, so the answer can only come from memory: ${JSON.stringify(tools)}`);
    });
  }

  await test('Flash gets the tool too, not just Max', async () => {
    const tools = await askWith('مين رئيس وزراء الأردن حاليًا؟', 'flash');
    assert.ok(tools.includes('web_search'), 'Flash answers current-affairs questions from memory: ' + JSON.stringify(tools));
  });

  await test('reading a page is offered alongside searching', async () => {
    const tools = await askWith('ابحثلي عن أفضل مكتبات React');
    assert.ok(tools.includes('fetch_page'), 'the model can search but not open anything: ' + JSON.stringify(tools));
  });

  await test('no search tool when search is not configured', async () => {
    const { engine, offered } = engineWith({ withSearch: false });
    await engine.callAgent({ agentType: 'chat', model: 't', mode: 'max', max_tokens: 200, useTools: true, messages: [{ role: 'user', content: 'أخبار اليوم' }] });
    const tools = offered() || [];
    assert.ok(!tools.includes('web_search'), 'a tool that cannot work was advertised: ' + JSON.stringify(tools));
  });

  await test('a client source pack suppresses a duplicate search', async () => {
    const { engine, offered } = engineWith();
    await engine.callAgent({
      agentType: 'chat', model: 't', mode: 'max', max_tokens: 200, useTools: true,
      messages: [{ role: 'user', content: 'أخبار اليوم\n\nSOURCE PACK:\n[1] خبر (https://example.com)' }]
    });
    const tools = offered() || [];
    assert.ok(!tools.includes('web_search'), 'it would have searched twice: ' + JSON.stringify(tools));
  });

  console.log('\nThe tool description tells it both when to search and when not to:');

  const description = WEB_SEARCH_TOOL.function.description;
  await test('it names the cases that need live data', () => {
    for (const signal of ['current', 'news', 'latest', 'weather']) {
      assert.ok(new RegExp(signal, 'i').test(description), `"${signal}" is missing from the guidance`);
    }
  });
  await test('it names the cases that do not', () => {
    for (const signal of ['code', 'translat', 'summar', 'opinion']) {
      assert.ok(new RegExp(signal, 'i').test(description), `"${signal}" is missing from the do-not list`);
    }
  });

  console.log('\nResults come back as evidence, not as facts:');

  // formatSearchResultsForTool is internal, so drive it through a real search.
  async function toolOutputFor(results) {
    let toolResult = null;
    let round = 0;
    const engine = createRoutingEngine({
      llmService: {
        dispatch: async (provider, params) => {
          round++;
          if (round === 1) {
            const call = { id: '1', type: 'function', function: { name: 'web_search', arguments: JSON.stringify({ query: 'سعر الذهب' }) } };
            return { ok: true, answer: '', provider, model: params.model, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call] }, toolCalls: [call] };
          }
          toolResult = params.messages.filter(m => m.role === 'tool').map(m => m.content).join('\n');
          return { ok: true, answer: 'تم', provider, model: params.model, finish_reason: 'stop' };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
    });
    await engine.callAgent({ agentType: 'chat', model: 't', mode: 'max', max_tokens: 200, useTools: true, messages: [{ role: 'user', content: 'سعر الذهب اليوم' }] });
    return toolResult || '';
  }

  await test('every result carries its link so a claim can be cited', async () => {
    const out = await toolOutputFor([{ id: 1, title: 'سعر الذهب', url: 'https://example.com/gold', content: 'السعر 2400' }]);
    assert.ok(out.includes('https://example.com/gold'), 'the source URL never reached the model');
    assert.ok(/cite/i.test(out), 'nothing asks the model to cite');
  });

  await test('a snippet is labelled as a snippet', async () => {
    const out = await toolOutputFor([{ id: 1, title: 'ت', url: 'https://example.com/a', content: 'مقتطف' }]);
    assert.ok(/snippet only/i.test(out), 'the model cannot tell a two-line snippet from a full page');
    assert.ok(/fetch_page/i.test(out), 'nothing tells it how to read the full page');
  });

  await test('an extracted page is labelled as one', async () => {
    const out = await toolOutputFor([{ id: 1, title: 'ت', url: 'https://example.com/a', content: 'نص كامل', firecrawl: true }]);
    assert.ok(/full page text/i.test(out), 'extraction is invisible to the model');
  });

  await test('publication dates travel with the result', async () => {
    const out = await toolOutputFor([{ id: 1, title: 'خبر', url: 'https://example.com/n', content: 'خبر', publishedDate: '2026-09-01T00:00:00Z' }]);
    assert.ok(out.includes('2026-09-01'), 'the model cannot tell a fresh source from an old one');
  });

  await test('finding nothing is not an invitation to guess', async () => {
    const out = await toolOutputFor([]);
    assert.ok(/do not fill the gap|could not find/i.test(out), 'an empty result set says nothing about what to do: ' + out.slice(0, 120));
  });

  await test('conflicting or thin evidence is something to say, not smooth over', async () => {
    const out = await toolOutputFor([{ id: 1, title: 'ت', url: 'https://example.com/a', content: 'x' }]);
    assert.ok(/disagree|does not support/i.test(out), 'nothing asks it to flag weak evidence');
  });


  console.log('\nSearch can no longer hold the whole message hostage:');

  const { createSearchService } = require('../src/services/searchService');

  function slowSearchService(delayMs) {
    // Stands in for a provider that has stopped answering. Before the budget,
    // the chain waited out Tavily, then Serper, then DuckDuckGo in turn.
    // Behaves like a provider that accepted the connection and then went
    // quiet — honouring abort, as real fetch does, so the test measures the
    // budget rather than a stub that ignores every signal.
    global.fetch = (_url, init) => new Promise((_resolve, reject) => {
      const signal = init && init.signal;
      if (signal) signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    return createSearchService({
      stableCacheKey: (a, b) => a + b,
      cacheGet: () => null,
      cacheSet: (_c, _k, v) => v,
      memoryCaches: { search: new Map(), deepSearch: new Map() },
      tavilyApiKey: 'tv-test',
      serperApiKey: 'sp-test',
      firecrawlApiKey: 'fc-test'
    });
  }

  await test('a dead provider cannot stall a search past its budget', async () => {
    const service = slowSearchService();
    const started = Date.now();
    const payload = await service.performSearch({ rawQuery: 'سعر الذهب اليوم', originalQuestion: 'سعر الذهب اليوم' });
    const elapsed = Date.now() - started;
    console.log(`     (a fully dead provider chain resolved in ${(elapsed / 1000).toFixed(1)}s)`);
    assert.ok(elapsed < 14000, `search took ${Math.round(elapsed / 1000)}s — the budget is not being enforced`);
    assert.ok(payload && Array.isArray(payload.results), 'it must still answer with a shape the caller can use');
  });

  await test('the client bounds its own pre-search', () => {
    const fs = require('fs');
    const app = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const block = app.slice(app.indexOf('async function getWebSearchContext'), app.indexOf('async function getWebSearchContext') + 2600);
    assert.ok(/AbortController/.test(block), 'the pre-search fetch still has no abort');
    assert.ok(/searchAbort\.abort\(\)/.test(block), 'nothing ever aborts it');
    assert.ok(/clearTimeout\(searchTimeout\)/.test(block), 'the timeout is never cleared');
  });

  await test('a dropped pre-search tells the model to search itself', () => {
    const fs = require('fs');
    const app = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
    assert.ok(/call web_search yourself/i.test(app), 'a timed-out pre-search leaves the model with no route to current facts');
  });


  console.log('\nAn empty answer is a failure, not a result:');

  // From a real transcript: a question came back with a completely blank
  // message. A provider replying 200 with no text passed as success, so
  // nothing anywhere retried it.
  function chainOver(script) {
    let call = 0;
    const seen = [];
    const engine = createRoutingEngine({
      extraTools: HOST_TOOLS,
      llmService: {
        dispatch: async (provider, params) => {
          const step = script[Math.min(call, script.length - 1)];
          call++;
          seen.push(`${provider}:${params.model}`);
          return { ok: true, answer: step.answer, provider, model: params.model, finish_reason: 'stop', ...(step.extra || {}) };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async () => ({ query: 'q', results: [] }) },
      keys: { groq: 1, llm7: 1, qwen: 1, kimi: 1 },
      models: {
        groqFlash: 'gf', groqText: 'gt', groqCode: 'gt', groqVision: 'gv',
        llm7Flash: 'lf', llm7Text: 'lt', qwenFlash: 'qf', qwenText: 'qt', kimiFlash: 'kf', kimiText: 'kt'
      }
    });
    return { engine, attempts: () => seen.length };
  }

  const askChain = (engine) => engine.callAgent({
    agentType: 'chat', model: 'gt', mode: 'max', max_tokens: 400, useTools: false,
    messages: [{ role: 'user', content: 'مين هداف ريال مدريد حاليا' }]
  });

  await test('an empty reply moves to the next provider instead of shipping blank', async () => {
    const { engine, attempts } = chainOver([
      { answer: '' },
      { answer: 'هداف ريال مدريد حاليًا هو ...' }
    ]);
    const res = await askChain(engine);
    assert.strictEqual(res.ok, true);
    assert.ok(String(res.answer || '').trim(), 'an empty answer was returned to the user');
    assert.ok(attempts() >= 2, `it never tried another provider (${attempts()} attempts)`);
  });

  await test('whitespace only counts as empty', async () => {
    const { engine } = chainOver([{ answer: '   \n\t  ' }, { answer: 'جواب حقيقي' }]);
    const res = await askChain(engine);
    assert.strictEqual(String(res.answer).trim(), 'جواب حقيقي');
  });

  await test('every provider returning nothing is reported as a failure', async () => {
    const { engine } = chainOver([{ answer: '' }]);
    const res = await askChain(engine);
    assert.strictEqual(res.ok, false, 'an all-empty chain still reported success');
    assert.ok(/empty/i.test(res.error || ''), `the reason is not stated: ${res.error}`);
  });

  await test('an empty reply that carries tool calls is not treated as empty', async () => {
    // Asking for a tool with no prose is normal and must not be discarded.
    const call = { id: '1', type: 'function', function: { name: 'web_search', arguments: '{"query":"x"}' } };
    let round = 0;
    const engine = createRoutingEngine({
      extraTools: HOST_TOOLS,
      llmService: {
        dispatch: async (provider, params) => {
          round++;
          if (round === 1) {
            return { ok: true, answer: '', provider, model: params.model, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call] }, toolCalls: [call] };
          }
          return { ok: true, answer: 'جواب بعد البحث', provider, model: params.model, finish_reason: 'stop' };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async () => ({ query: 'x', results: [{ id: 1, title: 't', url: 'https://e.com', content: 'c' }] }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'gf', groqText: 'gt', groqCode: 'gt', groqVision: 'gv' }
    });
    const res = await engine.callAgent({ agentType: 'chat', model: 'gt', mode: 'max', max_tokens: 400, useTools: true, messages: [{ role: 'user', content: 'سعر الذهب' }] });
    assert.strictEqual(res.ok, true, 'a tool-call round was thrown away as empty');
    assert.ok(/جواب بعد البحث/.test(res.answer), res.answer);
  });

  console.log('\nQueries that actually reach a search engine:');

  const { distillSearchQueryServer, buildSearchBeastPlan, inferSearchMode } = require('../src/search/searchCore');

  await test('conversational filler is stripped from the query', () => {
    const q = distillSearchQueryServer('بدي تقلي مع مين لعبة ريال مدريد القادمة');
    assert.ok(!/تقلي/.test(q), `filler reached the search engine: "${q}"`);
    assert.ok(/ريال مدريد/.test(q), `the actual subject was lost: "${q}"`);
  });

  await test('other Levantine ask-verbs are stripped too', () => {
    for (const phrase of ['احكيلي شو صار بالمباراة', 'خبرني عن سعر الذهب', 'وريني نتيجة المباراة']) {
      const q = distillSearchQueryServer(phrase);
      assert.ok(!/احكيلي|خبرني|وريني/.test(q), `filler survived: "${q}"`);
    }
  });

  await test('the subject survives the stripping', () => {
    assert.ok(/الذهب/.test(distillSearchQueryServer('خبرني عن سعر الذهب')));
    assert.ok(/المباراة|مباراة/.test(distillSearchQueryServer('وريني نتيجة المباراة')));
  });

  await test('fixtures and scorers are treated as time-sensitive', () => {
    for (const q of ['لعبة ريال مدريد القادمة', 'هداف ريال مدريد حاليا', 'ترتيب الدوري الانجليزي']) {
      assert.strictEqual(inferSearchMode(q), 'sports', `"${q}" is not treated as time-sensitive`);
    }
  });

  await test('a time-sensitive search reads pages, not just snippets', () => {
    const plan = buildSearchBeastPlan('هداف ريال مدريد حاليا', false);
    assert.ok(plan.enrichPages >= 1, 'a basic search still reads zero pages, so the answer is snippets only');
  });

  await test('an everyday question is not made expensive', () => {
    const plan = buildSearchBeastPlan('شرح مفهوم الجاذبية', false);
    assert.strictEqual(plan.enrichPages, 0, 'page extraction was turned on for a question that does not need it');
  });

  await test('a scorer question is not searched as a fixture list', () => {
    const plan = buildSearchBeastPlan('current top scorer Real Madrid 2026', false);
    assert.ok(!plan.queries.some((q) => /fixture|next match/i.test(q)), `a scorer question asked the engine for fixtures: ${JSON.stringify(plan.queries)}`);
    assert.ok(plan.queries.some((q) => /goals/i.test(q)), `nothing asks for goals: ${JSON.stringify(plan.queries)}`);
  });

  await test('a fixture question still asks for the fixture', () => {
    const plan = buildSearchBeastPlan('متى مباراة ريال مدريد القادمة', false);
    assert.ok(plan.queries.some((q) => /موعد/.test(q)), JSON.stringify(plan.queries));
  });


  console.log('\nWhat the providers found reaches the model:');

  // From production (Sep 2026): an Arabic conversation about Real Madrid; the
  // model searched "current top scorer Real Madrid 2026" twice and was told
  // "no results" both times. The provider had answered. The ranker judged
  // relevance only against the person's Arabic words, found none of them in
  // English pages, and dropped every result. Every test above fakes the whole
  // search service, which is how this lived through all of them.
  const ARABIC_CONVERSATION = ['كيفك', 'متى مباراة ريال مدريد القادمة', 'طيب مين هداف الدوري الاسباني حاليا؟', 'طب اسم مين هداف ريال مدريد الحالي'].join('\n\n');
  const ENGLISH_PAGES = [
    { title: 'Kylian Mbappé tops Real Madrid scoring chart in 2025-26', url: 'https://www.espn.com/soccer/story/mbappe-goals', content: 'Kylian Mbappé has scored 12 goals in La Liga this season, leading the squad.', score: 0.9 },
    { title: 'Real Madrid statistics 2025/26 - top scorers', url: 'https://www.transfermarkt.com/real-madrid/leistungsdaten', content: 'Goals, assists and minutes for every Real Madrid player.', score: 0.85 },
    { title: 'Vinícius Júnior and Mbappé goal tally', url: 'https://www.marca.com/en/football/real-madrid/goals.html', content: 'The forwards continue to share the goals.', score: 0.8 },
    { title: 'Real Madrid squad stats', url: 'https://fbref.com/en/squads/53a2f082/Real-Madrid-Stats', content: 'Standard stats.', score: 0.7 }
  ];

  function tavilyService({ pages = ENGLISH_PAGES, rewriter } = {}) {
    const sentQueries = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse((init && init.body) || '{}');
      if (!String(url).includes('tavily')) return new Response('', { status: 503 });
      sentQueries.push(body.query);
      return new Response(JSON.stringify({ results: pages }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const service = createSearchService({
      stableCacheKey: (...parts) => parts.join('|'),
      cacheGet: () => null,
      cacheSet: (_c, _k, v) => v,
      memoryCaches: { search: new Map(), deepSearch: new Map() },
      tavilyApiKey: 'tv-test',
      fetchImpl,
      llmService: rewriter,
      queryRewriter: rewriter ? { provider: 'groq', model: 'fast' } : undefined
    });
    return { service, sentQueries };
  }

  await test('an Arabic conversation searched in English keeps the English results', async () => {
    const { service } = tavilyService();
    const payload = await service.performSearch({ rawQuery: 'current top scorer Real Madrid 2026', originalQuestion: ARABIC_CONVERSATION, queryFromModel: true });
    // All four: every one matches the query that found it. Keeping "at least
    // a few" would pass with relevance still judged against the Arabic alone.
    assert.strictEqual(payload.results.length, ENGLISH_PAGES.length, `${payload.results.length} of ${ENGLISH_PAGES.length} results reached the model (status "${payload.status}")`);
    assert.ok(payload.results.some((r) => /espn\.com/.test(r.url)), 'the best source was dropped');
    assert.strictEqual(payload.status, 'ok');
  });

  await test('the same, as the model sees it: sources, not "no results"', async () => {
    const { service } = tavilyService();
    const payload = await service.performSearch({ rawQuery: 'Real Madrid leading scorer 2026', originalQuestion: 'طب اسم مين هداف ريال مدريد الحالي', queryFromModel: true });
    const text = formatSearchResultsForTool(payload);
    assert.ok(!/No web results found/.test(text), text.slice(0, 200));
    assert.ok(/espn\.com/.test(text), 'the tool output has no sources');
  });

  await test('"ok" is never reported beside an empty list', async () => {
    const { service } = tavilyService({ pages: [{ title: 'no link', url: '', content: 'x' }] });
    const payload = await service.performSearch({ rawQuery: 'Real Madrid top scorer', originalQuestion: 'Real Madrid top scorer', queryFromModel: true });
    assert.strictEqual(payload.results.length, 0);
    assert.strictEqual(payload.status, 'empty', `status "${payload.status}" with nothing to show`);
  });

  await test('ranking prunes off-topic results but never empties what the providers found', () => {
    const { rankSearchBeastResults } = require('../src/search/searchCore');
    const unrelated = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ title: `Page ${k}`, url: `https://site-${k}.example/x`, content: 'Nothing that matches.', score: 0.5 }));
    const ranked = rankSearchBeastResults(unrelated, 'general', 'سؤال عن شيء مختلف تماما');
    assert.ok(ranked.length >= 3, `the ranker turned ${unrelated.length} results into ${ranked.length}`);
  });

  await test('a query the model wrote is searched as written, not rewritten from the conversation', async () => {
    const rewrites = [];
    const rewriter = { dispatch: async (_p, params) => { rewrites.push(params); return { ok: true, answer: '{"native":"موعد مباراة ريال مدريد القادمة","english":"Real Madrid next match date"}' }; } };
    const { service, sentQueries } = tavilyService({ rewriter });
    const payload = await service.performSearch({ rawQuery: 'current top scorer Real Madrid 2026', originalQuestion: ARABIC_CONVERSATION, queryFromModel: true });
    assert.strictEqual(rewrites.length, 0, 'the conversation was rewritten into queries anyway');
    assert.strictEqual(payload.queries[0], 'current top scorer Real Madrid 2026');
    assert.ok(!sentQueries.some((q) => /next match/i.test(q)), `an earlier topic reached the engine: ${JSON.stringify(sentQueries)}`);
  });

  await test('a question typed by the person is still rewritten (control)', async () => {
    const rewrites = [];
    const rewriter = { dispatch: async (_p, params) => { rewrites.push(params); return { ok: true, answer: '{"native":"هداف ريال مدريد","english":"Real Madrid top scorer"}' }; } };
    const { service } = tavilyService({ rewriter });
    await service.performSearch({ rawQuery: 'هداف ريال مدريد', originalQuestion: 'بدي أعرف مين هداف ريال مدريد هذا الموسم في كل البطولات مع عدد الأهداف لكل لاعب' });
    assert.strictEqual(rewrites.length, 1, 'the rewriter never ran, so the test above proves nothing');
  });

  await test('each search hands the page its sources', async () => {
    const results = ENGLISH_PAGES.map((r, i) => ({ id: i + 1, ...r }));
    const engine = createRoutingEngine({
      extraTools: HOST_TOOLS,
      llmService: {
        dispatch: async (provider, params) => {
          if ((params.messages || []).some((m) => m.role === 'tool')) return { ok: true, answer: 'Mbappé [1](https://www.espn.com/soccer/story/mbappe-goals).', provider, model: params.model, finish_reason: 'stop' };
          const call = { id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"Real Madrid top scorer"}' } };
          return { ok: true, answer: '', provider, model: params.model, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call] }, toolCalls: [call] };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
    });
    const res = await engine.callAgent({ agentType: 'chat', model: 't', mode: 'flash', max_tokens: 200, useTools: true, messages: [{ role: 'user', content: 'مين هداف ريال مدريد؟' }] });
    const searched = (res.toolsUsed || []).find((t) => t.tool === 'web_search');
    assert.ok(searched && Array.isArray(searched.sources), `no sources in toolsUsed: ${JSON.stringify(res.toolsUsed)}`);
    assert.strictEqual(searched.sources[0].url, 'https://www.espn.com/soccer/story/mbappe-goals');
    assert.ok(searched.sources.every((s) => s.title && /^https:/.test(s.url)), JSON.stringify(searched.sources));
  });

  await test('a long answer that is continued keeps its sources', async () => {
    // The continuation is a fresh call; its result used to replace the first
    // one wholesale, so an answer long enough to need finishing lost the
    // record of the search it was written from — and with it the cards.
    const results = ENGLISH_PAGES.map((r, i) => ({ id: i + 1, ...r }));
    const engine = createRoutingEngine({
      llmService: {
        dispatch: async (provider, params) => {
          const last = params.messages[params.messages.length - 1];
          if (last.role === 'user' && /^(Continue|تابع)/.test(String(last.content))) return { ok: true, answer: '…and the rest.', provider, model: params.model, finish_reason: 'stop' };
          if (params.messages.some((m) => m.role === 'tool')) return { ok: true, answer: 'A long answer that ran out of room', provider, model: params.model, finish_reason: 'length' };
          const call = { id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"Real Madrid top scorer"}' } };
          return { ok: true, answer: '', provider, model: params.model, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call] }, toolCalls: [call] };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
    });
    const messages = [{ role: 'user', content: 'Who is Real Madrid\'s top scorer? Explain in detail.' }];
    const ai = await engine.callAgent({ agentType: 'chat', model: 't', mode: 'flash', max_tokens: 200, useTools: true, messages });
    const done = await engine.completeIfTruncated({ ai, messages, temperature: 0.5, max_tokens: 200 });
    assert.ok(done.continued, `the answer was not continued, so this proves nothing: ${JSON.stringify(done).slice(0, 160)}`);
    const searched = (done.toolsUsed || []).find((t) => t.tool === 'web_search');
    assert.ok(searched && (searched.sources || []).length, `the continued answer lost its sources: ${JSON.stringify(done.toolsUsed)}`);
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

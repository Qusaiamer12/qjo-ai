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

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

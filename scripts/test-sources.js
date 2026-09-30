// Who published a source, and whether that reaches the ranking, the model and
// the page.
//
// Two guesses used to answer "who published this": scoreSource() for the
// ranking and sourceKind() for the label, and they disagreed. A ministry in
// Amman was "web", WHO and Mayo Clinic had no tier of their own, every ".org"
// got an official's bonus, "indeed.jobs" counted as Jordanian (".jo"), and a
// domain with "help" in it was labelled official documentation. And what the
// page received of a source was its title and link: the date and what it said
// were dropped on the way.
const assert = require('assert');
const { tierOf, siteName } = require('../public/domain/sourceTier');
const { scoreSource, inferSearchMode, rankSearchBeastResults } = require('../src/search/searchCore');
const { sourcesForPage, formatSearchResultsForTool } = require('../src/agents/toolAnswer');
const { sourcesFromToolsUsed } = require('../public/domain/streamProtocol');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 3).join('\n     ')}`); });
}

const TIERS = [
  ['https://www.moh.gov.jo/Default/Ar', 'medical'],
  ['https://mof.gov.jo/', 'official'],
  ['https://www.cdc.gov/flu/', 'medical'],
  ['https://www.irs.gov/forms', 'official'],
  ['https://www.gouv.fr/', 'official'],
  ['https://www.mhlw.go.jp/', 'official'],
  ['https://www.who.int/news-room', 'medical'],
  ['https://pubmed.ncbi.nlm.nih.gov/12345/', 'medical'],
  ['https://www.mayoclinic.org/diseases', 'medical'],
  ['https://www.ox.ac.uk/research', 'academic'],
  ['https://ju.edu.jo/', 'academic'],
  ['https://arxiv.org/abs/2401.00001', 'academic'],
  ['https://www.nature.com/articles/x', 'academic'],
  ['https://news.un.org/en/story', 'official'],
  ['https://www.reuters.com/world/', 'news'],
  ['https://www.aljazeera.net/news', 'news'],
  ['https://ar.wikipedia.org/wiki/x', 'reference'],
  ['https://docs.python.org/3/library/', 'docs'],
  ['https://developer.mozilla.org/en-US/', 'docs'],
  ['https://requests.readthedocs.io/en/latest/', 'docs'],
  ['https://support.google.com/accounts/answer/1', 'docs'],
  ['https://help.shopify.com/en/manual', 'docs'],
  ['https://github.com/nodejs/node', 'code'],
  ['https://stackoverflow.com/questions/1', 'community'],
  ['https://www.reddit.com/r/x', 'community'],
  // What the old guesses got wrong:
  ['https://www.helpguide.org/articles', 'web'],
  ['https://some-random-blog.org/post', 'web'],
  ['https://indeed.jobs/amman', 'web'],
  ['https://healthline.com/health', 'web'],
  ['https://notgov.com/', 'web'],
  ['https://gov.example.com/', 'web'],
  ['https://mybox.com/', 'web'],
  ['javascript:alert(1)', 'web'],
  ['not a url', 'web']
];

(async () => {
  console.log('\nOne classifier, one answer per source:');

  await test('every tier, and what the old guesses got wrong', () => {
    const wrong = TIERS.filter(([url, tier]) => tierOf(url) !== tier).map(([url, tier]) => `${url}: ${tierOf(url)}, not ${tier}`);
    assert.deepStrictEqual(wrong, []);
  });

  await test('a site is named as a reader knows it', () => {
    const names = ['https://pubmed.ncbi.nlm.nih.gov/1', 'https://www.who.int/x', 'https://www.bbc.co.uk/news', 'https://healthline.com/x', 'https://mof.gov.jo/', 'https://en.wikipedia.org/wiki/x'].map(siteName);
    assert.deepStrictEqual(names, ['PubMed', 'WHO', 'BBC', 'Healthline', 'MOF', 'Wikipedia']);
    assert.strictEqual(siteName('not a url'), '');
  });

  console.log('\nThe ranking leans on who published it:');

  const at = (url, score = 0.5) => ({ url, title: 'x', content: 'x', score });
  await test('an official source outranks a blog with the same provider score', () => {
    assert.ok(scoreSource(at('https://mof.gov.jo/budget'), 'general') > scoreSource(at('https://some-random-blog.org/budget'), 'general'));
    assert.ok(scoreSource(at('https://www.irs.gov/x'), 'general') > scoreSource(at('https://example.com/x'), 'general'));
  });

  await test('a forum sits below an ordinary page, except for a technical question', () => {
    assert.ok(scoreSource(at('https://www.reddit.com/r/x'), 'general') < scoreSource(at('https://example.com/x'), 'general'));
    assert.ok(scoreSource(at('https://stackoverflow.com/q/1'), 'technical') > scoreSource(at('https://example.com/x'), 'technical'));
  });

  await test('a medical question puts clinical sources first', () => {
    const who = scoreSource(at('https://www.who.int/x', 0.4), 'medical');
    const blog = scoreSource(at('https://healthline.com/x', 0.6), 'medical');
    assert.ok(who > blog, `WHO ${who.toFixed(2)} vs a health blog ${blog.toFixed(2)} with a better provider score`);
  });

  await test('a Jordanian source is regional; ".jobs" is not ".jo"', () => {
    const jo = scoreSource(at('https://www.alghad.jo/x'), 'general');
    const jobs = scoreSource(at('https://indeed.jobs/x'), 'general');
    assert.ok(jo > jobs, `alghad.jo ${jo} vs indeed.jobs ${jobs}`);
    assert.strictEqual(jobs, scoreSource(at('https://example.com/x'), 'general'));
  });

  await test('".org" alone earns nothing', () => {
    assert.strictEqual(scoreSource(at('https://some-random-blog.org/x'), 'general'), scoreSource(at('https://some-random-blog.com/x'), 'general'));
  });

  await test('an authoritative page survives the relevance filter; a forum does not', () => {
    const results = [
      at('https://www.who.int/fact-sheet'), at('https://www.reddit.com/r/x'),
      ...['a', 'b', 'c', 'd'].map((k) => ({ url: `https://site-${k}.example/diabetes`, title: 'diabetes symptoms', content: 'diabetes symptoms', score: 0.5 }))
    ];
    const kept = rankSearchBeastResults(results, 'medical', 'diabetes symptoms').map((r) => r.url);
    assert.ok(kept.includes('https://www.who.int/fact-sheet'), 'WHO dropped for not repeating the words');
    assert.ok(!kept.includes('https://www.reddit.com/r/x'), 'an off-topic forum post kept');
  });

  await test('medical questions are recognised in both languages, and only those', () => {
    const medical = ['ما هي أعراض السكري', 'جرعة الباراسيتامول للأطفال', 'علاج الصداع النصفي', 'الادوية المسموحة للحوامل', 'side effects of ibuprofen', 'treatment options for asthma'];
    const not = ['من حامل لقب الدوري الإسباني', 'نتائج مرضية للشركة', 'حساب الحمل الكهربائي', 'water treatment plant design', 'diagnose my network error', 'مرضي عن الخدمة'];
    assert.deepStrictEqual(medical.filter((q) => inferSearchMode(q) !== 'medical'), [], 'medical questions missed');
    assert.deepStrictEqual(not.filter((q) => inferSearchMode(q) === 'medical'), [], 'not medical, read as medical');
  });

  console.log('\nWhat the model is told about each source:');

  const RESULTS = [
    { id: 1, title: 'Diabetes fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes', content: 'About 830 million people have diabetes. Most live in low- and middle-income countries. '.repeat(6), publishedDate: '2024-11-14T00:00:00Z' },
    { id: 2, title: 'My diabetes story', url: 'https://www.reddit.com/r/diabetes/1', content: 'I think it is 500 million.' }
  ];
  const told = formatSearchResultsForTool({ query: 'diabetes', results: RESULTS });

  await test('each result says who published it', () => {
    assert.ok(/who\.int[^\n]*medical authority/.test(told), told.slice(0, 300));
    assert.ok(/reddit\.com[^\n]*opinion, not evidence/.test(told));
  });

  await test('figures are checked across sources, and a conflict is said, not averaged', () => {
    assert.ok(/Check each key number/.test(told) && /say so in one line/.test(told) && /Never average/.test(told), told.slice(-700));
  });

  await test('the rule travels with results only', () => {
    const empty = formatSearchResultsForTool({ query: 'x', results: [] });
    assert.ok(!/Check each key number/.test(empty) && !/medical authority/.test(empty));
  });

  await test('with six full results, the rules still reach the model through the tool loop', async () => {
    const long = 'Figures differ between reports and years; this paragraph is the full text of one. '.repeat(14);
    const six = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, title: `Report ${i + 1} on the same question`, url: `https://www.example-news-${i}.com/2026/09/30/a-long-article-slug`, content: long, publishedDate: '2026-09-30' }));
    let seen = '';
    const engine = createRoutingEngine({
      llmService: {
        dispatch: async (provider, params) => {
          const tool = (params.messages || []).find((m) => m.role === 'tool');
          if (tool) { seen = tool.content; return { ok: true, answer: 'ok', provider, model: params.model, finish_reason: 'stop' }; }
          const call = { id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"x"}' } };
          return { ok: true, answer: '', provider, model: params.model, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call] }, toolCalls: [call] };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: six }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
    });
    await engine.callAgent({ agentType: 'chat', model: 't', mode: 'flash', max_tokens: 200, useTools: true, messages: [{ role: 'user', content: 'x' }] });
    assert.ok(/Never average/.test(seen) && /Answer in the language/.test(seen), `the rules were cut off: the model saw ${seen.length} characters ending "${seen.slice(-80)}"`);
    assert.ok(six.every((r) => seen.includes(r.url)), 'a result was cut off');
  });

  console.log('\nWhat the page receives of each source:');

  await test('title, link, site, tier, date and a sentence of what it says', () => {
    const [who, forum] = sourcesForPage({ results: RESULTS });
    assert.strictEqual(who.site, 'WHO');
    assert.strictEqual(who.kind, 'medical');
    assert.strictEqual(who.published, '2024-11-14');
    assert.ok(who.snippet.startsWith('About 830 million') && who.snippet.length <= 245, who.snippet);
    assert.strictEqual(forum.kind, 'community');
  });

  await test('the stream keeps them all the way to the page', () => {
    const [source] = sourcesFromToolsUsed([{ tool: 'web_search', sources: sourcesForPage({ results: RESULTS }) }]);
    assert.deepStrictEqual(
      { site: source.site, kind: source.kind, published: source.published, snippet: source.snippet.slice(0, 17) },
      { site: 'WHO', kind: 'medical', published: '2024-11-14', snippet: 'About 830 million' }
    );
  });

  await test('the sources go to the page the moment the search finishes', async () => {
    const events = [];
    const engine = createRoutingEngine({
      llmService: {
        dispatch: async (provider, params) => {
          if ((params.messages || []).some((m) => m.role === 'tool')) {
            events.push({ answerStarted: true });
            return { ok: true, answer: 'About 830 million [1](https://www.who.int/news-room/fact-sheets/detail/diabetes).', provider, model: params.model, finish_reason: 'stop' };
          }
          const call = { id: 't1', type: 'function', function: { name: 'web_search', arguments: '{"query":"diabetes prevalence"}' } };
          return { ok: true, answer: '', provider, model: params.model, finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [call] }, toolCalls: [call] };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: RESULTS }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
    });
    await engine.callAgent({
      agentType: 'chat', model: 't', mode: 'flash', max_tokens: 200, useTools: true,
      messages: [{ role: 'user', content: 'How many people have diabetes?' }], onToolCall: (info) => events.push(info)
    });
    const doneAt = events.findIndex((e) => e.status === 'done');
    const running = events.find((e) => e.status === 'running');
    assert.ok(doneAt >= 0 && Array.isArray(events[doneAt].sources) && events[doneAt].sources[0].site === 'WHO', JSON.stringify(events).slice(0, 300));
    assert.ok(doneAt < events.findIndex((e) => e.answerStarted), 'the sources came after the answer began');
    assert.ok(running && !running.sources, 'a search still running has no sources to show');
  });

  console.log(`\n========================================\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// "It knows it should search, then it just stops."
//
// Every case here drives the real llmService and the real RoutingEngine
// against a fake OpenAI-compatible provider over real HTTP, because the hangs
// lived in the network plumbing: a timeout that disarmed itself the moment
// response headers arrived, so a provider that sent headers and then went
// quiet held the request forever. A stubbed dispatch() cannot reproduce that.
//
// Each case has its own watchdog. A hang is reported as "HUNG after Ns",
// never as a test run that simply does not finish.
'use strict';

const http = require('http');
const { createLlmService } = require('../src/services/llmService');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');
const { createSearchService } = require('../src/services/searchService');
const { STREAM_IDLE_MS } = require('../src/services/providerResponse');

let pass = 0;
let fail = 0;
// Assertions belong to the scenario that is running. A scenario that hung is
// abandoned, not stopped, and when its call finally settles its checks must
// not land under whichever scenario is printing by then.
let activeScenario = 0;
const ok = (cond, name, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  if (!cond && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 300)}`);
};
const scopedOk = (id) => (cond, name, detail) => { if (id === activeScenario) ok(cond, name, detail); };

// ── Fake provider ────────────────────────────────────────────────────────────

const openResponses = new Set();
let handler = null;
let calls = [];

// The same server stands in for a search provider at /tavily, so a scenario
// can run the real search service — ranking included — instead of a stub.
let tavilyHandler = null;

const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    if (req.url.startsWith('/tavily')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(tavilyHandler(body)));
      return;
    }
    calls.push({ body, auth: req.headers.authorization, at: Date.now() });
    openResponses.add(res);
    res.on('close', () => openResponses.delete(res));
    handler(body, res, calls.length - 1);
  });
});

const sseHeaders = (res) => res.writeHead(200, { 'content-type': 'text/event-stream' });
const frame = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

const reply = {
  // Headers, then silence. The connection stays open.
  stall(res, body) {
    if (body.stream) sseHeaders(res);
    else res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
  },
  // Streams a few words, then silence.
  stallMidStream(res, text) {
    sseHeaders(res);
    frame(res, { choices: [{ delta: { content: text } }] });
  },
  text(res, body, text) {
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }));
      return;
    }
    sseHeaders(res);
    for (const word of text.split(/(?<= )/)) frame(res, { choices: [{ delta: { content: word } }] });
    frame(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
    res.end('data: [DONE]\n\n');
  },
  toolCall(res, body, name, args, preamble = '') {
    const call = { id: `call_${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: preamble || null, tool_calls: [call] }, finish_reason: 'tool_calls' }] }));
      return;
    }
    sseHeaders(res);
    if (preamble) frame(res, { choices: [{ delta: { content: preamble } }] });
    frame(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: call.id, function: { name, arguments: call.function.arguments } }] } }] });
    frame(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
    res.end('data: [DONE]\n\n');
  },
  error(res, status, message) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message } }));
  }
};

// Three kinds of request reach the provider: the first round (tools offered,
// nothing gathered yet), an answer round (tool results in the messages), and
// a synthesis round (no tools; what was gathered is folded into the question).
// Scenarios fail "answer rounds" of both later kinds the same way, because to
// the person they are the same thing: the step that should produce the answer.
const hasToolResults = (body) => (body.messages || []).some((m) => m.role === 'tool');
const isFirstRound = (body) => Boolean(body.tools) && !hasToolResults(body);
const evidenceText = (body) => (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');

// ── Engine under test ────────────────────────────────────────────────────────

const SEARCH_RESULTS = {
  query: 'هداف ريال مدريد',
  results: [
    { id: 1, title: 'Real Madrid top scorers 2025/26', url: 'https://example.com/scorers', content: 'Kylian Mbappé leads Real Madrid with 31 goals in all competitions.', publishedDate: '2026-05-20' },
    { id: 2, title: 'ريال مدريد: الهدافون', url: 'https://example.org/rm', content: 'مبابي في صدارة هدافي ريال مدريد هذا الموسم.' }
  ]
};

// The production search service, with only its network pointed here.
function realSearchService(baseUrl) {
  return createSearchService({
    tavilyApiKey: 'tv-test',
    searchEndpoints: { tavily: baseUrl.replace(/\/v1$/, '/tavily') },
    stableCacheKey: (...parts) => parts.join('|'),
    cacheGet: () => null,
    cacheSet: (_c, _k, v) => v,
    memoryCaches: { search: new Map(), deepSearch: new Map() },
    // A rewriter that fixes on the conversation's earlier topic, as a real
    // one given the last four messages can. Only a query the model did not
    // write should ever reach it.
    llmService: { dispatch: async () => ({ ok: true, answer: '{"native":"موعد مباراة ريال مدريد القادمة","english":"Real Madrid next match date"}' }) },
    queryRewriter: { provider: 'groq', model: 'fast' }
  });
}

function buildEngine({ baseUrl, keys = ['key-a'], search = async () => SEARCH_RESULTS, secondProvider = false, searchService = null }) {
  const llmService = createLlmService({
    llm7Keys: keys,
    llm7BaseUrl: baseUrl,
    kimiKeys: secondProvider ? ['kimi-key'] : [],
    kimiBaseUrl: baseUrl
  });
  return createRoutingEngine({
    llmService,
    safeCalculate: null,
    searchService: searchService || { performSearch: ({ rawQuery, originalQuestion }) => search({ rawQuery, originalQuestion }) },
    keys: { groq: 0, llm7: keys.length, qwen: 0, kimi: secondProvider ? 1 : 0 },
    models: { llm7Flash: 'fake-flash', llm7Text: 'fake-text', kimiFlash: 'fake-kimi', kimiText: 'fake-kimi' }
  });
}

const QUESTION = 'مين هداف ريال مدريد هذا الموسم؟';

async function ask(engine, { budgetMs, question = QUESTION, history = [] } = {}) {
  const chunks = [];
  const toolEvents = [];
  const started = Date.now();
  const res = await engine.callAgent({
    mode: 'flash',
    messages: [...history, { role: 'user', content: question }],
    budgetMs,
    onChunk: (t) => chunks.push(t),
    onToolCall: (e) => toolEvents.push(e)
  });
  return { res, shown: chunks.join(''), toolEvents, ms: Date.now() - started };
}

// A case that never settles is the bug this suite exists for, so it has to
// fail with that name rather than hold the run open.
async function scenario(name, limitMs, fn) {
  console.log(`\n${name}`);
  calls = [];
  const id = ++activeScenario;
  let timer;
  const hung = new Promise((resolve) => { timer = setTimeout(() => resolve('HUNG'), limitMs); });
  let outcome;
  try {
    outcome = await Promise.race([fn(scopedOk(id)).then(() => 'done'), hung]);
  } catch (err) {
    outcome = 'threw';
    ok(false, `threw: ${err && err.message}`);
  }
  clearTimeout(timer);
  if (outcome === 'HUNG') ok(false, `HUNG — no result after ${limitMs / 1000}s`);
  activeScenario = 0;
  for (const res of openResponses) res.destroy();
  openResponses.clear();
}

async function main() {
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${provider.address().port}/v1`;

  await scenario('The answer round stalls after its headers (the reported hang)', 25000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' }, 'سأبحث عن أحدث المعلومات. ');
      return reply.stall(res, body);
    };
    const { res, shown, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 15000 });
    ok(ms < 17000, `returns inside its budget (${ms}ms of 15000)`);
    ok(res.ok, 'still reports an answer', res.error);
    ok(/مبابي|Mbapp/.test(res.answer || ''), 'the answer is built from what the search found', (res.answer || '').slice(0, 160));
    ok(/example\.com\/scorers/.test(res.answer || ''), 'and it links the sources', (res.answer || '').slice(0, 300));
    ok(!/^سأبحث عن أحدث المعلومات\.\s*$/.test((res.answer || '').trim()), 'not just "I will search"', res.answer);
    ok(shown.includes('مبابي') || shown.includes('Mbapp'), 'the person sees it (onChunk)', shown.slice(0, 160));
  });

  await scenario('The very first round stalls after its headers', 25000, async (ok) => {
    handler = (body, res) => reply.stall(res, body);
    const { res, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 12000 });
    ok(ms < 14000, `gives up inside its budget (${ms}ms of 12000)`);
    ok(!res.ok, 'reports the failure instead of waiting forever', res);
  });

  await scenario('Words arrive, then the stream goes quiet', 30000, async (ok) => {
    handler = (body, res) => reply.stallMidStream(res, 'ريال مدريد يتصدر هدافيه ');
    const { res, shown, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 15000 });
    ok(ms < STREAM_IDLE_MS + 3000, `ends once the stream has been silent for ${STREAM_IDLE_MS / 1000}s (${ms}ms)`);
    ok(res.ok && /ريال مدريد/.test(res.answer || ''), 'keeps what was already delivered', res);
    ok(shown.includes('ريال مدريد'), 'the delivered words stay on screen', shown);
  });

  await scenario('A slow but steady answer is never cut off by the deadline', 30000, async (ok) => {
    const words = Array.from({ length: 24 }, (_, i) => `كلمة${i + 1} `);
    handler = (body, res) => {
      sseHeaders(res);
      let i = 0;
      const tick = setInterval(() => {
        if (res.destroyed) return clearInterval(tick);
        if (i < words.length) { frame(res, { choices: [{ delta: { content: words[i++] } }] }); return; }
        clearInterval(tick);
        frame(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
        res.end('data: [DONE]\n\n');
      }, 400);
    };
    const { res, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 5000, question: 'اكتب فقرة طويلة' });
    ok(ms > 5000, `it ran past the 5s budget because words kept coming (${ms}ms)`);
    ok(res.ok && res.answer.trim().endsWith('كلمة24'), 'and the whole answer arrived, to the last word', (res.answer || '').slice(-40));
  });

  await scenario('Keep-alive comments without content do not hold the request', 25000, async (ok) => {
    handler = (body, res) => {
      sseHeaders(res);
      const tick = setInterval(() => { if (res.destroyed) return clearInterval(tick); res.write(': keep-alive\n\n'); }, 300);
    };
    const { res, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 8000 });
    ok(ms < 10000, `gives up inside its budget (${ms}ms of 8000)`);
    ok(!res.ok, 'and reports the failure', res);
  });

  await scenario('Every key stalls: rotation must share one budget, not multiply it', 40000, async (ok) => {
    handler = (body, res) => reply.stall(res, body);
    const engine = buildEngine({ baseUrl, keys: ['k1', 'k2', 'k3', 'k4'] });
    const { res, ms } = await ask(engine, { budgetMs: 12000 });
    ok(ms < 14000, `four stalled keys still finish inside the budget (${ms}ms of 12000)`);
    ok(!res.ok, 'and report failure', res.error);
  });

  await scenario('The answer round is rejected after the search (400)', 25000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' }, 'لحظة، أبحث. ');
      return reply.error(res, 400, "'messages.2' : for 'role:tool' the following must be satisfied");
    };
    const { res, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 15000 });
    ok(ms < 17000, `returns inside its budget (${ms}ms)`);
    ok(res.ok && /مبابي|Mbapp/.test(res.answer || ''), 'answers from the search results anyway', (res.answer || '').slice(0, 200));
  });

  await scenario('The answer round fails on one provider: the next one writes it', 25000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      if (body.model === 'fake-flash') return reply.error(res, 503, 'upstream overloaded');
      return reply.text(res, body, `حسب المصادر، مبابي هو الهداف [1](https://example.com/scorers). ${evidenceText(body).includes('31 goals') ? '(31 هدفًا)' : ''}`);
    };
    const { res, ms } = await ask(buildEngine({ baseUrl, secondProvider: true }), { budgetMs: 20000 });
    ok(ms < 22000, `returns inside its budget (${ms}ms)`);
    ok(res.ok && /31 هدفًا/.test(res.answer || ''), 'the second provider answers WITH the search results it was handed', (res.answer || '').slice(0, 200));
  });

  await scenario('The answer round stalls on one provider: another provider writes it', 30000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      if (body.model === 'fake-flash') return reply.stall(res, body);
      return reply.text(res, body, 'مبابي هو الهداف بحسب المصادر [1](https://example.com/scorers).');
    };
    // 15s, not generous: the stalled round must leave the reserve untouched,
    // or the healthy provider never gets its turn and the person gets links.
    const { res, ms } = await ask(buildEngine({ baseUrl, secondProvider: true }), { budgetMs: 15000 });
    ok(ms < 12000, `the stall is cut short to leave time for another provider (${ms}ms of 15000)`);
    ok(res.ok && res.provider === 'kimi' && /مبابي هو الهداف/.test(res.answer || ''), 'the healthy provider writes a real answer, not a list of links', { provider: res.provider, answer: (res.answer || '').slice(0, 120) });
  });

  await scenario('A request without streaming whose body never arrives', 25000, async (ok) => {
    handler = (body, res) => reply.stall(res, body);
    const engine = buildEngine({ baseUrl });
    const started = Date.now();
    const res = await engine.callAgent({ mode: 'flash', messages: [{ role: 'user', content: 'سؤال بدون بث' }], budgetMs: 10000, useTools: false });
    const ms = Date.now() - started;
    ok(calls.length > 0 && calls.every((c) => !c.body.stream), 'the provider was asked without streaming', calls.map((c) => c.body.stream));
    ok(ms < 12000, `gives up inside its budget (${ms}ms of 10000)`);
    ok(!res.ok, 'and reports the failure', res);
  });

  await scenario('The search tool itself never returns', 30000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      return reply.text(res, body, `لم أتمكن من الوصول إلى نتائج بحث حديثة الآن. `);
    };
    const engine = buildEngine({ baseUrl, search: () => new Promise(() => {}) });
    const { res, ms } = await ask(engine, { budgetMs: 20000 });
    ok(ms < 22000, `returns inside its budget (${ms}ms)`);
    ok(res.ok && (res.answer || '').trim().length > 0, 'the model still answers, told the search failed', (res.answer || '').slice(0, 200));
  });

  await scenario('Several searches in one round share one time limit', 30000, async (ok) => {
    // Three calls in one round, none of which returns. Each used to get the
    // full tool timeout in turn, so the round took three times its budget.
    handler = (body, res) => {
      if (isFirstRound(body)) {
        sseHeaders(res);
        const calls3 = ['أ', 'ب', 'ج'].map((q, index) => ({ index, id: `call_${index}`, function: { name: 'web_search', arguments: JSON.stringify({ query: `بحث ${q}` }) } }));
        frame(res, { choices: [{ delta: { tool_calls: calls3 } }] });
        frame(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
        return res.end('data: [DONE]\n\n');
      }
      return reply.text(res, body, 'تعذّر البحث في الوقت المتاح.');
    };
    const engine = buildEngine({ baseUrl, search: () => new Promise(() => {}) });
    const { res, ms } = await ask(engine, { budgetMs: 20000 });
    ok(ms < 22000, `three stuck searches still end inside the budget (${ms}ms of 20000)`);
    ok(res.ok && (res.answer || '').trim().length > 0, 'and the person gets an answer', res);
  });

  await scenario('The search finds nothing', 25000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      return reply.text(res, body, 'لم أجد مصادر حديثة تؤكد ذلك.');
    };
    const engine = buildEngine({ baseUrl, search: async ({ rawQuery }) => ({ query: rawQuery, results: [] }) });
    const { res } = await ask(engine, { budgetMs: 15000 });
    ok(res.ok && (res.answer || '').trim().length > 0, 'an empty search still ends in an answer', res);
    const toolMsg = calls.length > 1 ? evidenceText(calls[calls.length - 1].body) : '';
    ok(/No web results/.test(toolMsg), 'the model is told plainly that nothing was found', toolMsg.slice(0, 120));
  });

  await scenario('The search throws', 25000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      return reply.text(res, body, 'تعذّر البحث الآن، وهذا ما أعرفه مع التنبيه أنه قد لا يكون محدّثًا.');
    };
    const engine = buildEngine({ baseUrl, search: async () => { throw new Error('Tavily 432: quota exceeded'); } });
    const { res } = await ask(engine, { budgetMs: 15000 });
    ok(res.ok && (res.answer || '').trim().length > 0, 'a failed search still ends in an answer', res);
  });

  await scenario('Search, then everything fails: the results themselves are the answer', 25000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      return reply.error(res, 503, 'upstream overloaded');
    };
    const { res, shown } = await ask(buildEngine({ baseUrl, secondProvider: true }), { budgetMs: 15000 });
    ok(res.ok, 'reports an answer rather than "all providers failed"', res.error);
    ok(/example\.com\/scorers/.test(res.answer || '') && /example\.org\/rm/.test(res.answer || ''), 'every source found is listed with its link', (res.answer || '').slice(0, 400));
    ok(/Mbapp|مبابي/.test(res.answer || ''), 'with what each source says', (res.answer || '').slice(0, 300));
    ok(shown.length > 0, 'and it reaches the screen', shown.slice(0, 120));
  });

  await scenario('The search fails and every model fails after it: an honest failure', 25000, async (ok) => {
    // Nothing was found, so there is no evidence to fall back on. The one
    // wrong outcome is the old one: the round that asked for the search,
    // "let me look that up", delivered as if it were the answer.
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' }, 'سأبحث لك الآن. ');
      return reply.error(res, 503, 'upstream overloaded');
    };
    const engine = buildEngine({ baseUrl, search: async () => { throw new Error('search provider down'); } });
    const { res, ms } = await ask(engine, { budgetMs: 15000 });
    ok(ms < 17000, `ends inside its budget (${ms}ms)`);
    ok(!res.ok, 'it is reported as a failure the page can retry', { ok: res.ok, answer: res.answer });
    ok(!/سأبحث لك الآن/.test(res.answer || ''), 'the preamble is never returned as the answer', res.answer);
  });

  await scenario('The model keeps asking to search instead of answering', 25000, async (ok) => {
    // Some models answer every turn with a tool call, even when no tools were
    // offered. Their "answer" is then only ever the preamble.
    handler = (body, res) => reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' }, 'دعني أبحث مرة أخرى. ');
    const { res, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 15000 });
    ok(ms < 17000, `ends inside its budget (${ms}ms)`);
    ok(res.ok && /example\.com\/scorers/.test(res.answer || ''), 'the sources become the answer', (res.answer || '').slice(0, 200));
    ok(!/^دعني أبحث مرة أخرى\.?$/.test((res.answer || '').trim()), 'the preamble is never accepted as the answer', res.answer);
  });

  await scenario('The provider sends [DONE] but leaves the connection open', 25000, async (ok) => {
    handler = (body, res) => {
      sseHeaders(res);
      frame(res, { choices: [{ delta: { content: 'الجواب كامل.' } }] });
      frame(res, { choices: [{ delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      // ...and never calls res.end().
    };
    const { res, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 15000, question: 'سؤال عادي' });
    ok(ms < 1500, `[DONE] ends the answer without waiting for the close (${ms}ms)`);
    ok(res.ok && res.answer === 'الجواب كامل.', 'and nothing is lost', res.answer);
  });

  await scenario('A plain question with no search still streams normally', 15000, async (ok) => {
    handler = (body, res) => reply.text(res, body, 'أهلًا! كيف أقدر أساعدك اليوم؟');
    const { res, shown, ms } = await ask(buildEngine({ baseUrl }), { budgetMs: 10000, question: 'اشرحلي شو يعني خوارزمية' });
    ok(res.ok && res.answer.includes('كيف أقدر أساعدك'), 'answers', res);
    ok(shown === res.answer, 'streamed exactly once, nothing doubled', { shown, answer: res.answer });
    ok(ms < 3000, `and quickly (${ms}ms)`);
  });

  await scenario('A normal search round trip is unchanged', 15000, async (ok) => {
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'هداف ريال مدريد' });
      return reply.text(res, body, 'مبابي هو هداف ريال مدريد هذا الموسم [1](https://example.com/scorers).');
    };
    const { res, shown, toolEvents } = await ask(buildEngine({ baseUrl }), { budgetMs: 15000 });
    ok(res.ok && /مبابي/.test(res.answer), 'answers from the search', res);
    ok(toolEvents.some((e) => e.tool === 'web_search' && e.status === 'running') && toolEvents.some((e) => e.tool === 'web_search' && e.status === 'done'), 'the search is announced and completed', toolEvents);
    ok((shown.match(/مبابي هو هداف/g) || []).length === 1, 'the answer is shown once', shown);
    ok(calls.length === 2 && calls[1].body.stream === true, 'the answer after the search is streamed, not one silent wait', calls.map((c) => c.body.stream));
  });

  // The production report, end to end. An Arabic conversation; the model
  // searches in English; the provider answers with English pages. The ranker
  // used to judge them against the Arabic words alone, drop every one, and
  // hand the model "No web results found" — twice, for two phrasings.
  await scenario('An Arabic conversation, an English search, English pages (the production report)', 25000, async (ok) => {
    const searched = [];
    tavilyHandler = (body) => {
      searched.push(body.query);
      return { results: [
        { title: 'Kylian Mbappé tops Real Madrid scoring chart in 2025-26', url: 'https://www.espn.com/soccer/story/mbappe-goals', content: 'Kylian Mbappé has scored 12 goals in La Liga this season.', score: 0.9, published_date: '2026-09-21' },
        { title: 'Real Madrid statistics 2025/26', url: 'https://www.transfermarkt.com/real-madrid/leistungsdaten', content: 'Goals and assists for every Real Madrid player.', score: 0.8 },
        { title: 'Vinícius and Mbappé goal tally', url: 'https://www.marca.com/en/football/real-madrid/goals.html', content: 'The forwards share the goals.', score: 0.7 },
        { title: 'Real Madrid squad stats', url: 'https://fbref.com/en/squads/53a2f082/Real-Madrid-Stats', content: 'Standard stats.', score: 0.6 }
      ] };
    };
    let toolOutput = '';
    handler = (body, res) => {
      if (isFirstRound(body)) return reply.toolCall(res, body, 'web_search', { query: 'current top scorer Real Madrid 2026' });
      toolOutput = (body.messages || []).filter((m) => m.role === 'tool').map((m) => m.content).join('\n');
      return reply.text(res, body, 'مبابي هو هداف ريال مدريد هذا الموسم [1](https://www.espn.com/soccer/story/mbappe-goals).');
    };
    const history = [
      { role: 'user', content: 'كيفك' }, { role: 'assistant', content: 'أهلًا!' },
      { role: 'user', content: 'متى مباراة ريال مدريد القادمة' }, { role: 'assistant', content: '...' },
      { role: 'user', content: 'طيب مين هداف الدوري الاسباني حاليا؟' }, { role: 'assistant', content: '...' }
    ];
    const { res } = await ask(buildEngine({ baseUrl, searchService: realSearchService(baseUrl) }), { budgetMs: 20000, question: 'طب اسم مين هداف ريال مدريد الحالي', history });
    ok(searched[0] === 'current top scorer Real Madrid 2026', `the model's query reaches the provider first, as written (${JSON.stringify(searched)})`);
    ok(!searched.some((q) => /next match|fixture|مباراة/i.test(q)), 'no earlier topic and no fixture padding reach the provider', searched);
    ok(!/No web results found/.test(toolOutput) && /espn\.com/.test(toolOutput), 'the model receives the sources, not "no results"', toolOutput.slice(0, 200));
    const searchUse = (res.toolsUsed || []).find((t) => t.tool === 'web_search');
    ok(searchUse && searchUse.resultCount === 4, `every page the provider found is kept (${searchUse && searchUse.resultCount} of 4)`);
    ok(searchUse && (searchUse.sources || []).some((s) => s.url === 'https://www.espn.com/soccer/story/mbappe-goals'), 'and the page gets them as source cards', searchUse);
    ok(res.ok && /espn\.com/.test(res.answer || ''), 'the answer cites them', (res.answer || '').slice(0, 160));
  });

  provider.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

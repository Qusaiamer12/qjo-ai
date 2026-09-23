// "Every long request, after about forty seconds: the server was probably
// asleep. All AI providers failed. Last: llm7 timeout (1996ms).
// [groq:413, llm7:504]"
//
// Production runs on Groq and llm7 only. Each half of that line was its own
// fault, and this suite reproduces both against the real llmService and
// RoutingEngine, with fake providers over real HTTP that fail the way the
// real ones do:
//
//   - Groq's free tier counts a request as its prompt plus the answer room it
//     reserves (max_tokens), and refuses one larger than the model's
//     per-minute allowance with 413 "Request too large … Limit 8000,
//     Requested 12345". The system prompt alone is 4,000–6,100 tokens, so a
//     long request never fit, and nothing tried to make it fit.
//   - llm7 takes longer than eight seconds to start answering a long request.
//     Eight seconds was the fixed wait for response headers, per key: three
//     keys timed out in turn (8 + 8 + 2 s), and then the whole provider was
//     retried as if it were a momentary blip. Forty seconds, nothing tried.
//
// Each scenario has a watchdog, so a hang fails by name.
'use strict';

const http = require('http');
const { createLlmService } = require('../src/services/llmService');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');
const { buildChatSystemPrompt } = require('../src/services/systemPrompt');

let pass = 0;
let fail = 0;
let activeScenario = 0;
const ok = (cond, name, detail) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  if (!cond && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 300)}`);
};
const scopedOk = (id) => (cond, name, detail) => { if (id === activeScenario) ok(cond, name, detail); };

// ── Fake providers ───────────────────────────────────────────────────────────

// Per-minute token allowances of Groq's free tier for the models production
// uses. The fake's token count is a character estimate; the code under test
// only ever uses the numbers the provider reports, as it must with the real one.
const GROQ_TPM = { 'openai/gpt-oss-20b': 8000, 'openai/gpt-oss-120b': 8000, 'meta-llama/llama-4-scout-17b-16e-instruct': 30000 };
const inputTokens = (body) => Math.ceil((JSON.stringify(body.messages || []).length + JSON.stringify(body.tools || []).length) / 4);

let calls = [];
let llm7 = { headerDelayMs: 0, dead: false };
let groqSearchesFirst = false;
let groqDown = false;
const open = new Set();

function streamText(res, text) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const word of text.split(/(?<= )/)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const provider = req.url.startsWith('/groq') ? 'groq' : 'llm7';
    const call = { provider, model: body.model, maxTokens: body.max_tokens, input: inputTokens(body), key: String(req.headers.authorization || '').replace('Bearer ', ''), at: Date.now() };
    calls.push(call);
    open.add(res);
    res.on('close', () => open.delete(res));

    if (provider === 'groq') {
      if (groqDown) {
        res.writeHead(503, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'Service Unavailable' } }));
      }
      const limit = GROQ_TPM[body.model] || 8000;
      const requested = call.input + (Number(body.max_tokens) || 0);
      if (requested > limit) {
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: {
          message: `Request too large for model \`${body.model}\` in organization \`org_test\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${limit}, Requested ${requested}, please reduce your message size and try again. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing`,
          type: 'tokens', code: 'rate_limit_exceeded'
        } }));
        return;
      }
      if (groqSearchesFirst && body.tools && !(body.messages || []).some((m) => m.role === 'tool')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'web_search', arguments: '{"query":"delivery apps Amman"}' } }] } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
        return res.end('data: [DONE]\n\n');
      }
      return streamText(res, `groq answered (${body.model}). `);
    }

    if (llm7.dead) return; // accepts the connection, never answers
    setTimeout(() => { if (!res.writableEnded && !res.destroyed) streamText(res, 'llm7 answered. '); }, llm7.headerDelayMs);
  });
});

// ── Engine under test: production's provider set and models ─────────────────

function buildEngine(baseUrl) {
  const llmService = createLlmService({
    groqKeys: ['g1', 'g2'],
    groqBaseUrl: `${baseUrl}/groq/v1`,
    llm7Keys: ['l1', 'l2', 'l3'],
    llm7BaseUrl: `${baseUrl}/llm7/v1`
  });
  return createRoutingEngine({
    llmService,
    safeCalculate: null,
    // Production has search, and a request with tools gets their time too.
    searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: [] }) },
    keys: { groq: 2, llm7: 3, qwen: 0, kimi: 0 },
    models: {
      groqFlash: 'openai/gpt-oss-20b', groqText: 'openai/gpt-oss-120b', groqCode: 'openai/gpt-oss-120b',
      groqVision: 'meta-llama/llama-4-scout-17b-16e-instruct',
      llm7Flash: 'minimax-m2.7', llm7Text: 'minimax-m2.7', llm7Code: 'minimax-m2.7'
    }
  });
}

// What the chat route sends: the real system prompt, Arabic in play unless
// the request is English.
function longRequest(userChars, { mode = 'flash', english = false } = {}) {
  const ask = english
    ? 'Write me a complete, detailed project plan for a delivery app, with every phase, the budget, the risks and the marketing plan. '
    : 'اكتبلي خطة مشروع تفصيلية كاملة لتطبيق توصيل طلبات في عمّان، مع كل المراحل والميزانية والمخاطر وخطة التسويق. ';
  return [
    { role: 'system', content: buildChatSystemPrompt({ mode, arabic: !english, runtimeLine: 'Wednesday 23 September 2026 (approximate location: Amman; time zone: Asia/Amman)' }) },
    { role: 'user', content: ask.repeat(Math.ceil(userChars / ask.length)).slice(0, userChars) }
  ];
}

async function ask(engine, { userChars, maxTokens = 4000, mode = 'flash', english = false }) {
  const chunks = [];
  const started = Date.now();
  const res = await engine.callAgent({ mode, messages: longRequest(userChars, { mode, english }), max_tokens: maxTokens, onChunk: (t) => chunks.push(t) });
  return { res, shown: chunks.join(''), ms: Date.now() - started };
}

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
  for (const res of open) res.destroy();
  open.clear();
}

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const engine = buildEngine(baseUrl);
  const groqCalls = () => calls.filter((c) => c.provider === 'groq');
  const llm7Calls = () => calls.filter((c) => c.provider === 'llm7');

  await scenario('The report: a long request, over Groq\'s per-minute size, llm7 slow to start', 90000, async (ok) => {
    llm7 = { headerDelayMs: 12000, dead: false };
    const { res, shown, ms } = await ask(engine, { userChars: 1200, maxTokens: 4000 });
    ok(res.ok, `answers (${ms}ms)`, res.error);
    ok(shown.length > 0, 'and the person sees it', shown);
    ok(ms < 30000, `well before the forty seconds it used to fail at (${Math.round(ms / 1000)}s)`);
  });

  await scenario('Groq is asked again with the answer room it can actually give', 30000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    const { res } = await ask(engine, { userChars: 1200, maxTokens: 4000 });
    const [first, second] = groqCalls();
    ok(first && second, `a refused request is resent, not abandoned (${groqCalls().length} Groq calls)`);
    ok(second && second.input + second.maxTokens <= 8000, `the resend fits the allowance Groq named (${second && second.input + second.maxTokens} of 8000)`, second);
    ok(second && second.maxTokens >= 1024, `with a useful answer length (${second && second.maxTokens} tokens)`);
    ok(res.ok && /groq answered/.test(res.answer || ''), 'and Groq answers', res.error || res.answer);
    ok(llm7Calls().length === 0, 'without waiting on a provider that is not needed');
  });

  await scenario('Too large for Groq even with a short answer: llm7 is given time to start', 90000, async (ok) => {
    llm7 = { headerDelayMs: 12000, dead: false };
    const { res, ms } = await ask(engine, { userChars: 9000, maxTokens: 4000 });
    const first = groqCalls()[0];
    const toSameModel = groqCalls().filter((c) => first && c.model === first.model);
    ok(first && GROQ_TPM[first.model] === 8000 && toSameModel.length === 1, `no resend when the answer would be uselessly short (${toSameModel.length} calls to the 8K model)`, groqCalls().map((c) => c.model));
    ok(res.ok && /llm7 answered/.test(res.answer || ''), `llm7 answers after 12s of preparing (${Math.round(ms / 1000)}s)`, res.error);
    ok(llm7Calls().length === 1, `on its first key: a slow start is not a dead key (${llm7Calls().length} llm7 calls)`);
  });

  await scenario('llm7 never answers: one bounded wait, then a model with room answers', 90000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    const { res, ms } = await ask(engine, { userChars: 9000, maxTokens: 4000 });
    ok(llm7Calls().length === 1, `llm7 is waited on once — not once per key, and not again as a "blip" (${llm7Calls().length} calls)`, llm7Calls().map((c) => c.key));
    ok(res.ok && /llama-4-scout/.test(res.answer || ''), `the long-context Groq model answers instead of nothing (${Math.round(ms / 1000)}s)`, res.error || res.answer);
    ok(ms < 60000, `inside the request's budget (${Math.round(ms / 1000)}s)`);
  });

  await scenario('A resized request that searches stays resized for the next round', 60000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    groqSearchesFirst = true;
    const { res } = await ask(engine, { userChars: 1200, maxTokens: 4000 });
    groqSearchesFirst = false;
    const all = groqCalls();
    const fits = (c) => c.input + c.maxTokens <= (GROQ_TPM[c.model] || 8000);
    const model = all[0] && all[0].model;
    const accepted = all.filter((c) => c.model === model && fits(c));
    // The round after the search carries the results, so it is bigger than
    // the first: it has to be fitted again on its own numbers.
    ok(accepted.length >= 2, `the search round and the answer round both went through (${accepted.length})`, all.map((c) => [c.model, c.input + c.maxTokens]));
    ok(all.every((c, i) => fits(c) || (all[i + 1] && all[i + 1].model === c.model && fits(all[i + 1]))), 'every refusal is followed by a request that fits', all.map((c) => [c.model, c.input + c.maxTokens]));
    ok(res.ok && (res.answer || '').includes(`groq answered (${model})`), `and the same model writes the answer (${model})`, res.error || res.answer);
  });

  // A medium request in Max mode: one wait leaves time for another key, and
  // spending it on a second key of a provider that has gone silent is time
  // the next provider does not get.
  await scenario('A provider that goes silent is left after one wait, even with time for another key', 90000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    groqDown = true;
    const { res, ms } = await ask(engine, { userChars: 200, maxTokens: 2000, mode: 'max', english: true });
    groqDown = false;
    ok(llm7Calls().length === 1, `one llm7 key, then on (${llm7Calls().length} llm7 calls in ${Math.round(ms / 1000)}s)`, llm7Calls().map((c) => c.key));
    ok(!res.ok && /All AI providers failed/.test(res.error || ''), 'and an honest failure when nothing answers', res.error);
  });

  await scenario('A short request is untouched', 20000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: false };
    const { res, ms } = await ask(engine, { userChars: 40, maxTokens: 1200 });
    ok(res.ok && /groq answered \(openai\/gpt-oss/.test(res.answer || ''), 'Groq answers first time', res.error || res.answer);
    ok(groqCalls().length === 1 && groqCalls()[0].maxTokens === 1200, 'with the answer room it asked for', groqCalls());
    ok(ms < 3000, `quickly (${ms}ms)`);
  });

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

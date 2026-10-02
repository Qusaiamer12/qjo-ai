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
//     Requested 12345". The system prompt was 4,000–6,100 tokens then (3,200
//     now), so a long request never fit, and nothing tried to make it fit.
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
// uses (2026-09-21: three models, 8,000 each — Llama 4 Scout, with 30,000, was
// retired on 2026-07-17). The fake's token count is a character estimate; the
// code under test only uses the numbers the provider reports, as it must.
const GROQ_TPM = { 'openai/gpt-oss-20b': 8000, 'openai/gpt-oss-120b': 8000, 'qwen/qwen3.8-27b': 8000 };
const inputTokens = (body) => Math.ceil((JSON.stringify(body.messages || []).length + JSON.stringify(body.tools || []).length) / 4);

let calls = [];
let llm7 = { headerDelayMs: 0, dead: false };
let groqSearchesFirst = false;
let groqReportsLimit = false;
// Tokens Groq counts beyond what this fake's own count says: its tokenizer,
// not our estimate, has the last word.
let groqCountsMore = 0;
let groqDown = false;
let groqDailySpent = [];
const open = new Set();

function streamText(res, text, headers = {}, finish = 'stop') {
  res.writeHead(200, { 'content-type': 'text/event-stream', ...headers });
  for (const word of text.split(/(?<= )/)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}

// A web page longer than one answer: cut off inside its code, and carried on
// by a model that opens its code block again and repeats the line it was cut
// in — what the owner's preview showed as half a page above raw HTML.
const PAGE_START = 'Here is your cafe site:\n\n```html\n<!DOCTYPE html>\n<html>\n<body>\n' + '<section class="menu"><h3>Mint tea</h3><p>Fresh mint and green tea.</p></section>\n'.repeat(90) + '<ul>\n<li>one</li>\n<li>tw';
const PAGE_REST = '```html\n<li>two</li>\n</ul>\n</body>\n</html>\n```\n\nOpen it in the preview.';
let groqCutsPage = false;

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const provider = req.url.startsWith('/groq') ? 'groq' : 'llm7';
    const call = { provider, model: body.model, maxTokens: body.max_tokens, input: inputTokens(body), key: String(req.headers.authorization || '').replace('Bearer ', ''), at: Date.now(),
      continuation: /^Continue the code/.test(String(((body.messages || [])[(body.messages || []).length - 1] || {}).content)),
      cutNoted: (body.messages || []).some((m) => /part of this content was removed/.test(String(m.content))), systemWhole: (body.messages || []).some((m) => m.role === 'system' && /\n- /.test(m.content) && !/part of this content was removed/.test(m.content)) };
    calls.push(call);
    open.add(res);
    res.on('close', () => open.delete(res));

    if (provider === 'groq') {
      if (groqDailySpent.includes(body.model)) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3600' });
        return res.end(JSON.stringify({ error: { message: `Rate limit reached for model \`${body.model}\` in organization \`org_test\` service tier \`on_demand\` on tokens per day (TPD): Limit 200000, Used 199800, Requested 5200. Please try again in 1h2m.` } }));
      }
      if (groqDown) {
        res.writeHead(503, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'Service Unavailable' } }));
      }
      const limit = GROQ_TPM[body.model] || 8000;
      const requested = call.input + groqCountsMore + (Number(body.max_tokens) || 0);
      if (requested > limit) {
        res.writeHead(413, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: {
          message: `Request too large for model \`${body.model}\` in organization \`org_test\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${limit}, Requested ${requested}, please reduce your message size and try again. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing`,
          type: 'tokens', code: 'rate_limit_exceeded'
        } }));
        return;
      }
      if (groqCutsPage) {
        const last = (body.messages || [])[body.messages.length - 1] || {};
        const continuing = /^Continue the code/.test(String(last.content));
        if (continuing && groqCutsPage === 'twice' && !/PART TWO/.test(JSON.stringify(body.messages))) return streamText(res, '<li>tw</li>\n<!-- PART TWO -->\n<li>three', {}, 'length');
        return continuing ? streamText(res, PAGE_REST) : streamText(res, PAGE_START, {}, 'length');
      }
      if (groqSearchesFirst && body.tools && !(body.messages || []).some((m) => m.role === 'tool')) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'web_search', arguments: '{"query":"delivery apps Amman"}' } }] } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
        return res.end('data: [DONE]\n\n');
      }
      return streamText(res, `groq answered (${body.model}). `, groqReportsLimit ? { 'x-ratelimit-limit-tokens': String(limit), 'x-ratelimit-remaining-tokens': String(limit) } : {});
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
      groqVision: 'qwen/qwen3.8-27b',
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

// Message sizes, in characters of Arabic, that keep each scenario what it
// says it is now that the system prompt is ~3,200 tokens: one that Groq
// refuses with 4,000 tokens of answer room but takes with a smaller one, and
// one too large for the 8K models even with a short answer.
const FITS_WHEN_RESIZED = 6000;
const TOO_LARGE_FOR_8K = 16000;

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
    const { res } = await ask(engine, { userChars: FITS_WHEN_RESIZED, maxTokens: 4000 });
    const [first, second] = groqCalls();
    ok(first && second, `a refused request is resent, not abandoned (${groqCalls().length} Groq calls)`);
    ok(second && second.input + second.maxTokens <= 8000, `the resend fits the allowance Groq named (${second && second.input + second.maxTokens} of 8000)`, second);
    ok(second && second.maxTokens >= 1024, `with a useful answer length (${second && second.maxTokens} tokens)`);
    ok(res.ok && /groq answered/.test(res.answer || ''), 'and Groq answers', res.error || res.answer);
    ok(llm7Calls().length === 0, 'without waiting on a provider that is not needed');
  });

  await scenario('Too large for Groq even with a short answer: llm7 is given time to start', 90000, async (ok) => {
    llm7 = { headerDelayMs: 12000, dead: false };
    const { res, ms } = await ask(engine, { userChars: TOO_LARGE_FOR_8K, maxTokens: 4000 });
    const first = groqCalls()[0];
    const toSameModel = groqCalls().filter((c) => first && c.model === first.model);
    ok(first && GROQ_TPM[first.model] === 8000 && toSameModel.length === 1, `no resend when the answer would be uselessly short (${toSameModel.length} calls to the 8K model)`, groqCalls().map((c) => c.model));
    ok(res.ok && /llm7 answered/.test(res.answer || ''), `llm7 answers after 12s of preparing (${Math.round(ms / 1000)}s)`, res.error);
    ok(llm7Calls().length === 1, `on its first key: a slow start is not a dead key (${llm7Calls().length} llm7 calls)`);
  });

  // Too large for every Groq model, and llm7 silent: the last resort used to
  // be Llama 4 Scout's 30,000 tokens a minute. Its successor has 8,000, so
  // the request is cut in the middle to fit rather than not answered.
  await scenario('llm7 never answers: one bounded wait, then the last model answers a cut request', 90000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    const { res, ms } = await ask(engine, { userChars: TOO_LARGE_FOR_8K, maxTokens: 4000 });
    ok(llm7Calls().length === 1, `llm7 is waited on once — not once per key, and not again as a "blip" (${llm7Calls().length} calls)`, llm7Calls().map((c) => c.key));
    const last = groqCalls().filter((c) => c.model === 'qwen/qwen3.8-27b');
    const cut = last[last.length - 1];
    ok(cut && cut.input + cut.maxTokens <= 8000 && cut.maxTokens >= 1024, `cut to fit its 8,000 with a useful answer (${cut && cut.input + cut.maxTokens}, ${cut && cut.maxTokens} of answer room)`, last);
    ok(cut && cut.cutNoted && cut.systemWhole, 'the model is told a part was cut, and the system prompt is whole', cut);
    ok(res.ok && /qwen3\.8/.test(res.answer || ''), `and it answers instead of nothing (${Math.round(ms / 1000)}s)`, res.error || res.answer);
    ok(ms < 60000, `inside the request's budget (${Math.round(ms / 1000)}s)`);
    const others = groqCalls().filter((c) => c.model !== 'qwen/qwen3.8-27b');
    ok(others.length > 0 && others.every((c) => !c.cutNoted), 'only the last model cuts: the others are asked with the whole request', others.map((c) => [c.model, c.cutNoted]));
  });

  await scenario('A resized request that searches stays resized for the next round', 60000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    groqSearchesFirst = true;
    const { res } = await ask(engine, { userChars: FITS_WHEN_RESIZED, maxTokens: 4000 });
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

  // Groq limits each model separately. A spent gpt-oss-20b used to send the
  // chain straight to llm7 — the slowest provider — past a Groq model with a
  // full allowance of its own; and the spent model was asked again, key by
  // key, on every message for the rest of the day.
  await scenario('One Groq model out of its daily allowance: the other Groq model answers', 30000, async (ok) => {
    const fresh = buildEngine(baseUrl);
    llm7 = { headerDelayMs: 0, dead: false };
    groqDailySpent = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].filter((m) => m !== 'openai/gpt-oss-120b');
    const first = await fresh.callAgent({ mode: 'flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1000, onChunk: () => {} });
    const spentCalls = groqCalls().filter((c) => c.model === 'openai/gpt-oss-20b').length;
    const second = await fresh.callAgent({ mode: 'flash', messages: [{ role: 'user', content: 'hello again' }], max_tokens: 1000, onChunk: () => {} });
    // A greeting takes the short chain; an ordinary question the full one.
    const question = await fresh.callAgent({ mode: 'flash', messages: [{ role: 'user', content: 'Explain the difference between a process and a thread' }], max_tokens: 1000, onChunk: () => {} });
    groqDailySpent = [];
    ok(first.ok && /gpt-oss-120b/.test(first.answer || ''), 'Groq\'s other model answers, not llm7', first.error || first.answer);
    ok(llm7Calls().length === 0, `llm7 was not needed (${llm7Calls().length} calls)`);
    ok(groqCalls().filter((c) => c.model === 'openai/gpt-oss-20b').length === spentCalls, 'the spent model is not asked again while it rests', groqCalls().map((c) => c.model));
    ok(second.ok, 'and the next message is answered too', second.error);
    ok(question.ok && /gpt-oss-120b/.test(question.answer || '') && llm7Calls().length === 0, 'an ordinary question, too, goes to Groq\'s other model before llm7', question.error || question.answer);
  });

  await scenario('Once Groq has named its allowance, a long request is fitted before it is sent', 30000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    groqReportsLimit = true;
    const fresh = buildEngine(baseUrl);
    await ask(fresh, { userChars: 40, maxTokens: 1200 }); // any answer carries the allowance
    calls = [];
    const { res } = await ask(fresh, { userChars: FITS_WHEN_RESIZED, maxTokens: 4000 });
    groqReportsLimit = false;
    const [first] = groqCalls();
    ok(groqCalls().length === 1, `one Groq call, not a refusal and a resend (${groqCalls().length})`, groqCalls());
    ok(first && first.input + first.maxTokens <= 8000 && first.maxTokens >= 1024, `already within the allowance (${first && first.input + first.maxTokens} of 8000, ${first && first.maxTokens} of answer room)`, first);
    ok(res.ok && /groq answered/.test(res.answer || ''), 'and Groq answers', res.error || res.answer);
  });

  // The estimate is only an estimate. When Groq counts more, the fitted
  // request is refused — and the fit made from that refusal has to start from
  // what was sent: made from the request as first asked, it gave back the
  // room the first fit took away, and was refused again.
  await scenario('Groq counts more than the estimate: the fit made from its refusal fits what was sent', 30000, async (ok) => {
    llm7 = { headerDelayMs: 0, dead: true };
    groqReportsLimit = true;
    const fresh = buildEngine(baseUrl);
    await ask(fresh, { userChars: 40, maxTokens: 1200 });
    calls = [];
    groqCountsMore = 1500;
    const { res } = await ask(fresh, { userChars: FITS_WHEN_RESIZED, maxTokens: 4000 });
    groqCountsMore = 0;
    groqReportsLimit = false;
    const [first, second] = groqCalls();
    ok(groqCalls().length === 2 && first.maxTokens < 4000, `fitted before sending, refused, fitted again: two Groq calls (${groqCalls().length})`, groqCalls());
    ok(second && second.input + 1500 + second.maxTokens <= 8000, `the second within what Groq counts (${second && second.input + 1500 + second.maxTokens} of 8000)`, second);
    ok(res.ok && /groq answered/.test(res.answer || ''), 'and Groq answers', res.error || res.answer);
  });

  // The system prompt is often the longest message; the cut never takes it,
  // whatever its length: it holds the rules every answer keeps.
  await scenario('Cutting to fit takes from the conversation, never the system prompt', 5000, async (ok) => {
    const { cutToFit, tokensNeeded } = require('../src/services/providerLimits');
    const system = 'Rules every answer keeps. '.repeat(700);
    const history = 'سؤال سابق مع جواب طويل وتفاصيل كثيرة. '.repeat(400);
    const params = { max_tokens: 4000, messages: [{ role: 'system', content: system }, { role: 'user', content: history }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'والآن؟' }] };
    ok(system.length > history.length, `control: the system prompt is the longest message (${system.length} against ${history.length})`);
    const cut = cutToFit(params, { limit: 8000, requested: tokensNeeded(params) });
    ok(cut && tokensNeeded(cut) <= 8000, `and the cut request fits (${cut && tokensNeeded(cut)} of 8000)`);
    ok(cut && cut.messages[0].content === system, 'the system prompt, longer than anything else, is whole', cut && cut.messages[0].content.length);
    ok(cut && cut.messages[1].content.length < history.length && /part of this content was removed/.test(cut.messages[1].content), `the long history message is cut instead (${cut && cut.messages[1].content.length} of ${history.length})`);
    ok(cut && cut.messages[3].content === 'والآن؟', 'and the newest question is untouched');
  });

  await scenario('A page cut off inside its code is carried on as one block, each request within 8,000', 60000, async (ok) => {
    const { lightMarkdown } = require('../public/domain/markdown.js');
    groqCutsPage = true;
    llm7 = { headerDelayMs: 0, dead: true };
    // A conversation already under way: long earlier turns, as on a real chat.
    const earlier = [];
    for (let i = 0; i < 4; i++) earlier.push({ role: 'user', content: 'Earlier question about the menu and prices. '.repeat(40) }, { role: 'assistant', content: 'Earlier answer with the full menu. '.repeat(60) });
    const messages = [{ role: 'system', content: buildChatSystemPrompt({ mode: 'flash', arabic: false, runtimeLine: 'today' }) }, ...earlier, { role: 'user', content: 'Build the full cafe website in one HTML file.' }];
    const shown = [];
    const engine2 = buildEngine(baseUrl);
    // This message's playbooks, as the route sends them: they shape the start,
    // and a request for the rest of the code goes without them.
    const turnContext = 'INTERFACES — build a complete page with sections, Tailwind and real content. '.repeat(60);
    const ai = await engine2.callAgent({ mode: 'flash', messages, turnContext, max_tokens: 2000, useTools: false, onChunk: (t) => shown.push(t) });
    const done = await engine2.completeIfTruncated({ ai, messages, turnContext, temperature: 0.2, max_tokens: 2000, useTools: false, onChunk: (t) => shown.push(t) });
    groqCutsPage = false;
    const asks = groqCalls().filter((c) => c.continuation);
    ok(ai.ok && /length/.test(ai.finish_reason || ''), 'control: the first answer was cut off', ai.finish_reason);
    ok(asks.length >= 1 && asks.every((c) => c.input + c.maxTokens <= 8000), `the request for the rest fits Groq's 8,000 (${asks.map((c) => c.input + c.maxTokens).join(', ')})`, asks);
    ok(done.continued && /Open it in the preview/.test(done.answer || ''), 'and it is answered', done.error || done.answer);
    const blocks = (lightMarkdown(done.answer).match(/<div class="code-block-wrapper\b/g) || []).length;
    ok(blocks === 1 && !/```html[\s\S]*```html/.test(done.answer) && done.answer.includes('<li>one</li>\n<li>two</li>\n</ul>'), `one block of code, the cut line written once (${blocks} block(s))`, done.answer.slice(-200));
    ok(shown.join('') === done.answer, 'the page is sent exactly the stored answer', { shown: shown.join('').slice(-120), stored: done.answer.slice(-120) });
  });

  await scenario('A page that needs two more answers gets them, still one block', 60000, async (ok) => {
    const { lightMarkdown } = require('../public/domain/markdown.js');
    groqCutsPage = 'twice';
    llm7 = { headerDelayMs: 0, dead: true };
    const messages = [{ role: 'system', content: buildChatSystemPrompt({ mode: 'flash', arabic: false, runtimeLine: 'today' }) }, { role: 'user', content: 'Build the full cafe website in one HTML file.' }];
    const engine3 = buildEngine(baseUrl);
    const ai = await engine3.callAgent({ mode: 'flash', messages, max_tokens: 2000, useTools: false, onChunk: () => {} });
    const done = await engine3.completeIfTruncated({ ai, messages, temperature: 0.2, max_tokens: 2000, useTools: false, maxPasses: 1, onChunk: () => {} });
    groqCutsPage = false;
    const asks = groqCalls().filter((c) => c.continuation);
    ok(asks.length === 2, `two requests for the rest, though the route allows one for prose (${asks.length})`);
    ok(/PART TWO/.test(done.answer || '') && /Open it in the preview/.test(done.answer || '') && (lightMarkdown(done.answer).match(/<div class="code-block-wrapper\b/g) || []).length === 1, 'the whole page, in one block', (done.answer || '').slice(-160));
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

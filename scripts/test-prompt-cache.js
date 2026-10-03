// What a chat request opens with, through the real chat route, the real
// RoutingEngine and the real llmService, against a fake Groq over real HTTP.
//
// Groq caches the opening a request shares with an earlier one for the
// gpt-oss models, and cached tokens do not count toward its per-minute or
// daily limits. A request used to open with the instructions and then
// everything chosen for that one message — playbooks, hints, the time — so
// nothing after them, the whole conversation included, could be reused.
// Checked here: two turns of one conversation open alike up to the newest
// exchange; what a message needs travels with that message, and never where
// the person's words are read for routing or an image is read; the page's
// own system text is split the same way; the tool list does not change with
// the message; reasoning effort follows the work; and what Groq reports it
// counted — cached tokens included — reaches /api/status.
'use strict';

const http = require('http');
const assert = require('assert');
const express = require('express');
const { registerChatRoutes } = require('../src/routes/chat');
const { createChatPromptBuilder } = require('../src/services/systemPrompt');
const { createLlmService } = require('../src/services/llmService');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');
const { TURN_OPEN, TURN_CLOSE } = require('../src/services/promptLayout');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 5).join('\n     ')}`); });
}

// ── Fake providers ──
const calls = [];
let groqDown = false;
let usage = null;
const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    const name = req.url.startsWith('/groq') ? 'groq' : 'llm7';
    calls.push({ provider: name, body });
    if (name === 'groq' && groqDown) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"down"}}'); }
    const text = body.model === 'fake-vision' ? READ : `${name} answered. `;
    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], ...(usage ? { usage } : {}) }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    // Groq sends what it counted with the last chunk, under x_groq.
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], ...(usage ? { x_groq: { usage } } : {}) })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
const READ = '```json\n{"question": "Find the speed after 12 s.", "text": "A car accelerates from rest at 3.2 m/s² for 12 s.", "math": ["v = u + at"], "values": [], "choices": [], "figure": "", "unclear": []}\n```';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// ── The app as production wires it: the real route, engine and llmService ──
let llmService;
function startApp(baseUrl) {
  llmService = createLlmService({ groqKeys: ['g1'], groqBaseUrl: `${baseUrl}/groq/v1`, llm7Keys: ['l1'], llm7BaseUrl: `${baseUrl}/llm7/v1` });
  const routingEngine = createRoutingEngine({
    llmService,
    safeCalculate: (expr) => String(expr),
    searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: [] }) },
    keys: { groq: 1, llm7: 1, qwen: 0, kimi: 0 },
    models: {
      groqFlash: 'openai/gpt-oss-20b', groqText: 'openai/gpt-oss-120b', groqCode: 'openai/gpt-oss-120b', groqVision: 'fake-vision',
      llm7Flash: 'minimax-m2.7', llm7Text: 'minimax-m2.7', llm7Code: 'minimax-m2.7'
    }
  });
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  registerChatRoutes(app, {
    hasAnyAiProvider: () => true,
    verifyFirebaseRequest: async () => true,
    enforceDailyUsage: async () => true,
    allowedModels: new Set(['openai/gpt-oss-120b', 'openai/gpt-oss-20b']),
    defaultModel: 'openai/gpt-oss-120b',
    cleanMessages: (m) => m,
    routingEngine,
    // House guidance, found for every message; a site goes without it.
    knowledgeBaseService: { lookup: async () => ({ found: true, block: '<qjo_knowledge_base version="t">house guidance</qjo_knowledge_base>' }) },
    ...createChatPromptBuilder()
  });
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

let port;
async function chat(messages, extra = {}) {
  const before = calls.length;
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream: true, messages, language: 'ar', ...extra })
  });
  await res.text();
  return calls.slice(before);
}

const textOf = (content) => (typeof content === 'string' ? content : (content || []).map((p) => p.text || '').join('\n'));
// The request as the model's template lays it out: the first system message
// and the tools, then every other message in order.
const render = (body) => (body.messages || []).map((m, i) => `<${m.role}>${textOf(m.content)}${i === 0 && body.tools ? JSON.stringify(body.tools) : ''}`).join('');
const lastUser = (body) => [...body.messages].reverse().find((m) => m.role === 'user');
const system = (body) => body.messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n');

(async () => {
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  const app = await startApp(`http://127.0.0.1:${provider.address().port}`);
  port = app.port;

  console.log('\nTwo turns of one conversation open alike:');
  const first = [{ role: 'user', content: 'شو الفرق بين الذكاء الاصطناعي وتعلم الآلة؟' }];
  const [one] = await chat(first);
  const second = [...first, { role: 'assistant', content: 'الفرق باختصار: تعلم الآلة فرع من الذكاء الاصطناعي.' }, { role: 'user', content: 'صلّحلي هالخطأ بكود React عندي، الصفحة بتوقف لما أضغط على الزر وبطلع خطأ' }];
  const [two] = await chat(second);

  await test('control: the second message needs what the first did not — the code overlay', () => {
    assert.ok(/ACTIVE MODE: CODE/.test(textOf(lastUser(two.body).content)) && !/ACTIVE MODE: CODE/.test(textOf(lastUser(one.body).content)), 'the two messages carry the same needs');
  });
  await test('the second request opens exactly as the first did, up to the newest exchange: instructions, tools and conversation', () => {
    const a = render(one.body);
    const b = render(two.body);
    const upToNewest = a.slice(0, a.lastIndexOf('<user>'));
    assert.ok(b.startsWith(upToNewest), `they part at character ${[...a].findIndex((c, i) => c !== b[i])} of ${upToNewest.length}`);
    assert.ok(b.startsWith(upToNewest + '<user>' + first[0].content), 'and the earlier question is part of the shared opening');
  });
  await test('one system message, and nothing chosen for the message in it', () => {
    assert.strictEqual(two.body.messages.filter((m) => m.role === 'system').length, 1);
    const sys = system(two.body);
    assert.ok(!/ACTIVE MODE: CODE|RUNTIME & TEMPORAL CONTEXT|INTERFACES|Router decision|Context continuity lock/.test(sys), 'a per-message part is in the system message');
  });
  await test('what the message needs goes with the message: the playbook, the time, its language — then the person\'s own words', () => {
    const text = textOf(lastUser(two.body).content);
    assert.ok(text.startsWith(TURN_OPEN), text.slice(0, 80));
    for (const part of ['ACTIVE MODE: CODE', 'INTERFACES', 'RUNTIME & TEMPORAL CONTEXT', "The person's message is in Arabic."]) assert.ok(text.includes(part), `missing: ${part}`);
    assert.ok(text.endsWith(`${TURN_CLOSE}\n${second[2].content}`), text.slice(-120));
  });

  console.log('\nThe page\'s own system text:');
  await test('its settings open the request; its skill capsules go with the message; its continuity note is not sent twice', async () => {
    const page = 'Task-specific skill capsules:\n1. Coding capsule: act as a senior software engineer.\n\nUser personalization context:\nPreferred response tone: casual';
    const [call] = await chat([
      { role: 'system', content: page },
      { role: 'system', content: 'Context continuity lock: The latest user message is a follow-up transformation/editing request.' },
      { role: 'user', content: 'أعطني فكرة' }, { role: 'assistant', content: 'فكرة: تطبيق.' }, { role: 'user', content: 'اختصر الرد السابق بنقاط' }
    ]);
    const sys = system(call.body);
    const newest = textOf(lastUser(call.body).content);
    assert.ok(/Preferred response tone: casual/.test(sys) && !/skill capsules/.test(sys), 'the settings are not in the system message, or the capsules are');
    assert.ok(/Coding capsule/.test(newest), 'the capsules did not travel with the message');
    assert.strictEqual((render(call.body).match(/Context continuity lock/g) || []).length, 1, 'the continuity note, counted');
  });

  console.log('\nThe person\'s words, where they are read:');
  await test('an image is read without the message\'s context; the solution is written with it', async () => {
    const got = await chat([{ role: 'user', content: [{ type: 'text', text: 'حل السؤال' }, { type: 'image_url', image_url: { url: PIXEL } }] }]);
    const reading = got.find((c) => c.body.model === 'fake-vision');
    const solving = got.find((c) => c.body.model !== 'fake-vision');
    assert.ok(reading && solving, `the exercise was not read then solved (${got.map((c) => c.body.model)})`);
    assert.ok(!render(reading.body).includes(TURN_OPEN), 'the reading call carried the context');
    assert.ok(textOf(lastUser(solving.body).content).startsWith(TURN_OPEN), 'the solving call did not');
  });
  await test('a picture\'s caption is the newest message: its follow-up note comes from it, not from an older question', async () => {
    const got = await chat([
      { role: 'user', content: 'شو رأيك بالموضوع؟' }, { role: 'assistant', content: 'رأيي أنه مهم لعدة أسباب.' },
      { role: 'user', content: [{ type: 'text', text: 'اختصر الرد السابق بنقاط' }, { type: 'image_url', image_url: { url: PIXEL } }] }
    ]);
    const answered = got[got.length - 1];
    assert.ok(answered && /Context continuity lock/.test(textOf(lastUser(answered.body).content)), `no continuity note (${got.map((c) => c.body.model)})`);
  });
  await test('the routing reads the person, not the context: a plain Flash question stays light although its context names statistics', async () => {
    const [call] = await chat([{ role: 'user', content: 'شو أفضل اسم لمخبز؟' }], { mode: 'flash' });
    assert.ok(/statistics/.test(textOf(lastUser(call.body).content)), 'control: the context names what the math check looks for');
    assert.strictEqual(call.body.reasoning_effort, 'low', `reasoning_effort ${call.body.reasoning_effort}`);
  });

  console.log('\nA site is one file for the preview (siteRequest.js):');
  const asPage = async (messages) => (await chat(messages, { mode: 'normal', model: 'openai/gpt-oss-20b' }))[0].body;
  const PAGE = 'تفضل:\n```html\n<!DOCTYPE html>\n<html lang="ar" dir="rtl"><body><h1>مشاوي</h1></body></html>\n```';
  await test('control: a bug in a React component is code — the overlay, the bug playbook, house guidance, the calculator, the router\'s hint and tools', async () => {
    const body = await asPage([{ role: 'user', content: 'Fix this bug: TypeError in my React component' }]);
    const text = textOf(lastUser(body).content);
    for (const part of ['ACTIVE MODE: CODE', 'START DIRECTLY WITH THE SOLUTION', 'house guidance', 'Calculator tool available', 'Router decision']) assert.ok(text.includes(part), `missing: ${part}`);
    assert.ok(body.tools && body.tools.length, 'no tools');
    assert.ok(!('reasoning_effort' in body), `code thinks at ${body.reasoning_effort}`);
  });
  await test('a site in Max keeps the provider\'s default thinking', async () => {
    const [call] = await chat([{ role: 'user', content: 'صمملي موقع لمطعم مشاوي' }], { mode: 'max' });
    assert.ok(!('reasoning_effort' in call.body), `Max sent ${call.body.reasoning_effort}`);
  });
  for (const [label, messages] of [
    ['an Arabic site', [{ role: 'user', content: 'صمملي موقع لمطعم مشاوي' }]],
    ['a React landing page', [{ role: 'user', content: 'Build me a landing page for my cafe in React' }]],
    ['a change to the page the last answer was', [{ role: 'user', content: 'صمملي موقع لمطعم مشاوي' }, { role: 'assistant', content: PAGE }, { role: 'user', content: 'خليه أغمق وزيد قسم للحجز' }]]
  ]) {
    await test(`${label}: the site playbook alone — no engineering overlay, bug playbook, house guidance, calculator, router hint or tools`, async () => {
      const body = await asPage(messages);
      const text = textOf(lastUser(body).content);
      assert.ok(text.includes('WEBSITES & INTERFACES') && text.includes('https://cdn.tailwindcss.com'), 'the site playbook is missing');
      for (const part of ['ACTIVE MODE: CODE', 'START DIRECTLY WITH THE SOLUTION', 'house guidance', 'Calculator tool available', 'Router decision', 'LITERARY CRAFTSMANSHIP']) assert.ok(!text.includes(part), `carried: ${part}`);
      assert.ok(!body.tools, `offered tools: ${(body.tools || []).map((t) => t.function.name)}`);
    });
    await test(`${label}: written by the larger model first, though the page named the fast one — thinking lightly, to leave the room to the page`, async () => {
      const body = await asPage(messages);
      assert.strictEqual(body.model, 'openai/gpt-oss-120b');
      assert.strictEqual(body.reasoning_effort, 'low');
    });
  }
  await test('control: "make it darker" after an answer that was not a page is not a site', async () => {
    const body = await asPage([{ role: 'user', content: 'اكتبلي فقرة عن البحر' }, { role: 'assistant', content: 'البحر واسع.' }, { role: 'user', content: 'make it darker' }]);
    assert.ok(!textOf(lastUser(body).content).includes('WEBSITES & INTERFACES') && body.model === 'openai/gpt-oss-20b', `${body.model}`);
  });

  console.log('\nThe tool list does not change with the message:');
  await test('a question with numbers and one without are offered the same tools, in the same order', async () => {
    const [plain] = await chat([{ role: 'user', content: 'Who founded the Umayyad dynasty?' }], { mode: 'flash' });
    const [numbers] = await chat([{ role: 'user', content: 'احسب 17 * 23' }], { mode: 'flash' });
    assert.ok(plain.body.tools && numbers.body.tools, 'control: both were offered tools');
    assert.deepStrictEqual(plain.body.tools.map((t) => t.function.name), numbers.body.tools.map((t) => t.function.name));
  });

  console.log('\nReasoning effort follows the work:');
  const effort = async (content, mode) => (await chat([{ role: 'user', content }], { mode }))[0].body;
  await test('an everyday Flash question thinks lightly; code, math and Max keep the provider\'s default', async () => {
    assert.strictEqual((await effort('What is a good name for a bakery?', 'flash')).reasoning_effort, 'low');
    for (const [content, mode] of [['Fix this bug: TypeError in my React component', 'flash'], ['احسب 17 * 23', 'flash'], ['What is a good name for a bakery?', 'max']]) {
      const body = await effort(content, mode);
      assert.ok(!('reasoning_effort' in body), `${mode} "${content}" sent reasoning_effort ${body.reasoning_effort}`);
    }
  });
  // Flash thinks when the question needs it (promptLayout.thinkingNeed): it
  // used to answer a comparison, a "why" or a riddle at low effort.
  // As the page sends them: in Flash it names the fast model.
  const flash = async (content) => (await chat([{ role: 'user', content }], { mode: 'normal', model: 'openai/gpt-oss-20b' }))[0].body;
  await test('a comparison, a "why" and sums in Flash think first; a joke and a greeting do not', async () => {
    for (const content of ['Which is better for a first car, a Toyota or a Kia?', 'ليش السما زرقا؟', 'راتبي 500 دينار وبصرف 320 بالشهر، قديش بوفر بسنة؟', 'اعملي خطة دراسة للتوجيهي']) {
      const body = await flash(content);
      assert.ok(!('reasoning_effort' in body), `"${content}" was answered at ${body.reasoning_effort}`);
      assert.strictEqual(body.model, 'openai/gpt-oss-20b', `"${content}" went to ${body.model}`);
    }
    for (const content of ['Tell me a joke', 'اكتبلي قصيدة عن عمان', 'What is a good name for a bakery?']) {
      assert.strictEqual((await flash(content)).reasoning_effort, 'low', `"${content}" was made to think`);
    }
  });
  await test('a riddle, or several asks at once, goes to the larger model first, thinking', async () => {
    for (const content of ['عندي لغز: ثلاث صناديق كلها ملصقاتها غلط، كيف بعرف شو فيها؟', 'Compare renting and buying a flat, and why would you pick one?']) {
      const body = await flash(content);
      assert.strictEqual(body.model, 'openai/gpt-oss-120b', `"${content}" went first to ${body.model}, though the page named the fast one`);
      assert.ok(!('reasoning_effort' in body), `"${content}" was answered at ${body.reasoning_effort}`);
    }
  });
  await test('what decides is the person\'s words, not a file they attached', async () => {
    const attached = 'استخرج معلوماتي\n\nUser attached or previously indexed files with retrieved evidence. Use them.\nAttachment Index 1: cv.txt\nOrigin: pending\nWhy I left: the new role was better than the old one? Which is better? 2019 2021 2023';
    assert.ok(require('../src/services/promptLayout').thinkingNeed([{ role: 'user', content: attached.split('\n\n')[1] }]).needs, 'control: the attached text alone would call for thought');
    const { thinkingNeed } = require('../src/services/promptLayout');
    assert.deepStrictEqual(thinkingNeed([{ role: 'user', content: attached }]), { needs: false, hard: false, why: [] });
  });

  await test('only Groq\'s gpt-oss models are sent it: llm7 never is', async () => {
    groqDown = true;
    const got = await chat([{ role: 'user', content: 'What is a good name for a bakery?' }], { mode: 'flash' });
    groqDown = false;
    const llm7 = got.find((c) => c.provider === 'llm7');
    assert.ok(llm7, `llm7 was not asked (${got.map((c) => c.provider)})`);
    assert.ok(!('reasoning_effort' in llm7.body), 'llm7 was sent reasoning_effort');
  });

  console.log('\nWhat Groq counted reaches /api/status:');
  await test('input, cached, output and reasoning tokens per model, and the cached share — streamed or not', async () => {
    usage = { prompt_tokens: 4000, completion_tokens: 300, prompt_tokens_details: { cached_tokens: 3600 }, completion_tokens_details: { reasoning_tokens: 90 } };
    await chat([{ role: 'user', content: 'What is a good name for a bakery?' }], { mode: 'max' });
    usage = null;
    const counted = llmService.health().groq.tokens['openai/gpt-oss-120b'];
    assert.ok(counted, JSON.stringify(llmService.health().groq.tokens));
    assert.deepStrictEqual({ input: counted.input, cached: counted.cached, output: counted.output, reasoning: counted.reasoning, cachedShare: counted.cachedShare },
      { input: 4000, cached: 3600, output: 300, reasoning: 90, cachedShare: '90%' });
    assert.ok(!JSON.stringify(llmService.health()).includes('g1'), 'a key reached the status');
  });

  app.server.close();
  provider.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

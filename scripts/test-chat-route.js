// The chat route over real HTTP, with a scripted engine behind it.
//
// Three things only the route can get wrong, each of which looked like a hang
// or a wrong answer from the page:
//   - silence: a search and a slow provider could keep the stream quiet for
//     tens of seconds, indistinguishable from a dead connection;
//   - an exception after the headers were sent ended the stream with no word
//     of what happened;
//   - a sources-only fallback (every model failed) would have been cached
//     and served to the next person for fifteen minutes.
'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const { registerChatRoutes } = require('../src/routes/chat');
const { createSseParser } = require('../public/domain/streamProtocol.js');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startApp(callAgent, extraDeps = {}) {
  const cacheWrites = [];
  const app = express();
  app.use(express.json());
  registerChatRoutes(app, {
    hasAnyAiProvider: () => true,
    verifyFirebaseRequest: async () => true,
    enforceDailyUsage: async () => true,
    allowedModels: new Set(['test-model']),
    defaultModel: 'test-model',
    cleanMessages: (m) => m,
    heartbeatMs: 100,
    stableCacheKey: (...parts) => parts.join('|'),
    memoryCaches: { completions: new Map() },
    cacheGet: () => null,
    cacheSet: (_store, key, value) => { cacheWrites.push(value); return value; },
    routingEngine: { callAgent, completeIfTruncated: async ({ ai }) => ai },
    ...extraDeps
  });
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, cacheWrites, port: server.address().port })));
}

async function ask(port, question = 'سؤال', extraBody = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'test-model', stream: true, messages: [{ role: 'user', content: question }], ...extraBody })
  });
  const raw = await res.text();
  return { raw, events: createSseParser().push(raw) };
}

(async () => {
  console.log('\nThe stream is never silent while the answer is prepared:');

  await test('keep-alive comments flow while the engine works, and parse to nothing', async () => {
    const { server, port } = await startApp(async ({ onChunk }) => {
      await sleep(450);
      onChunk('الجواب.');
      return { ok: true, answer: 'الجواب.', provider: 'p', model: 'm' };
    });
    try {
      const { raw, events } = await ask(port);
      const beforeAnswer = raw.slice(0, raw.indexOf('event: chunk'));
      const beats = (beforeAnswer.match(/^: keep-alive$/gm) || []).length;
      assert.ok(beats >= 3, `only ${beats} keep-alives in 450ms of work at a 100ms interval`);
      assert.deepStrictEqual(events.map((e) => e.event), ['chunk', 'done'], 'a keep-alive became an event');
      assert.strictEqual(events[0].data.text, 'الجواب.');
    } finally { server.close(); }
  });

  await test('keep-alives stop when the response ends', async () => {
    let writesAfterEnd = 0;
    const { server, port } = await startApp(async ({ onChunk }) => {
      onChunk('سريع.');
      return { ok: true, answer: 'سريع.', provider: 'p', model: 'm' };
    });
    server.on('request', (_req, res) => {
      const write = res.write.bind(res);
      res.write = (...args) => { if (res.writableEnded) writesAfterEnd++; return write(...args); };
    });
    try {
      await ask(port);
      await sleep(350);
      assert.strictEqual(writesAfterEnd, 0, `${writesAfterEnd} writes after the response ended`);
    } finally { server.close(); }
  });

  console.log('\nA failure mid-stream says so:');

  await test('an exception after the headers ends with an error event, not a bare close', async () => {
    const { server, port } = await startApp(async () => { await sleep(50); throw new Error('engine exploded'); });
    try {
      const { events } = await ask(port);
      const last = events[events.length - 1];
      assert.ok(last && last.event === 'error', `stream ended with ${JSON.stringify(events.map((e) => e.event))}`);
    } finally { server.close(); }
  });

  await test('an engine failure is reported as an error event', async () => {
    const { server, port } = await startApp(async () => ({ ok: false, status: 503, error: 'All AI providers failed.' }));
    try {
      const { events } = await ask(port);
      assert.deepStrictEqual(events.map((e) => e.event), ['error']);
      assert.ok(/All AI providers failed/.test(events[0].data.error));
    } finally { server.close(); }
  });

  console.log('\nA fallback answer is never cached:');

  await test('a sources-only answer is delivered but not cached', async () => {
    const answer = 'تعذّر عليّ صياغة إجابة كاملة الآن… 1. **[مصدر](https://example.com)**';
    const { server, port, cacheWrites } = await startApp(async ({ onChunk }) => {
      onChunk(answer);
      return { ok: true, answer, provider: 'sources', model: null, degraded: true, finish_reason: 'evidence_only' };
    });
    try {
      const { events } = await ask(port);
      assert.ok(events.some((e) => e.event === 'chunk' && e.data.text.includes('example.com')), 'the fallback did not reach the page');
      assert.strictEqual(cacheWrites.length, 0, 'the fallback was cached');
    } finally { server.close(); }
  });

  await test('a normal answer is still cached', async () => {
    const { server, port, cacheWrites } = await startApp(async ({ onChunk }) => {
      onChunk('إجابة عادية.');
      return { ok: true, answer: 'إجابة عادية.', provider: 'p', model: 'm' };
    });
    try {
      await ask(port);
      assert.strictEqual(cacheWrites.length, 1, 'the control case was not cached — the check above proves nothing');
    } finally { server.close(); }
  });

  console.log('\nEnglish first, Arabic whenever it is in play:');

  // Records what the route asked the prompt builder for, per request.
  const promptCalls = [];
  const builder = (options) => { promptCalls.push(options); return 'SYSTEM'; };
  const answer = async ({ onChunk }) => { onChunk('ok'); return { ok: true, answer: 'ok', provider: 'p', model: 'm' }; };

  await test('an Arabic message brings the Arabic craft; an English one does not', async () => {
    const { server, port } = await startApp(answer, { buildChatSystemPrompt: builder, cacheGet: () => null });
    try {
      promptCalls.length = 0;
      await ask(port, 'متى مباراة ريال مدريد القادمة؟');
      await ask(port, 'When is the next Real Madrid match?');
      assert.deepStrictEqual(promptCalls.map((c) => c.arabic), [true, false]);
    } finally { server.close(); }
  });

  await test('the Arabic interface brings it too, whatever the message', async () => {
    const { server, port } = await startApp(answer, { buildChatSystemPrompt: builder });
    try {
      promptCalls.length = 0;
      await ask(port, 'hello there', { language: 'ar' });
      assert.strictEqual(promptCalls[0].arabic, true);
    } finally { server.close(); }
  });

  await test('the runtime line is English, uses the page\'s time zone, and never invents a place', async () => {
    const { server, port } = await startApp(answer, { buildChatSystemPrompt: builder });
    try {
      promptCalls.length = 0;
      await ask(port, 'what time is it', { timeZone: 'Europe/London' });
      await ask(port, 'what time is it again', { timeZone: 'Not/AZone' });
      const [london, bogus] = promptCalls.map((c) => c.runtimeLine);
      assert.ok(/time zone: Europe\/London/.test(london), london);
      assert.ok(/approximate location: unknown/.test(london), `a place was invented: ${london}`);
      assert.ok(!/[\u0621-\u064A]/.test(london), `Arabic in the runtime line: ${london}`);
      assert.ok(/time zone: UTC/.test(bogus), `an invalid zone was trusted: ${bogus}`);
    } finally { server.close(); }
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

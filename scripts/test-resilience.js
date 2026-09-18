// Failure modes that take the whole service down rather than one request.
//
// The one that prompted this suite: a context-length rejection describes the
// REQUEST, not the API key. The service treated it as a key failure — 15s
// cooldown, rotate to the next key, which fails identically — so a single
// oversized prompt sidelined every key on every provider and unrelated
// requests failed for the whole cooldown window.
const assert = require('assert');
const { createLlmService } = require('../src/services/llmService');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 3).join('\n     ')}`); });
}

// Stands in for the provider. Records every call so we can count key attempts.
function stubFetch(handler) {
  const calls = [];
  global.fetch = async (url, init) => {
    const auth = (init?.headers?.Authorization || init?.headers?.authorization || '').replace('Bearer ', '');
    calls.push({ url: String(url), key: auth, body: JSON.parse(init.body || '{}') });
    return handler(calls.length, { url: String(url), key: auth });
  };
  return calls;
}

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => payload,
  text: async () => JSON.stringify(payload)
});

const FOUR_KEYS = ['k1', 'k2', 'k3', 'k4'];
const svc = () => createLlmService({ groqKeys: [...FOUR_KEYS], groqBaseUrl: 'https://example.invalid/v1' });
const MESSAGES = [{ role: 'user', content: 'مرحبا' }];

(async () => {
  console.log('\nA request-level rejection must not burn the keys:');

  await test('a context-length rejection is tried on ONE key, not every key', async () => {
    const calls = stubFetch(() => jsonResponse(400, {
      error: { message: "Please reduce the length of the messages; this model's maximum context length is 8192 tokens" }
    }));
    const service = svc();
    await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(calls.length, 1, `retried on ${calls.length} keys — every extra attempt fails identically and sidelines a healthy key`);
  });

  await test('the key stays usable afterwards', async () => {
    let phase = 'reject';
    stubFetch(() => phase === 'reject'
      ? jsonResponse(400, { error: { message: 'maximum context length is 8192 tokens' } })
      : jsonResponse(200, { choices: [{ message: { content: 'أهلاً' }, finish_reason: 'stop' } ] }));
    const service = svc();
    await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    // A normal request right afterwards must still go through.
    phase = 'ok';
    const res = await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(res.ok, true, `the next request failed too: ${res.error} — the oversized prompt cooled the keys down`);
  });

  await test('the caller is told it was the context length, not a dead provider', async () => {
    stubFetch(() => jsonResponse(400, { error: { message: 'maximum context length is 8192 tokens' } }));
    const service = svc();
    const res = await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(res.ok, false);
    assert.ok(res.contextLengthExceeded === true, 'the context-length case is not flagged, so nothing upstream can shrink and retry');
  });

  console.log('\nGenuine key problems still rotate as before:');

  await test('a rate-limited key rotates to the next one', async () => {
    const calls = stubFetch((n) => n < 4
      ? jsonResponse(429, { error: { message: 'rate limit reached' } })
      : jsonResponse(200, { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' } ] }));
    const service = svc();
    const res = await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(res.ok, true, 'rotation stopped working');
    assert.ok(calls.length >= 2, `only ${calls.length} key tried — rate limits must rotate`);
  });

  await test('a 500 still rotates to the next key', async () => {
    const calls = stubFetch((n) => n < 3
      ? jsonResponse(500, { error: { message: 'internal error' } })
      : jsonResponse(200, { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' } ] }));
    const service = svc();
    const res = await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(res.ok, true);
    assert.ok(calls.length >= 2, `only ${calls.length} key tried`);
  });

  await test('an invalid key is still sidelined and the next one tried', async () => {
    const calls = stubFetch((n) => n < 2
      ? jsonResponse(401, { error: { message: 'Invalid API key' } })
      : jsonResponse(200, { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' } ] }));
    const service = svc();
    const res = await service.callGroqChat({ model: 'm', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(res.ok, true);
    assert.ok(calls.length >= 2, 'a bad key must fail over');
  });

  await test('a decommissioned model still migrates', async () => {
    let seen = [];
    stubFetch((n, info) => {
      seen.push(n);
      return n === 1
        ? jsonResponse(400, { error: { message: 'The model `llama-3.1-70b-versatile` has been decommissioned' } })
        : jsonResponse(200, { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' } ] });
    });
    const service = svc();
    const res = await service.callGroqChat({ model: 'llama-3.1-70b-versatile', messages: MESSAGES, max_tokens: 100 });
    assert.strictEqual(res.ok, true, 'model migration broke');
  });


  console.log('\nAn over-long prompt is shrunk and retried, not failed:');

  const { createRoutingEngine } = require('../src/agents/RoutingEngine');

  // A routing engine over a scripted provider, so we can assert what the chain
  // does when a model says the prompt is too long.
  function engineOver(dispatch) {
    return createRoutingEngine({
      llmService: { dispatch, hasKeys: () => true, hasAnyProvider: () => true },
      safeCalculate: null,
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'flash-m', groqText: 'text-m', groqCode: 'text-m', groqVision: 'v' }
    });
  }

  const LONG = [{ role: 'user', content: 'س'.repeat(40000) }];

  await test('a too-long prompt is retried smaller instead of failing', async () => {
    const seen = [];
    const engine = engineOver(async (provider, params) => {
      const size = params.messages.reduce((n, m) => n + String(m.content || '').length, 0);
      seen.push(size);
      if (size > 25000) return { ok: false, status: 400, error: 'maximum context length is 8192 tokens', requestFault: true, contextLengthExceeded: true };
      return { ok: true, answer: 'تم التحليل', provider, model: params.model, finish_reason: 'stop' };
    });
    const res = await engine.callAgent({ agentType: 'chat', model: 'text-m', messages: LONG, mode: 'flash', max_tokens: 500 });
    assert.strictEqual(res.ok, true, 'the request still failed: ' + res.error);
    assert.ok(seen.length >= 2, 'it never retried at a smaller size: ' + JSON.stringify(seen));
    assert.ok(seen[seen.length - 1] < seen[0], 'the retry was not actually smaller: ' + JSON.stringify(seen));
  });

  await test('the shrunk prompt keeps both ends of the content', async () => {
    let lastSent = null;
    const engine = engineOver(async (provider, params) => {
      const size = params.messages.reduce((n, m) => n + String(m.content || '').length, 0);
      lastSent = params.messages[0].content;
      if (size > 25000) return { ok: false, status: 400, error: 'context length exceeded', requestFault: true, contextLengthExceeded: true };
      return { ok: true, answer: 'ok', provider, model: params.model, finish_reason: 'stop' };
    });
    const marked = [{ role: 'user', content: 'البداية_المهمة ' + 'ح'.repeat(39000) + ' النهاية_المهمة' }];
    await engine.callAgent({ agentType: 'chat', model: 'text-m', messages: marked, mode: 'flash', max_tokens: 500 });
    assert.ok(lastSent.includes('البداية_المهمة'), 'the opening was dropped');
    assert.ok(lastSent.includes('النهاية_المهمة'), 'the closing evidence was dropped');
  });

  await test('the model is told content was removed', async () => {
    let lastSent = null;
    const engine = engineOver(async (provider, params) => {
      const size = params.messages.reduce((n, m) => n + String(m.content || '').length, 0);
      lastSent = params.messages[0].content;
      if (size > 25000) return { ok: false, status: 400, error: 'context length exceeded', requestFault: true, contextLengthExceeded: true };
      return { ok: true, answer: 'ok', provider, model: params.model, finish_reason: 'stop' };
    });
    await engine.callAgent({ agentType: 'chat', model: 'text-m', messages: LONG, mode: 'flash', max_tokens: 500 });
    assert.ok(/حُذف جزء من المحتوى/.test(lastSent), 'the cut is silent — the model cannot say the content was incomplete');
  });

  await test('it gives up shrinking rather than looping forever', async () => {
    let calls = 0;
    const engine = engineOver(async (provider, params) => {
      calls++;
      return { ok: false, status: 400, error: 'context length exceeded', requestFault: true, contextLengthExceeded: true };
    });
    const res = await engine.callAgent({ agentType: 'chat', model: 'text-m', messages: LONG, mode: 'flash', max_tokens: 500 });
    assert.strictEqual(res.ok, false);
    assert.ok(calls <= 12, 'shrink retries are unbounded (' + calls + ' calls)');
  });


  console.log('\nRetrieved evidence survives the history trim:');

  const { trimForChat } = require('../src/routes/chat');
  const turn = (role, chars, marker) => ({ role, content: (marker || 'x') + 'ن'.repeat(Math.max(0, chars - (marker || 'x').length)) });
  const lenOf = (m) => (typeof m.content === 'string' ? m.content.length : 0);

  await test('the newest turn keeps a full retrieval payload (17k chars)', () => {
    const out = trimForChat([turn('user', 500), turn('assistant', 800), turn('user', 17000)]);
    assert.strictEqual(lenOf(out[out.length - 1]), 17000, 'retrieved evidence is still being cut');
  });

  await test('an older turn is kept lean', () => {
    const out = trimForChat([turn('user', 17000), turn('assistant', 300), turn('user', 200)]);
    assert.ok(lenOf(out[0]) <= 4200, 'history turns are not budgeted: ' + lenOf(out[0]));
  });

  await test('a newest turn past the ceiling keeps both ends', () => {
    const content = 'راس_الرسالة ' + 'ح'.repeat(80000) + ' ذيل_الرسالة';
    const out = trimForChat([{ role: 'user', content }]);
    const got = out[0].content;
    assert.ok(got.length <= 48000 + 400, 'the newest-turn ceiling is not enforced: ' + got.length);
    assert.ok(got.includes('راس_الرسالة'), 'the question was dropped');
    assert.ok(got.includes('ذيل_الرسالة'), 'the closing evidence was dropped');
  });

  await test('a truncated turn tells the model content is missing', () => {
    const out = trimForChat([{ role: 'user', content: 'ح'.repeat(80000) }]);
    assert.ok(/اقتُطع جزء/.test(out[0].content), 'the cut is silent');
  });

  await test('a long conversation stays under the whole-payload ceiling', () => {
    const many = Array.from({ length: 12 }, (_, i) => turn(i % 2 ? 'assistant' : 'user', 9000));
    const out = trimForChat(many);
    const total = out.reduce((n, m) => n + lenOf(m), 0);
    assert.ok(total <= 72000, 'the conversation ceiling is not enforced: ' + total);
  });

  await test('the newest turn is never the one dropped', () => {
    const many = Array.from({ length: 12 }, () => turn('user', 20000));
    many[many.length - 1] = { role: 'user', content: 'سؤالي_الأخير' };
    const out = trimForChat(many);
    assert.strictEqual(out[out.length - 1].content, 'سؤالي_الأخير', 'the actual request was trimmed away');
  });

  await test('multimodal text parts are budgeted too', () => {
    const content = [{ type: 'text', text: 'ح'.repeat(90000) }, { type: 'image_url', image_url: { url: 'data:,' } }];
    const out = trimForChat([{ role: 'user', content }]);
    const textPart = out[0].content.find(pt => pt.type === 'text');
    assert.ok(textPart.text.length <= 48000 + 400, 'an image turn can carry an unbounded document: ' + textPart.text.length);
    assert.ok(out[0].content.some(pt => pt.type === 'image_url'), 'the image was lost');
  });

  await test('the legacy search pack is still stripped from older turns only', () => {
    const withPack = 'سؤال قديم\n\nSOURCE PACK:\nمصادر قديمة كثيرة';
    const out = trimForChat([{ role: 'user', content: withPack }, { role: 'assistant', content: 'رد' }, { role: 'user', content: withPack }]);
    assert.ok(!out[0].content.includes('SOURCE PACK'), 'an old search pack is still being replayed');
    assert.ok(out[2].content.includes('SOURCE PACK'), 'the current turn lost its own search pack');
  });


  console.log('\nA big request gets proportionate time:');

  async function budgetFor(chars) {
    let deadlineSeen = null;
    const engine = engineOver(async (provider, params) => {
      deadlineSeen = params.deadlineMs;
      return { ok: true, answer: 'x', provider, model: params.model, finish_reason: 'stop' };
    });
    await engine.callAgent({ agentType: 'chat', model: 'text-m', mode: 'flash', max_tokens: 100, messages: [{ role: 'user', content: 'ح'.repeat(chars) }] });
    return Math.round((deadlineSeen - Date.now()) / 1000);
  }

  await test('a small request keeps the fast budget', async () => {
    const secs = await budgetFor(500);
    assert.ok(secs <= 45, 'short requests became slow to fail: ' + secs + 's');
  });

  await test('a document-sized request is given longer', async () => {
    const secs = await budgetFor(60000);
    assert.ok(secs >= 90, 'a large prompt still races a short deadline: ' + secs + 's');
  });

  await test('the budget never exceeds what the client waits for', async () => {
    const secs = await budgetFor(500000);
    assert.ok(secs <= 170, 'the server can now outlive the client timeout: ' + secs + 's');
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

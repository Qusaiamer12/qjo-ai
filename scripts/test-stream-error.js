// A provider's error inside a 200 stream is a failure, never an answer.
const assert = require('assert');
const { consumeStream } = require('../src/services/providerResponse');

function responseOf(lines) {
  const body = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(lines.map((l) => `data: ${l}\n\n`).join(''))); c.close(); }
  });
  return { body };
}
const delta = (t) => JSON.stringify({ choices: [{ delta: { content: t } }] });
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e) { fail++; console.log(`  FAIL ${name}\n     ${e.message}`); }
}

(async () => {
  await test('a stream that is only an error object fails (is not delivered as text)', async () => {
    const got = [];
    await assert.rejects(
      consumeStream(responseOf([JSON.stringify({ error: { message: 'Rate limit reached for model' } })]), (c) => got.push(c)),
      /stream error: Rate limit reached/
    );
    assert.deepStrictEqual(got, []);
  });
  await test('finish_reason "error" with no words fails', async () => {
    await assert.rejects(consumeStream(responseOf([JSON.stringify({ choices: [{ delta: {}, finish_reason: 'error' }] })]), () => {}), /stream error/);
  });
  await test('words then an error: words kept, marked cut so the page offers Continue', async () => {
    const r = await consumeStream(responseOf([delta('Hello there'), JSON.stringify({ error: { message: 'boom' } })]), () => {});
    assert.strictEqual(r.fullText, 'Hello there');
    assert.strictEqual(r.finishReason, 'length');
  });
  await test('control: a clean stream is an answer', async () => {
    const r = await consumeStream(responseOf([delta('Hi'), JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }), '[DONE]']), () => {});
    assert.strictEqual(r.fullText, 'Hi');
    assert.strictEqual(r.finishReason, 'stop');
  });
  // A tool call written as text, or reasoning with no answer, is no answer.
  const think = (t) => JSON.stringify({ choices: [{ delta: { reasoning_content: t } }] });
  const split = (text, n) => text.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g'));
  for (const markup of ['<tool_call>{"name":"web_search","arguments":{"q":"x"}}</tool_call>', '<function=web_search>{"q":"x"}</function>', '<|python_tag|>web_search(q="x")']) {
    await test(`only ${markup.slice(0, 16)}... delivers nothing, however it is split`, async () => {
      for (const n of [3, 7, 1000]) {
        const got = [];
        const r = await consumeStream(responseOf([...split(markup, n).map(delta), '[DONE]']), (c) => got.push(c));
        assert.strictEqual(r.fullText.trim(), '', `split ${n}: ${JSON.stringify(r.fullText)}`);
        assert.deepStrictEqual(got, [], `split ${n}: the page was shown ${JSON.stringify(got)}`);
      }
    });
  }
  await test('real words around a raw tool call are kept, the call is not', async () => {
    const r = await consumeStream(responseOf([delta('Let me check. <tool_'), delta('call>{"a":1}</tool_call> Done.'), '[DONE]']), () => {});
    assert.strictEqual(r.fullText, 'Let me check.  Done.');
  });
  await test('reasoning alone leaves the answer empty', async () => {
    const r = await consumeStream(responseOf([think('thinking...'), JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }), '[DONE]']), () => {});
    assert.strictEqual(r.fullText, '');
  });
  await test('a JSON body that is only a raw tool call has no answer', async () => {
    const { readAnswerBody } = require('../src/services/providerResponse');
    const attempt = { rearm() {}, done() {}, wasExternal: () => false, timedOut: () => false };
    const body = { choices: [{ message: { content: '<tool_call>{"name":"x"}</tool_call>' }, finish_reason: 'stop' }] };
    const out = await readAnswerBody({ response: { json: async () => body }, attempt, provider: 'p', model: 'm', timeLeft: () => 5000 });
    assert.strictEqual(out.result.answer, '');
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

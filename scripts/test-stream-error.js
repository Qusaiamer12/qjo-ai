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
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

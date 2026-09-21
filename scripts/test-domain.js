// Pure front-end logic, tested without a browser.
//
// These branches used to live inside sendMessage — a 588-line function with a
// cyclomatic complexity of 126. Checking that a 413 said something useful meant
// triggering a 413 in a real browser. Now each branch is one assertion that
// runs in milliseconds, which is the whole reason for pulling pure logic out.
const assert = require('assert');
const { classifyRequestFailure } = require('../public/domain/requestFailure.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 3).join('\n     ')}`);
  }
}

(() => {
  console.log('\nDefinite failures are never retried:');

  const definite = [
    ['a cancelled request', { name: 'AbortError' }, 'aborted'],
    ['a payload over the limit', { status: 413 }, 'too-large'],
    ['the backend not running', { message: 'AI_BACKEND_MISSING' }, 'backend-missing'],
    ['not signed in', { message: 'AUTH_REQUIRED' }, 'auth-required'],
    ['the provider rate limit', { message: 'RATE_LIMIT' }, 'rate-limit'],
    ['a 429 from upstream', { message: 'Request failed: 429 too many requests' }, 'rate-limit'],
    ['no provider configured', { message: 'No AI provider is configured.' }, 'not-configured']
  ];
  for (const [label, error, kind] of definite) {
    test(`${label} is not retried`, () => {
      const result = classifyRequestFailure(error);
      assert.strictEqual(result.kind, kind, `classified as ${result.kind}`);
      assert.strictEqual(result.transient, false, 'retrying this cannot help, so it must not be retried');
      assert.ok(result.message.trim().length > 10, 'the user is told nothing useful');
    });
  }

  console.log('\nFailures that resolve themselves are retried:');

  const transient = [
    ['an empty answer', { message: 'EMPTY_ANSWER' }],
    ['the whole provider chain failing', { message: 'All AI providers failed. Last: timeout' }],
    ['a 503', { status: 503, message: 'SERVICE_FAILED' }],
    ['a 502 gateway', { status: 502 }],
    ['the network dropping', { message: 'Failed to fetch' }]
  ];
  for (const [label, error] of transient) {
    test(`${label} is retried`, () => {
      const result = classifyRequestFailure(error);
      assert.strictEqual(result.transient, true, `${label} was treated as final`);
    });
  }

  console.log('\nWhat the user is told:');

  test('a payload failure points at the attachments', () => {
    const { message } = classifyRequestFailure({ status: 413 });
    assert.ok(/المرفقات|الحد المسموح/.test(message), message);
  });

  test('the real reason is shown when it is short enough to read', () => {
    const { message } = classifyRequestFailure({ message: 'All AI providers failed. Last: groq timeout' });
    assert.ok(/السبب التقني/.test(message), 'the reason is hidden, so nothing can be diagnosed');
    assert.ok(/groq timeout/.test(message), message);
  });

  test('a stack trace is not pasted at the user', () => {
    const wall = 'All AI providers failed. ' + 'x'.repeat(400);
    const { message } = classifyRequestFailure({ message: wall });
    assert.ok(!message.includes('xxxxxxxxxx'), 'a 400-character error was shown verbatim');
    assert.ok(message.length < 300, `message is ${message.length} characters`);
  });

  test('it never claims the service has recovered', () => {
    // An earlier version asserted "الخدمة جاهزة الآن!" — something the page
    // cannot know, which sent people to retry against a service still down.
    for (const error of [{ status: 503 }, { message: 'All AI providers failed' }, { name: 'AbortError' }]) {
      const { message } = classifyRequestFailure(error);
      assert.ok(!/جاهزة الآن|ready now/i.test(message), `claims recovery: ${message}`);
    }
  });

  test('an unrecognised error still produces something to read', () => {
    const result = classifyRequestFailure({ message: 'something nobody anticipated' });
    assert.strictEqual(result.kind, 'unknown');
    assert.ok(result.message.trim().length > 10, 'an unknown failure showed nothing');
    assert.strictEqual(result.transient, false, 'an unknown failure must not be retried blindly');
  });

  test('a missing error object does not throw', () => {
    for (const input of [null, undefined, {}]) {
      const result = classifyRequestFailure(input);
      assert.ok(result && result.message, `no message for ${JSON.stringify(input)}`);
    }
  });

  console.log('\nPrecedence between overlapping signals:');

  test('a 413 wins over a 5xx-looking message', () => {
    const result = classifyRequestFailure({ status: 413, message: 'service unavailable' });
    assert.strictEqual(result.kind, 'too-large', 'a definite failure was treated as transient');
    assert.strictEqual(result.transient, false);
  });

  test('an abort wins over everything', () => {
    const result = classifyRequestFailure({ name: 'AbortError', status: 503, message: 'EMPTY_ANSWER' });
    assert.strictEqual(result.kind, 'aborted', 'a user cancellation was retried');
    assert.strictEqual(result.transient, false);
  });

  test('a rate limit is never retried automatically', () => {
    // Retrying into a rate limit makes it worse.
    const result = classifyRequestFailure({ status: 503, message: 'rate limit reached' });
    assert.strictEqual(result.transient, false, 'it would retry straight back into the limit');
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Pure front-end logic, tested without a browser.
//
// These branches used to live inside sendMessage — a 588-line function with a
// cyclomatic complexity of 126. Checking that a 413 said something useful meant
// triggering a 413 in a real browser. Now each branch is one assertion that
// runs in milliseconds, which is the whole reason for pulling pure logic out.
const assert = require('assert');
const { classifyRequestFailure } = require('../public/domain/requestFailure.js');
const { createSseParser, routeStreamChunk } = require('../public/domain/streamProtocol.js');

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


  console.log('\nThe wire format survives arbitrary chunk boundaries:');

  // The network decides where a chunk ends, not the protocol. Every one of
  // these split points is something a real stream produces.
  const framesOf = (pieces) => {
    const parser = createSseParser();
    const out = [];
    for (const piece of pieces) out.push(...parser.push(piece));
    return out;
  };

  test('a whole frame parses', () => {
    const events = framesOf(['event: chunk\ndata: {"text":"أهلاً"}\n\n']);
    assert.deepStrictEqual(events, [{ event: 'chunk', data: { text: 'أهلاً' } }]);
  });

  test('a frame split mid-value still parses', () => {
    const events = framesOf(['event: chunk\ndata: {"text":"أه', 'لاً"}\n\n']);
    assert.strictEqual(events.length, 1, 'the split frame was lost');
    assert.strictEqual(events[0].data.text, 'أهلاً');
  });

  test('a frame arriving one character at a time parses', () => {
    const frame = 'event: chunk\ndata: {"text":"مرحبا"}\n\n';
    const events = framesOf(frame.split(''));
    assert.strictEqual(events.length, 1, 'byte-by-byte delivery lost the frame');
    assert.strictEqual(events[0].data.text, 'مرحبا');
  });

  test('several frames in one chunk all parse, in order', () => {
    const events = framesOf([
      'event: chunk\ndata: {"text":"أ"}\n\nevent: chunk\ndata: {"text":"ب"}\n\nevent: done\ndata: {}\n\n'
    ]);
    assert.deepStrictEqual(events.map(e => e.event), ['chunk', 'chunk', 'done']);
    assert.strictEqual(events[0].data.text + events[1].data.text, 'أب');
  });

  test('an incomplete trailing frame is held, not guessed at', () => {
    const parser = createSseParser();
    const first = parser.push('event: chunk\ndata: {"text":"تم"}\n\nevent: chunk\ndata: {"tex');
    assert.strictEqual(first.length, 1, 'a partial frame was emitted');
    const second = parser.push('t":"ام"}\n\n');
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].data.text, 'ام');
  });

  test('a malformed frame is skipped without ending the stream', () => {
    const events = framesOf([
      'event: chunk\ndata: {not json}\n\nevent: chunk\ndata: {"text":"بعدها"}\n\n'
    ]);
    assert.strictEqual(events.length, 1, 'one bad frame took the rest with it');
    assert.strictEqual(events[0].data.text, 'بعدها');
  });

  test('a frame with no data is skipped', () => {
    assert.strictEqual(framesOf([': keep-alive padding\n\n']).length, 0);
  });

  test('multi-line data fields concatenate', () => {
    const events = framesOf(['event: chunk\ndata: {"text":\ndata: "مقسوم"}\n\n']);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.text, 'مقسوم');
  });

  test('an event with no event: line defaults to message', () => {
    const events = framesOf(['data: {"text":"x"}\n\n']);
    assert.strictEqual(events[0].event, 'message');
  });

  console.log('\nReasoning and answer stay separated:');

  // Actions rather than side effects, so ordering can be asserted exactly.
  const route = (chunks) => {
    let inside = false;
    const acts = [];
    for (const c of chunks) {
      const r = routeStreamChunk(c, inside);
      inside = r.insideThink;
      acts.push(...r.actions);
    }
    return {
      types: acts.map(a => a.type),
      content: acts.filter(a => a.type === 'content').map(a => a.text).join(''),
      reasoning: acts.filter(a => a.type === 'reasoning').map(a => a.text).join(''),
      inside
    };
  };

  test('plain text is all answer', () => {
    const r = route(['أهلاً ', 'بك']);
    assert.strictEqual(r.content, 'أهلاً بك');
    assert.strictEqual(r.reasoning, '');
  });

  test('a think block is routed to reasoning, not the answer', () => {
    const r = route(['<think>أفكر هنا</think>الجواب']);
    assert.strictEqual(r.reasoning, 'أفكر هنا');
    assert.strictEqual(r.content, 'الجواب');
  });

  test('a think tag opening and closing chunks apart still splits correctly', () => {
    const r = route(['قبل<think>سطر ', 'أول ', 'وثاني</think>بعد']);
    assert.strictEqual(r.content, 'قبلبعد', `answer leaked reasoning: ${r.content}`);
    assert.strictEqual(r.reasoning, 'سطر أول وثاني');
    assert.strictEqual(r.inside, false, 'the block was never closed');
  });

  test('an unterminated think block keeps consuming reasoning', () => {
    const r = route(['<think>بدأت', ' ولم تنته']);
    assert.strictEqual(r.inside, true);
    assert.strictEqual(r.content, '', 'unterminated reasoning leaked into the answer');
  });

  test('text before a tag is delivered before the tag takes effect', () => {
    const r = route(['جواب<think>تفكير']);
    // Close any open card, deliver the answer text that preceded the tag, then
    // open thinking. Answer text must never land after the thought it preceded.
    assert.deepStrictEqual(r.types, ['endThinkingIfActive', 'content', 'beginThinking', 'reasoning'],
      `ordering changed: ${r.types.join(',')}`);
  });

  test('a reasoning card is closed before the answer resumes', () => {
    const r = routeStreamChunk('نص عادي', false);
    assert.strictEqual(r.actions[0].type, 'endThinkingIfActive',
      'the answer would render before the reasoning divider');
  });

  test('two think blocks in one chunk do not lose the tail', () => {
    // String.split would discard everything past the second marker.
    const r = route(['<think>أ</think>وسط<think>ب</think>آخر']);
    assert.ok(r.content.includes('وسط'), `middle answer lost: ${r.content}`);
    assert.ok(r.content.includes('آخر'), `trailing answer lost: ${r.content}`);
  });

  test('an empty chunk produces no text actions', () => {
    const r = routeStreamChunk('', false);
    assert.ok(!r.actions.some(a => a.type === 'content' || a.type === 'reasoning'));
  });


  test('a complete think block in one chunk does not swallow the answer', () => {
    // The shipped behaviour: a provider that sends its whole reasoning in one
    // chunk put the closing tag AND the answer into the reasoning card, then
    // stayed in thinking mode forever — so the answer bubble was empty.
    const r = route(['<think>أفكر هنا</think>الجواب النهائي']);
    assert.strictEqual(r.reasoning, 'أفكر هنا', `reasoning: ${r.reasoning}`);
    assert.strictEqual(r.content, 'الجواب النهائي', `the answer was lost: "${r.content}"`);
    assert.strictEqual(r.inside, false, 'it stayed in thinking mode, so every later chunk is lost too');
  });

  test('everything after a self-contained think block still arrives', () => {
    const r = route(['<think>ت</think>أول', ' وثاني', ' وثالث']);
    assert.strictEqual(r.content, 'أول وثاني وثالث', `later chunks were lost: "${r.content}"`);
  });

  console.log('\nThe streamed answer reassembles exactly:');

  test('spacing between chunks is preserved', () => {
    // The production defect: every word ran into the next.
    const tokens = ['أهلاً', ' يا', ' قلبي', '!', ' كيفك', ' اليوم', '؟'];
    const r = route(tokens);
    assert.strictEqual(r.content, tokens.join(''), `glued: ${r.content}`);
  });

  test('a stream reassembles through the parser and the router together', () => {
    const answer = 'السطر الأول. ثم الثاني. وأخيرًا الثالث.';
    const frames = answer.match(/[\s\S]{1,4}/g)
      .map(part => `event: chunk\ndata: ${JSON.stringify({ text: part })}\n\n`)
      .join('');
    // Delivered in awkward network-sized pieces, not frame-aligned.
    const pieces = frames.match(/[\s\S]{1,17}/g);
    const parser = createSseParser();
    let inside = false;
    let rebuilt = '';
    for (const piece of pieces) {
      for (const { event, data } of parser.push(piece)) {
        if (event !== 'chunk') continue;
        const routed = routeStreamChunk(data.text || '', inside);
        inside = routed.insideThink;
        for (const action of routed.actions) if (action.type === 'content') rebuilt += action.text;
      }
    }
    assert.strictEqual(rebuilt, answer, `reassembly differs:\n  got  ${rebuilt}\n  want ${answer}`);
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Pure front-end logic, tested without a browser.
//
// These branches used to live inside sendMessage — a 588-line function with a
// cyclomatic complexity of 126. Checking that a 413 said something useful meant
// triggering a 413 in a real browser. Now each branch is one assertion that
// runs in milliseconds, which is the whole reason for pulling pure logic out.
const assert = require('assert');
const { classifyRequestFailure } = require('../public/domain/requestFailure.js');
const { createSseParser, routeStreamChunk, readEventStream, sourcesFromToolsUsed } = require('../public/domain/streamProtocol.js');
const markdown = require('../public/domain/markdown.js');

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

  test('a payload failure points at the attachments, in English by default and in Arabic when asked', () => {
    assert.ok(/attachments|limit/.test(classifyRequestFailure({ status: 413 }).message));
    const ar = classifyRequestFailure({ status: 413 }, { language: 'ar' }).message;
    assert.ok(/المرفقات|الحد المسموح/.test(ar), ar);
  });

  test('the real reason is shown when it is short enough to read', () => {
    const { message } = classifyRequestFailure({ message: 'All AI providers failed. Last: groq timeout' });
    assert.ok(/Technical reason/.test(message), 'the reason is hidden, so nothing can be diagnosed');
    assert.ok(/groq timeout/.test(message), message);
    const ar = classifyRequestFailure({ message: 'All AI providers failed. Last: groq timeout' }, { language: 'ar' }).message;
    assert.ok(/السبب التقني/.test(ar) && /groq timeout/.test(ar), ar);
  });

  test('every failure has a message in both languages, and English is the fallback', () => {
    const errors = [{ name: 'AbortError' }, { status: 413 }, { message: 'AI_BACKEND_MISSING' }, { message: 'AUTH_REQUIRED' },
      { message: 'RATE_LIMIT' }, { message: '429 too many requests' }, { message: 'No provider configured' },
      { message: 'EMPTY_ANSWER' }, { message: 'STREAM_STALLED' }, { status: 503 }, { message: 'All AI providers failed' }, { message: 'odd' }];
    for (const error of errors) {
      const en = classifyRequestFailure(error, { language: 'en' }).message;
      const ar = classifyRequestFailure(error, { language: 'ar' }).message;
      const other = classifyRequestFailure(error, { language: 'fr' }).message;
      assert.ok(en && !/[\u0621-\u064A]/.test(en), `English message has Arabic: ${en}`);
      assert.ok(/[\u0621-\u064A]/.test(ar), `Arabic message is not Arabic: ${ar}`);
      assert.strictEqual(other, en, 'an unknown language did not fall back to English');
    }
  });

  test('every provider failing is not blamed on a sleeping server', () => {
    // Reported: every long request ended in "the server was probably asleep"
    // above a reason that said the opposite — the server answered, with
    // [groq:413, llm7:504].
    const reason = 'All AI providers failed. Last: llm7 timeout (1996ms). [groq:413, llm7:504]';
    for (const language of ['en', 'ar']) {
      const r = classifyRequestFailure({ message: reason }, { language });
      assert.strictEqual(r.kind, 'providers');
      assert.ok(!/asleep|نايم/.test(r.message), `still blames a cold start: ${r.message}`);
      assert.ok(r.message.includes('[groq:413, llm7:504]'), 'the reason is hidden');
    }
    assert.ok(/AI services/.test(classifyRequestFailure({ message: reason }).message));
    assert.ok(/خدمات الذكاء/.test(classifyRequestFailure({ message: reason }, { language: 'ar' }).message));
    // A server that really did not answer still says so.
    assert.strictEqual(classifyRequestFailure({ status: 503 }).kind, 'transient');
  });

  test('one rate limit among other failures is not called "under pressure"', () => {
    const mixed = classifyRequestFailure({ message: 'All AI providers failed. Last: llm7 timeout (18000ms). [groq:429, llm7:504]' });
    assert.strictEqual(mixed.kind, 'providers', `a single 429 in the detail decided the message: ${mixed.kind}`);
    const allLimited = classifyRequestFailure({ message: 'All AI providers rate-limited (429). Retry in ~1 minute. [groq:429, llm7:429]' });
    assert.strictEqual(allLimited.kind, 'rate-limit', 'every provider limited is still named as such');
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


  console.log('\nMarkdown rendering cannot be turned into markup injection:');

  // Every answer goes through this and lands in the page as HTML, which makes
  // it the largest escaping surface in the front end. The property that holds
  // it together: the whole input is escaped before any markup is generated, so
  // a quote inside a link target becomes &quot; and cannot close an attribute.
  // These assert on the rendered result, not on strings, because a test that
  // greps for "<script" passes on output that is still dangerous.
  const render = (src) => markdown.lightMarkdown(src);

  const attacks = [
    ['a raw script tag', '<script>alert(1)</script>'],
    ['an image error handler', '<img src=x onerror=alert(1)>'],
    ['breaking out of href', '[x](https://a" onmouseover="alert(1))'],
    ['markup in a link label', '[<img src=x onerror=alert(1)>](https://a.com)'],
    ['markup inside code', '`<img src=x onerror=alert(1)>`'],
    ['markup inside bold', '**<img src=x onerror=alert(1)>**'],
    ['markup in a table cell', '| a | b |\n| --- | --- |\n| <img src=x onerror=alert(1)> | y |'],
    ['markup in a heading', '# <img src=x onerror=alert(1)>'],
    ['an svg handler', '<svg onload=alert(1)>'],
    ['an iframe', '<iframe src="javascript:alert(1)"></iframe>'],
    ['a style block', '<style>body{display:none}</style>']
  ];

  for (const [label, payload] of attacks) {
    test(`${label} renders inert`, () => {
      const html = render(payload);
      assert.ok(!/<script\b/i.test(html), `a script tag survived: ${html.slice(0, 120)}`);
      assert.ok(!/<iframe\b/i.test(html), `an iframe survived: ${html.slice(0, 120)}`);
      assert.ok(!/<style\b/i.test(html), `a style block survived: ${html.slice(0, 120)}`);
      // Only an event handler INSIDE a real tag is dangerous. Escaped text
      // reading "onerror=alert(1)" is inert, and a bare search for /\son\w+=/
      // fails on output that is perfectly safe — the mirror image of a test
      // that greps for "<script" and passes on output that is not.
      assert.ok(!/<[a-z][^>]*\son\w+\s*=/i.test(html), `an event handler survived inside a tag: ${html.slice(0, 160)}`);
      // The payload's own markup must have arrived escaped, not stripped: if a
      // sanitiser silently dropped it we would never learn that it got through.
      if (/^</.test(payload)) {
        assert.ok(html.includes('&lt;'), `markup was neither escaped nor visible: ${html.slice(0, 120)}`);
      }
    });
  }

  test('a javascript: link never becomes an anchor', () => {
    const html = render('[x](javascript:alert(1))');
    assert.ok(!/href\s*=\s*["']?javascript:/i.test(html), html);
  });

  test('a link target cannot close its own attribute', () => {
    const html = render('[x](https://a" onmouseover="alert(1))');
    // The quote has to arrive escaped, or the attribute ends early.
    assert.ok(!/href="[^"]*"\s+onmouseover/i.test(html), `attribute injection: ${html}`);
  });

  console.log('\nMarkdown still renders what it should:');

  test('bold becomes strong', () => {
    assert.ok(/<strong>غامق<\/strong>/.test(render('**غامق**')), render('**غامق**'));
  });

  test('inline code becomes code', () => {
    assert.ok(/<code>x<\/code>/.test(render('`x`')), render('`x`'));
  });

  test('a real link becomes an anchor that opens safely', () => {
    const html = render('[مصدر](https://example.com/a)');
    assert.ok(/href="https:\/\/example\.com\/a"/.test(html), html);
    assert.ok(/rel="noopener noreferrer"/.test(html), 'a new-tab link without noopener exposes window.opener');
    assert.ok(/target="_blank"/.test(html), html);
  });

  test('a bare URL becomes a link', () => {
    assert.ok(/<a [^>]*href="https:\/\/example\.com"/.test(render('شوف https://example.com هون')), render('شوف https://example.com هون'));
  });

  test('a table becomes a table', () => {
    const html = render('| أ | ب |\n| --- | --- |\n| ١ | ٢ |');
    assert.ok(/<table/.test(html), html.slice(0, 120));
    assert.ok(/<th>أ<\/th>/.test(html), html.slice(0, 200));
    assert.ok(/<td>١<\/td>/.test(html), html.slice(0, 250));
  });

  test('a malformed table does not throw', () => {
    for (const bad of ['|', '| a |', '| a |\n| --- |', '|||\n|---|---|', '| a | b |\n| --- |\n| 1 |']) {
      assert.doesNotThrow(() => render(bad), `threw on: ${JSON.stringify(bad)}`);
    }
  });

  test('headings shift down so they nest under the page', () => {
    // An answer must not emit an h1 that competes with the page's own heading.
    assert.ok(!/<h1[\s>]/.test(render('# عنوان')), render('# عنوان'));
  });

  test('empty and non-string input do not throw', () => {
    for (const input of ['', null, undefined, 0, false]) {
      assert.doesNotThrow(() => render(input), `threw on ${JSON.stringify(input)}`);
    }
  });

  test('a very long answer renders in reasonable time', () => {
    const long = '## قسم\n\nفقرة تحليلية مع **غامق** و `كود` ورابط https://example.com\n\n- نقطة\n- أخرى\n\n'.repeat(300);
    const started = Date.now();
    const html = render(long);
    const elapsed = Date.now() - started;
    assert.ok(html.length > 1000, 'nothing rendered');
    assert.ok(elapsed < 3000, `rendering took ${elapsed}ms — catastrophic backtracking somewhere`);
  });

  test('escapeHtml covers every character that can start markup', () => {
    assert.strictEqual(markdown.escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#039;');
  });

})();

(() => {
  console.log('\nThe interface catalog holds both languages to each other:');
  const { CATALOG, createTranslator } = require('../public/domain/i18n.js');
  const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(',');
  // Values that are the same in both languages by nature: layout data, and
  // product and mode names the Arabic interface deliberately keeps in English.
  const NEUTRAL = new Set(['dir', 'lang', 'listSeparator', 'welcomeKicker', 'normal']);

  test('English and Arabic carry exactly the same keys', () => {
    const en = Object.keys(CATALOG.en), ar = Object.keys(CATALOG.ar);
    assert.deepStrictEqual(en.filter((k) => !(k in CATALOG.ar)), [], 'missing in Arabic');
    assert.deepStrictEqual(ar.filter((k) => !(k in CATALOG.en)), [], 'missing in English');
  });

  test('a placeholder in one language exists in the other', () => {
    const bad = Object.keys(CATALOG.en).filter((k) => placeholders(CATALOG.en[k]) !== placeholders(CATALOG.ar[k]));
    assert.deepStrictEqual(bad, []);
  });

  test('no English string is secretly Arabic, and no Arabic string was left in English', () => {
    const arabicInEnglish = Object.keys(CATALOG.en).filter((k) => /[\u0621-\u064A]/.test(CATALOG.en[k]));
    assert.deepStrictEqual(arabicInEnglish, [], 'Arabic text in the English catalog');
    const englishInArabic = Object.keys(CATALOG.ar)
      .filter((k) => !NEUTRAL.has(k) && /[A-Za-z]{4,}/.test(CATALOG.ar[k]) && !/[\u0621-\u064A]/.test(CATALOG.ar[k]));
    assert.deepStrictEqual(englishInArabic, [], 'English-only text in the Arabic catalog');
  });

  test('a missing key falls back to English, never to Arabic', () => {
    const t = createTranslator(() => 'ar');
    const saved = CATALOG.ar.statusReady;
    delete CATALOG.ar.statusReady;
    try {
      assert.strictEqual(t('statusReady'), CATALOG.en.statusReady);
    } finally {
      CATALOG.ar.statusReady = saved;
    }
  });

  test('placeholders are filled, and an unknown one is left visible rather than blanked', () => {
    const t = createTranslator(() => 'en');
    assert.strictEqual(t('quizProgress', { n: 2, total: 5 }), 'Question 2 of 5');
    assert.ok(/\{total\}/.test(t('quizProgress', { n: 2 })));
  });
})();

// Reading a live stream has timing in it, so these run as async tests after
// the synchronous ones.
async function testAsync(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 3).join('\n     ')}`);
  }
}

// A body we control: `send` pushes text, `end` closes it; nothing else happens
// unless the test says so, which is how a stalled connection looks.
function controlledBody() {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const encoder = new TextEncoder();
  return {
    body,
    send: (text) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close()
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

(async () => {
  console.log('\nReading a stream never waits forever:');

  await testAsync('a stream that finishes delivers every event and is not stalled', async () => {
    const { body, send, end } = controlledBody();
    const events = [];
    const reading = readEventStream(body, { idleMs: 500, onEvent: (e) => events.push(e) });
    send(frame('chunk', { text: 'مرحبا' }));
    send(frame('done', {}));
    end();
    const { stalled } = await reading;
    assert.strictEqual(stalled, false);
    assert.deepStrictEqual(events.map((e) => e.event), ['chunk', 'done']);
  });

  await testAsync('silence past the limit ends the read and says it stalled', async () => {
    const { body, send } = controlledBody();
    const events = [];
    const started = Date.now();
    const reading = readEventStream(body, { idleMs: 150, onEvent: (e) => events.push(e) });
    send(frame('chunk', { text: 'جزء' }));
    const { stalled } = await reading;
    const took = Date.now() - started;
    assert.strictEqual(stalled, true, 'not reported as stalled');
    assert.strictEqual(events.length, 1, 'the part that arrived was lost');
    assert.ok(took < 1000, `took ${took}ms to notice a 150ms silence`);
  });

  await testAsync('keep-alive comments reset the clock without producing events', async () => {
    const { body, send, end } = controlledBody();
    const events = [];
    const reading = readEventStream(body, { idleMs: 200, onEvent: (e) => events.push(e) });
    for (let i = 0; i < 6; i++) { await sleep(100); send(': keep-alive\n\n'); }
    send(frame('chunk', { text: 'وصلت' }));
    end();
    const { stalled } = await reading;
    assert.strictEqual(stalled, false, 'a stream kept alive for 600ms with a 200ms limit was called stalled');
    assert.deepStrictEqual(events.map((e) => e.data.text), ['وصلت'], 'a comment was turned into an event');
  });

  await testAsync('an error thrown by the handler propagates and does not wait for the stream', async () => {
    const { body, send } = controlledBody();
    const reading = readEventStream(body, {
      idleMs: 5000,
      onEvent: (e) => { if (e.event === 'error') throw new Error(e.data.error); }
    });
    send(frame('error', { error: 'All AI providers failed' }));
    const started = Date.now();
    await assert.rejects(reading, /All AI providers failed/);
    assert.ok(Date.now() - started < 1000, 'the error waited for the idle timer');
  });

  console.log('\nThe sources behind an answer:');

  await testAsync('every search the model ran contributes its sources, once each, numbered as shown', async () => {
    const sources = sourcesFromToolsUsed([
      { tool: 'web_search', sources: [{ title: 'A', url: 'https://a.example/1' }, { title: 'B', url: 'https://b.example/2' }] },
      { tool: 'fetch_page', input: 'https://a.example/1' },
      { tool: 'web_search', sources: [{ title: 'A again', url: 'https://a.example/1' }, { title: 'C', url: 'https://c.example/3', kind: 'news' }] }
    ]);
    assert.deepStrictEqual(sources.map((s) => [s.id, s.title, s.url]), [[1, 'A', 'https://a.example/1'], [2, 'B', 'https://b.example/2'], [3, 'C', 'https://c.example/3']]);
    assert.strictEqual(sources[2].kind, 'news');
  });

  await testAsync('only web links become sources, and there is a ceiling', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, url: `https://s${i}.example/` }));
    const sources = sourcesFromToolsUsed([{ sources: [{ title: 'x', url: 'javascript:alert(1)' }, { title: 'y', url: 'data:text/html,hi' }, ...many] }]);
    assert.ok(sources.every((s) => /^https:/.test(s.url)), JSON.stringify(sources.slice(0, 2)));
    assert.strictEqual(sources.length, 8);
  });

  await testAsync('anything that is not a list of tool runs is no sources, not an exception', async () => {
    for (const bad of [undefined, null, {}, 'x', [null], [{ sources: 'no' }], [{ sources: [null, {}] }]]) {
      assert.deepStrictEqual(sourcesFromToolsUsed(/** @type {any} */ (bad)), []);
    }
  });

  await testAsync('a stalled read is a transient failure with its own message', async () => {
    const r = classifyRequestFailure({ message: 'STREAM_STALLED' }, { language: 'ar' });
    assert.strictEqual(r.transient, true);
    assert.strictEqual(r.kind, 'stalled');
    assert.ok(/انقطع/.test(r.message), r.message);
  });

  console.log('\nA file asked for, and only then:');
  const { requestedFormat, hasTable, worthExporting } = require('../public/domain/fileRequest.js');
  const asked = [
    ['اعملي ملف اكسل فيه جدول المبيعات', 'xlsx'], ['حوّل الجدول لملف إكسل', 'xlsx'], ['بدي عرض تقديمي عن الطاقة الشمسية', 'pptx'],
    ['صدرلي الشرح pdf', 'pdf'], ['اكتبلي تقرير وحطه بملف وورد', 'docx'], ['التقرير بصيغة pdf لو سمحت', 'pdf'],
    ['make me a PowerPoint about solar energy', 'pptx'], ['export this as a PDF', 'pdf'], ['convert the table into an excel file', 'xlsx'],
    ['Create a Word document with my CV', 'docx'], ['give me slides for my talk', 'pptx'], ['اعملي ملف وورد وبعدين pdf', 'docx'],
    ['can you make me a PowerPoint about this?', 'pptx'], ['هل ممكن تعملي ملف وورد فيه الملخص؟', 'docx'],
    ['شو هو السكري؟ واعملي ملف وورد', 'docx'], ['What is photosynthesis? Make me slides about it.', 'pptx']
  ];
  for (const [text, format] of asked) test(`"${text}" asks for ${format}`, () => assert.strictEqual(requestedFormat(text), format));
  const notAsked = [
    'لخصلي هالملف pdf', 'what is a pdf file?', 'كيف احول وورد لـ pdf؟', 'how to give a good presentation', 'in a word, explain recursion',
    'cheat sheet for git', 'شو يعني ملف اكسل', 'اشرحلي الطاقة الشمسية', 'ما هي الشرائح', 'اكتبلي مقال حول تاريخ صيغة pdf',
    'محطة الطاقة في ملف pdf المرفق', 'summarize the chart in pdf', 'how do I export a table to Excel?', 'what does convert to pdf mean?',
    'شو هو الإكسل؟ وكيف بحول الجدول لملف اكسل؟', 'Explain recursion. And how do I save it as a PDF?'
  ];
  for (const text of notAsked) test(`"${text}" asks for no file`, () => assert.strictEqual(requestedFormat(text), null));
  test('a table is what makes an Excel file; a pipe in a sentence is not one', () => {
    assert.strictEqual(hasTable('a\n\n| x | y |\n| --- | --- |\n| 1 | 2 |'), true);
    assert.strictEqual(hasTable('this | that'), false);
    assert.strictEqual(worthExporting('ok.'), false);
    assert.strictEqual(worthExporting('| x | y |\n| - | - |\n| 1 | 2 |'), true);
  });

  console.log('\nStarters on the welcome screen (i18n.js, read by fileRequest.js):');
  {
    const { CATALOG } = require('../public/domain/i18n.js');
    const GROUPS = ['files', 'study', 'research', 'code', 'images', 'charts', 'write', 'plan'];
    const key = (prefix, group) => prefix + group[0].toUpperCase() + group.slice(1);
    for (const group of GROUPS) {
      test(`"${group}": five starters and a name in each language, the same ones needing a file`, () => {
        const [ar, en] = ['ar', 'en'].map((lang) => CATALOG[lang][key('starters', group)].split('\n'));
        assert.strictEqual(ar.length, 5);
        assert.strictEqual(en.length, 5);
        assert.deepStrictEqual(ar.map((s) => s.startsWith('📎')), en.map((s) => s.startsWith('📎')));
        assert.ok(CATALOG.ar[key('cat', group)] && CATALOG.en[key('cat', group)]);
      });
    }
    // A starter is read like anything the person types: the file starters
    // and the one Excel table get their file card, and nothing else does.
    test('the file starters ask for a file, and no other starter does', () => {
      for (const lang of ['ar', 'en']) {
        for (const group of GROUPS) {
          for (const starter of CATALOG[lang][key('starters', group)].split('\n')) {
            const asks = Boolean(requestedFormat(starter.replace(/^📎\s*/u, '')));
            assert.strictEqual(asks, group === 'files' || /إكسل|Excel/.test(starter), `${lang} ${group}: ${starter}`);
          }
        }
      }
    });
  }

  console.log('\nAn answer read aloud (speech.js):');
  const { speakable, chunks } = require('../public/domain/speech.js');
  test('the words are read, not the Markdown', () => {
    const md = [
      '## السكري', '', 'مرض **مزمن** يصيب *كثيرين* [1](https://who.int/x) حسب [منظمة الصحة](https://who.int).',
      '', '> [!TIP]', '> امشِ كل يوم.', '', '- أول', '1. ثاني', '', '| النوع | السبب |', '|---|---|', '| الأول | مناعي |',
      '', '```python', 'print(1)', '```', '', 'انظر https://example.com للمزيد.', '', '$$x^2$$', '', '![صورتي](attachment:abc123)'
    ].join('\n');
    const heard = speakable(md);
    assert.strictEqual(heard, ['السكري', 'مرض مزمن يصيب كثيرين حسب منظمة الصحة.', 'امشِ كل يوم.', 'أول', 'ثاني', 'النوع، السبب', 'الأول، مناعي', 'انظر للمزيد.', 'صورتي'].join('\n'));
  });
  test('snake_case and a lone asterisk in a sum survive; an unclosed code block is still code', () => {
    assert.strictEqual(speakable('use my_var now, 2 * 3 = 6'), 'use my_var now, 2 * 3 = 6');
    assert.strictEqual(speakable('قبل\n```js\nlet a = 1'), 'قبل');
  });
  test('long text in pieces of at most 220 characters, broken after sentences, nothing lost', () => {
    const sentence = 'هذه جملة متوسطة الطول تشرح فكرة واحدة بوضوح. ';
    const long = sentence.repeat(12) + 'كلمة '.repeat(80);
    const parts = chunks(long);
    assert.ok(parts.length > 3 && parts.every((p) => p.length <= 220), parts.map((p) => p.length).join(','));
    assert.ok(parts[0].endsWith('.'), parts[0]);
    assert.strictEqual(parts.join(' ').replace(/\s+/g, ' ').trim(), long.replace(/\s+/g, ' ').trim());
    assert.deepStrictEqual(chunks('Short.'), ['Short.']);
    assert.deepStrictEqual(chunks(''), []);
  });

  console.log('\nA quiz as the model wrote it (quiz.js):');
  const { readQuiz, correctOption } = require('../public/domain/quiz.js');
  const OPTIONS = ['Area', 'Rate of change', 'Volume', 'Mass'];
  for (const [answer, index] of [['Rate of change', 1], ['  rate of CHANGE ', 1], ['B', 1], ['(b)', 1], ['b)', 1], ['ب', 1], ['ا', 0], ['أ', 0], ['B) Rate of change', 1], [1, 1], ['1', 1], [0, 0], [4, 3], ['E', -1], ['Speed', -1], [9, -1], ['', -1], [null, -1]]) {
    test(`answer ${JSON.stringify(answer)} names option ${index}`, () => assert.strictEqual(correctOption(OPTIONS, answer), index));
  }
  test('an option written with its letter matches the answer without it, and an option that is a number is read as text first', () => {
    assert.strictEqual(correctOption(['A) Insulin', 'B) Glucagon'], 'Glucagon'), 1);
    assert.strictEqual(correctOption(['أ) الأنسولين', 'ب) الجلوكاجون'], 'الأنسولين'), 0);
    assert.strictEqual(correctOption(['0', '1', '2', '3'], 2), 2);
    assert.strictEqual(correctOption(['3', '2', '1', '0'], '1'), 2);
  });
  test('a quiz block: other field names, nothing invalid kept, no answer is unknown', () => {
    const quiz = readQuiz({ questions: [
      { q: 'Q1', choices: ['x', 'y'], correct_answer: 'y', explanation: 'because' },
      { question: 'no options' },
      { question: 'one option', options: ['only'] },
      { question: 'Q2', options: ['a', ' ', 'b'], answer: 'C' },
      'not a question'
    ] });
    assert.deepStrictEqual(quiz, [
      { question: 'Q1', options: ['x', 'y'], correct: 1, explanation: 'because' },
      { question: 'Q2', options: ['a', 'b'], correct: -1, explanation: '' }
    ]);
    assert.deepStrictEqual(readQuiz(null), []);
    assert.deepStrictEqual(readQuiz('[1,2]'), []);
  });

  console.log('\nMath in the renderer (markdown.js):');
  // Direction has its own test; these are about the markup inside a block.
  const inline = (t) => markdown.lightMarkdown(t).replace(/ dir="(?:ltr|rtl)"/g, '').replace(/<\/?p>/g, '');

  test('"$…$" becomes "\\(…\\)" for MathJax, in English and in Arabic', () => {
    assert.strictEqual(inline('so $x^2 + 1$ here'), 'so \\(x^2 + 1\\) here');
    assert.strictEqual(inline('السرعة $v = u + at$ تساوي'), 'السرعة \\(v = u + at\\) تساوي');
    assert.strictEqual(inline('$a$ and $b$'), '\\(a\\) and \\(b\\)');
  });

  test('prices stay prices: "$5 and $10", "$20,000 and $30,000", "\\$5"', () => {
    assert.strictEqual(inline('Price $5 and $10 each.'), 'Price $5 and $10 each.');
    assert.strictEqual(inline('$20,000 and $30,000'), '$20,000 and $30,000');
    assert.strictEqual(inline('between $5-$10 a unit'), 'between $5-$10 a unit');
    assert.strictEqual(inline('a fee of \\$5'), 'a fee of $5');
  });

  test('math is left whole: no bold, link or code reaches into it, and code keeps its dollars', () => {
    assert.strictEqual(inline('**area $a*b*c$ here**'), '<strong>area \\(a*b*c\\) here</strong>');
    assert.strictEqual(inline('\\(a**b**c\\)'), '\\(a**b**c\\)');
    assert.strictEqual(inline('`$y$`'), '<code>$y$</code>');
    assert.strictEqual(inline('$$E = mc^2$$'), '$$E = mc^2$$');
  });

  test('math cannot carry markup: it is escaped like everything else', () => {
    const out = inline('$<img src=x onerror=alert(1)>$');
    assert.ok(!/<img/.test(out) && /&lt;img/.test(out), out);
  });

  console.log('\nQuotes, callouts and emphasis (markdown.js):');
  const html = (t) => markdown.lightMarkdown(t).replace(/ dir="(?:ltr|rtl)"/g, '').replace(/\n/g, '');

  test('a numbered list is numbered from its first item, as written', () => {
    assert.strictEqual(html('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
    // Apart by a blank line or an explanation, each part keeps its number.
    assert.strictEqual(html('1. a\n\n2. b'), '<ol><li>a</li></ol><ol start="2"><li>b</li></ol>');
    assert.ok(/<ol start="3"><li>c<\/li><\/ol>$/.test(html('1. a\nWhy it matters.\n\n3. c')));
  });

  test('each block reads in its own direction, by the share of its letters, not its first one', () => {
    // The direction on the first tag the block opens with.
    const dir = (t) => ((markdown.lightMarkdown(t).match(/^<[^>]*>/) || [''])[0].match(/ dir="(\w+)"/) || [])[1] || 'page';
    assert.strictEqual(dir('JavaScript هي لغة برمجة تعمل في المتصفح.'), 'rtl', 'an Arabic sentence opening with an English word');
    assert.strictEqual(dir('The word مرحبا means hello.'), 'ltr');
    assert.strictEqual(dir('استخدم `useState` و `useEffect` مع https://react.dev/reference/react'), 'rtl', 'code and addresses are not words');
    assert.strictEqual(dir('- **API**: واجهة برمجة التطبيقات\n- **SDK**: حزمة تطوير'), 'rtl', 'a list');
    assert.strictEqual(dir('## Introduction'), 'ltr', 'a heading');
    assert.strictEqual(dir('| الاسم | العمر |\n|---|---|\n| علي | 20 |'), 'rtl', 'a table, on the box that scrolls');
    assert.strictEqual(dir('> [!TIP]\n> الفكرة الأساسية هنا'), 'rtl', 'a callout');
    assert.strictEqual(dir('x = 5'), 'page', 'too few letters to tell');
  });

  test('a quote is a quote, its lines rendered as blocks', () => {
    assert.strictEqual(html('> one\n> two'), '<blockquote><p>one two</p></blockquote>');
    assert.strictEqual(html('> - a\n> - b'), '<blockquote><ul><li>a</li><li>b</li></ul></blockquote>');
  });

  test('a callout by marker or emoji, titled in the page language unless it names itself', () => {
    const tip = html('> [!TIP]\n> Rates of change.');
    assert.ok(/class="qjo-callout" data-kind="tip"/.test(tip) && /💡<\/span> (?:Key idea|مفتاح الفهم)</.test(tip) && /<p>Rates of change\.<\/p>/.test(tip), tip);
    assert.ok(/data-kind="warning"/.test(html('> ⚠️ Units first.')));
    assert.ok(/data-kind="practice"/.test(html('> [!CLINICAL] At the bedside.')));
    assert.ok(/data-kind="summary"[\s\S]*<ul><li>a<\/li>/.test(html('> [!SUMMARY]\n> - a\n> - b')));
    assert.ok(/💡<\/span> Why it works</.test(html('> 💡 **Why it works**\n> Because.')));
  });

  test('nothing in a quote or callout is markup', () => {
    for (const t of ['> <img src=x onerror=alert(1)>', '> [!TIP] <script>alert(1)</script>', '> 💡 **<b>x</b>**\n> y']) {
      const out = html(t);
      assert.ok(!/<(?:img|script|b)\b/i.test(out), out);
    }
  });

  test('italics and strikethrough, but not inside words, numbers or link addresses', () => {
    assert.strictEqual(inline('an *italic* and _also_ and ~~gone~~'), 'an <em>italic</em> and <em>also</em> and <del>gone</del>');
    assert.strictEqual(inline('2*3*4 and snake_case_name'), '2*3*4 and snake_case_name');
    assert.strictEqual(inline('a*b* c and x_y_ z'), 'a*b* c and x_y_ z'); // a marker glued to a word opens nothing
    assert.strictEqual(inline('و*نص مائل* عربي'), 'و<em>نص مائل</em> عربي');
    assert.ok(/href="https:\/\/e\.com\/_a_\/b"/.test(inline('[x](https://e.com/_a_/b)')));
    assert.strictEqual(inline('**bold *inner* bold** and ***both***'), '<strong>bold <em>inner</em> bold</strong> and <strong><em>both</em></strong>');
  });

  console.log('\nImages referred to by id, sent only to be looked at (attachmentRefs.js):');
  const refs = require('../public/domain/attachmentRefs.js');

  test('placing an image is told apart from asking about it, in both languages', () => {
    for (const text of ['حطلي هالصورة بالسيفي تبعي واعملي ملف pdf', 'ضيف صورتي على السيرة الذاتية', 'put this photo in my CV', 'add my picture to the resume and make a PDF', 'use this image as the header of my website', 'حطها بملف وورد']) {
      assert.ok(refs.placesAttachment(text), `"${text}" only places the image`);
    }
    for (const text of ['شو في بالصورة؟', 'حل السؤال اللي بالصورة', 'describe this photo and put it in a report', 'اقرأ النص وحطه بملف وورد', "what's in this image?", 'اعملي سيفي من هالصورة', 'حلو كتير', 'حلل الصورة']) {
      assert.ok(!refs.placesAttachment(text), `"${text}" needs someone to look`);
    }
  });

  test('the model is told the id and how to place it; the ids an answer uses are found', () => {
    const note = refs.referenceNote([{ id: 'k7f2q9', name: 'me".jpg]' }]);
    assert.ok(note.includes('![a short description](attachment:k7f2q9)') && /not shown to you/.test(note) && note.includes('"me.jpg" (id k7f2q9)'), note);
    assert.strictEqual(refs.referenceNote([{ id: 'bad id', name: 'x' }]), '', 'an id that is not one');
    assert.deepStrictEqual(refs.referencedIds('![a](attachment:K7F2Q9) and ![b](attachment:zz9911)'), ['k7f2q9', 'zz9911']);
    assert.ok(refs.isImageDataUrl('data:image/png;base64,iVBORw0KGgo=') && !refs.isImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=') && !refs.isImageDataUrl('javascript:alert(1)'));
  });

  test('the page shows the image it holds, a placeholder for one it does not, and nothing else', () => {
    const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    markdown.setAttachmentSource((id) => ({ abcd12: PX, evil01: 'javascript:alert(1)', svg001: 'data:image/svg+xml;base64,PHN2Zz4=' }[id] || null));
    const out = (t) => markdown.lightMarkdown(t);
    assert.ok(out('![صورتي](attachment:ABCD12)').includes(`<img class="qjo-attachment" src="${PX}" alt="صورتي">`));
    for (const id of ['evil01', 'svg001', 'zzzz99']) {
      const html = out(`![x](attachment:${id})`);
      assert.ok(!/<img/.test(html) && /qjo-attachment-missing/.test(html), `${id}: ${html}`);
    }
    const hostile = out('![<img src=x onerror=alert(1)>](attachment:abcd12)');
    assert.ok((hostile.match(/<img/g) || []).length === 1 && !/onerror=alert/.test(hostile.replace(/alt="[^"]*"/, '')), hostile);
    assert.ok(out('`![x](attachment:abcd12)`').includes('<code>![x](attachment:abcd12)</code>'), 'code stays code');
    markdown.setAttachmentSource(() => null);
  });

  console.log('\nWhich earlier messages a request carries (historyWindow.js):');
  const { historyStart } = require('../public/domain/historyWindow.js');

  test('up to eleven earlier messages; past that, the start moves six at a time and lands on the person', () => {
    const carried = (length) => length - 1 - historyStart(length);
    for (const length of [1, 2, 7, 12]) assert.strictEqual(historyStart(length), 0, `${length} messages: all of it`);
    for (let length = 1; length <= 60; length++) {
      assert.ok(carried(length) <= 11 && (length <= 12 || carried(length) >= 6), `${length}: carries ${carried(length)}`);
      assert.strictEqual(historyStart(length) % 2, 0, `${length}: starts on an answer`);
    }
  });

  test('the start stays put for three turns running, so the history opens alike', () => {
    // A turn adds two messages: the person's and the answer.
    const starts = [];
    for (let length = 13; length <= 49; length += 2) starts.push(historyStart(length));
    const moves = starts.filter((s, i) => i && s !== starts[i - 1]).length;
    assert.ok(moves <= Math.ceil(starts.length / 3), `${moves} moves in ${starts.length} turns: ${starts}`);
    assert.ok(moves >= 3, `control: a long conversation moves it (${moves})`);
  });

  console.log('\nWhere a streaming answer is finished (streamBlocks.js):');
  const { splitStable, closeOpenFence } = require('../public/domain/streamBlocks.js');

  test('finished up to the last blank line; the rest is the tail; nothing lost', () => {
    for (const text of ['one\n\ntwo', 'no break yet', 'a\n\nb\n\nc', 'ends\n\n', '']) {
      const { stable, tail } = splitStable(text);
      assert.strictEqual(stable + tail, text);
    }
    assert.deepStrictEqual(splitStable('one\n\ntwo'), { stable: 'one\n\n', tail: 'two' });
  });

  test('never inside a code block, even at a blank line in the code', () => {
    const text = 'intro\n\n```js\nconst a = 1;\n\nconst b = 2;';
    assert.deepStrictEqual(splitStable(text), { stable: 'intro\n\n', tail: '```js\nconst a = 1;\n\nconst b = 2;' });
    assert.strictEqual(splitStable(text + '\n```\n\nafter').tail, 'after');
  });

  test('a code block still being typed is closed for drawing; a closed one is left alone', () => {
    assert.strictEqual(closeOpenFence('```py\nprint(1)'), '```py\nprint(1)\n```');
    assert.strictEqual(closeOpenFence('```py\nx\n```'), '```py\nx\n```');
    assert.strictEqual(closeOpenFence('plain text'), 'plain text');
  });

  test('inside a block, "```html" is code; only a line of backticks alone closes it — as the renderer reads it', () => {
    const { openFence } = require('../public/domain/streamBlocks.js');
    const { lightMarkdown } = require('../public/domain/markdown.js');
    const reopened = 'x\n\n```html\n<ul>\n```html\n<li>two</li>';
    assert.deepStrictEqual(openFence(reopened), { ticks: '```', info: 'html' });
    assert.strictEqual(openFence(reopened + '\n```'), null);
    assert.deepStrictEqual(openFence('```js\nconst s = "```";\n'), { ticks: '```', info: 'js' }, 'backticks inside a line do not close');
    assert.strictEqual(splitStable(reopened + '\n\nmore').stable, 'x\n\n', 'not cut inside the block');
    const html = lightMarkdown(reopened + '\n```\n\nafter');
    assert.strictEqual((html.match(/<div class="code-block-wrapper\b/g) || []).length, 1);
    assert.ok(/&lt;li&gt;two/.test(html) && /<p[^>]*>after<\/p>/.test(html), html.slice(-200));
    assert.strictEqual((lightMarkdown('```\n```').match(/<div class="code-block-wrapper\b/g) || []).length, 1, 'an empty block is still a block');
  });

  console.log('\nHow an attached image is sent (imagePlan.js):');
  const { LIMITS, encodings, capPerImage } = require('../public/domain/imagePlan.js');

  test('a phone screenshot keeps enough width to read', () => {
    const [first] = encodings({ width: 1170, height: 2532, type: 'image/png' });
    assert.deepStrictEqual(first, { width: 946, height: 2048, format: 'image/png' });
  });

  test('a PNG is tried as PNG, then JPEG, then smaller, never larger', () => {
    const steps = encodings({ width: 3024, height: 4032, type: 'image/png' });
    assert.strictEqual(steps[0].format, 'image/png');
    assert.ok(steps.slice(1).every((s) => s.format === 'image/jpeg'), JSON.stringify(steps));
    const sides = steps.map((s) => Math.max(s.width, s.height));
    assert.ok(sides.every((side, i) => i === 0 || side <= sides[i - 1]) && sides[0] === 2048 && sides[sides.length - 1] === 1024, sides.join(','));
  });

  test('a JPEG is never tried as PNG, and a small image is never enlarged', () => {
    const steps = encodings({ width: 640, height: 480, type: 'image/jpeg' });
    assert.ok(steps.every((s) => s.format === 'image/jpeg' && s.width === 640 && s.height === 480), JSON.stringify(steps));
  });

  test('one image fits Groq\'s 4 MB; five fit one request together', () => {
    assert.ok(capPerImage(1) <= 4 * 1024 * 1024 && capPerImage(1) === LIMITS.maxImageChars);
    assert.ok(capPerImage(5) * 5 <= LIMITS.maxMessageChars && LIMITS.maxMessageChars < 8 * 1024 * 1024);
  });

  console.log('\nThe person\'s own words in what the page sent (ownWords.js):');
  const { ownWords, ADDED } = require('../public/domain/ownWords.js');
  const i18nSource = require('../public/domain/i18n.js');
  const pageSource = ['../public/app.js', '../public/ui/attachmentShelf.js', '../public/domain/attachmentRefs.js', '../public/domain/i18n.js', '../public/ui/pythonRun.js']
    .map((f) => require('fs').readFileSync(require('path').join(__dirname, f), 'utf8')).join('\n');

  test('what the person typed is kept whole, line breaks and all', () => {
    assert.strictEqual(ownWords('سؤال أول\n\nوسؤال ثاني'), 'سؤال أول\n\nوسؤال ثاني');
    assert.strictEqual(ownWords(''), '');
  });

  test('everything the page adds after it is not theirs', () => {
    const own = 'استخرج معلوماتي';
    for (const added of ['\n\nUser attached or previously indexed files with retrieved evidence. Use …\nAttachment Index 1: cv.jpg',
      '\n\nPossible user typo/intent correction: The user wrote …', '\n\nWeb search note: The pre-search failed.',
      '\n\nConnected search executed. Search query used: x', '\n\nحلّل الصورة/الصور المرفقة مباشرة وبالعربية.',
      '\n\nAnalyze the attached image(s) directly in the user language.', '\n\n[The attached image is "cv.jpg" (id abcd12).]',
      '\n\n[Attached by the person and kept by the page — not shown to you: "cv.jpg" (id abcd12).]', '\n\n[🖼️ cv.jpg · attachment:abcd12]']) {
      assert.strictEqual(ownWords(own + added + '\nJavaScript, React'), own, JSON.stringify(added));
    }
  });

  test('the note a sent picture leaves, in both languages, is the page\'s', () => {
    for (const lang of ['en', 'ar']) {
      const note = i18nSource.CATALOG[lang].imagesAnalyzedNote;
      assert.ok(note, `no imagesAnalyzedNote in ${lang}`);
      assert.strictEqual(ownWords(`hello\n\n${note} [🖼️ a.png · attachment:abcd12]`), 'hello', lang);
    }
  });

  test('every part it knows is one the page really writes', () => {
    for (const marker of ADDED) assert.ok(pageSource.includes(marker.slice(2)), `the page no longer writes "${marker.slice(2)}"`);
  });

  console.log('\nA site to write (siteRequest.js):');
  const { buildsSite, asksForSite, siteInConversation } = require('../public/domain/siteRequest.js');

  test('asked for in English and Arabic, in the ways people ask', () => {
    for (const text of ['Build me a landing page for my cafe in React', 'Build me a website for my bakery', 'make a website for my dental clinic', 'design a modern portfolio site',
      'create a dashboard for sales', 'make a todo app in React', 'create a calculator with html css js', 'write a landing page for a SaaS', 'Make me a login page UI',
      'create a React component for a pricing table', 'Can you build a simple one-page site for my photography business?', 'make for me a website about cats',
      'صمملي موقع شخصي لمصمم جرافيك', 'بدي موقع لمطعمي', 'اعمللي صفحة هبوط لمنتج', 'سويلي موقع احترافي لشركة مقاولات', 'ابني لي واجهة تسجيل دخول',
      'برمج موقع متجر الكتروني', 'اكتبلي كود html لموقع مطعم', 'صمم لي داشبورد للمبيعات', 'بدي موقع إلكتروني لمحل ورد', 'أنشئ موقع ويب لمدرسة']) {
      assert.ok(buildsSite(text), text);
    }
  });

  test('not a site: asking about one, a place, a list, a Word page, a bug, a logo', () => {
    for (const text of ['what is the best website to learn French', 'recommend websites for free movies', 'make a list of websites for learning', 'give me sites to watch anime',
      'بدي موقع الجامعة', 'وين موقع المطعم', 'اعمل بحث عن موقع الجامعة', 'شو احسن موقع لتعلم الانجليزي', 'سافرت على موقع اثري', 'write an essay about websites',
      'make the page landscape in Word', 'fix this bug in my code', 'explain how websites work', 'what is tailwind', 'write the components of a cell', 'design a logo', 'كيفك']) {
      assert.ok(!buildsSite(text), text);
    }
  });

  const PAGE = 'Here:\n```html\n<!DOCTYPE html>\n<html><body>hi</body></html>\n```';
  test('a change to the page the last answer was is a site; thanks, a question, or a change to prose is not', () => {
    assert.ok(asksForSite({ text: 'add a contact section', lastAnswer: PAGE }));
    assert.ok(asksForSite({ text: 'خليه أغمق', lastAnswer: PAGE }));
    assert.ok(asksForSite({ text: 'make it darker', lastAnswer: '```jsx\nexport default function A() { return <div/>; }\n```' }));
    assert.ok(!asksForSite({ text: 'add a contact section', lastAnswer: 'Sure — an essay about the sea.' }));
    assert.ok(!asksForSite({ text: 'thanks!', lastAnswer: PAGE }) && !asksForSite({ text: 'شكرا', lastAnswer: PAGE }));
    assert.ok(!asksForSite({ text: 'what does the meta viewport do?', lastAnswer: PAGE }));
  });

  test('read from a conversation: the newest message, and the answer before it — not one after', () => {
    assert.ok(siteInConversation([{ role: 'user', content: 'build a site' }, { role: 'assistant', content: PAGE }, { role: 'user', content: 'make it darker' }]));
    assert.ok(!siteInConversation([{ role: 'user', content: 'make it darker' }, { role: 'assistant', content: PAGE }]), 'an answer after the message was read as before it');
    assert.ok(!siteInConversation([]) && !siteInConversation([{ role: 'assistant', content: PAGE }]));
    assert.ok(siteInConversation([{ role: 'user', content: 'صمملي موقع لمطعم\n\nWeb search note: x' }], ownWords), 'own words');
    assert.ok(!siteInConversation([{ role: 'user', content: 'استخرج معلوماتي\n\nUser attached or previously indexed files with retrieved evidence.\nbuild a website for my bakery' }], ownWords), 'a file\'s text read as the person');
  });

  console.log('\nAn Excel file as text the model can read (xlsxText.js):');
  const ExcelJS = require('exceljs');
  const { readXlsx, isXlsx } = require('../public/domain/xlsxText.js');
  const book = new ExcelJS.Workbook();
  const sales = book.addWorksheet('المبيعات');
  sales.addRow(['الشهر', 'amount', 'date', 'when', 'ok', 'note']);
  sales.addRow(['كانون الثاني', 10, new Date(Date.UTC(2026, 0, 31)), new Date(Date.UTC(2026, 0, 31, 14, 30)), true, 'a, "quoted"\nline']);
  sales.getCell('C2').numFmt = 'yyyy-mm-dd';
  sales.getCell('D2').numFmt = 'yyyy-mm-dd hh:mm';
  sales.addRow(['Feb', 20.5]);
  sales.getCell('F3').value = 'after a gap';
  sales.getCell('A5').value = 'after an empty row';
  sales.getCell('B6').value = { formula: 'B2+B3', result: 30.5 };
  book.addWorksheet('Second').addRow(['x']);
  const workbook = new Uint8Array(await book.xlsx.writeBuffer());

  await testAsync('every sheet by its name, its rows as CSV: Arabic, numbers, a formula\'s result, gaps kept in place', async () => {
    const { sheets, text } = await readXlsx(workbook);
    assert.deepStrictEqual(sheets.map((s) => s.name), ['المبيعات', 'Second']);
    assert.deepStrictEqual(sheets[0].rows[2], ['Feb', '20.5', '', '', '', 'after a gap']);
    assert.deepStrictEqual(sheets[0].rows[3], [], 'the empty row is kept in its place');
    assert.deepStrictEqual(sheets[0].rows.slice(4), [['after an empty row'], ['', '30.5']]);
    assert.ok(text.startsWith('Sheet: المبيعات\nالشهر,amount,date,when,ok,note\n') && text.includes('\n\nSheet: Second\nx'), text);
  });
  await testAsync('dates as dates, a time with its time, booleans as words, a field with a comma, a quote or a line quoted', async () => {
    const { sheets, text } = await readXlsx(workbook);
    assert.deepStrictEqual(sheets[0].rows[1].slice(0, 5), ['كانون الثاني', '10', '2026-01-31', '2026-01-31 14:30:00', 'TRUE']);
    assert.ok(text.includes(',TRUE,"a, ""quoted""\nline"'), text);
  });
  await testAsync('a file that is not a workbook is refused, by what it is', async () => {
    await assert.rejects(() => readXlsx(new TextEncoder().encode('month,amount\nJan,10')), /not a zip file/);
    assert.ok(isXlsx({ name: 'Sales.XLSX' }) && isXlsx({ name: 'x', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) && !isXlsx({ name: 'a.csv', type: 'text/csv' }));
  });

  console.log('\nChart and quiz blocks read as data, never run (relaxedJson.js):');
  const relaxed = require('../public/domain/relaxedJson.js');
  test('strict JSON reads as JSON.parse reads it', () => {
    const text = '{"type":"bar","data":{"labels":["a","ب"],"datasets":[{"data":[1,2.5,-3e2]}]},"x":null,"y":true}';
    assert.deepStrictEqual(relaxed.parse(text), JSON.parse(text));
    assert.deepStrictEqual(relaxed.read(text), { ok: true, value: JSON.parse(text) });
  });
  test('the forms models write: bare and Arabic keys, single quotes, backticks, trailing commas, comments, odd numbers', () => {
    const text = `{
      type: 'line', // a comment
      /* another */ عنوان: "مبيعات",
      url: 'https://example.com/a//b',
      data: [1, +2, .5, 0x10, -Infinity, NaN, undefined,],
      note: \`two
lines\`,
    }`;
    const value = relaxed.parse(text);
    assert.strictEqual(value.type, 'line');
    assert.strictEqual(value['عنوان'], 'مبيعات');
    assert.strictEqual(value.url, 'https://example.com/a//b', 'a comment marker inside a string is text');
    assert.deepStrictEqual(value.data.slice(0, 5), [1, 2, 0.5, 16, -Infinity]);
    assert.ok(Number.isNaN(value.data[5]) && value.data[6] === null && value.data.length === 7);
    assert.strictEqual(value.note, 'two\nlines');
  });
  test('LaTeX in a string is kept as written; real escapes are read', () => {
    const value = relaxed.parse("{q: 'solve \\(x^2\\) with \\alpha', e: 'caf\\u00e9 \\x41', n: 'a\\nb', s: 'it\\'s'}");
    assert.strictEqual(value.q, 'solve \\(x^2\\) with \\alpha');
    assert.strictEqual(value.e, 'café A');
    assert.strictEqual(value.n, 'a\nb');
    assert.strictEqual(value.s, "it's");
  });
  test('code in a block is refused, and none of it runs', () => {
    delete globalThis.__qjoRan;
    const attempts = [
      "{data: [1, (globalThis.__qjoRan = 1, 2)]}",
      "{a: alert(1)}",
      "(function () { globalThis.__qjoRan = 1; })()",
      "{a: 1 + 2}",
      "{a: globalThis}",
      "{a: new Date()}",
      "{a: [].constructor.constructor('globalThis.__qjoRan = 1')()}"
    ];
    for (const text of attempts) {
      assert.strictEqual(relaxed.parse(text), null, text);
      assert.strictEqual(relaxed.read(text).ok, false, text);
    }
    const literal = relaxed.parse('{a: `${globalThis.__qjoRan = 1}`}');
    assert.strictEqual(literal.a, '${globalThis.__qjoRan = 1}', 'a template is text');
    assert.strictEqual(globalThis.__qjoRan, undefined, 'nothing ran');
  });
  test('"__proto__" is a key, as JSON.parse makes it: nothing is polluted', () => {
    const value = relaxed.parse("{__proto__: {polluted: 1}, 'constructor': {prototype: {x: 1}}, ok: 1,}");
    assert.ok(Object.prototype.hasOwnProperty.call(value, '__proto__'));
    assert.strictEqual(Object.getPrototypeOf(value), Object.prototype);
    assert.strictEqual(/** @type {any} */ ({}).polluted, undefined);
    assert.strictEqual(value.ok, 1);
  });
  test('deep nesting and huge input are refused, not a crash', () => {
    assert.strictEqual(relaxed.parse('['.repeat(20000)), null);
    assert.match(relaxed.read('['.repeat(200) + ']'.repeat(200)).error, /nested too deeply/);
    assert.match(relaxed.read('[' + '1,'.repeat(250000) + ']').error, /too long/);
  });
  test('a refusal says where', () => {
    assert.match(relaxed.read("{\n  a: 1,\n  b: 2 3\n}").error, /line 3, column 8/);
    assert.match(relaxed.read("{a: 'open").error, /unclosed string/);
  });
  test('words, a fence or old escaping around a block do not stop it', () => {
    assert.deepStrictEqual(relaxed.parse("Here is the chart: {type: 'bar', n: 2} enjoy"), { type: 'bar', n: 2 });
    assert.deepStrictEqual(relaxed.parse('```chart\n{a: 1}\n```'), { a: 1 });
    assert.deepStrictEqual(relaxed.parse('{&quot;a&quot;: &quot;x &amp;lt; y&quot;}'), { a: 'x &lt; y' });
    assert.strictEqual(relaxed.parse(''), null);
    assert.strictEqual(relaxed.parse(/** @type {any} */ (null)), null);
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

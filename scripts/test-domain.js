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
    ['can you make me a PowerPoint about this?', 'pptx'], ['هل ممكن تعملي ملف وورد فيه الملخص؟', 'docx']
  ];
  for (const [text, format] of asked) test(`"${text}" asks for ${format}`, () => assert.strictEqual(requestedFormat(text), format));
  const notAsked = [
    'لخصلي هالملف pdf', 'what is a pdf file?', 'كيف احول وورد لـ pdf؟', 'how to give a good presentation', 'in a word, explain recursion',
    'cheat sheet for git', 'شو يعني ملف اكسل', 'اشرحلي الطاقة الشمسية', 'ما هي الشرائح', 'اكتبلي مقال حول تاريخ صيغة pdf',
    'محطة الطاقة في ملف pdf المرفق', 'summarize the chart in pdf', 'how do I export a table to Excel?', 'what does convert to pdf mean?'
  ];
  for (const text of notAsked) test(`"${text}" asks for no file`, () => assert.strictEqual(requestedFormat(text), null));
  test('a table is what makes an Excel file; a pipe in a sentence is not one', () => {
    assert.strictEqual(hasTable('a\n\n| x | y |\n| --- | --- |\n| 1 | 2 |'), true);
    assert.strictEqual(hasTable('this | that'), false);
    assert.strictEqual(worthExporting('ok.'), false);
    assert.strictEqual(worthExporting('| x | y |\n| - | - |\n| 1 | 2 |'), true);
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

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

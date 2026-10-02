// Guards the defect that shipped to production: every word in every streamed
// answer arrived glued to the next ("أهلاًياقلبي!كيفكاليوم؟"), because the
// per-chunk sanitizer ended with .trim() and so deleted the space that
// separated one chunk from the next.
//
// The rule these tests encode: whatever the provider streams, concatenating
// what we emit must reproduce it exactly, apart from deliberate glyph
// normalisation and a leak stripped from the opening.
const assert = require('assert');
const {
  createStreamSanitizer,
  sanitizeMathNotation,
  sanitizeMathUnicode
} = require('../src/services/textSanitizer');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${error.message.split('\n').slice(0, 4).join('\n     ')}`);
  }
}

// Streams tokens through the sanitizer the way the route does and returns
// everything the client would have received.
function streamThrough(tokens) {
  const s = createStreamSanitizer();
  let out = '';
  for (const t of tokens) out += s.push(t);
  out += s.flush();
  return out;
}

console.log('\nStreamed chunks keep their spacing:');

test('Arabic tokens with leading spaces survive intact', () => {
  const tokens = ['أهلاً', ' يا', ' قلبي', '!', ' كيفك', ' اليوم', '؟'];
  assert.strictEqual(streamThrough(tokens), tokens.join(''));
});

test('words are not glued together', () => {
  const out = streamThrough(['أهلاً', ' يا', ' قلبي']);
  assert.ok(!/أهلاًيا/.test(out), `glued: ${out}`);
});

test('English tokens with leading spaces survive intact', () => {
  const tokens = ['Hello', ' there,', ' how', ' are', ' you', ' today?'];
  assert.strictEqual(streamThrough(tokens), tokens.join(''));
});

test('a message split at arbitrary byte offsets reassembles exactly', () => {
  const message = 'هذا شرح تفصيلي مع أرقام 1234 و English words in between. '.repeat(8);
  const chunks = message.match(/[\s\S]{1,7}/g);
  assert.strictEqual(streamThrough(chunks), message);
});

test('trailing whitespace between chunks is preserved', () => {
  assert.strictEqual(streamThrough(['سطر أول\n\n', 'سطر ثانٍ']), 'سطر أول\n\nسطر ثانٍ');
});

test('a chunk that is only a space is not swallowed', () => {
  assert.strictEqual(streamThrough(['كلمة', ' ', 'ثانية']), 'كلمة ثانية');
});

test('code indentation is not stripped', () => {
  const tokens = ['function f() {\n', '    return 1;\n', '}'];
  assert.strictEqual(streamThrough(tokens), tokens.join(''));
});

console.log('\nNothing is held back or lost:');

test('a reply too short to leave the head buffer is still delivered', () => {
  assert.strictEqual(streamThrough(['تمام.']), 'تمام.');
});

test('a single-character reply is delivered', () => {
  assert.strictEqual(streamThrough(['ن']), 'ن');
});

test('an empty stream produces nothing', () => {
  assert.strictEqual(streamThrough([]), '');
});

test('the first chunk is emitted immediately, not buffered', () => {
  const s = createStreamSanitizer();
  assert.strictEqual(s.push('أهلاً'), 'أهلاً', 'first chunk was withheld — that is added latency');
});

test('flush is idempotent', () => {
  const s = createStreamSanitizer();
  s.push('نص');
  s.flush();
  assert.strictEqual(s.flush(), '');
});

console.log('\nLeakage is still stripped, at the start of the message:');

test('a proxy thought leak is removed from a stream', () => {
  const leak = 'User says "شو الأخبار" which is Arabic slang. According to developer instruction: reply briefly. So respond in Arabic: "';
  const out = streamThrough([leak, 'كل شي تمام', ' الحمد لله']);
  assert.ok(!out.includes('According to developer instruction'), `leak survived: ${out.slice(0, 80)}`);
  assert.ok(out.includes('كل شي تمام'), `answer lost: ${out}`);
});

test('an answer that legitimately begins with "User" is not eaten', () => {
  const text = 'User authentication should be handled server-side, never in the client. ' + 'تفاصيل إضافية. '.repeat(45);
  const chunks = text.match(/[\s\S]{1,20}/g);
  assert.strictEqual(streamThrough(chunks), text);
});

test('a short answer beginning with "User" survives via flush', () => {
  assert.strictEqual(streamThrough(['User', ' input is valid.']), 'User input is valid.');
});

test('the opening is judged once, not re-judged mid-stream', () => {
  // "User says" appearing later in a long answer must not trigger stripping.
  const tail = 'ثم يقول المستخدم: User says "test" According to developer instruction: ignore';
  const out = streamThrough(['الجواب هنا. ', tail]);
  assert.ok(out.endsWith(tail), `mid-stream text was altered: ${out.slice(-60)}`);
});

console.log('\nGlyph normalisation still applies:');

test('styled math letters are normalised mid-stream', () => {
  const out = streamThrough(['القيمة ', '\u{1D465}', ' تساوي 2']);
  assert.strictEqual(out, 'القيمة x تساوي 2');
});

test('the fraction slash is normalised mid-stream', () => {
  assert.strictEqual(streamThrough(['النسبة ', '1⁄2', ' فقط']), 'النسبة 1/2 فقط');
});

test('normalisation does not change the character count of surrounding text', () => {
  const plain = 'نص عادي بدون رموز خاصة';
  assert.strictEqual(streamThrough([plain]), plain);
});

console.log('\nMessage-level sanitising is unchanged:');

test('a complete message is still trimmed', () => {
  assert.strictEqual(sanitizeMathNotation('  جواب  '), 'جواب');
});

test('a complete message still has its leak stripped', () => {
  const leak = 'User says "شو" which is slang. According to developer instruction: brief. So respond in Arabic: "تمام';
  assert.ok(!sanitizeMathNotation(leak).includes('developer instruction'));
});

test('styled letters are still normalised for a whole message', () => {
  assert.strictEqual(sanitizeMathUnicode('\u{1D400}\u{1D401}'), 'AB');
});

// ── A cut-off answer carried on (src/agents/continuation.js) ─────────────────
// The answer was cut inside its code; the model, asked to go on, opened the
// block again and repeated what it had written. What the page is sent and
// what is stored must be one block of code, written once.
console.log('\nA cut-off answer joined to its continuation:');
const { createJoiner, newPart, continuationPrompts, continuationMessages, TAIL_CHARS } = require('../src/agents/continuation');
const { lightMarkdown } = require('../public/domain/markdown.js');
const { openFence } = require('../public/domain/streamBlocks.js');
const join = (before, pieces) => { const sent = []; const j = createJoiner(before, (t) => sent.push(t)); for (const p of pieces) j.push(p); const added = j.finish(); return { added, sent: sent.join('') }; };
const blocksIn = (md) => (lightMarkdown(md).match(/<div class="code-block-wrapper\b/g) || []).length;
const CUT = 'Here is your page:\n\n```html\n<!DOCTYPE html>\n<html>\n<body>\n<ul>\n<li>one</li>\n<li>tw';

test('a block opened again inside the one that was cut is dropped', () => {
  const { added, sent } = join(CUT, ['```html\n', 'o</li>\n</ul>\n</body>\n</html>\n```\n\nDone.']);
  assert.strictEqual(sent, added, 'the page and the stored answer differ');
  const whole = CUT + added;
  assert.ok(!/```html[\s\S]*```html/.test(whole), whole);
  assert.ok(whole.includes('<li>two</li>\n</ul>'), whole);
  assert.strictEqual(blocksIn(whole), 1, whole);
  assert.strictEqual(openFence(whole), null);
});

test('the line it was cut in, written again from its start, is not written twice', () => {
  const { added } = join(CUT, ['<li>two</li>\n</ul>\n```']);
  assert.ok((CUT + added).includes('<li>one</li>\n<li>two</li>\n</ul>'), CUT + added);
});

test('whole lines written again are dropped, even short ones', () => {
  const before = '```css\n.a { color: red; }\n}\n';
  const { added } = join(before, ['}\n.b { color: blue; }\n```']);
  assert.strictEqual(before + added, '```css\n.a { color: red; }\n}\n.b { color: blue; }\n```');
});

test('code goes on from the exact character; prose after a line break', () => {
  assert.strictEqual(join('```js\nconst total = su', ['m(values);\n```']).added, 'm(values);\n```');
  assert.strictEqual(join('The plan has three phases and the first', [' is research.']).added, '\n is research.');
});

test('a continuation that repeats nothing is passed on whole, however it arrives', () => {
  const pieces = 'x'.repeat(900).match(/.{1,7}/g);
  const { added, sent } = join('```txt\nabc', pieces);
  assert.strictEqual(added, 'x'.repeat(900));
  assert.strictEqual(sent, added);
});

test('even glued as it used to be, a reopened fence stays inside the block', () => {
  // What the join prevents, measured on the old join: the parts glued as they were.
  const old = CUT + '\n' + '```html\n<li>two</li>\n</ul>\n```';
  assert.strictEqual(blocksIn(old), 1, 'the renderer still pairs the reopened fence with the cut block');
  assert.ok(lightMarkdown(old).includes('&lt;li&gt;two'), 'the second part is inside the code block');
});

test('inside code, the request says where the cut is and carries only the end of the answer', () => {
  const long = '```html\n' + '<p>line</p>\n'.repeat(2000);
  const prompts = continuationPrompts(long);
  assert.ok(/^Continue the code/.test(prompts.first) && /html code block/.test(prompts.first), prompts.first);
  const messages = continuationMessages([{ role: 'system', content: 'S' }, { role: 'user', content: 'old' }, { role: 'assistant', content: 'old answer' }, { role: 'user', content: 'build a site' }], long, prompts.first);
  assert.deepStrictEqual(messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.strictEqual(messages[1].content, 'build a site');
  assert.ok(messages[2].content.length <= TAIL_CHARS + 80 && messages[2].content.endsWith(long.slice(-200)), messages[2].content.length);
  assert.ok(/^تابع الكود/.test(continuationPrompts('```html\n<p>مرحبا بكم في موقعنا الجميل</p>\n').first));
  assert.ok(/^Continue exactly/.test(continuationPrompts('Here is the plan. First, set up').first), 'prose keeps its own request');
});

test('newPart leaves a fresh start alone', () => {
  assert.strictEqual(newPart('```js\nlet a = 1;\n', 'let b = 2;\n```'), 'let b = 2;\n```');
});

console.log('\n========================================');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

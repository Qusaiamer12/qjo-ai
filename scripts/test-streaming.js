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

console.log('\n========================================');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

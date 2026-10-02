// A study question in a picture, through the real llmService and the real
// RoutingEngine, against a fake Groq over real HTTP.
//
// The vision model used to read and solve in one pass, with no calculator. An
// exercise is now read by the vision model and solved by a text model from
// what it read. What is checked is what each model was actually sent — the
// image to one, only text to the other, the calculator offered — and what the
// person saw: the solution, never the transcript.
'use strict';

const http = require('http');
const assert = require('assert');
const { createLlmService } = require('../src/services/llmService');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');
const { isExercise, transcriptFrom } = require('../src/agents/visionPipeline');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 4).join('\n     ')}`); });
}

// ── Fake Groq ──
let calls = [];
let handler = null;
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    calls.push(body);
    handler(body, res);
  });
});

function reply(res, body, text) {
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const word of text.split(/(?<= )/)) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}
function toolCall(res, body, name, args) {
  const call = { id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } };
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [call] }, finish_reason: 'tool_calls' }] }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: call.id, function: { name, arguments: call.function.arguments } }] } }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}
function fail500(res) { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":{"message":"boom"}}'); }

const VISION = 'fake-vision';
const TEXT = 'fake-text';
const hasImage = (body) => (body.messages || []).some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'));
const textOf = (body) => (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((p) => p.text || '').join('\n'))).join('\n');

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const READ = '```json\n{"question": "Find the speed after 12 s.", "text": "A car accelerates from rest at 3.2 m/s² for 12 s.", "math": ["v = u + at"], "values": [{"name": "a", "value": "3.2", "unit": "m/s²"}, {"name": "t", "value": "12", "unit": "s"}], "choices": ["A) 38.4 m/s", "B) 26.7 m/s"], "figure": "", "unclear": []}\n```';

function engine(baseUrl) {
  const math = require('mathjs');
  return createRoutingEngine({
    llmService: createLlmService({ groqKeys: ['g1'], groqBaseUrl: baseUrl }),
    safeCalculate: (expr) => { try { return String(math.evaluate(String(expr))); } catch (e) { return `error: ${e.message}`; } },
    keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
    models: { groqFlash: TEXT, groqText: TEXT, groqCode: TEXT, groqVision: VISION }
  });
}

async function ask(eng, text, { mode = 'flash' } = {}) {
  const shown = [];
  const steps = [];
  const res = await eng.callAgent({
    mode, max_tokens: 800,
    messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: PIXEL } }] }],
    onChunk: (t) => shown.push(t), onToolCall: (e) => steps.push(e)
  });
  return { res, shown: shown.join(''), steps };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

  console.log('\nWhich image messages are exercises:');
  await test('asked to solve, or an exercise on the page, in either language', () => {
    const yes = ['حل السؤال', 'solve this', 'Find x', 'اوجد قيمة س', 'جاوبني على الواجب', 'which of the following is correct?',
      'Analyze the attachments\n\nOCR text extracted from image (a.png):\nQ3. A car accelerates from rest',
      'x\nOCR text extracted from image (b):\nA) 12 m/s\nB) 24 m/s', 'describe\nOCR text extracted from image (c):\nIf x = 4, what is 3x + 2?'];
    assert.deepStrictEqual(yes.filter((q) => !isExercise(q)), []);
  });
  await test('a picture to look at is not an exercise', () => {
    const no = ['what is the problem with this design?', 'how many people are in this photo?', 'كم عمر هذا المبنى؟', 'شو رأيك بالتصميم',
      'Analyze the attachments\n\nOCR text extracted from image (r.png):\nInvoice 2026-09-30 total 24/7 support', 'describe this image', 'I have a question about this logo'];
    assert.deepStrictEqual(no.filter((q) => isExercise(q)), []);
  });
  await test('the instruction the page adds to every image is not the person asking to solve', () => {
    // Read from the page itself, so a change to its wording is tested here.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'ui', 'attachmentShelf.js'), 'utf8');
    const pageText = (start) => src.match(new RegExp(`'\\\\n\\\\n${start}[^']*'`))[0].slice(1, -1).replace(/\\n/g, '\n');
    const en = pageText('Analyze the attached image');
    const ar = pageText('حلّل الصورة');
    assert.ok(/Start with the answer/.test(en), 'the page\'s English instruction was not found');
    assert.strictEqual(isExercise(`Analyze the attached files as fully as you can.${en}`), false, 'an image sent without words counted as an exercise');
    assert.strictEqual(isExercise(`حلّل المرفقات المرفقة قدر الإمكان.${ar}`), false);
    assert.strictEqual(isExercise(`solve this${en}`), true, 'control: asking to solve still counts');
    assert.strictEqual(isExercise(`حل السؤال${ar}`), true);
    // The line naming the image's id follows the instruction.
    const note = `\n\n${require('../public/domain/attachmentRefs.js').referenceNote([{ id: 'k7f2q9', name: 'page.jpg' }], { shown: true })}`;
    assert.strictEqual(isExercise(`Analyze the attached files as fully as you can.${en}${note}`), false, 'the id line made an image an exercise');
    assert.strictEqual(isExercise(`solve this${en}${note}`), true);
  });

  await test('the note the page puts before a file\'s text is not the person asking either', () => {
    // It says "answer from the retrieved sections", and read as the person's
    // words it made every photo with readable text an exercise: a CV was
    // "transcribed" and then "solved". Read from the page itself.
    const app = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
    const lead = app.match(/`\\n\\n(User attached or previously indexed files[^\\`]*)\\n\$\{parts/);
    assert.ok(lead && /answer from the retrieved sections/.test(lead[1]), 'the page\'s note on attached files was not found');
    const message = (own, ocr) => `${own}\n\n${lead[1]}\nAttachment Index 1: a.jpg\nOrigin: pending\nOCR text extracted from image (a.jpg):\n${ocr}`;
    assert.strictEqual(isExercise(message('استخرج معلوماتي', 'CURRICULUM VITAE\nSKILLS\nJavaScript, React')), false, 'a CV became an exercise');
    assert.strictEqual(isExercise(message('describe this', 'Invoice total 240')), false);
    assert.strictEqual(isExercise(message('حل السؤال', 'CURRICULUM VITAE')), true, 'control: asking to solve still counts');
    assert.strictEqual(isExercise(message('describe this', 'Q3. A car accelerates from rest')), true, 'control: an exercise on the page still counts');
  });

  await test('what the vision model read becomes text for the solver; nothing read is nothing', () => {
    const t = transcriptFrom(READ);
    assert.ok(/Question: Find the speed/.test(t) && /Given values: a 3\.2 m\/s² \| t 12 s/.test(t) && /Choices: A\) 38\.4/.test(t), t);
    assert.strictEqual(transcriptFrom(''), null);
    assert.strictEqual(transcriptFrom('{}'), null);
    assert.ok(/car accelerates/.test(transcriptFrom('The image shows a physics exercise: a car accelerates from rest at 3.2 m/s².')));
  });

  console.log('\nAn exercise, read then solved:');
  await test('the vision model reads, the text model solves with the calculator, the person sees only the solution', async () => {
    calls = [];
    handler = (body, res) => {
      if (body.model === VISION) return reply(res, body, READ);
      const sawResult = (body.messages || []).some((m) => m.role === 'tool');
      if (!sawResult) return toolCall(res, body, 'calculate', { expression: '0 + 3.2 * 12' });
      return reply(res, body, 'v = u + at = 0 + 3.2 × 12 = **38.4 m/s** — answer A.');
    };
    const { res, shown, steps } = await ask(engine(baseUrl), 'حل السؤال');
    const [read, ...solving] = calls;
    assert.ok(read && read.model === VISION && hasImage(read) && !read.tools, `first call: ${read && read.model}, image ${read && hasImage(read)}`);
    assert.ok(/Transcribe/.test(textOf(read)) && /Do not solve/.test(textOf(read)), 'the vision model was not asked to transcribe');
    assert.ok(solving.length >= 2 && solving.every((b) => b.model === TEXT && !hasImage(b)), `solver calls: ${solving.map((b) => b.model + (hasImage(b) ? '+image' : '')).join(', ')}`);
    assert.ok(/Find the speed after 12 s/.test(textOf(solving[0])) && /3\.2 m\/s²/.test(textOf(solving[0])), 'the transcript did not reach the solver');
    assert.ok(/حل السؤال/.test(textOf(solving[0])) && !/\[object Object\]/.test(textOf(solving[0])), `the person's own words did not reach the solver: ${textOf(solving[0]).slice(0, 120)}`);
    assert.ok((solving[0].tools || []).some((t) => t.function.name === 'calculate'), 'the calculator was not offered');
    assert.ok(solving.some((b) => (b.messages || []).some((m) => m.role === 'tool' && /38\.4/.test(m.content))), 'the calculator did not run');
    assert.ok(res.ok && /38\.4 m\/s/.test(res.answer), res.answer);
    assert.ok(/38\.4/.test(shown) && !/Given values|"question"/.test(shown), `the person saw: ${shown.slice(0, 160)}`);
    assert.deepStrictEqual(steps.filter((s) => s.tool === 'read_image').map((s) => s.status), ['running', 'done']);
  });

  await test('in Arabic, the solver is told to solve in steps', async () => {
    calls = [];
    handler = (body, res) => (body.model === VISION ? reply(res, body, READ) : reply(res, body, 'الحل: 38.4 م/ث'));
    await ask(engine(baseUrl), 'حل هذا السؤال خطوة خطوة من فضلك');
    assert.ok(/حلّ المسألة خطوة بخطوة/.test(textOf(calls[1] || {})), textOf(calls[1] || {}).slice(-300));
  });

  console.log('\nEverything else about a picture is one pass:');
  await test('control: "describe this" goes to the vision model once, with the image, streamed', async () => {
    calls = [];
    handler = (body, res) => reply(res, body, 'A red logo on white.');
    const { res, shown, steps } = await ask(engine(baseUrl), 'describe this image');
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].model === VISION && hasImage(calls[0]) && calls[0].stream, JSON.stringify({ model: calls[0].model, stream: calls[0].stream }));
    assert.ok(res.ok && /red logo/.test(shown) && !steps.length);
  });

  console.log('\nWhen a stage fails, the picture is still answered:');
  await test('the reading comes back empty: one pass, as before', async () => {
    calls = [];
    let n = 0;
    handler = (body, res) => (body.model === VISION ? reply(res, body, n++ === 0 ? 'ok' : 'Speed is 38.4 m/s.') : reply(res, body, 'should not be asked'));
    const { res, shown } = await ask(engine(baseUrl), 'solve this');
    assert.ok(res.ok && /38\.4/.test(shown), shown);
    assert.ok(calls.every((b) => b.model === VISION) && hasImage(calls[calls.length - 1]), calls.map((b) => b.model).join(','));
  });
  await test('the solver fails: one pass, as before', async () => {
    calls = [];
    let n = 0;
    handler = (body, res) => {
      if (body.model === TEXT) return fail500(res);
      return reply(res, body, n++ === 0 ? READ : 'Speed is 38.4 m/s.');
    };
    const { res, shown } = await ask(engine(baseUrl), 'solve this');
    assert.ok(res.ok && /38\.4/.test(shown), shown);
    assert.ok(calls.some((b) => b.model === TEXT), 'the solver was never tried');
    assert.ok(calls[calls.length - 1].model === VISION && hasImage(calls[calls.length - 1]));
  });

  await test('the solver\'s stream drops mid-answer: what arrived is kept, with no second answer under it', async () => {
    calls = [];
    let n = 0;
    handler = (body, res) => {
      if (body.model === VISION) return reply(res, body, n++ === 0 ? READ : 'A SECOND ANSWER FROM THE FALLBACK');
      // Headers, a few words, then the connection drops.
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'v = u + at = ' } }] })}\n\n`);
      setTimeout(() => res.destroy(), 50);
    };
    const { shown } = await ask(engine(baseUrl), 'solve this');
    assert.ok(/v = u \+ at/.test(shown) && !/A SECOND ANSWER/.test(shown), `the person saw: ${shown.slice(0, 160)}`);
  });

  server.close();
  console.log(`\n========================================\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

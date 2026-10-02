// A photo, then a question about it, through the real page and the real
// server, against a Groq that behaves as Groq does now (a fake over HTTP):
// the models it serves and the ones it has retired, 8,000 tokens a minute for
// each model, and no pictures for a model that cannot see.
//
// What the owner met on a phone: a CV photographed with "extract my details"
// went to meta-llama/llama-4-scout, which Groq shut down on 2026-07-17. The
// page said the server was waking up, asked again without the photo, and got
// an answer from the OCR text alone. The next message — a name — was refused
// by both text models as too large and by the retired model as missing:
// [groq:413, groq:413, llm7:429, groq:404].
//
// OCR runs in the page through Tesseract, a script from a CDN the suites
// block; it is replaced at that boundary by one that "reads" a fixed CV. The
// person is signed in (fakeFirebase.js), as the owner was: a signed-in chat
// keeps what a file said and offers it again with every later message.
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { encode } = require('gpt-tokenizer/cjs/encoding/o200k_base');
const { launchBrowser, REPO_ROOT } = require('./harness');
const { useFakeFirebase } = require('./fakeFirebase');

let browser;
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

// Groq's free tier as of 2026-09-21: three models, 8,000 tokens a minute each.
const RETIRED = 'meta-llama/llama-4-scout-17b-16e-instruct';
const LIVE = new Set(['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
const SEES = new Set(['qwen/qwen3.8-27b']);
const TPM = 8000;
// What one picture costs. Qwen's vision encoder spends about a token per
// 28 × 28 pixels and caps an image near 1,280.
const IMAGE_TOKENS = 1280;

// A CV as Tesseract reads one: lines, a few misreadings, both languages. The
// person is invented.
const CV_TEXT = [
  'CURRICULUM VITAE',
  'Sami Khaled Nasser',
  'Software Developer | Amman, Jordan',
  'Email: sami.nasser@example.com | Phone: 07 0000 0000',
  'PROFILE',
  'Developer with four years of experience building web applications, REST APIs and dashboards for retail and logistics clients. Comfortable across the stack, with a focus on clean code, testing and performance.',
  'EXPERIENCE',
  'Senior Developer — Example Logistics (2023 – present)',
  '- Led a team of four building the dispatch dashboard used by 300 drivers.',
  '- Cut page load time by half by moving rendering to the server and caching.',
  '- Introduced automated tests and code review; production incidents fell sharply.',
  'Web Developer — Example Retail (2021 – 2023)',
  '- Built the online store front end and the order tracking pages.',
  '- Integrated payment and delivery partners through their APIs.',
  'EDUCATION',
  'B.Sc. Computer Science — Example University (2017 – 2021), GPA 3.4 / 4',
  'SKILLS',
  'JavaScript, TypeScript, React, Node.js, Express, PostgreSQL, MongoDB, Docker, Git, REST, testing',
  'LANGUAGES',
  'Arabic (native), English (fluent)',
  'الخبرات',
  'مطور برمجيات أول — شركة مثال للخدمات اللوجستية',
  'قيادة فريق من أربعة مطورين لبناء لوحة توزيع الطلبات، وتحسين سرعة الصفحات، وإدخال الاختبارات الآلية.',
  'التعليم',
  'بكالوريوس علم الحاسوب — جامعة مثال',
  'الدورات',
  'تطوير تطبيقات الويب المتقدمة، إدارة المشاريع البرمجية، أساسيات الحوسبة السحابية',
  'Training period: Nov 2024 – Jan 2026 aa Pluto Games 00606090 2'
].join('\n');

const CV_LINE = 'Sami Khaled Nasser';
const times = (body, text) => JSON.stringify(body || {}).split(text).length - 1;
const FAKE_TESSERACT = `window.Tesseract = { recognize: async () => ({ data: { text: ${JSON.stringify(CV_TEXT)} } }) };`;

// The answers, at a realistic length: the photo read, and the name taken.
const SAW = 'قرأت السيرة من الصورة';
const FROM_TEXT = 'من النص المستخرج';
const NAME_TAKEN = 'تمام، اعتمدت الاسم';
const longArabic = (lead) => lead + '. ' + 'الخبرات: مطور برمجيات أول في شركة مثال، قاد فريقًا من أربعة مطورين وحسّن سرعة الصفحات وأدخل الاختبارات الآلية. '.repeat(18);

/** A Groq and an llm7 on one port, as they answer today. */
function fakeProviders({ visionDown = false } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const provider = req.url.startsWith('/llm7/') ? 'llm7' : 'groq';
      const images = (body.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p && p.type === 'image_url').length;
      const tokens = counted(body);
      const call = { provider, model: body.model, images, tokens, body };
      calls.push(call);
      const refuse = (status, message, extra = {}) => { call.status = status; res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message, ...extra } })); };
      if (provider === 'llm7') return refuse(429, 'Rate limit exceeded. Please slow down.');
      if (!LIVE.has(body.model)) return refuse(404, `The model \`${body.model}\` does not exist or you do not have access to it.`, { type: 'invalid_request_error', code: 'model_not_found' });
      if (images && !SEES.has(body.model)) return refuse(400, "`messages.1` : for 'role:user' the following must be satisfied[('messages.1.content' : value must be a string)]", { type: 'invalid_request_error' });
      if (visionDown && SEES.has(body.model)) return refuse(503, 'Service Unavailable');
      if (tokens > TPM) return refuse(413, `Request too large for model \`${body.model}\` in organization \`org_test\` service tier \`on_demand\` on tokens per minute (TPM): Limit ${TPM}, Requested ${tokens}, please reduce your message size and try again.`, { type: 'tokens', code: 'rate_limit_exceeded' });
      call.status = 200;
      const asked = lastUserText(body);
      const text = images ? longArabic(SAW) : /الاسم سامي/.test(asked) ? `${NAME_TAKEN}: سامي خالد.` : /سيرة ذاتية/.test(asked) ? 'أكيد، ابعتلي معلوماتك أو صورة عنها.' : longArabic(FROM_TEXT);
      if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] })); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      res.end(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  return { calls, server };
}

function counted(body) {
  let n = encode(JSON.stringify(body.tools || [])).length;
  for (const m of body.messages || []) {
    n += 4;
    if (typeof m.content === 'string') n += encode(m.content).length;
    else for (const p of m.content || []) n += p && p.type === 'image_url' ? IMAGE_TOKENS : encode(String((p && p.text) || '')).length;
  }
  return n + (Number(body.max_tokens) || 0);
}

function lastUserText(body) {
  const last = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  return typeof last.content === 'string' ? last.content : (last.content || []).map((p) => (p && p.text) || '').join('\n');
}

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

/** The real server against the fakes; `env` overrides the vision model. */
async function boot(env, providerOptions) {
  const providers = fakeProviders(providerOptions);
  await new Promise((r) => providers.server.listen(0, '127.0.0.1', r));
  const fake = `http://127.0.0.1:${providers.server.address().port}`;
  const port = await freePort();
  const childEnv = { ...process.env, PORT: String(port), GROQ_API_KEYS: 'g1', GROQ_API_KEY: '', GROQ_BASE_URL: `${fake}/groq/v1`, LLM7_API_KEYS: 'l1', LLM7_API_KEY: '', LLM7_BASE_URL: `${fake}/llm7/v1`,
    QWEN_API_KEYS: '', QWEN_API_KEY: '', KIMI_API_KEYS: '', KIMI_API_KEY: '', TAVILY_API_KEY: '', SERPER_API_KEY: '', GROQ_FLASH_MODEL: '', GROQ_TEXT_MODEL: '', GROQ_VISION_MODEL: '', ...env };
  for (const [k, v] of Object.entries(childEnv)) if (v === '') delete childEnv[k];
  const app = spawn(process.execPath, ['server.js'], { cwd: REPO_ROOT, env: childEnv, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  app.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try { up = (await fetch(`${base}/api/health`)).ok; } catch (_) { /* booting */ }
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) throw new Error(`the server did not start: ${log.slice(-400)}`);
  return { base, calls: providers.calls, log: () => log, stop: () => { app.kill('SIGKILL'); providers.server.close(); } };
}

async function cvPhoto() {
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 1200;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 1200); x.fillStyle = '#111'; x.font = '28px sans-serif';
    for (let i = 0; i < 30; i++) x.fillText(`Line ${i + 1} of a curriculum vitae`, 40, 60 + i * 36);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return window.btoa(bin);
  });
  await page.close();
  return Buffer.from(b64, 'base64');
}

/** The real page on that server, in Arabic, with OCR that reads the CV. */
async function openPage(base, control = { fail: 0 }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`${base}/**`, (route) => route.continue());
  await useFakeFirebase(page);
  await page.route('**/tesseract.js@5/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_TESSERACT }));
  // `control.fail`: how many of the next requests fail as a server reports
  // every provider failing.
  const chats = [];
  await page.route(`${base}/api/chat`, (route) => {
    chats.push(JSON.parse(route.request().postData() || '{}'));
    if (!(control.fail > 0)) return route.continue();
    control.fail -= 1;
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'All AI providers failed. Last: upstream broke [groq:503, llm7:429]' }) });
  });
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__signIn());
  await page.waitForTimeout(1200);
  return { ctx, page, errors, chats };
}

// The last answer on screen. Not `.msg.assistant:last-of-type`: that matches
// nothing once a Retry row follows the answer.
const lastAnswer = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('#messages .msg.assistant')].pop();
  return el ? { text: el.innerText.replace(/\s+/g, ' ').trim(), error: el.classList.contains('error') } : { text: '', error: false };
});

/** Sends, and waits until the page is no longer busy and its answer has settled. */
async function ask(page, text, { photo } = {}) {
  if (photo) {
    await page.setInputFiles('#fileInput', [{ name: 'cv.jpg', mimeType: 'image/jpeg', buffer: photo }]);
    await page.waitForFunction(() => [...document.querySelectorAll('#attachmentTray .attachment-chip')].some((c) => /جاهز|ready/i.test(c.textContent)), null, { timeout: 30000 }).catch(() => {});
  }
  const answersBefore = await page.$$eval('#messages .msg.assistant', (els) => els.length);
  await page.fill('#input', text);
  await page.click('#sendBtn');
  // Settled: not busy, and the last answer is an answer (it has its actions)
  // or a failure. A silent retry's placeholder is neither, so this waits on.
  await page.waitForFunction((before) => {
    const all = document.querySelectorAll('#messages .msg.assistant');
    const last = all[all.length - 1];
    return !document.querySelector('#sendBtn.is-stop') && all.length > before && (last.classList.contains('error') || last.querySelector('.msg-actions-toolbar'));
  }, answersBefore, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(500);
}

const summary = (calls) => calls.map((c) => `${c.provider}:${c.model.replace(/^.*\//, '')}${c.images ? '+img' : ''}=${c.status}(${c.tokens})`).join(', ');

async function staleVisionModel(photo) {
  console.log('\n— the vision model an older setup names: retired by Groq —');
  const server = await boot({ GROQ_VISION_MODEL: RETIRED });
  const { ctx, page, errors, chats } = await openPage(server.base);
  try {
    // A chat already under way, as the owner's was: the photo is indexed in it.
    await ask(page, 'بدي اعمل سيرة ذاتية');
    server.calls.splice(0);
    chats.splice(0);
    await ask(page, 'استخرج معلوماتي', { photo });
    const first = server.calls.splice(0);
    const answer = await lastAnswer(page);
    ok(first.some((c) => c.images && SEES.has(c.model) && c.status === 200), `the photo reaches a model that can see it (${summary(first)})`);
    ok(!first.some((c) => c.images && !SEES.has(c.model)), 'and no model that cannot see is sent the photo', summary(first));
    ok(answer.text.includes(SAW) && !answer.error, `the page shows what was read in the photo (${answer.text.slice(0, 80)})`);
    ok(chats.length === 1, `answered on the first request — no silent retry (${chats.length} request(s))`);
    const seen = first.find((c) => c.images && c.status === 200) || first[0] || { body: {} };
    ok(times(seen.body, CV_LINE) === 1, `the photo's text goes once — not once as an overview and three times as its only section (${times(seen.body, CV_LINE)})`);
    const said = JSON.stringify(seen.body);
    ok(/COVER LETTERS/.test(said) && !/ACTIVE MODE: CODE|WORKED PROBLEMS|INTERFACES \(pages/.test(said),
      'the playbooks are the ones the person asked for (a CV: job applications), not what the photo says: a CV listing JavaScript is not a request for code');
    ok(!/t:code-review/.test(said), 'nor is the house guidance on reviewing code (it was, from the CV\'s words)');
    ok(!/Coding capsule/.test(said), 'nor the page\'s own coding capsule');
    ok(!first.some((c) => /Transcribe the attached image/.test(JSON.stringify(c.body))), 'and a CV is read in one pass, not taken for an exercise to solve');

    await ask(page, 'الاسم سامي خالد');
    const second = server.calls.splice(0);
    const reply = await lastAnswer(page);
    const firstCall = second[0] || { body: {} };
    const parts = (firstCall.body.messages || []).map((m) => `${m.role}:${counted({ messages: [m] }) - 4}`).join(' ');
    console.log(`   the follow-up's first provider call: ${firstCall.tokens} tokens counted — ${parts}, tools ${encode(JSON.stringify(firstCall.body.tools || [])).length}, answer room ${firstCall.body.max_tokens}`);
    ok(reply.text.includes(NAME_TAKEN) && !reply.error, `the next message is answered (${reply.text.slice(0, 80)})`);
    ok(second.length > 0 && !second.some((c) => c.status === 413), `no provider refuses it as too large (${summary(second)})`);
    ok(chats.length === 2, `on the first request (${chats.length - 1} for the follow-up)`);
    ok(times(firstCall.body, CV_LINE) === 1, `the photo's text rides in the history once, not again beside the new message (${times(firstCall.body, CV_LINE)})`);
    ok(!/Router decision: qcode|ACTIVE MODE: CODE/.test(JSON.stringify(firstCall.body)), 'and a name is not taken for a coding request because the CV in the history mentions JavaScript');
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  } finally {
    await ctx.close();
    server.stop();
  }
}

async function defaultVisionModel(photo) {
  console.log('\n— no vision model configured: the default —');
  const server = await boot({});
  const { ctx, page } = await openPage(server.base);
  try {
    await ask(page, 'استخرج معلوماتي', { photo });
    const calls = server.calls.splice(0);
    const answer = await lastAnswer(page);
    ok(calls[0] && calls[0].images && LIVE.has(calls[0].model), `the default vision model is one Groq serves (${summary(calls)})`);
    ok(answer.text.includes(SAW) && !answer.error, 'and the photo is read');
  } finally {
    await ctx.close();
    server.stop();
  }
}

async function visionUnavailable(photo) {
  console.log('\n— the vision model is down: the text read from the photo still answers —');
  const server = await boot({}, { visionDown: true });
  const { ctx, page, chats } = await openPage(server.base);
  try {
    await ask(page, 'استخرج معلوماتي', { photo });
    const calls = server.calls.splice(0);
    const answer = await lastAnswer(page);
    ok(calls.some((c) => c.images && SEES.has(c.model) && c.status === 503), `control: the vision model was asked and failed (${summary(calls)})`);
    ok(!calls.some((c) => c.images && !SEES.has(c.model)), 'no model that cannot see is sent the photo', summary(calls));
    ok(answer.text.includes(FROM_TEXT) && !answer.error, `a text model answers from the OCR text (${answer.text.slice(0, 80)})`);
    ok(chats.length === 1, `on the first request (${chats.length})`);
  } finally {
    await ctx.close();
    server.stop();
  }
}

const imagesIn = (body) => (body.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((p) => p.type === 'image_url').length;
const savedIndexes = (page) => page.evaluate(() => [...window.__store.keys()].filter((k) => /ragIndexes|rag_indexes|ragRecords/i.test(k)).length);

async function retryKeepsThePhoto(photo) {
  console.log('\n— a failed first attempt: the silent retry carries the photo, and says what is happening —');
  const server = await boot({});
  const control = { fail: 0 };
  const { ctx, page, chats } = await openPage(server.base, control);
  try {
    await ask(page, 'بدي اعمل سيرة ذاتية');
    chats.splice(0);
    control.fail = 1;
    await page.setInputFiles('#fileInput', [{ name: 'cv.jpg', mimeType: 'image/jpeg', buffer: photo }]);
    await page.waitForFunction(() => [...document.querySelectorAll('#attachmentTray .attachment-chip')].some((c) => /جاهز|ready/i.test(c.textContent)), null, { timeout: 30000 }).catch(() => {});
    const before = await page.$$eval('#messages .msg.assistant', (els) => els.length);
    await page.fill('#input', 'استخرج معلوماتي');
    await page.click('#sendBtn');
    // The new answer's bubble once the failed attempt has left it, before the retry.
    const waiting = await page.waitForFunction((n) => {
      const all = document.querySelectorAll('#messages .msg.assistant');
      const el = all[all.length - 1];
      return all.length > n && !document.querySelector('#sendBtn.is-stop') && el.innerText.trim() ? { text: el.innerText.trim(), actions: Boolean(el.querySelector('.msg-actions-toolbar')) } : null;
    }, before, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
    ok(waiting && !/يصحى|wake/i.test(waiting.text), `while it retries, the page does not blame a sleeping server (${waiting && waiting.text})`);
    ok(waiting && !waiting.actions, 'and offers no copy or rating for a message that is not an answer');
    await page.waitForFunction(() => /قرأت السيرة/.test(([...document.querySelectorAll('#messages .msg.assistant')].pop() || document.body).innerText), null, { timeout: 60000 }).catch(() => {});
    ok(chats.length === 2 && imagesIn(chats[0]) === 1 && imagesIn(chats[1]) === 1, `the retry sends the photo again (${chats.map(imagesIn).join(' then ')} image(s))`);
    ok((await lastAnswer(page)).text.includes(SAW), 'and the photo is read');
    ok(chats.length === 2 && times(chats[1], CV_LINE) === 1, `its text goes once, not beside its own saved copy (${chats[1] && times(chats[1], CV_LINE)})`);
    await page.waitForTimeout(800);
    ok((await savedIndexes(page)) === 1, `the photo's text is saved for the chat once, not once per attempt (${await savedIndexes(page)})`);
  } finally {
    await ctx.close();
    server.stop();
  }
}

async function retryButtonKeepsThePhoto(photo) {
  console.log('\n— the attempt and its silent retry both fail: Retry carries the photo —');
  const server = await boot({});
  const control = { fail: 2 };
  const { ctx, page, chats } = await openPage(server.base, control);
  try {
    await ask(page, 'استخرج معلوماتي', { photo });
    const failed = await lastAnswer(page);
    ok(failed.error && (await page.$('.retry-row button')), `control: a failure is shown, with Retry (${failed.text.slice(0, 60)})`);
    await page.click('.retry-row button');
    await page.waitForFunction(() => /قرأت السيرة/.test(([...document.querySelectorAll('#messages .msg.assistant')].pop() || document.body).innerText), null, { timeout: 60000 }).catch(() => {});
    ok(chats.length === 3 && imagesIn(chats[2]) === 1, `Retry sends the photo again (${chats.map(imagesIn).join(', ')} image(s))`);
    ok((await lastAnswer(page)).text.includes(SAW), 'and the photo is read');
  } finally {
    await ctx.close();
    server.stop();
  }
}

(async () => {
  browser = await launchBrowser();
  const photo = await cvPhoto();
  const only = process.env.QJO_SCENARIO;
  for (const scenario of [staleVisionModel, defaultVisionModel, visionUnavailable, retryKeepsThePhoto, retryButtonKeepsThePhoto]) {
    if (only && scenario.name !== only) continue;
    try { await scenario(photo); } catch (e) { ok(false, `${scenario.name} ran to the end`, e.message); }
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

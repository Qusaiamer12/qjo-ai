// Stopping an answer, from the real page through the real server to a fake
// Groq that writes part of an answer and then holds the stream open.
//
// Stop was a small word in the status line, and the line went away once the
// answer started to appear: a long answer could not be stopped. Stopping it
// some other way replaced what had been written with "the request was
// stopped or timed out, try again" and a retry button. Checked: the send
// button is Stop for as long as an answer is being written; stopping keeps
// what was written as the answer, with its actions, and the next request
// carries it; a stop before any text leaves nothing behind; the stream to
// the provider is cut; a real failure still says so.
const http = require('http');
const { spawn } = require('child_process');
const { launchBrowser, REPO_ROOT } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

const PARTIAL = 'الجزء الأول من القصة وصل كاملاً.';
// Holds every stream open after its first words; "صامت" gets none at all and
// "خطأ" a server error. Records what each request carried and when it closed.
function fakeGroq() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const text = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
      const call = { closed: false, assistant: (body.messages || []).filter((m) => m.role === 'assistant').map((m) => m.content) };
      calls.push(call);
      if (/خطأ/.test(text.split('\n').pop() || '')) {
        res.writeHead(500, { 'content-type': 'application/json' });
        return res.end('{"error":{"message":"upstream broke"}}');
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (!/صامت/.test(text.slice(-200))) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: PARTIAL } }] })}\n\n`);
      const keep = setInterval(() => res.write(': ping\n\n'), 500);
      res.on('close', () => { call.closed = true; clearInterval(keep); });
    });
  });
  return { calls, server };
}

const status = (page) => page.evaluate(() => {
  const send = document.querySelector('#sendBtn');
  const r = send.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const last = [...document.querySelectorAll('#messages .msg.assistant')].pop();
  return {
    label: send.getAttribute('aria-label'), stop: send.classList.contains('is-stop'), disabled: send.disabled, size: Math.round(Math.min(r.width, r.height)),
    reachable: Boolean(hit && (hit === send || send.contains(hit))),
    answer: last ? last.querySelector('.bubble').innerText : null,
    toolbar: last ? Boolean(last.querySelector('.msg-actions-toolbar')) : null,
    error: last ? last.classList.contains('error') : null,
    retry: Boolean(document.querySelector('#messages .retry-row')),
    stoppedNote: last ? (last.querySelector('.qjo-stopped') || {}).textContent || '' : '',
    inputEnabled: !document.querySelector('#input').disabled,
    answers: document.querySelectorAll('#messages .msg.assistant').length
  };
});

async function send(page, text) {
  await page.fill('#input', text);
  await page.click('#sendBtn');
}

async function check(browser, base, groq, phone) {
  const where = phone ? 'phone' : 'desktop';
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`${base}/**`, (route) => route.continue());
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

  let s = await status(page);
  ok(s.label === 'إرسال' && !s.stop, `${where}: before anything is asked the button sends (${s.label})`);

  // Part of an answer arrives and keeps coming: Stop is there, and works.
  const before = groq.calls.length;
  await send(page, 'اكتبلي قصة طويلة');
  await page.waitForFunction((p) => [...document.querySelectorAll('#messages .msg.assistant')].pop()?.innerText.includes(p), PARTIAL, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  s = await status(page);
  ok(s.answer && s.answer.includes(PARTIAL), `${where}: part of the answer is on the screen`, s);
  ok(s.stop && s.label === 'إيقاف' && !s.disabled && s.reachable && s.size >= 40, `${where}: while it is written the button is Stop, ${s.size}px, reachable (${s.label})`, s);
  ok(s.toolbar === false, `${where}: no actions under an answer still being written`, s);
  await page.click('#sendBtn');
  await page.waitForTimeout(1200);
  s = await status(page);
  ok(s.answer.includes(PARTIAL) && !s.error && !s.retry, `${where}: stopping keeps what was written, with no error and no retry`, s);
  ok(s.stoppedNote.includes('تم الإيقاف'), `${where}: and says it was stopped (${s.stoppedNote})`);
  ok(s.toolbar === true, `${where}: the stopped answer has its actions`, s);
  ok(!s.stop && s.label === 'إرسال' && s.inputEnabled, `${where}: the button sends again and the composer is free`, s);
  await page.waitForTimeout(500);
  const cut = groq.calls.slice(before);
  ok(cut.length >= 1 && cut.every((c) => c.closed), `${where}: the stream to the provider was cut (${cut.map((c) => c.closed)})`);

  // The next request carries the stopped answer as the last thing said.
  const next = groq.calls.length;
  await send(page, 'صامت: كمل');
  await page.waitForTimeout(1500);
  const carried = groq.calls[next];
  ok(carried && carried.assistant.some((a) => String(a).includes(PARTIAL)), `${where}: the next request carries the stopped answer`, carried && carried.assistant);

  // Stopped before any text: nothing is left behind.
  const answersBefore = s.answers;
  await page.click('#sendBtn');
  await page.waitForTimeout(1200);
  s = await status(page);
  ok(s.answers === answersBefore && !s.retry && !s.stop && s.inputEnabled, `${where}: stopped before any text, no empty answer or error is left (${s.answers} answers)`, s);

  // Control: a real failure is still a failure.
  await send(page, 'خطأ');
  await page.waitForFunction(() => document.querySelector('#messages .retry-row'), null, { timeout: 30000 }).catch(() => {});
  s = await status(page);
  ok(s.error && s.retry, `${where}: control — a provider error still says so, with a retry`, s);
  ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  const groq = fakeGroq();
  await new Promise((r) => groq.server.listen(0, '127.0.0.1', r));
  const fake = `http://127.0.0.1:${groq.server.address().port}/v1`;
  const port = 7400 + Math.floor(Math.random() * 300);
  const app = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(port), GROQ_API_KEYS: 'g1', GROQ_BASE_URL: fake, LLM7_API_KEYS: '', LLM7_BASE_URL: fake, KIMI_API_KEYS: '', KIMI_BASE_URL: fake, QWEN_API_KEYS: '' }
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { up = (await fetch(`${base}/api/health`)).ok; } catch (_) { /* booting */ }
      if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    ok(up, 'the server started with the fake Groq');
    for (const phone of [false, true]) await check(browser, base, groq, phone);
  } finally {
    app.kill('SIGKILL');
    groq.server.close();
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// A conversation from the real page, through the real server, to a fake Groq
// that counts the way Groq does: whatever part of a request opens exactly as
// an earlier one did is reported as cached — and Groq does not count cached
// tokens toward its per-minute or daily limits.
//
// The page used to send "the last eleven messages", so past eleven the oldest
// one changed on every turn; the server put everything chosen for a message
// in front of the conversation. Either way no request could reuse the one
// before it beyond the instructions. Checked: each request opens as the one
// before it did up to the newest exchange, except when the page's window of
// earlier messages moves, at most once every three turns; the window holds
// six to eleven messages; and /api/status reports the share Groq counted as
// cached, from the usage it sent with each answer.
const http = require('http');
const { spawn } = require('child_process');
const { launchBrowser, REPO_ROOT } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

const textOf = (content) => (typeof content === 'string' ? content : (content || []).map((p) => p.text || '').join('\n'));
const render = (body) => (body.messages || []).map((m, i) => `<${m.role}>${textOf(m.content)}${i === 0 && body.tools ? JSON.stringify(body.tools) : ''}`).join('');
const shared = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };

// Answers of a realistic length, so the conversation is most of each request.
const ANSWER = 'هذه إجابة بطول واقعي تشرح الفكرة خطوة بخطوة مع مثال. '.repeat(24);

function fakeGroq() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const seen = render(body);
      const cachedChars = calls.reduce((best, c) => Math.max(best, shared(seen, c.seen)), 0);
      calls.push({ body, seen });
      const usage = { prompt_tokens: Math.ceil(seen.length / 4), completion_tokens: Math.ceil(ANSWER.length / 3), prompt_tokens_details: { cached_tokens: Math.floor(cachedChars / 4) } };
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ANSWER } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], x_groq: { usage } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  return { calls, server };
}

const MESSAGES = ['كيفك؟', 'شو الفرق بين الذكاء الاصطناعي وتعلم الآلة؟', 'اعطيني مثال من الحياة', 'Explain recursion with a short example',
  'طيب واختصرلي الكلام بنقاط', 'اقترحلي اسم لمخبز', 'كيف أبدأ مشروع صغير؟', 'شو أهم نصيحة؟', 'شكراً إلك'];

(async () => {
  const browser = await launchBrowser();
  const groq = fakeGroq();
  await new Promise((r) => groq.server.listen(0, '127.0.0.1', r));
  const fake = `http://127.0.0.1:${groq.server.address().port}/v1`;
  const port = 4900 + Math.floor(Math.random() * 300);
  const app = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), GROQ_API_KEYS: 'g1', GROQ_BASE_URL: fake, GROQ_TEXT_MODEL: 'openai/gpt-oss-120b', GROQ_FLASH_MODEL: 'openai/gpt-oss-20b',
      LLM7_API_KEYS: '', LLM7_BASE_URL: fake, KIMI_API_KEYS: '', KIMI_BASE_URL: fake, QWEN_API_KEYS: '' },
    stdio: 'ignore'
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { up = (await fetch(`${base}/api/health`)).ok; } catch (_) { /* booting */ }
      if (!up) await new Promise((r) => setTimeout(r, 250));
    }
    ok(up, 'the server started with the fake Groq');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(`${base}/**`, (route) => route.continue());
    await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

    // One request per message: the ones that answered it.
    const requests = [];
    for (const text of MESSAGES) {
      const before = groq.calls.length;
      const answered = await page.$$eval('.msg.assistant', (els) => els.length);
      await page.fill('#input', text);
      await page.click('#sendBtn');
      await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant').length > n && !document.querySelector('.qjo-typing-cursor'), answered, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(300);
      requests.push(groq.calls[groq.calls.length - 1]);
      if (groq.calls.length === before) break;
    }
    ok(requests.length === MESSAGES.length && requests.every(Boolean), `every message reached Groq (${requests.filter(Boolean).length} of ${MESSAGES.length})`);

    // How many earlier messages each request carried, and whether it opened
    // as the one before it did up to the newest exchange.
    const earlier = requests.map((r) => r.body.messages.filter((m) => m.role !== 'system').length - 1);
    const moves = [];
    requests.forEach((r, i) => {
      if (!i) return;
      const prev = requests[i - 1].seen;
      const upToNewest = prev.slice(0, prev.lastIndexOf('<user>'));
      if (!r.seen.startsWith(upToNewest)) moves.push(i);
    });
    ok(earlier[earlier.length - 1] >= 6 && earlier.every((n) => n <= 11), `each request carries at most eleven earlier messages, and a long conversation at least six (${earlier.join(', ')})`);
    ok(moves.length >= 1, `control: the conversation is long enough for the window to move (${moves.length} move(s), at request ${moves.join(', ')})`);
    ok(moves.every((at, k) => !k || at - moves[k - 1] >= 3), `every other request opens as the one before it did, up to the newest exchange — the window moves at most once every three turns (at ${moves.join(', ')})`);

    const status = await (await fetch(`${base}/api/status`)).json();
    const counted = Object.values((status.providerHealth && status.providerHealth.groq && status.providerHealth.groq.tokens) || {})
      .reduce((t, m) => ({ input: t.input + m.input, cached: t.cached + m.cached, answers: t.answers + m.answers }), { input: 0, cached: 0, answers: 0 });
    const share = counted.input ? Math.round((100 * counted.cached) / counted.input) : 0;
    ok(counted.answers === MESSAGES.length, `/api/status counted every answer from what Groq reported (${counted.answers})`);
    ok(share >= 55, `Groq counted ${share}% of what was sent as cached (${counted.cached} of ${counted.input} tokens)`, counted);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  } finally {
    app.kill('SIGKILL');
    groq.server.close();
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

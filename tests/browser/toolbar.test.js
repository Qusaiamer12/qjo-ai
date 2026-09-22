// Drives the real answer toolbar in the real app and inspects the requests it
// puts on the wire — the previous buttons only looked like they worked.
const { launchBrowser, BASE_URL } = require('./harness');

const ANSWER = [
  '## النتيجة',
  '',
  'شرح تفصيلي للموضوع مع عدة فقرات لكي يتجاوز الحد الذي يستحق تصديرًا إلى ملف.',
  'فقرة ثانية تضيف طولًا كافيًا حتى يظهر شريط التصدير بشكل موثوق في الاختبار.',
  '',
  '```javascript:src/utils/sum.js',
  'const add = (a, b) => a + b;',
  '```',
  '',
  '| العمود | القيمة |',
  '| --- | --- |',
  '| أ | ١ |'
].join('\n');

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const sent = { chat: [], feedback: [], exports: [] };
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.route('**/api/chat', async (route) => {
    sent.chat.push(JSON.parse(route.request().postData() || '{}'));
    const body = `event: chunk\ndata: ${JSON.stringify({ text: ANSWER })}\n\nevent: done\ndata: {"provider":"t","model":"t"}\n\n`;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });
  await page.route('**/api/feedback', async (route) => {
    sent.feedback.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"id":"fb-1"}' });
  });
  for (const ep of ['pdf', 'pptx', 'docx', 'code-zip']) {
    await page.route(`**/api/export/${ep}`, async (route) => {
      sent.exports.push({ endpoint: ep, hasAuth: Boolean(route.request().headers()['authorization']), body: JSON.parse(route.request().postData() || '{}') });
      await route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from('FAKEFILE') });
    });
  }

  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const dismiss = () => page.evaluate(() => { const o = document.getElementById('authOverlay'); if (o) { o.classList.remove('show'); o.style.display = 'none'; } });
  await dismiss();

  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 260)); };

  const ask = async (text) => { await dismiss(); await page.fill('#input', text); await page.click('#sendBtn'); await page.waitForTimeout(1600); };

  await ask('اشرحلي الموضوع');
  const buttons = await page.$$eval('.msg.assistant .msg-actions-toolbar .msg-action-btn', els => els.map(e => e.getAttribute('title')));
  ok(buttons.length >= 7, `toolbar renders its actions (${buttons.length}): ${buttons.join(' | ')}`);

  // ── No decorative buttons remain ──
  const fake = buttons.filter(t => /مفيدة|أعجبتني|Helpful|Love it/.test(t || ''));
  ok(fake.length === 0, 'the decorative reaction buttons are gone', fake);

  // ── Feedback actually posts ──
  sent.feedback.length = 0;
  await page.click('.msg.assistant .msg-rate-btn');
  await page.waitForTimeout(700);
  ok(sent.feedback.length === 1, 'thumbs-up posts to /api/feedback', sent.feedback);
  ok(sent.feedback[0]?.rating === 'up', `rating is sent (${sent.feedback[0]?.rating})`);
  ok(Boolean(sent.feedback[0]?.question), 'the question travels with the rating');
  ok(Boolean(sent.feedback[0]?.answer), 'the answer travels with the rating');
  const rated = await page.$$eval('.msg.assistant .msg-rate-btn', els => els.map(e => ({ rated: e.classList.contains('rated'), disabled: e.disabled })));
  ok(rated.some(r => r.rated) && rated.every(r => r.disabled), 'rating locks in and cannot be double-sent', rated);

  // ── Thumbs-down exists ──
  const hasDown = buttons.some(t => /ضعيفة|Poor/.test(t || ''));
  ok(hasDown, 'a negative rating is available at all');

  // ── Exports send auth and hit the right endpoint ──
  sent.exports.length = 0;
  await page.click('.msg.assistant .msg-action-btn[title*="PDF"]');
  await page.waitForTimeout(900);
  ok(sent.exports.some(e => e.endpoint === 'pdf'), 'PDF export calls /api/export/pdf', sent.exports);
  ok(Boolean(sent.exports[0]?.body?.content), 'the answer content is sent to the exporter');

  sent.exports.length = 0;
  await page.click('.msg.assistant .msg-action-btn[title*="شرائح"], .msg.assistant .msg-action-btn[title*="slides"]');
  await page.waitForTimeout(900);
  ok(sent.exports.some(e => e.endpoint === 'pptx'), 'slides export calls /api/export/pptx', sent.exports);

  sent.exports.length = 0;
  await page.click('.msg.assistant .msg-action-btn[title*="Word"]');
  await page.waitForTimeout(900);
  ok(sent.exports.some(e => e.endpoint === 'docx'), 'Word export calls /api/export/docx', sent.exports);

  // ── ZIP appears because the answer carries a file-path code block ──
  sent.exports.length = 0;
  const zipBtn = await page.$('.msg.assistant .msg-action-btn[title*="المشروع"], .msg.assistant .msg-action-btn[title*="project"]');
  ok(Boolean(zipBtn), 'a project ZIP action appears for file-labelled code');
  if (zipBtn) {
    await zipBtn.click();
    await page.waitForTimeout(900);
    ok(sent.exports.some(e => e.endpoint === 'code-zip'), 'ZIP export calls /api/export/code-zip', sent.exports);
    ok(Array.isArray(sent.exports[0]?.body?.files) && sent.exports[0].body.files.length > 0, 'the extracted files are sent', sent.exports[0]?.body);
  }

  // ── Regenerate actually re-asks ──
  sent.chat.length = 0;
  const before = await page.$$eval('.msg.assistant', els => els.length);
  await page.click('.msg.assistant:last-of-type .msg-action-btn[title*="إعادة توليد"], .msg.assistant:last-of-type .msg-action-btn[title*="Regenerate"]');
  await page.waitForTimeout(1800);
  ok(sent.chat.length === 1, 'regenerate issues a new /api/chat request', sent.chat.length);
  const lastUserMsg = sent.chat[0]?.messages?.filter(m => m.role === 'user').pop();
  ok(String(lastUserMsg?.content || '').includes('اشرحلي الموضوع'), 'it re-asks the original question', lastUserMsg?.content?.slice(0, 60));
  const noDupQuestion = (sent.chat[0]?.messages || []).filter(m => m.role === 'assistant').length === 0;
  ok(noDupQuestion, 'the rejected answer is not replayed back as context', sent.chat[0]?.messages?.map(m => m.role));
  const after = await page.$$eval('.msg.assistant', els => els.length);
  ok(after === before, `the old answer is replaced, not appended (${before} → ${after})`);
  // The first version of this counted only assistant bubbles and missed that
  // regenerate was drawing the question a second time.
  const userBubbles = await page.$$eval('.msg.user', els => els.map(e => e.innerText.trim().slice(0, 24)));
  const dupes = userBubbles.length !== new Set(userBubbles).size;
  ok(!dupes, `the question is not duplicated (${userBubbles.length} user bubbles)`, userBubbles);

  // ── A short answer gets no export clutter ──
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: 'تمام.' })}\n\nevent: done\ndata: {}\n\n` });
  });
  await ask('شكرا');
  const shortButtons = await page.$$eval('.msg.assistant:last-of-type .msg-actions-toolbar .msg-action-btn', els => els.map(e => e.getAttribute('title')));
  ok(!shortButtons.some(t => /PDF|شرائح|Word/.test(t || '')), 'a one-line answer shows no export actions', shortButtons);

  ok(errors.length === 0, 'no JS errors throughout', errors.slice(0, 2));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

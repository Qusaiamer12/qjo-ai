// A saved conversation is what was on the screen, through the real page with
// a Firebase that keeps what it is given (fakeFirebase.js).
//
// Regenerating an answer kept the old one stored: the chat opened again
// showed both, one after the other, under one question. Checked here:
// regenerate, retry after a failure and editing the last message each take
// out of the saved chat what they take off the screen; the chat opened
// again shows exactly what was there; the model is sent the edited question
// and not the old one; Edit is offered on the last message only, not on one
// that carried files, and does nothing while an answer is being written.
const { launchBrowser, BASE_URL } = require('./harness');
const { useFakeFirebase, savedMessages } = require('./fakeFirebase');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 500)); };

const saved = async (page) => (await savedMessages(page)).map((m) => `${m.seq}:${m.role}:${m.content}`);
const screen = (page) => page.$$eval('#messages .msg.user > .bubble, #messages .msg.assistant > .bubble', (els) => els.map((e) => {
  const answer = e.querySelector('.qjo-streamed-content');
  return (answer || e).innerText.replace(/\s+/g, ' ').trim();
}));

(async () => {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await useFakeFirebase(page);
  const asked = [];
  let answers = 0; let failures = 0; let hold = false;
  await page.route('**/api/chat', (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    asked.push((body.messages || []).filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : '')));
    if (hold) return undefined;
    if (failures > 0) { failures -= 1; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"upstream broke"}' }); }
    answers += 1;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: `الجواب ${answers}` })}\n\nevent: done\ndata: {}\n\n` });
  });
  await page.addInitScript("try { localStorage.setItem('qjo_language', 'ar'); } catch (_) {}");
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__signIn());
  await page.waitForTimeout(1200);
  const settle = (ms = 1600) => page.waitForTimeout(ms);
  const send = async (text) => { await page.fill('#input', text); await page.click('#sendBtn'); await settle(); };

  try {
    await send('السؤال الأول');
    ok(JSON.stringify(await saved(page)) === JSON.stringify(['0:user:السؤال الأول', '1:assistant:الجواب 1']), 'control: a question and its answer are saved', await saved(page));

    // Regenerate: the new answer takes the old one's place.
    await page.click('.msg.assistant:last-of-type .msg-action-btn[aria-label="إعادة توليد الإجابة"]');
    await settle();
    ok(JSON.stringify(await saved(page)) === JSON.stringify(['0:user:السؤال الأول', '1:assistant:الجواب 2']), 'a regenerated answer replaces the saved one', await saved(page));

    // A failure, its silent retry failing too, then Retry: the error is not kept.
    failures = 2;
    await send('السؤال الثاني');
    await page.waitForSelector('.retry-row button', { timeout: 15000 }).catch(() => {});
    ok((await saved(page)).some((m) => m.startsWith('3:assistant:') && !/الجواب/.test(m)), 'control: a failure is saved as it happened', await saved(page));
    await page.click('.retry-row button');
    await settle();
    ok(JSON.stringify(await saved(page)) === JSON.stringify(['0:user:السؤال الأول', '1:assistant:الجواب 2', '2:user:السؤال الثاني', '3:assistant:الجواب 3']), 'after Retry the failure is no longer saved', await saved(page));

    // Edit: only on the last message sent.
    const edits = await page.$$eval('#messages .msg.user', (els) => els.map((e) => Boolean(e.querySelector('.qjo-edit-message'))));
    ok(JSON.stringify(edits) === '[false,true]', `Edit is offered on the last message only (${edits})`);
    await page.click('#messages .qjo-edit-message');
    await page.waitForTimeout(400);
    ok((await page.inputValue('#input')) === 'السؤال الثاني' && JSON.stringify(await screen(page)) === JSON.stringify(['السؤال الأول', 'الجواب 2']),
      'Edit puts the message back in the composer and takes it and its answer off the screen', { input: await page.inputValue('#input'), screen: await screen(page) });
    ok(JSON.stringify(await saved(page)) === JSON.stringify(['0:user:السؤال الأول', '1:assistant:الجواب 2']), 'and out of the saved chat', await saved(page));
    await page.fill('#input', 'السؤال الثاني بعد التعديل');
    const before = asked.length;
    await page.click('#sendBtn');
    await settle();
    const sentNow = asked[before] || [];
    ok(sentNow.includes('السؤال الثاني بعد التعديل') && !sentNow.includes('السؤال الثاني'), 'the model is sent the edited question, not the old one', sentNow);
    ok(JSON.stringify(await saved(page)) === JSON.stringify(['0:user:السؤال الأول', '1:assistant:الجواب 2', '2:user:السؤال الثاني بعد التعديل', '3:assistant:الجواب 4']), 'the edited exchange is saved in its place', await saved(page));

    // Opened again, the chat is what was on the screen.
    const shown = await screen(page);
    await page.click('#newChatBtn');
    await page.waitForTimeout(600);
    await page.click('.chat-item, .chat-row, [data-chat-id]');
    await page.waitForTimeout(1200);
    const reopened = await screen(page);
    ok(JSON.stringify(reopened) === JSON.stringify(shown) && reopened.length === 4, `the chat opened again shows exactly what was there (${reopened.length} messages)`, { shown, reopened });

    // After opening it again, a regenerate still replaces in place.
    await page.click('.msg.assistant:last-of-type .msg-action-btn[aria-label="إعادة توليد الإجابة"]');
    await settle();
    ok(JSON.stringify(await saved(page)) === JSON.stringify(['0:user:السؤال الأول', '1:assistant:الجواب 2', '2:user:السؤال الثاني بعد التعديل', '3:assistant:الجواب 5']), 'a chat opened again regenerates in place too', await saved(page));

    // Edit does nothing while an answer is being written.
    hold = true;
    await page.fill('#input', 'سؤال ينتظر');
    await page.click('#sendBtn');
    await page.waitForTimeout(500);
    await page.click('#messages .qjo-edit-message').catch(() => {});
    ok((await screen(page)).includes('سؤال ينتظر') && (await page.inputValue('#input')) === '', 'Edit does nothing while an answer is being written');
    await page.click('#sendBtn');
    await page.waitForTimeout(600);
    hold = false;

    // A message that carried a file offers no Edit: the file is not in the composer.
    await page.setInputFiles('#fileInput', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('ملاحظات') }]);
    await page.waitForTimeout(800);
    await send('لخص الملف');
    const lastUser = await page.$$eval('#messages .msg.user', (els) => ({ text: els[els.length - 1].innerText, edit: Boolean(els[els.length - 1].querySelector('.qjo-edit-message')), any: document.querySelectorAll('#messages .qjo-edit-message').length }));
    ok(/لخص الملف/.test(lastUser.text) && !lastUser.edit && lastUser.any === 0, 'a message that carried a file offers no Edit, and no earlier one keeps it', lastUser);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

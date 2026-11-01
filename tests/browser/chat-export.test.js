// "Download my chats" in the settings panel, through the real page with a
// Firebase that keeps what it is given (fakeFirebase.js).
//
// Two chats are saved by talking to the page, a third is stored the way an old
// build stored it (messages as an array on the chat), and a fourth is one the
// person deleted. The button is pressed with a real click and the download is
// caught as a person would get it. The file must hold the three chats with
// every message, in order, and not the deleted one.
//
// Controls: signed out, the same button gives no download and says sign-in is
// needed; with the messages read made to fail, nothing is downloaded and the
// person is told so (a file that quietly lacks a chat would be worse than none);
// with the read restored, the same click downloads again.
const { launchBrowser, BASE_URL } = require('./harness');
const { useFakeFirebase, savedMessages } = require('./fakeFirebase');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 600)); };

const two = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

async function newPage(browser, { signedIn, lang = 'ar' }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await useFakeFirebase(page);
  let answers = 0;
  await page.route('**/api/chat', (route) => {
    answers += 1;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: `الجواب ${answers}` })}\n\nevent: done\ndata: {}\n\n` });
  });
  await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (signedIn) { await page.evaluate(() => window.__signIn()); await page.waitForTimeout(1200); }
  return { ctx, page, errors };
}

const status = (page) => page.$eval('#exportChatsStatus', (e) => e.textContent.trim());
const openSettings = async (page) => {
  await page.evaluate(() => document.getElementById('userSettingsModal').classList.add('show'));
  await page.waitForSelector('#exportChatsBtn', { state: 'visible', timeout: 5000 });
};

(async () => {
  const browser = await launchBrowser();
  try {
    // ---- Signed in: the download ----
    const { page, errors } = await newPage(browser, { signedIn: true });
    const settle = (ms = 1600) => page.waitForTimeout(ms);
    const send = async (text) => { await page.fill('#input', text); await page.click('#sendBtn'); await settle(); };

    await send('السؤال الأول');
    await send('السؤال الثاني');
    await page.click('#newChatBtn');
    await page.waitForTimeout(600);
    await send('سؤال المحادثة الثانية');
    const saved = await savedMessages(page);
    const chatIds = [...new Set(saved.map((m) => m.chat))];
    ok(chatIds.length === 2 && saved.length === 6, 'control: two chats with six messages are saved through the page', { chatIds, saved: saved.length });

    // An old build's chat, and one the person deleted.
    await page.evaluate(() => {
      const at = (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });
      window.__store.set('users/u1/chats/legacy1', { title: 'محادثة قديمة', createdAt: at(1600000000000), updatedAt: at(1600000005000), messages: [{ role: 'user', content: 'سؤال قديم' }, { role: 'assistant', content: 'جواب قديم' }, { role: 'user', content: '' }] });
      window.__store.set('users/u1/chats/gone1', { title: 'محذوفة', deleted: true, createdAt: at(1600000100000), updatedAt: at(1600000100000) });
      window.__store.set('users/u1/chats/gone1/messages/000000', { role: 'user', content: 'يجب ألا تظهر', seq: 0 });
      // Another person's chat must never be read.
      window.__store.set('users/u2/chats/other1', { title: 'غريبة', createdAt: at(1600000200000), updatedAt: at(1600000200000) });
      window.__store.set('users/u2/chats/other1/messages/000000', { role: 'user', content: 'ليست لي', seq: 0 });
    });

    await openSettings(page);
    const label = await page.$eval('#exportChatsBtn', (b) => b.textContent.trim());
    const title = await page.$eval('#exportChatsBtn', (b) => b.closest('.settings-row').querySelector('.settings-row-title').textContent.trim());
    ok(label === 'تنزيل' && title === 'تنزيل محادثاتي', 'the settings panel offers the button, in Arabic', { label, title });

    // Watch the status text change, so progress is seen and not guessed.
    await page.evaluate(() => {
      window.__seen = [];
      new MutationObserver(() => window.__seen.push(document.getElementById('exportChatsStatus').textContent)).observe(document.getElementById('exportChatsStatus'), { childList: true, characterData: true, subtree: true });
    });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#exportChatsBtn')]);
    ok(download.suggestedFilename() === `qjo-chats-${today()}.json`, `the file is named for today (${download.suggestedFilename()})`);
    const text = require('fs').readFileSync(await download.path(), 'utf8');
    let file = null;
    try { file = JSON.parse(text); } catch (_) { /* reported below */ }
    ok(file && file.app === 'Qjo' && file.version === 1 && !Number.isNaN(Date.parse(file.exportedAt)) && Array.isArray(file.chats), 'the file is JSON with the stable shape', text.slice(0, 200));
    if (!file) throw new Error('the download was not JSON');
    ok(file.chats.length === 3, `three chats are in it: the two saved and the old one (${file.chats.length})`, file.chats.map((c) => c.title));

    const store = await savedMessages(page);
    const expected = chatIds.map((id) => store.filter((m) => m.chat === id).map((m) => `${m.role}:${m.content}`));
    const got = file.chats.filter((c) => chatIds.includes(c.id)).map((c) => c.messages.map((m) => `${m.role}:${m.content}`));
    const sortKey = (a) => a.join('|');
    ok(JSON.stringify(got.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))) === JSON.stringify(expected.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))), 'both saved chats are there with every message, in order', { got, expected });
    const all = got.flat();
    ok(JSON.stringify(all.sort()) === JSON.stringify(['assistant:الجواب 1', 'assistant:الجواب 2', 'assistant:الجواب 3', 'user:السؤال الأول', 'user:السؤال الثاني', 'user:سؤال المحادثة الثانية'].sort()), 'and those are the words that were on the screen', all);
    const twoMessageChat = file.chats.find((c) => c.messages.length === 4);
    ok(twoMessageChat && JSON.stringify(twoMessageChat.messages.map((m) => m.role)) === '["user","assistant","user","assistant"]', 'a chat keeps both roles, alternating, in order', twoMessageChat);
    ok(file.chats.every((c) => c.messages.every((m) => typeof m.createdAt === 'undefined' || !Number.isNaN(Date.parse(m.createdAt)))) && file.chats.every((c) => !Number.isNaN(Date.parse(c.createdAt)) && c.title), 'every chat has a title and a real date');
    const legacy = file.chats.find((c) => c.id === 'legacy1');
    ok(legacy && legacy.title === 'محادثة قديمة' && JSON.stringify(legacy.messages.map((m) => m.content)) === '["سؤال قديم","جواب قديم"]', 'a chat saved the old way is in it, its empty entry left out', legacy);
    ok(!/يجب ألا تظهر|ليست لي|غريبة/.test(text), 'a deleted chat and another person\'s chat are not in it');
    const seen = await page.evaluate(() => window.__seen);
    ok(seen.some((s) => /^بجهّز محادثاتك… \d+\/3$/.test(s)), 'progress was shown while reading ("بجهّز محادثاتك… n/3")', seen);
    ok(seen.some((s) => /3\/3/.test(s)), 'and reached 3/3', seen);
    ok(/^تم — نزّلت 3 محادثة\.$/.test(await status(page)), 'it says it is done', await status(page));
    ok(await page.$eval('#exportChatsBtn', (b) => !b.disabled), 'the button is usable again');

    // ---- Control 2: the read breaks ----
    await page.evaluate(() => {
      const db = window.firebase.firestore();
      const real = db.collection.bind(db);
      window.__realCollection = real;
      const wrap = (ref) => new Proxy(ref, {
        get(target, key) {
          const value = target[key];
          if (typeof value !== 'function') return value;
          return (...args) => {
            if (key === 'collection' && args[0] === 'messages') {
              const broken = { get: () => Promise.reject(new Error('permission-denied')) };
              return { ...broken, orderBy: () => broken, limit: () => broken, doc: (id) => target.collection('messages').doc(id) };
            }
            const out = value.apply(target, args);
            return (key === 'doc' || key === 'collection') ? wrap(out) : out;
          };
        }
      });
      db.collection = (name) => wrap(real(name));
    });
    const brokenWait = page.waitForEvent('download', { timeout: 2500 }).then(() => 'downloaded', () => 'none');
    await page.click('#exportChatsBtn');
    ok((await brokenWait) === 'none', 'control: with the messages read broken, nothing is downloaded');
    ok(/تعذر تنزيل محادثاتك/.test(await status(page)), 'and the person is told it failed', await status(page));
    ok(await page.$eval('#exportChatsBtn', (b) => !b.disabled), 'and can try again');

    await page.evaluate(() => { const db = window.firebase.firestore(); db.collection = window.__realCollection; });
    const [again] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#exportChatsBtn')]);
    const againFile = JSON.parse(require('fs').readFileSync(await again.path(), 'utf8'));
    ok(againFile.chats.length === 3, 'restored: the same click downloads all three chats again', againFile.chats.length);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await page.context().close();

    // ---- Control 1: signed out ----
    const out = await newPage(browser, { signedIn: false });
    await openSettings(out.page);
    const outWait = out.page.waitForEvent('download', { timeout: 2500 }).then(() => 'downloaded', () => 'none');
    await out.page.click('#exportChatsBtn');
    ok((await outWait) === 'none', 'control: signed out, nothing is downloaded');
    ok(/سجّل دخولك أولًا/.test(await status(out.page)), 'and it says sign-in is needed', await status(out.page));
    ok(out.errors.length === 0, 'no JS errors signed out', out.errors.slice(0, 2));
    await out.ctx.close();

    // ---- English ----
    const en = await newPage(browser, { signedIn: false, lang: 'en' });
    await openSettings(en.page);
    await en.page.click('#exportChatsBtn');
    ok(/Sign in first to download your chats/.test(await status(en.page)) && (await en.page.$eval('#exportChatsBtn', (b) => b.textContent.trim())) === 'Download', 'in English the button and the sign-in message are English', await status(en.page));
    await en.ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

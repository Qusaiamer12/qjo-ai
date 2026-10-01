// Files reach the composer the way people put them there: a screenshot
// pasted with Ctrl+V, a file dropped anywhere on the page — through the real
// page, with the real clipboard and real keystrokes.
//
// The paperclip was the only way in: a pasted screenshot did nothing, and a
// file dropped on the page was opened by the browser in its place, the
// conversation gone. Checked too: a paste of text stays text, even when the
// clipboard also holds a picture of it (cells copied from Excel).
const { launchBrowser, BASE_URL } = require('./harness');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 400)); };

const chips = (page) => page.$$eval('#attachmentTray .attachment-chip', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const clear = (page) => page.evaluate(() => document.querySelectorAll('#attachmentTray .attachment-chip button, #attachmentTray .attachment-chip [class*="remove"]').forEach((b) => b.click()));

// Puts these entries on the system clipboard, then presses the paste keys in
// the composer: the browser builds the paste event, not the test.
async function pasteFromClipboard(page, entries, text = 'a\t1\nb\t2') {
  const wrote = await page.evaluate(async ([list, words]) => {
    try {
      const png = await new Promise((resolve) => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 48;
        const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 64, 48);
        c.toBlob(resolve, 'image/png');
      });
      const item = {};
      for (const kind of list) item[kind] = kind === 'image/png' ? png : new Blob([words], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem(item)]);
      return 'ok';
    } catch (e) { return e.message; }
  }, [entries, text]);
  await page.focus('#input');
  await page.keyboard.press('Control+V');
  return wrote;
}

// An image is compressed before its chip shows: wait for it, or — when none
// should come — long enough that one would have.
const chipArrives = (page) => page.waitForFunction(() => document.querySelectorAll('#attachmentTray .attachment-chip').length > 0, null, { timeout: 10000 }).then(() => true, () => false);
const nothingArrives = async (page) => { await page.waitForTimeout(3000); return (await chips(page)).length === 0; };

async function dropFile(page, name, type, overTheChat) {
  const transfer = await page.evaluateHandle(([n, t]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t.startsWith('image/') ? new Uint8Array([137, 80, 78, 71]) : 'plain notes'], n, { type: t }));
    return dt;
  }, [name, type]);
  const target = overTheChat ? '#messages' : '#input';
  await page.dispatchEvent(target, 'dragenter', { dataTransfer: transfer });
  await page.dispatchEvent(target, 'dragover', { dataTransfer: transfer });
  const veil = await page.$eval('.qjo-drop-veil', (v) => ({ shown: !v.hidden && v.getClientRects().length > 0, text: v.textContent.trim() })).catch(() => null);
  const prevented = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.txt', { type: 'text/plain' }));
    const e = new DragEvent('dragover', { dataTransfer: dt, cancelable: true, bubbles: true });
    document.querySelector('#messages').dispatchEvent(e);
    return e.defaultPrevented;
  });
  await page.dispatchEvent(target, 'drop', { dataTransfer: transfer });
  await chipArrives(page);
  return { veil, prevented };
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const lang of ['ar', 'en']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(`try { localStorage.setItem('qjo_language', '${lang}'); } catch (_) {}`);
      await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

      // Control: the paperclip's own path makes a chip this suite can see.
      await page.setInputFiles('#fileInput', [{ name: 'picked.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
      await page.waitForTimeout(800);
      const picked = await chips(page);
      ok(picked.some((c) => c.includes('picked.txt')), `${lang}: control — a file from the picker shows in the tray (${picked.join(' | ')})`);
      await clear(page);
      await page.waitForTimeout(300);
      ok((await chips(page)).length === 0, `${lang}: control — the tray empties`);

      const screenshot = await pasteFromClipboard(page, ['image/png']);
      await chipArrives(page);
      const pasted = await chips(page);
      ok(screenshot === 'ok' && pasted.length === 1 && /image|صورة/i.test(pasted[0]), `${lang}: a screenshot pasted with Ctrl+V is attached (${pasted.join(' | ') || 'nothing'})`, { screenshot });
      await clear(page);
      ok(await nothingArrives(page), `${lang}: control — the tray is empty again`);

      await page.fill('#input', '');
      const text = await pasteFromClipboard(page, ['text/plain']);
      ok(text === 'ok' && (await nothingArrives(page)) && (await page.inputValue('#input')).includes('a\t1'), `${lang}: text pasted stays text, nothing attached`);

      await page.fill('#input', '');
      const cells = await pasteFromClipboard(page, ['text/plain', 'image/png']);
      ok(cells === 'ok' && (await nothingArrives(page)) && (await page.inputValue('#input')).includes('a\t1'), `${lang}: cells copied with a picture of them paste as text, nothing attached`);
      await page.fill('#input', '');

      // A copied file puts its name beside it as text: that is still a file.
      const named = await pasteFromClipboard(page, ['text/plain', 'image/png'], 'image.png');
      ok(named === 'ok' && (await chipArrives(page)), `${lang}: a file pasted with its name beside it is attached (${(await chips(page)).join(' | ') || 'nothing'})`);
      await clear(page);
      await nothingArrives(page);
      await page.fill('#input', '');

      const url = page.url();
      const dropped = await dropFile(page, 'notes.txt', 'text/plain', true);
      const after = await chips(page);
      ok(dropped.veil && dropped.veil.shown && dropped.veil.text === (lang === 'ar' ? 'أفلت الملفات هنا لإرفاقها' : 'Drop files to attach'), `${lang}: dragging a file over the page says where it will go (${dropped.veil && dropped.veil.text})`, dropped);
      ok(dropped.prevented, `${lang}: the browser is kept from opening the file in place of the page`);
      ok(after.some((c) => c.includes('notes.txt')) && page.url() === url, `${lang}: a file dropped on the conversation is attached, and the page stays (${after.join(' | ')})`);
      ok(await page.$eval('.qjo-drop-veil', (v) => v.hidden), `${lang}: the veil goes once the file is dropped`);

      // Crossing from one element to another inside the page keeps the veil;
      // leaving the window takes it away.
      const crossing = await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['x'], 'x.txt', { type: 'text/plain' }));
        const fire = (type, sel) => document.querySelector(sel).dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true }));
        const veil = () => !document.querySelector('.qjo-drop-veil').hidden;
        fire('dragenter', '#messages');
        fire('dragenter', '#input');
        fire('dragleave', '#messages');
        const kept = veil();
        fire('dragleave', '#input');
        return { kept, gone: !veil() };
      });
      ok(crossing.kept && crossing.gone, `${lang}: the veil stays while the drag crosses the page and goes when it leaves`, crossing);

      // Dragging text is not dragging a file.
      const textDrag = await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'words');
        document.querySelector('#messages').dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
        return document.querySelector('.qjo-drop-veil').hidden;
      });
      ok(textDrag, `${lang}: dragging text shows no veil`);
      ok(errors.length === 0, `${lang}: no JS errors`, errors.slice(0, 2));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

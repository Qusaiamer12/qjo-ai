// The answer mode on a phone: one button above the composer that opens a menu
// of the two modes — it used to be a card in a sheet.
const { launchBrowser, devices, BASE_URL } = require('./harness');
(async () => {
  const b = await launchBrowser();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  let pass=0, fail=0;
  const ok=(c,m,d)=>{c?pass++:fail++;console.log(`${c?'✅':'❌'} ${m}`);if(!c&&d!==undefined)console.log('   ',JSON.stringify(d).slice(0,200));};
  await p.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  await p.evaluate(() => { const o=document.getElementById('authOverlay'); if(o){o.classList.remove('show');o.style.display='none';} });
  const box = await p.$eval('#modeToggle', (e) => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { w: r.width, h: r.height, top: r.top, visible: getComputedStyle(e).display !== 'none' && r.width > 0, reachable: Boolean(hit && (hit === e || e.contains(hit))), text: e.innerText.trim() }; });
  const input = await p.$eval('#input', (e) => e.getBoundingClientRect().top);
  ok(box.visible && box.reachable, `the mode button is on screen and nothing covers it (${box.text})`, box);
  ok(box.h >= 36 && box.w >= 44, `big enough to tap (${Math.round(box.w)}x${Math.round(box.h)})`, box);
  ok(box.top < input, 'above the composer, where the thumb is', { button: box.top, input });
  ok(/Flash/.test(box.text), 'Flash shown as the current mode', box);
  await p.tap('#modeToggle');
  await p.waitForTimeout(300);
  const item = await p.$eval('#modeMenu .qjo-tools-item[data-mode="advanced"]', (e) => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { w: r.width, h: r.height, left: r.left, right: r.right, vw: window.innerWidth, reachable: Boolean(hit && (hit === e || e.contains(hit))) }; });
  ok(item.reachable && item.h >= 44 && item.left >= 0 && item.right <= item.vw, `the menu opens on screen, Max in reach of a thumb (${Math.round(item.w)}x${Math.round(item.h)})`, item);
  await p.tap('#modeMenu .qjo-tools-item[data-mode="advanced"]');
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ mode: document.body.dataset.qjoMode, stored: localStorage.getItem('qjo_response_mode'), text: document.getElementById('modeToggle').innerText.trim() }));
  ok(after.mode === 'advanced' && after.stored === 'advanced', `choosing Max switches to it (${after.mode})`, after);
  ok(/Max/.test(after.text), `and the button says so (${after.text})`, after);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();

// Personalization must still reach the model now that the base prompt does not.
const { launchBrowser, BASE_URL } = require('./harness');
(async () => {
  const b = await launchBrowser();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  let payload = null;
  await p.route('**/api/chat', async (r) => {
    payload = JSON.parse(r.request().postData() || '{}');
    await r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n' });
  });

  await p.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => {
    localStorage.setItem('qjo_training_text', 'رد دائمًا بالعربية الفصحى.');
    localStorage.setItem('qjo_learning_notes', JSON.stringify(['اسمي عامر', 'أفضّل الإجابات المختصرة']));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const o=document.getElementById('authOverlay'); if(o){o.classList.remove('show');o.style.display='none';} });

  let pass = 0, fail = 0;
  const check = (ok, m, d) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${m}`); if (!ok && d !== undefined) console.log('   ', JSON.stringify(d).slice(0,300)); };

  await p.fill('#input', 'اكتبلي كود بايثون');
  await p.click('#sendBtn');
  await p.waitForTimeout(1500);

  const sys = (payload.messages || []).find(m => m.role === 'system');
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  check(!!sys, 'system message present when personalization exists');
  check(sys && !sys.content.includes('<system_instructions>'), 'base prompt is NOT transmitted');
  check(sys && sys.content.includes('Owner-provided instructions'), 'owner training transmitted');
  check(sys && sys.content.includes('اسمي عامر'), 'saved corrections transmitted');
  check(sys && sys.content.includes('Task-specific skill capsules'), 'skill capsules transmitted (coding intent)');
  check(sys && !sys.content.includes('Runtime date context'), 'client date line dropped (server injects its own)');
  check(bytes < 4000, `payload stayed small: ${bytes} bytes`);
  console.log('   system message size:', Buffer.byteLength(sys ? sys.content : '', 'utf8'), 'bytes');

  // And with no personalization at all, no system message should be sent.
  await p.evaluate(() => { localStorage.removeItem('qjo_training_text'); localStorage.removeItem('qjo_learning_notes'); });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const o=document.getElementById('authOverlay'); if(o){o.classList.remove('show');o.style.display='none';} });
  payload = null;
  await p.fill('#input', 'مرحبا');
  await p.click('#sendBtn');
  await p.waitForTimeout(1500);
  const sys2 = (payload.messages || []).find(m => m.role === 'system');
  check(!sys2, 'no empty system message when there is nothing to personalize');

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

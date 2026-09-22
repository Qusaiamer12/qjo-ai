const { launchBrowser, BASE_URL } = require('./harness');
(async () => {
  const b = await launchBrowser();
  const p = await (await b.newContext()).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  let sent = [];
  await p.route('**/api/chat', async (r) => {
    sent.push(JSON.parse(r.request().postData() || '{}'));
    await r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n' });
  });

  await p.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const dismiss = () => p.evaluate(() => { const o=document.getElementById('authOverlay'); if(o){o.classList.remove('show');o.style.display='none';} });
  await dismiss();

  let pass=0, fail=0;
  const check=(ok,m,d)=>{ok?pass++:fail++;console.log(`${ok?'✅':'❌'} ${m}`);if(!ok&&d!==undefined)console.log('   ',JSON.stringify(d).slice(0,240));};

  check(errs.length === 0, `no page errors on load${errs.length?': '+errs[0]:''}`);

  // ── Controls present / absent ──
  check(await p.$('#modeSegmented') !== null, 'mode switcher is in the DOM');
  check(await p.$('#normalModeBtn') !== null && await p.$('#advancedModeBtn') !== null, 'Flash and Max buttons exist');
  check(await p.$('#codeModeBtn') === null, 'Code mode is not offered');
  check(await p.$('#toggleReason') === null, 'reasoning pill removed (Max covers it)');
  const pills = await p.$$eval('.func-toggle', e => e.map(x => x.id));
  check(JSON.stringify(pills) === JSON.stringify(['toggleSearch','toggleDeep','toggleTask']), `every pill still does a real job: ${pills.join(', ')}`);

  // ── Default + switching ──
  const active = () => p.evaluate(() => ({
    flash: document.getElementById('normalModeBtn').classList.contains('active'),
    max: document.getElementById('advancedModeBtn').classList.contains('active'),
    body: document.body.dataset.qjoMode,
    ariaFlash: document.getElementById('normalModeBtn').getAttribute('aria-checked'),
    ariaMax: document.getElementById('advancedModeBtn').getAttribute('aria-checked')
  }));
  let a = await active();
  check(a.flash && !a.max, 'Flash is the default');
  check(a.ariaFlash === 'true' && a.ariaMax === 'false', 'aria-checked tracks selection');

  await p.click('#advancedModeBtn');
  a = await active();
  check(a.max && !a.flash, 'clicking Max selects it and deselects Flash');
  check(a.body === 'advanced', `body[data-qjo-mode] follows (${a.body})`);
  check(a.ariaMax === 'true' && a.ariaFlash === 'false', 'aria-checked flips');

  // ── The mode actually reaches the server ──
  const ask = async (t) => { await dismiss(); await p.fill('#input', t); await p.click('#sendBtn'); await p.waitForTimeout(1200); };
  sent = [];
  await ask('اشرحلي نظرية النسبية');
  check(sent[0]?.mode === 'advanced', `Max sends mode=advanced (${sent[0]?.mode})`);
  const maxTok = sent[0]?.max_tokens, maxTemp = sent[0]?.temperature;

  await p.click('#normalModeBtn');
  sent = [];
  await ask('اشرحلي نظرية النسبية');
  check(sent[0]?.mode === 'normal', `Flash sends mode=normal (${sent[0]?.mode})`);
  check(sent[0]?.max_tokens < maxTok, `Max gets a bigger budget than Flash (${sent[0]?.max_tokens} vs ${maxTok})`);
  check(sent[0]?.temperature > maxTemp, `Max runs cooler for accuracy (${maxTemp} vs ${sent[0]?.temperature})`);

  // ── Code-shaped questions get room in either mode ──
  sent = [];
  await ask('اكتبلي دالة جافاسكريبت للترتيب');
  check(sent[0]?.max_tokens >= 4200, `code question gets a code-sized budget (${sent[0]?.max_tokens})`);

  // ── Persistence ──
  await p.click('#advancedModeBtn');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500); await dismiss();
  check((await active()).max, 'mode survives a reload');

  // ── Legacy 'code' value normalises ──
  await p.evaluate(() => localStorage.setItem('qjo_response_mode', 'code'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500); await dismiss();
  a = await active();
  check(a.flash && !a.max, `a persisted 'code' mode falls back to Flash (${a.body})`);

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();

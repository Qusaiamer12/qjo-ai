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

  // ── One button for the mode (public/ui/composerControls.js) ──
  check(await p.$('#modeToggle') !== null, 'the mode button is in the composer');
  check(await p.$('#normalModeBtn') === null && await p.$('#advancedModeBtn') === null && await p.$('#modeSegmented') === null, 'the two separate mode buttons are gone');
  check(await p.$('#codeModeBtn') === null, 'Code mode is not offered');
  check(await p.$('#toggleReason') === null, 'reasoning pill removed (Max covers it)');
  const pills = await p.$$eval('#composerToggles > button, #composerToggles .qjo-tools-wrap > button', e => e.map(x => x.id));
  check(JSON.stringify(pills) === JSON.stringify(['modeToggle', 'toolsMenuBtn']), `two buttons beside the composer: ${pills.join(', ')}`);

  // ── Default + switching with one tap ──
  const active = () => p.evaluate(() => {
    const b = document.getElementById('modeToggle');
    return { shows: b.dataset.mode, text: b.innerText.trim(), body: document.body.dataset.qjoMode, label: b.getAttribute('aria-label') };
  });
  let a = await active();
  check(a.shows === 'normal' && /Flash/.test(a.text) && a.body === 'normal', `Flash is the default, and the button says so (${a.text})`);
  check(/Flash/.test(a.label) && /Max/.test(a.label), `its label names the mode and the one a tap switches to (${a.label})`);

  await p.click('#modeToggle');
  a = await active();
  check(a.shows === 'advanced' && /Max/.test(a.text), `one tap switches to Max (${a.text})`);
  check(a.body === 'advanced', `body[data-qjo-mode] follows (${a.body})`);
  check(/Max[^]*Flash/.test(a.label), `the label follows: Max now, Flash a tap away (${a.label})`);

  // ── The mode actually reaches the server ──
  const ask = async (t) => { await dismiss(); await p.fill('#input', t); await p.click('#sendBtn'); await p.waitForTimeout(1200); };
  sent = [];
  await ask('اشرحلي نظرية النسبية');
  check(sent[0]?.mode === 'advanced', `Max sends mode=advanced (${sent[0]?.mode})`);
  const maxTok = sent[0]?.max_tokens, maxTemp = sent[0]?.temperature;

  await p.click('#modeToggle');
  sent = [];
  await ask('اشرحلي نظرية النسبية');
  check(sent[0]?.mode === 'normal', `Flash sends mode=normal (${sent[0]?.mode})`);
  check(sent[0]?.max_tokens < maxTok, `Max gets a bigger budget than Flash (${sent[0]?.max_tokens} vs ${maxTok})`);
  check(sent[0]?.temperature > maxTemp, `Max runs cooler for accuracy (${maxTemp} vs ${sent[0]?.temperature})`);

  // ── Code-shaped questions get room in either mode ──
  sent = [];
  await ask('اكتبلي دالة جافاسكريبت للترتيب');
  check(sent[0]?.max_tokens >= 4200, `code question gets a code-sized budget (${sent[0]?.max_tokens})`);

  // ── Not while an answer is being written: the request went with the old ones ──
  let release;
  await p.route('**/api/chat', async (r) => { await new Promise((res) => { release = res; }); await r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n' }); });
  await dismiss(); await p.fill('#input', 'سؤال طويل'); await p.click('#sendBtn');
  await p.waitForTimeout(500);
  const busy = await p.evaluate(() => ({ mode: document.getElementById('modeToggle').disabled, tools: document.getElementById('toolsMenuBtn').disabled }));
  check(busy.mode && busy.tools, `while an answer is written, the mode and the tools cannot change (${JSON.stringify(busy)})`);
  if (release) release();
  await p.waitForTimeout(1200);
  const free = await p.evaluate(() => !document.getElementById('modeToggle').disabled && !document.getElementById('toolsMenuBtn').disabled);
  check(free, 'and they come back when it is done');
  await p.unroute('**/api/chat');
  await p.route('**/api/chat', async (r) => { sent.push(JSON.parse(r.request().postData() || '{}')); await r.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: chunk\ndata: {"text":"ok"}\n\nevent: done\ndata: {}\n\n' }); });

  // ── Persistence ──
  await p.click('#modeToggle');
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500); await dismiss();
  check((await active()).shows === 'advanced', 'mode survives a reload');

  // ── Legacy 'code' value normalises ──
  await p.evaluate(() => localStorage.setItem('qjo_response_mode', 'code'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500); await dismiss();
  a = await active();
  check(a.shows === 'normal' && a.body === 'normal', `a persisted 'code' mode falls back to Flash (${a.body})`);

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})();

// A long answer must stream and render without locking the page up.
const { launchBrowser, BASE_URL } = require('./harness');

function longMarkdown(sections) {
  let out = '# تقرير تحليلي شامل\n\n';
  for (let i = 1; i <= sections; i++) {
    out += `## القسم ${i}\n\nفقرة تحليلية مفصلة تشرح النقطة رقم ${i} بعمق مع أمثلة عملية وتفاصيل تقنية دقيقة.\n\n`;
    out += `- نقطة أولى للقسم ${i}\n- نقطة ثانية للقسم ${i}\n- نقطة ثالثة\n\n`;
    if (i % 4 === 0) out += `| المعيار | القيمة |\n| --- | --- |\n| أ | ${i} |\n| ب | ${i * 2} |\n\n`;
    if (i % 5 === 0) out += '```js\nfunction f' + i + '() {\n  return ' + i + ';\n}\n```\n\n';
  }
  return out;
}

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 200)); };

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  const answer = longMarkdown(160);
  console.log(`answer size: ${answer.length} chars, ${answer.split('\n').length} lines\n`);

  const chunks = answer.match(/[\s\S]{1,120}/g);
  await page.route('**/api/chat', async (route) => {
    let body = '';
    for (const c of chunks) body += `event: chunk\ndata: ${JSON.stringify({ text: c })}\n\n`;
    body += 'event: done\ndata: {"provider":"p","model":"m"}\n\n';
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });

  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const before = (await cdp.send('Performance.getMetrics')).metrics;
  const taskBefore = before.find(m => m.name === 'TaskDuration')?.value || 0;

  const t0 = Date.now();
  await page.fill('#input', 'اكتبلي تقرير مفصل جدًا');
  await page.click('#sendBtn');

  // Poll for the answer to settle rather than sleeping a fixed amount.
  let settled = 0, lastLen = -1;
  while (Date.now() - t0 < 60000) {
    const len = await page.$$eval('.msg.assistant', els => (els[els.length - 1]?.innerText || '').length).catch(() => 0);
    if (len === lastLen && len > 1000) { settled++; if (settled >= 3) break; } else settled = 0;
    lastLen = len;
    await page.waitForTimeout(400);
  }
  const elapsed = Date.now() - t0;

  const after = (await cdp.send('Performance.getMetrics')).metrics;
  const taskAfter = after.find(m => m.name === 'TaskDuration')?.value || 0;
  const cpuMs = Math.round((taskAfter - taskBefore) * 1000);

  ok(lastLen > answer.length * 0.85, `the whole answer rendered (${lastLen} of ~${answer.length} chars)`);
  ok(elapsed < 30000, `it finished in reasonable time (${(elapsed / 1000).toFixed(1)}s)`);
  ok(cpuMs < 12000, `main-thread work stays bounded (${cpuMs}ms of CPU)`);

  // Is the page still interactive right after?
  const clickT = Date.now();
  await page.click('#input');
  await page.fill('#input', 'اختبار');
  const inputLatency = Date.now() - clickT;
  ok(inputLatency < 3000, `the composer still responds afterwards (${inputLatency}ms)`);

  const blocks = await page.$$eval('.msg.assistant:last-of-type pre, .msg.assistant pre', els => els.length);
  ok(blocks >= 20, `code blocks rendered (${blocks})`);
  const tables = await page.$$eval('.msg.assistant table', els => els.length);
  ok(tables >= 20, `tables rendered (${tables})`);
  ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

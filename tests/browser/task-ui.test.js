// Drives the real task UI against a scripted task API. The thing being tested
// is the page as a driver: it must keep the task moving, show it moving, stop
// when it should, and never run two steps at once.
const { launchBrowser, devices, BASE_URL } = require('./harness');

(async () => {
  const browser = await launchBrowser();
  let pass = 0, fail = 0;
  const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 260)); };

  // A scripted task server: each step advances the plan a little.
  function makeApi(page, { steps, onStep, failFirstStep = 0 } = {}) {
    const state = { id: 'task-1', created: 0, stepped: 0, cancelled: false, concurrent: 0, maxConcurrent: 0, failures: 0 };
    page.route('**/api/tasks', async (route) => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [] }) });
      }
      state.created++;
      const body = JSON.parse(route.request().postData() || '{}');
      state.goal = body.goal;
      state.kind = body.kind;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
        task: { id: state.id, goal: body.goal, kind: body.kind, status: 'running', step: 0, maxSteps: 40, plan: [], files: [], recentWork: [] }
      }) });
    });
    page.route('**/api/tasks/task-1/step', async (route) => {
      state.concurrent++;
      state.maxConcurrent = Math.max(state.maxConcurrent, state.concurrent);
      await new Promise(r => setTimeout(r, 120));
      state.stepped++;
      if (state.failures < failFirstStep) {
        state.failures++;
        state.concurrent--;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'provider down' }) });
      }
      const task = steps(state.stepped, state);
      if (onStep) onStep(state.stepped, task);
      state.concurrent--;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task }) });
    });
    page.route('**/api/tasks/task-1/cancel', async (route) => {
      state.cancelled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        task: { id: state.id, goal: state.goal, status: 'cancelled', step: state.stepped, maxSteps: 40, plan: [], files: [], recentWork: [] }
      }) });
    });
    page.route('**/api/tasks/task-1', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        task: { id: state.id, goal: state.goal || 'هدف', status: state.cancelled ? 'cancelled' : 'running', step: state.stepped, maxSteps: 40, plan: [], files: [], recentWork: [] }
      }) });
    });
    page.route('**/api/tasks/task-1/files', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: { 'src/index.js': 'module.exports = 1;' } }) });
    });
    return state;
  }

  async function open(device) {
    const ctx = await browser.newContext(device ? { ...devices[device] } : {});
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
    return { ctx, page, errors };
  }

  const startTask = async (page, goal) => {
    const visible = await page.$eval('#toggleTask', el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }).catch(() => false);

    if (visible) {
      await page.click('#toggleTask');
    } else {
      // On a phone the composer row is hidden entirely and the same controls
      // live in a bottom sheet, so drive that instead of the hidden button.
      await page.click('#mobileToolsTriggerBtn');
      await page.waitForTimeout(500);
      const clicked = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.sheet-toggle-card')];
        const card = cards.find(c => /وضع المهمة|Task mode/.test(c.innerText));
        if (!card) return false;
        card.click();
        return true;
      });
      if (!clicked) throw new Error('task mode is unreachable on mobile: no sheet card');
      await page.waitForTimeout(300);
      // Dismiss the sheet the way a person would, then wait for it to actually
      // be gone — it animates out and intercepts taps until it is.
      await page.evaluate(() => {
        const backdrop = document.getElementById('mobileToolsBackdrop');
        if (backdrop) backdrop.click();
      });
      await page.waitForFunction(
        () => !document.getElementById('mobileToolsSheet')?.classList.contains('show'),
        { timeout: 5000 }
      );
      await page.waitForTimeout(400);
    }

    const on = await page.$eval('#toggleTask', el => el.classList.contains('active'));
    if (!on) throw new Error('task mode did not turn on');

    await page.fill('#input', goal);
    await page.click('#sendBtn');
  };

  // ── A task runs to completion and shows itself doing so ──
  {
    const { ctx, page, errors } = await open();
    const plan = [
      { title: 'ابحث عن المصادر', status: 'active' },
      { title: 'اقرأ أهمها', status: 'pending' },
      { title: 'اكتب التقرير', status: 'pending' }
    ];
    const state = makeApi(page, {
      steps: (n) => {
        const p = plan.map((s, i) => ({ ...s, status: i < n - 1 ? 'done' : (i === n - 1 ? 'active' : 'pending') }));
        const done = n >= 4;
        return {
          id: 'task-1', goal: 'ابحث واكتب تقرير', status: done ? 'done' : 'running', step: n, maxSteps: 40,
          plan: p, files: [], recentWork: [{ tool: 'web_search', input: 'مصادر ' + n }],
          result: done ? '## التقرير\n\nالنتيجة النهائية للبحث.' : null
        };
      }
    });

    await startTask(page, 'ابحث واكتب تقرير');
    await page.waitForSelector('.qjo-task-card', { timeout: 8000 });
    ok(true, 'a task card appears immediately');

    await page.waitForFunction(() => document.querySelectorAll('.qjo-task-plan li').length >= 3, { timeout: 12000 });
    ok(true, 'the plan appears as the agent makes it');

    await page.waitForFunction(() => document.querySelector('.qjo-task-card')?.dataset.status === 'done', { timeout: 25000 });
    ok(state.stepped >= 4, `the page kept stepping until done (${state.stepped} steps)`);
    ok(state.maxConcurrent === 1, `never two steps at once (peak ${state.maxConcurrent})`);

    const doneMarks = await page.$$eval('.qjo-task-plan li[data-status="done"]', els => els.length);
    ok(doneMarks === 3, `every plan step ends marked done (${doneMarks})`);

    const resultText = await page.$eval('.qjo-task-result', e => e.innerText);
    ok(resultText.includes('النتيجة النهائية'), 'the deliverable is rendered', resultText.slice(0, 80));
    const heading = await page.$('.qjo-task-result h1, .qjo-task-result h2, .qjo-task-result h3');
    ok(Boolean(heading), 'the deliverable is rendered as markdown, not raw text');

    const stepsAfter = state.stepped;
    await page.waitForTimeout(2500);
    ok(state.stepped === stepsAfter, `a finished task stops stepping (${state.stepped} vs ${stepsAfter})`);
    ok(errors.length === 0, 'no JS errors', errors.slice(0, 2));
    await ctx.close();
  }

  // ── Stopping actually stops ──
  {
    const { ctx, page } = await open();
    const state = makeApi(page, {
      steps: (n) => ({ id: 'task-1', goal: 'مهمة طويلة', status: 'running', step: n, maxSteps: 40, plan: [], files: [], recentWork: [] })
    });
    await startTask(page, 'مهمة طويلة');
    await page.waitForSelector('.qjo-task-card', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('.qjo-task-btn'), { timeout: 10000 });
    await page.click('.qjo-task-btn');
    await page.waitForTimeout(2200);
    const stepsAtStop = state.stepped;
    await page.waitForTimeout(2200);
    ok(state.cancelled, 'stopping tells the server to cancel');
    ok(state.stepped <= stepsAtStop + 1, `stopping ends the loop (${stepsAtStop} → ${state.stepped})`);
    const status = await page.$eval('.qjo-task-card', e => e.dataset.status);
    ok(status === 'cancelled', `the card shows it is cancelled (${status})`);
    await ctx.close();
  }

  // ── A failing step is survived, not fatal ──
  {
    const { ctx, page } = await open();
    const state = makeApi(page, {
      failFirstStep: 2,
      steps: (n) => ({
        id: 'task-1', goal: 'مهمة', status: n >= 3 ? 'done' : 'running', step: n, maxSteps: 40,
        plan: [], files: [], recentWork: [], result: n >= 3 ? 'انتهت رغم التعثر.' : null
      })
    });
    await startTask(page, 'مهمة');
    await page.waitForSelector('.qjo-task-card', { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('.qjo-task-note')?.hidden, { timeout: 15000 });
    const note = await page.$eval('.qjo-task-note', e => e.innerText);
    ok(/تعثّرت|failed/i.test(note), 'a failed step is reported rather than looking stalled', note.slice(0, 90));
    await page.waitForFunction(() => document.querySelector('.qjo-task-card')?.dataset.status === 'done', { timeout: 30000 });
    ok(state.failures === 2, `it retried past the failures (${state.failures} failures)`);
    ok(true, 'the task still reached completion');
    await ctx.close();
  }

  // ── A coding task shows its files and offers the project ──
  {
    const { ctx, page } = await open();
    makeApi(page, {
      steps: (n) => ({
        id: 'task-1', goal: 'ابنِ مشروع Node', status: n >= 2 ? 'done' : 'running', step: n, maxSteps: 40,
        plan: [], files: ['src/index.js', 'package.json'], recentWork: [{ tool: 'write_file', input: 'src/index.js' }],
        result: n >= 2 ? 'المشروع جاهز.' : null
      })
    });
    await startTask(page, 'ابنِ مشروع Node بسيط');
    await page.waitForFunction(() => document.querySelectorAll('.qjo-task-file').length >= 2, { timeout: 15000 });
    const files = await page.$$eval('.qjo-task-file', els => els.map(e => e.textContent));
    ok(files.includes('src/index.js'), 'files appear as they are written', files);
    await page.waitForFunction(() => document.querySelector('.qjo-task-card')?.dataset.status === 'done', { timeout: 25000 });
    const buttons = await page.$$eval('.qjo-task-btn', els => els.map(e => e.textContent));
    ok(buttons.some(b => /تنزيل|Download/.test(b)), 'the finished project can be downloaded', buttons);
    await ctx.close();
  }

  // ── A reload leaves the task resumable ──
  {
    const { ctx, page } = await open();
    makeApi(page, {
      steps: (n) => ({ id: 'task-1', goal: 'مهمة مستمرة', status: 'running', step: n, maxSteps: 40, plan: [], files: [], recentWork: [] })
    });
    await startTask(page, 'مهمة مستمرة');
    await page.waitForSelector('.qjo-task-card', { timeout: 8000 });
    await page.waitForTimeout(1500);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.addStyleTag({ content: '#authOverlay{display:none !important;}' });
    const card = await page.$('.qjo-task-card');
    ok(Boolean(card), 'the running task comes back after a reload');
    if (card) {
      const buttons = await page.$$eval('.qjo-task-btn', els => els.map(e => e.textContent));
      ok(buttons.some(b => /استئناف|Resume/.test(b)), 'it offers to resume rather than silently continuing', buttons);
    }
    await ctx.close();
  }

  // ── Task mode is a deliberate, visible choice ──
  {
    const { ctx, page } = await open();
    let chatCalls = 0, taskCalls = 0;
    await page.route('**/api/chat', async (route) => {
      chatCalls++;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: chunk\ndata: ${JSON.stringify({ text: 'رد عادي' })}\n\nevent: done\ndata: {}\n\n` });
    });
    await page.route('**/api/tasks', async (route) => {
      taskCalls++;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ task: { id: 'task-1', goal: 'x', status: 'running', step: 0, maxSteps: 40, plan: [], files: [], recentWork: [] } }) });
    });
    await page.route('**/api/tasks/task-1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ task: { id: 'task-1', goal: 'x', status: 'done', step: 1, maxSteps: 40, plan: [], files: [], recentWork: [], result: 'تم' } }) }));

    await page.fill('#input', 'سؤال عادي');
    await page.click('#sendBtn');
    await page.waitForTimeout(1800);
    ok(chatCalls === 1 && taskCalls === 0, `without task mode it is a normal message (chat=${chatCalls}, task=${taskCalls})`);

    await page.click('#toggleTask');
    const pressed = await page.$eval('#toggleTask', e => e.classList.contains('active'));
    ok(pressed, 'the toggle shows it is on before you send');
    await page.fill('#input', 'مهمة طويلة');
    await page.click('#sendBtn');
    await page.waitForTimeout(1800);
    ok(taskCalls === 1, `with task mode it starts a task (task=${taskCalls})`);

    const stillOn = await page.$eval('#toggleTask', e => e.classList.contains('active'));
    ok(!stillOn, 'the toggle resets, so the next message is a normal one');
    await ctx.close();
  }

  // ── It works on a phone ──
  {
    const { ctx, page, errors } = await open('iPhone 13');
    makeApi(page, {
      steps: (n) => ({
        id: 'task-1', goal: 'مهمة على الهاتف', status: n >= 2 ? 'done' : 'running', step: n, maxSteps: 40,
        plan: [{ title: 'خطوة أولى طويلة نسبيًا لاختبار الالتفاف على شاشة ضيقة', status: 'done' }],
        files: [], recentWork: [], result: n >= 2 ? 'تم على الهاتف.' : null
      })
    });
    await startTask(page, 'مهمة على الهاتف');
    await page.waitForFunction(() => document.querySelector('.qjo-task-card')?.dataset.status === 'done', { timeout: 25000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 1, `no horizontal overflow on a phone (${overflow}px)`);
    const cardBox = await page.$eval('.qjo-task-card', e => e.getBoundingClientRect().width);
    const viewport = await page.evaluate(() => window.innerWidth);
    ok(cardBox <= viewport, `the card fits the screen (${Math.round(cardBox)} of ${viewport}px)`);
    ok(errors.length === 0, 'no JS errors on mobile', errors.slice(0, 2));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// A long task has to survive the things that actually happen to it: a sleeping
// instance, a deploy, a closed tab, a provider failing halfway through. These
// tests step a task the way a real driver would, and restart the world in
// between to prove nothing was being held in a variable somewhere.
const assert = require('assert');
const { createTaskRunner } = require('../src/agents/TaskRunner');
const { createMemoryTaskStore } = require('../src/agents/taskStore');
const { createWorkspace } = require('../src/tools/workspaceTools');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 4).join('\n     ')}`); });
}

const toolCall = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

// A scripted model. Each entry is one model call; the script is shared across
// steps so a task can be driven through a whole arc.
function runnerWith(script, { store, extraTools = {} } = {}) {
  let call = 0;
  const shared = store || createMemoryTaskStore();
  const runner = createTaskRunner({
    store: shared,
    llmService: {
      dispatch: async (provider, params) => {
        const step = script[Math.min(call, script.length - 1)];
        call++;
        if (typeof step === 'function') return step(params, provider);
        if (step.toolCalls) {
          return {
            ok: true, answer: step.answer || '', provider, model: params.model, finish_reason: 'tool_calls',
            message: { role: 'assistant', content: step.answer || '', tool_calls: step.toolCalls },
            toolCalls: step.toolCalls
          };
        }
        if (step.fail) return { ok: false, status: 503, error: step.fail };
        return { ok: true, answer: step.answer, provider, model: params.model, finish_reason: 'stop' };
      },
      hasKeys: () => true, hasAnyProvider: () => true
    },
    safeCalculate: (e) => `calc(${e})`,
    searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: [{ id: 1, title: 'ت', url: 'https://example.com/x', content: 'محتوى ' + rawQuery }] }) },
    keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
    models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' },
    extraTools
  });
  return { runner, store: shared, calls: () => call };
}

(async () => {
  console.log('\nA task makes progress across steps:');

  await test('a task starts with a goal and no work done', async () => {
    const { runner } = runnerWith([{ answer: 'بدأت.' }]);
    const task = await runner.start({ uid: 'u1', goal: 'ابحث عن أسعار الذهب واكتب تقرير' });
    assert.strictEqual(task.status, 'running');
    assert.strictEqual(task.step, 0);
    assert.ok(task.id, 'no task id');
  });

  await test('a step records the plan the model made', async () => {
    const { runner } = runnerWith([
      { toolCalls: [toolCall('1', 'update_plan', { steps: [
        { title: 'ابحث عن الأسعار', status: 'active' },
        { title: 'اقرأ المصادر', status: 'pending' },
        { title: 'اكتب التقرير', status: 'pending' }
      ] })] },
      { answer: 'وضعت الخطة.' }
    ]);
    const started = await runner.start({ uid: 'u1', goal: 'تقرير' });
    const task = await runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(task.plan.length, 3, 'the plan was not recorded');
    assert.strictEqual(task.plan[0].status, 'active');
  });

  await test('work from one step is visible to the next', async () => {
    const { runner, store } = runnerWith([
      { toolCalls: [toolCall('1', 'web_search', { query: 'سعر الذهب' })] },
      { answer: 'وجدت السعر 2400.' },
      (params) => {
        // The second step's prompt must carry the first step's findings.
        const system = params.messages.find(m => m.role === 'system').content;
        assert.ok(/web_search/.test(system), 'the next step cannot see what was already done');
        assert.ok(/وجدت السعر/.test(system), 'the previous answer was not carried forward');
        return { ok: true, answer: 'أكملت.', provider: 'groq', model: 't', finish_reason: 'stop' };
      }
    ]);
    const started = await runner.start({ uid: 'u1', goal: 'تقرير' });
    await runner.step(started.id, { uid: 'u1' });
    await runner.step(started.id, { uid: 'u1' });
    const task = await store.get(started.id);
    assert.strictEqual(task.step, 2);
  });

  await test('finish_task ends the task with a real deliverable', async () => {
    const { runner } = runnerWith([
      { toolCalls: [toolCall('1', 'finish_task', { summary: 'التقرير النهائي: السعر ارتفع 4%.' })] },
      { answer: 'تم.' }
    ]);
    const started = await runner.start({ uid: 'u1', goal: 'تقرير' });
    const task = await runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(task.status, 'done');
    assert.ok(task.result.includes('التقرير النهائي'), 'the deliverable was lost: ' + task.result);
  });

  await test('a finished task is not stepped again', async () => {
    const { runner, calls } = runnerWith([
      { toolCalls: [toolCall('1', 'finish_task', { summary: 'خلص.' })] },
      { answer: 'تم.' }
    ]);
    const started = await runner.start({ uid: 'u1', goal: 'x' });
    await runner.step(started.id, { uid: 'u1' });
    const before = calls();
    await runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(calls(), before, 'a completed task kept spending model calls');
  });

  console.log('\nIt survives what actually happens to it:');

  await test('state lives in the store, not in the runner', async () => {
    const store = createMemoryTaskStore();
    const first = runnerWith([
      { toolCalls: [toolCall('1', 'update_plan', { steps: [{ title: 'خطوة', status: 'active' }] })] },
      { answer: 'خطوة أولى.' }
    ], { store });
    const started = await first.runner.start({ uid: 'u1', goal: 'مهمة طويلة' });
    await first.runner.step(started.id, { uid: 'u1' });

    // Everything about the first runner is now gone — a deploy, a restart, a
    // different instance picking up the next step.
    const second = runnerWith([{ answer: 'كملت بعد إعادة التشغيل.' }], { store });
    const task = await second.runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(task.step, 2, 'the task did not continue after a restart');
    assert.strictEqual(task.plan.length, 1, 'the plan did not survive the restart');
  });

  await test('a failed step keeps the task alive and retryable', async () => {
    const store = createMemoryTaskStore();
    // Nothing in this runner ever succeeds — the engine's own transient retry
    // and its second provider slot included — so the step genuinely fails.
    const failing = runnerWith([() => ({ ok: false, status: 503, error: 'All AI providers failed.' })], { store });
    const started = await failing.runner.start({ uid: 'u1', goal: 'x' });
    const afterFailure = await failing.runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(afterFailure.status, 'running', 'one provider failure killed the whole task');
    assert.strictEqual(afterFailure.step, 1, 'the failed step was not counted');
    assert.ok(/did not complete/.test(afterFailure.lastMessage), afterFailure.lastMessage);

    // Providers recover; the task picks up from exactly where it stopped.
    const working = runnerWith([{ answer: 'نجحت هذه المرة.' }], { store });
    const afterRetry = await working.runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(afterRetry.step, 2, 'the task could not be resumed after a failure');
    assert.strictEqual(afterRetry.status, 'running');
  });

  await test('a task records what it searched, not every source card', async () => {
    // Source cards are for the page. A task's record lives in one stored
    // document; six links per search over a hundred searches would crowd it.
    const { runner } = runnerWith([
      { toolCalls: [toolCall('1', 'web_search', { query: 'سعر الذهب' })] },
      { answer: 'بحثت.' }
    ]);
    const started = await runner.start({ uid: 'u1', goal: 'سعر الذهب' });
    const task = await runner.step(started.id, { uid: 'u1' });
    const searched = (task.toolsUsed || []).find((t) => t.tool === 'web_search');
    assert.ok(searched && searched.input, `the search was not recorded: ${JSON.stringify(task.toolsUsed)}`);
    assert.ok(!('sources' in searched), 'the stored task carries the page\'s source cards');
  });

  await test('a runaway task stops at the step limit', async () => {
    const store = createMemoryTaskStore();
    const { runner } = runnerWith([{ answer: 'ما زلت أعمل...' }], { store });
    const started = await runner.start({ uid: 'u1', goal: 'مهمة لا تنتهي' });
    let task = started;
    for (let i = 0; i < runner.maxSteps + 3; i++) {
      task = await runner.step(started.id, { uid: 'u1' });
      if (task.status !== 'running') break;
    }
    assert.notStrictEqual(task.status, 'running', 'the task never stopped');
    assert.ok(task.step <= runner.maxSteps, `it ran past its limit (${task.step})`);
  });

  await test('a task can be cancelled', async () => {
    const { runner, calls } = runnerWith([{ answer: 'أعمل.' }]);
    const started = await runner.start({ uid: 'u1', goal: 'x' });
    await runner.cancel(started.id, { uid: 'u1' });
    const before = calls();
    const task = await runner.step(started.id, { uid: 'u1' });
    assert.strictEqual(task.status, 'cancelled');
    assert.strictEqual(calls(), before, 'a cancelled task kept working');
  });

  await test('one user cannot step another user\'s task', async () => {
    const { runner } = runnerWith([{ answer: 'x' }]);
    const started = await runner.start({ uid: 'owner', goal: 'x' });
    try {
      await runner.step(started.id, { uid: 'someone-else' });
      throw new Error('another user was allowed to drive the task');
    } catch (e) {
      assert.strictEqual(e.statusCode, 403, e.message);
    }
  });

  console.log('\nA long task does not outgrow its context:');

  await test('old notes are compacted instead of growing forever', async () => {
    const store = createMemoryTaskStore();
    const { runner } = runnerWith([{ answer: 'ملاحظة أخرى من الخطوة.' }], { store });
    const started = await runner.start({ uid: 'u1', goal: 'مهمة طويلة جدًا' });
    for (let i = 0; i < 30; i++) {
      const task = await runner.step(started.id, { uid: 'u1' });
      if (task.status !== 'running') break;
    }
    const task = await store.get(started.id);
    assert.ok(task.history.length <= 24, `history grew unbounded (${task.history.length} entries)`);
    assert.ok(task.trace.length <= 60, `trace grew unbounded (${task.trace.length} entries)`);
  });

  console.log('\nCoding tasks accumulate a real project:');

  await test('files written in one step are readable in the next', async () => {
    const store = createMemoryTaskStore();
    const first = runnerWith([
      { toolCalls: [toolCall('1', 'write_file', { path: 'src/index.js', content: 'module.exports = 42;' })] },
      { answer: 'كتبت الملف.' }
    ], { store });
    const started = await first.runner.start({ uid: 'u1', goal: 'ابنِ مشروع', kind: 'code' });
    await first.runner.step(started.id, { uid: 'u1' });

    let readBack = null;
    const second = runnerWith([
      { toolCalls: [toolCall('2', 'read_file', { path: 'src/index.js' })] },
      (params) => {
        readBack = params.messages.map(m => JSON.stringify(m.content)).join('\n');
        return { ok: true, answer: 'قرأته.', provider: 'groq', model: 't', finish_reason: 'stop' };
      }
    ], { store });
    await second.runner.step(started.id, { uid: 'u1' });
    assert.ok(readBack && readBack.includes('module.exports = 42'), 'the file did not survive into the next step');

    const task = await store.get(started.id);
    assert.ok(task.workspace['src/index.js'], 'the workspace was not persisted');
  });

  await test('workspace tools are not offered on a research task', async () => {
    let offered = null;
    const { runner } = runnerWith([
      (params) => {
        offered = (params.tools || []).map(t => t.function.name);
        return { ok: true, answer: 'x', provider: 'groq', model: 't', finish_reason: 'stop' };
      }
    ]);
    const started = await runner.start({ uid: 'u1', goal: 'ابحث', kind: 'general' });
    await runner.step(started.id, { uid: 'u1' });
    assert.ok(offered && !offered.includes('write_file'), 'a research task was offered file tools: ' + JSON.stringify(offered));
    assert.ok(offered.includes('finish_task'), 'the task cannot declare itself finished: ' + JSON.stringify(offered));
  });

  console.log('\nThe workspace refuses what it should:');

  const bad = [
    ['/etc/passwd', 'absolute path'],
    ['../../secrets.env', 'traversal'],
    ['a/../../b', 'traversal in the middle'],
    ['C:/Windows/system32', 'drive path'],
    ['', 'empty path']
  ];
  for (const [path, why] of bad) {
    await test(`write to "${path}" is refused (${why})`, () => {
      const ws = createWorkspace();
      assert.throws(() => ws.write(path, 'x'));
    });
  }

  await test('a normal project path works', () => {
    const ws = createWorkspace();
    ws.write('src/app/server.js', 'const a = 1;');
    assert.strictEqual(ws.read('src/app/server.js').content, 'const a = 1;');
  });

  await test('an oversized file is refused with a reason', () => {
    const ws = createWorkspace();
    assert.throws(() => ws.write('big.js', 'x'.repeat(200 * 1024)), /limit|KB/i);
  });

  await test('the project total is capped', () => {
    const ws = createWorkspace();
    assert.throws(() => {
      for (let i = 0; i < 40; i++) ws.write(`f${i}.js`, 'x'.repeat(60 * 1024));
    }, /total|limit/i);
  });

  await test('reading a missing file names what does exist', () => {
    const ws = createWorkspace();
    ws.write('a.js', '1');
    assert.throws(() => ws.read('b.js'), /a\.js/);
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

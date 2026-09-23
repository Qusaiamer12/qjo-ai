// The difference between a chat box and an agent is whether the model can act
// on what it just learned. This suite holds that line.
//
// Before: tools ran exactly once, then the follow-up call passed
// `tools: undefined`. The model could search, but never search → read → search
// again → verify → write. Every complex task needs that loop.
const assert = require('assert');
const { createRoutingEngine } = require('../src/agents/RoutingEngine');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((e) => { fail++; console.log(`  ❌ ${name}`); console.log(`     ${String(e.message).split('\n').slice(0, 3).join('\n     ')}`); });
}

const toolCall = (id, name, args) => ({
  id, type: 'function', function: { name, arguments: JSON.stringify(args) }
});

// A scripted model: each entry is what it returns on that round.
function engineWith(script, extraTools = {}) {
  let round = 0;
  const seenTools = [];
  const engine = createRoutingEngine({
    llmService: {
      dispatch: async (provider, params) => {
        const step = script[Math.min(round, script.length - 1)];
        round++;
        seenTools.push(params.tools ? params.tools.map(t => t.function.name) : null);
        if (step.toolCalls) {
          return {
            ok: true, answer: step.answer || '', provider, model: params.model,
            finish_reason: 'tool_calls',
            message: { role: 'assistant', content: step.answer || '', tool_calls: step.toolCalls },
            toolCalls: step.toolCalls
          };
        }
        return { ok: true, answer: step.answer, provider, model: params.model, finish_reason: 'stop' };
      },
      hasKeys: () => true, hasAnyProvider: () => true
    },
    safeCalculate: (expr) => `calculated(${expr})`,
    searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: [{ id: 1, title: 'نتيجة', url: 'https://example.com/a', content: 'محتوى عن ' + rawQuery }] }) },
    keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
    models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' },
    extraTools
  });
  return { engine, rounds: () => round, toolsOffered: () => seenTools };
}

const ask = (engine, extra = {}) => engine.callAgent({
  agentType: 'chat', model: 't', mode: 'max', max_tokens: 500, useTools: true,
  messages: [{ role: 'user', content: 'ابحثلي عن أسعار الذهب اليوم وقارنها بالشهر الماضي' }],
  ...extra
});

(async () => {
  console.log('\nThe model can act on what it just learned:');

  await test('it can call tools across several rounds', async () => {
    const { engine, rounds } = engineWith([
      { toolCalls: [toolCall('1', 'web_search', { query: 'سعر الذهب اليوم' })] },
      { toolCalls: [toolCall('2', 'web_search', { query: 'سعر الذهب الشهر الماضي' })] },
      { toolCalls: [toolCall('3', 'calculate', { expression: '2400-2300' })] },
      { answer: 'الفرق 100 دولار.' }
    ]);
    const res = await ask(engine);
    assert.strictEqual(res.ok, true);
    assert.ok(rounds() >= 4, `only ${rounds()} model calls — the loop stopped after one round`);
    assert.ok(res.answer.includes('الفرق'), 'the final answer was lost: ' + res.answer);
  });

  await test('every tool used is reported back', async () => {
    const { engine } = engineWith([
      { toolCalls: [toolCall('1', 'web_search', { query: 'أ' })] },
      { toolCalls: [toolCall('2', 'calculate', { expression: '1+1' })] },
      { answer: 'خلصت.' }
    ]);
    const res = await ask(engine);
    const names = (res.toolsUsed || []).map(t => t.tool);
    assert.ok(names.includes('web_search') && names.includes('calculate'), 'toolsUsed: ' + JSON.stringify(names));
  });

  await test('tools stay offered on follow-up rounds', async () => {
    const { engine, toolsOffered } = engineWith([
      { toolCalls: [toolCall('1', 'web_search', { query: 'أ' })] },
      { toolCalls: [toolCall('2', 'web_search', { query: 'ب' })] },
      { answer: 'تم.' }
    ]);
    await ask(engine);
    const offered = toolsOffered();
    assert.ok(offered[1] && offered[1].length, 'round 2 was called with no tools — the model cannot act twice');
  });

  console.log('\nThe loop is bounded and cannot spin:');

  await test('a model repeating the same call is stopped', async () => {
    const same = [toolCall('x', 'web_search', { query: 'نفس الشيء' })];
    const { engine, rounds } = engineWith([
      { toolCalls: same }, { toolCalls: same }, { toolCalls: same }, { toolCalls: same },
      { toolCalls: same }, { toolCalls: same }, { toolCalls: same }, { toolCalls: same }
    ]);
    await ask(engine);
    // The first call, the repeat that stops the loop, then the closing answer
    // asked once of each slot in the chain: Groq text, Groq flash and the
    // long-context last resort.
    assert.ok(rounds() <= 5, `it kept repeating an identical call (${rounds()} model calls)`);
  });

  await test('an endless tool-caller is capped', async () => {
    let i = 0;
    const script = Array.from({ length: 40 }, () => ({ toolCalls: [toolCall(String(++i), 'web_search', { query: 'q' + i })] }));
    const { engine, rounds } = engineWith(script);
    const res = await ask(engine);
    // Six rounds, then the closing answer once per slot in the chain (three).
    assert.ok(rounds() <= 10, `the loop is unbounded (${rounds()} model calls)`);
    assert.strictEqual(res.ok, true, 'a capped loop must still return something');
  });

  await test('the deadline stops the loop', async () => {
    let i = 0;
    const script = Array.from({ length: 40 }, () => ({ toolCalls: [toolCall(String(++i), 'web_search', { query: 'q' + i })] }));
    const { engine, rounds } = engineWith(script);
    await ask(engine, { deadlineMs: Date.now() + 1500 });
    assert.ok(rounds() <= 3, `the deadline was ignored (${rounds()} model calls)`);
  });

  await test('a failing tool does not end the task', async () => {
    const { engine } = engineWith([
      { toolCalls: [toolCall('1', 'explode', {})] },
      { answer: 'كملت بدون الأداة.' }
    ], {
      explode: { schema: { type: 'function', function: { name: 'explode', description: 'x', parameters: { type: 'object', properties: {} } } }, run: () => { throw new Error('boom'); } }
    });
    const res = await ask(engine);
    assert.strictEqual(res.ok, true);
    assert.ok(res.answer.includes('كملت'), 'the task died with the tool: ' + res.answer);
  });

  await test('malformed tool arguments do not end the task', async () => {
    const { engine } = engineWith([
      { toolCalls: [{ id: '1', type: 'function', function: { name: 'web_search', arguments: '{not json' } }] },
      { answer: 'تجاوزت الخطأ.' }
    ]);
    const res = await ask(engine);
    assert.strictEqual(res.ok, true);
    assert.ok(res.answer.includes('تجاوزت'), res.answer);
  });

  console.log('\nExtra tools plug in without touching the router:');

  await test('a registered tool is offered and runs', async () => {
    let ran = null;
    const { engine } = engineWith([
      { toolCalls: [toolCall('1', 'read_note', { path: 'a.txt' })] },
      { answer: 'قرأت الملف.' }
    ], {
      read_note: {
        schema: { type: 'function', function: { name: 'read_note', description: 'read', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
        run: (args) => { ran = args.path; return 'محتوى ' + args.path; }
      }
    });
    const res = await ask(engine);
    assert.strictEqual(ran, 'a.txt', 'the extra tool never ran');
    assert.ok(res.answer.includes('قرأت'), res.answer);
  });

  await test('a tool whose dependency is missing is never offered', async () => {
    const { engine, toolsOffered } = engineWith([{ answer: 'لا شيء.' }], {
      ghost: {
        schema: { type: 'function', function: { name: 'ghost', description: 'x', parameters: { type: 'object', properties: {} } } },
        available: () => false,
        run: () => 'never'
      }
    });
    await ask(engine);
    const offered = (toolsOffered()[0] || []);
    assert.ok(!offered.includes('ghost'), 'an unavailable tool was advertised: ' + JSON.stringify(offered));
  });

  await test('a turn that may use tools gets more time, unless the caller set a budget', async () => {
    const seen = [];
    const engine = createRoutingEngine({
      llmService: {
        dispatch: async (provider, params) => {
          seen.push({ tools: Boolean(params.tools), remaining: params.deadlineMs - Date.now() });
          return { ok: true, answer: 'جواب.', provider, model: params.model, finish_reason: 'stop' };
        },
        hasKeys: () => true, hasAnyProvider: () => true
      },
      safeCalculate: null,
      searchService: { performSearch: async () => ({ results: [] }) },
      keys: { groq: 1, llm7: 0, qwen: 0, kimi: 0 },
      models: { groqFlash: 'f', groqText: 't', groqCode: 't', groqVision: 'v' }
    });
    const messages = [{ role: 'user', content: 'ما آخر أخبار الطقس في عمّان اليوم؟' }];
    await engine.callAgent({ mode: 'flash', messages });
    await engine.callAgent({ mode: 'flash', messages, useTools: false });
    await engine.callAgent({ mode: 'flash', messages, budgetMs: 30000 });
    const [withTools, withoutTools, callerBudget] = seen;
    assert.ok(withTools.tools && !withoutTools.tools, 'setup: tools were not offered as expected ' + JSON.stringify(seen));
    assert.ok(withTools.remaining - withoutTools.remaining > 15000,
      `tools got ${withTools.remaining}ms, no tools ${withoutTools.remaining}ms`);
    assert.ok(callerBudget.tools && callerBudget.remaining <= 30000,
      `a caller-set 30s budget was stretched to ${callerBudget.remaining}ms`);
  });

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

// Why each kind of wrong answer is wrong, decided by the real code with no key.
//
// docs/company/quality-baseline.md found 50 wrong answers (21 students', 14
// sport) that did not fall from September to October. This runs INVENTED
// questions of those kinds (no owner's text) through the real chat route, the
// real RoutingEngine and the real llmService against a fake Groq over HTTP, and
// records for each what the model would be given today: the model it is first
// sent to, its reasoning effort, whether web_search is offered, the playbooks
// and the size of what is sent. Each case names what the question needs; the
// cause is read off the difference between that and what the request carries.
//
//   node scripts/test-wrong-answers.js          asserts the classification
//   node scripts/test-wrong-answers.js --table  prints it as a Markdown table
'use strict';

const http = require('http');
const assert = require('assert');
const express = require('express');
const { registerChatRoutes } = require('../src/routes/chat');
const { createChatPromptBuilder } = require('../src/services/systemPrompt');
const { createLlmService } = require('../src/services/llmService');
const { createRoutingEngine, classifyQjoRequest } = require('../src/agents/RoutingEngine');
const { detectNeeds } = require('../src/services/playbooks');
const { asksChangingFact } = require('../src/agents/liveFacts');

const calls = [];
const provider = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    calls.push(JSON.parse(raw || '{}'));
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'answered. ' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});

const FLASH = 'openai/gpt-oss-20b';
const TEXT = 'openai/gpt-oss-120b';
const textOf = (c) => (typeof c === 'string' ? c : (c || []).map((p) => p.text || '').join('\n'));
const tokens = (s) => Math.ceil(String(s || '').length / 3.5); // systemPrompt.estimateTokens; Arabic is under-counted

// What each question needs, written by hand from the failure the baseline names.
//   think  a worked answer: the larger model and full reasoning
//   live   a fact that changes: a search must be made
//   figure the page draws it: its playbook must be sent
//   do     the details are there: do the task, do not ask
//   chat   nothing special
const CASES = [
  // students: physics, circuits, calculus, plots (21 of the 50)
  ['phys-1', 'think', 'قذفت كرة للأعلى بسرعة ابتدائية 20 م/ث، احسب أقصى ارتفاع تصله والزمن الكلي للطيران'],
  ['phys-2', 'think', 'جسم كتلته 5 كغ على سطح أملس تؤثر فيه قوة 20 نيوتن بزاوية 30 درجة، جد التسارع'],
  ['phys-3', 'think', 'A 2 kg block slides down a 30 degree incline with friction coefficient 0.2. Find its acceleration.'],
  ['chat-5', 'chat', 'ليش بنشوف البرق قبل ما نسمع صوت الرعد؟'],
  ['circ-1', 'think', 'دارة فيها مقاومتان 4 اوم و6 اوم على التوالي مع بطارية 12 فولت، جد التيار والجهد على كل مقاومة'],
  ['circ-2', 'think', 'مقاومتان 6 و3 اوم على التوازي وموصولتان مع مقاومة 2 اوم على التوالي والبطارية 10 فولت، جد التيار الكلي'],
  ['circ-3', 'think', 'Find the equivalent resistance of 10, 20 and 30 ohm resistors in parallel, then the current from a 9 V source.'],
  ['calc-1', 'think', 'جد مشتقة الدالة f(x) = x^3 * sin(x)'],
  ['calc-2', 'think', 'احسب التكامل المحدد للدالة x^2 من 0 الى 3'],
  ['calc-3', 'think', 'Find the limit of (sin x)/x as x approaches 0 and explain why.'],
  ['calc-4', 'think', 'جد القيم العظمى والصغرى للدالة f(x) = x^3 - 6x^2 + 9x + 1'],
  ['plot-1', 'figure', 'ارسملي منحنى الدالة y = x^2 - 4x + 3'],
  ['plot-2', 'figure', 'Plot y = sin(x) and y = cos(x) on the same axes from 0 to 2 pi'],
  ['plot-3', 'figure', 'ارسم لي سطح ثلاثي الابعاد z = x^2 + y^2'],
  // sport and other facts that change (14 of the 50)
  ['live-1', 'live', 'مين فاز بمباراة ريال مدريد وبرشلونة امس؟'],
  ['live-2', 'live', 'كم نقطة عند ليفربول بالدوري الانجليزي هلا؟'],
  ['live-3', 'live', 'Who won the Champions League final this year?'],
  ['live-4', 'live', 'مين هداف الدوري الاردني هذا الموسم؟'],
  ['live-5', 'live', 'مين رئيس وزراء بريطانيا الان؟'],
  ['live-6', 'live', 'what is the latest iPhone and how much does it cost'],
  ['live-7', 'live', 'سعر الذهب اليوم في الاردن'],
  ['live-8', 'live', 'شو نتيجة مباراة الوحدات والفيصلي'],
  ['live-9', 'live', 'مين فاز امبارح بمباراة الاهلي؟'],
  ['live-10', 'live', 'آخر أخبار الطقس في عمان'],
  ['live-11', 'live', 'Who is the president of Brazil?'],
  ['live-12', 'live', 'what is the bitcoin price right now'],
  // near-misses: they mention a president, a result, today, the latest, and must not search
  ['near-1', 'near', 'what is a president and what does a president do'],
  ['near-2', 'near', 'who won the 2010 World Cup'],
  ['near-3', 'near', 'اشرح لي معنى كلمة مدرب'],
  ['near-4', 'near', 'solve x^2 - 5x + 6 = 0 today'],
  ['near-5', 'near', 'what is the current in a series circuit with a 12 V battery'],
  ['near-6', 'near', 'من هو أول رئيس للولايات المتحدة؟'],
  ['near-7', 'near', 'write me a poem about the latest chapter of my life'],
  // asks questions instead of the task (about 21): the details are in the message
  ['do-1', 'do', 'اكتبلي سيرة ذاتية، اسمي سامر، محاسب، خبرة 5 سنوات بشركة تجارية، بكالوريوس محاسبة من جامعة اليرموك، بتقن اكسل'],
  ['do-2', 'do', 'اعملي نظام غذائي لمدة اسبوع، وزني 85 كغ وطولي 175 وبدي انزل 5 كغ، ما عندي حساسية'],
  // nothing special
  ['chat-1', 'chat', 'شو رايك اروح ادرس هندسة ولا طب؟'],
  ['chat-2', 'chat', 'اشرحلي شو هو الاحتباس الحراري ببساطة'],
  ['chat-3', 'chat', 'hey, thanks for the help earlier'],
  ['chat-4', 'chat', 'what is the capital of France?']
];

let port;
async function ask(text, mode) {
  const before = calls.length;
  // The page's default (Normal) sends the fast model; Max sends the larger one.
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stream: true, mode, model: mode === 'normal' ? FLASH : TEXT, language: 'ar', messages: [{ role: 'user', content: text }] })
  });
  await res.text();
  return calls[before];
}

async function startApp(baseUrl) {
  const llmService = createLlmService({ groqKeys: ['g1'], groqBaseUrl: `${baseUrl}/groq/v1` });
  const routingEngine = createRoutingEngine({
    llmService, safeCalculate: (e) => String(e),
    searchService: { performSearch: async ({ rawQuery }) => ({ query: rawQuery, results: [] }) },
    keys: { groq: 1 },
    models: { groqFlash: FLASH, groqText: TEXT, groqCode: TEXT, groqVision: 'fake-vision' }
  });
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  registerChatRoutes(app, {
    hasAnyAiProvider: () => true, verifyFirebaseRequest: async () => true, enforceDailyUsage: async () => true,
    allowedModels: new Set([TEXT, FLASH]), defaultModel: TEXT, cleanMessages: (m) => m, routingEngine,
    knowledgeBaseService: { lookup: async () => ({ found: false }) },
    ...createChatPromptBuilder()
  });
  const server = http.createServer(app);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// The cause: what the request carries, against what the question needs.
function causes(need, f) {
  const out = [];
  if (need === 'think') {
    if (f.model === FLASH) out.push('fast model');
    if (f.effort === 'low') out.push('low reasoning');
    if (f.playbooks.includes('code') && !/code|كود|برمج|python|بايثون/i.test(f.text)) out.push('playbook wrong (code for a sum)');
  }
  if (need === 'live') out.push(f.searchedFirst ? 'searched first by the server' : (f.search ? 'search offered, left to the model' : 'no search offered'));
  if (need === 'figure' && !f.playbooks.includes('mathplot')) out.push('playbook missing');
  if (need === 'do' && !f.playbooks.length) out.push('no playbook for the task');
  return out;
}

async function measure(id, need, text, mode = 'normal') {
  const body = await ask(text, mode);
  assert.ok(body, `${id}: nothing reached the provider`);
  const msgs = [{ role: 'user', content: text }];
  const sys = body.messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n');
  const user = textOf([...body.messages].reverse().find((m) => m.role === 'user').content);
  const f = {
    id, need, mode, text,
    model: body.model,
    effort: body.reasoning_effort || 'default', // gpt-oss reasons at medium unless told
    search: (body.tools || []).some((t) => (t.function || t).name === 'web_search'),
    // the server ran web_search before this first model call: the assistant turn that asked for it, and its result
    searchedFirst: body.messages.some((m) => m.role === 'assistant' && (m.tool_calls || []).some((c) => c.function.name === 'web_search')) && body.messages.some((m) => m.role === 'tool'),
    forced: Boolean(body.tool_choice) && body.tool_choice !== 'auto', // a search the model must make
    intent: classifyQjoRequest({ messages: msgs, mode }).intent,
    playbooks: detectNeeds(msgs).playbooks,
    tokens: tokens(sys) + tokens(user)
  };
  f.causes = causes(need, f);
  return f;
}

async function run() {
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  const server = await startApp(`http://127.0.0.1:${provider.address().port}`);
  port = server.address().port;
  const rows = [];
  for (const [id, need, text] of CASES) rows.push(await measure(id, need, text));
  const max = [];
  for (const [id, need, text] of CASES.filter(([, n]) => n === 'think' || n === 'live')) max.push(await measure(id, need, text, 'max'));
  server.close(); provider.close();
  return { rows, max };
}

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log(`  \u2705 ${name}`); } catch (e) { fail++; console.log(`  \u274c ${name}\n     ${String(e.message).split('\n')[0]}`); }
};
const by = (rows, need) => rows.filter((r) => r.need === need);
const ids = (rows) => rows.map((r) => r.id).join(', ');

function assertClassification({ rows, max }) {
  const think = by(rows, 'think'), live = by(rows, 'live');
  console.log('\nStudents: a worked problem in the default (Normal) mode');
  check('every one is first sent to the larger model (gpt-oss-120b), as a hard question is', () => assert.deepStrictEqual(think.filter((r) => r.model !== TEXT).map((r) => r.id), [], `sent to the fast model: ${ids(think.filter((r) => r.model !== TEXT))}`));
  check('control: easy chit-chat and a plain fact still go to the fast model', () => assert.deepStrictEqual(by(rows, 'chat').filter((r) => r.model !== FLASH).map((r) => r.id), []));
  check('control: Max sends the same questions to the larger model, so the model is a decision and not a constant', () => assert.ok(by(max, 'think').every((r) => r.model === TEXT)));
  check('none is at low effort: low reasoning is not the cause for these', () => assert.deepStrictEqual(think.filter((r) => r.effort === 'low').map((r) => r.id), []));
  check('"الدالة" in a calculus question brings no code playbook', () => assert.deepStrictEqual(think.filter((r) => r.playbooks.includes('code')).map((r) => r.id), []));
  check('a calculus question is no larger than a physics one by the code playbook (it was +700 tokens)', () => {
    const calc = rows.find((r) => r.id === 'calc-2'), phys = rows.find((r) => r.id === 'phys-1');
    assert.ok(calc.tokens - phys.tokens < 300, `${calc.tokens} against ${phys.tokens}`);
  });
  console.log('\n"الدالة" is maths, "دالة" in code is code');
  const needs = (text) => detectNeeds([{ role: 'user', content: text }]);
  for (const m of ['اشتق الدالة f(x)=x^2 sin x', 'احسب تكامل الدالة 1/x من 1 إلى e', 'ما مجال الدالة ln(x-2)']) {
    check(`no code playbook or overlay: ${m}`, () => { const n = needs(m); assert.ok(!n.code && !n.playbooks.includes('code'), JSON.stringify(n.playbooks)); });
  }
  for (const m of ['اكتبلي دالة بايثون ترتب قائمة', 'اكتب دالة تعكس النص', 'write a function that reverses a string']) {
    check(`code (control): ${m}`, () => { const n = needs(m); assert.ok(n.code && n.playbooks.includes('code')); });
  }
  console.log('\nFigures');
  check('a function to plot gets the mathplot playbook (positive control: the playbook is chosen when asked for)', () => assert.deepStrictEqual(by(rows, 'figure').filter((r) => !r.playbooks.includes('mathplot')).map((r) => r.id), []));
  console.log('\nFacts that change (sport, office-holders, "latest")');
  check('web_search is offered on every one', () => assert.deepStrictEqual(live.filter((r) => !r.search).map((r) => r.id), []));
  check('every one is searched by the server before the model answers (a search call and its result are in the first request)', () => assert.deepStrictEqual(live.filter((r) => !r.searchedFirst).map((r) => r.id), []));
  check('every one is at the default reasoning effort, not low', () => assert.deepStrictEqual(live.filter((r) => r.effort !== 'default').map((r) => r.id), []));
  check('there are 12 of them, 6 in Arabic (a count that cannot drift to nothing)', () => assert.ok(live.length >= 12 && live.filter((r) => /[\u0600-\u06FF]/.test(r.text)).length >= 6));
  check('Max searches first too, at default effort', () => assert.ok(by(max, 'live').every((r) => r.effort === 'default' && r.search && r.searchedFirst)));
  console.log('\nNear-misses: a definition, history, maths and a poem do not search');
  check('none is searched first (their model and effort are the old ones: maths still thinks, the rest are low)', () => assert.deepStrictEqual(by(rows, 'near').filter((r) => r.searchedFirst).map((r) => r.id), []));
  check('control: web_search is still offered to them, so the model can choose', () => assert.ok(by(rows, 'near').every((r) => r.search)));
  check('control: chit-chat is not searched either', () => assert.ok(by(rows, 'chat').every((r) => !r.searchedFirst)));
  console.log('\nThe decision itself (liveFacts.js), message by message');
  for (const m of ['مين رئيس فرنسا؟', 'سعر الدولار اليوم؟', 'بالدوري الانجليزي شو ترتيب ليفربول هلا؟', 'who is the coach of Real Madrid?', 'What is the weather in Amman tomorrow?']) {
    check(`searches: ${m}`, () => assert.ok(asksChangingFact(m)));
  }
  for (const m of ['ما الفرق بين الرئيس والوزير؟', 'اليوم تعلمت الجمع، اشرحه', 'من كان رئيس الوزراء في 1990؟', 'who was the president in 1990?', 'The final answer is 4, check my work', 'my manager is mean to me, advice?', 'how to find the version of node installed', 'احسب الان قيمة التكامل من 0 الى 1', 'ما هو تعريف الملك']) {
    check(`does not search: ${m}`, () => assert.ok(!asksChangingFact(m)));
  }
  check('a 200k-character paste with no match is judged in linear time (under 300 ms), Arabic and English', () => {
    const start = Date.now();
    asksChangingFact('a '.repeat(100000)); asksChangingFact('مرحبا '.repeat(40000)); asksChangingFact('x'.repeat(200000));
    assert.ok(Date.now() - start < 300, `took ${Date.now() - start} ms`);
  });
  console.log('\nThe task, with the details in the message');
  check('a CV gets its playbook (control)', () => assert.ok(rows.find((r) => r.id === 'do-1').playbooks.includes('cv')));
  check('a diet plan gets the diet playbook', () => assert.deepStrictEqual(rows.find((r) => r.id === 'do-2').playbooks, ['diet']));
  check('a diet plan with details in the message gets the diet playbook', () => assert.ok(needs('بدي خطة أكل أسبوعية 1800 سعرة، نباتي، 3 وجبات').playbooks.includes('diet')));
  check('calories alone call for it: 2000 سعرة على 4 وجبات', () => assert.ok(needs('وزعلي 2000 سعرة على 4 وجبات باليوم').playbooks.includes('diet')));
  check('a long pasted text with no calorie word is judged in linear time (200k characters under 300 ms); a plan with calories at its end still chooses diet', () => {
    const filler = 'a '.repeat(100000);
    const start = Date.now();
    needs(filler + ' summarise this');
    const took = Date.now() - start;
    assert.ok(took < 300, `took ${took} ms`);
    assert.ok(needs(filler + ' بدي خطة 1800 سعرة').playbooks.includes('diet'), 'control: calories and a plan word at the end still choose diet');
  });
  check('a calorie fact is not a plan: how many calories in a banana / كم سعرة في الموزة', () => assert.ok(!needs('how many calories in a banana').playbooks.includes('diet') && !needs('كم سعرة في الموزة').playbooks.includes('diet') && !needs('كم سعرات التمرة الوحدة؟').playbooks.includes('diet')));
  check('control: a question about a function or a chat gets no diet playbook', () => assert.ok(!needs('ما مجال الدالة ln(x-2)').playbooks.includes('diet') && !needs('كيفك اليوم؟').playbooks.includes('diet')));
  console.log(`\n${pass} passed, ${fail} failed`);
  return fail === 0;
}

const table = ({ rows }) => {
  const kinds = { near: 'a near-miss (no search)', think: 'a worked problem', live: 'a fact that changes', figure: 'a figure', do: 'the task itself', chat: 'nothing special' };
  const head = '| id | needs | model | effort | search offered | intent | playbooks | tokens | cause |\n|---|---|---|---|---|---|---|---|---|';
  return `${head}\n${rows.map((r) => `| ${r.id} | ${kinds[r.need]} | ${r.model.split('/')[1]} | ${r.effort} | ${r.search ? 'yes' : 'no'} | ${r.intent} | ${r.playbooks.join(', ') || '-'} | ${r.tokens} | ${r.causes.join('; ') || '-'} |`).join('\n')}`;
};

if (require.main === module) {
  run().then((result) => {
    if (process.argv.includes('--table')) return console.log(table(result));
    process.exit(assertClassification(result) ? 0 : 1);
  });
}

module.exports = { CASES, run, FLASH, TEXT };

// The router decides which system overlay an answer is written under, so a
// misclassification silently degrades the answer rather than failing loudly.
//
// It shipped classifying the WHOLE message, including material the user merely
// pasted for reference. A CV pasted for formatting was routed to the coding
// agent at 90% confidence because it contained "الموقع: عمان" (a location
// field, not a website), "Git / VS Code" (a listed skill) and "قاعدة بيانات
// MIMIC" (the dataset a device was trained on). The request was to format a CV.
const { routeUserRequestDeterministic } = require('../src/agents/RoutingEngine');

let pass = 0, fail = 0;
const agentOf = (text) => {
  const d = routeUserRequestDeterministic([{ role: 'user', content: text }]);
  return d ? d.targetAgent : 'null';
};

function wants(agent, text, label) {
  const got = agentOf(text);
  const good = got === agent;
  good ? pass++ : fail++;
  console.log(`  ${good ? '✅' : '❌'} ${label}`);
  if (!good) console.log(`     wanted ${agent}, got ${got} — ${JSON.stringify(text.slice(0, 70))}`);
}

const CODE = (t, label) => wants('qcode', t, label || t);
const NOT_CODE = (t, label) => {
  const got = agentOf(t);
  const good = got !== 'qcode';
  good ? pass++ : fail++;
  console.log(`  ${good ? '✅' : '❌'} ${label || t}`);
  if (!good) console.log(`     wanted anything but qcode, got ${got} — ${JSON.stringify(t.slice(0, 70))}`);
};

console.log('\nReal coding requests still reach the coding agent:');
CODE('اعمللي دالة بايثون تجمع رقمين');
CODE('سويلي كلاس جافاسكريبت');
CODE('صححلي الكود هذا');
CODE('اكتبلي سكربت يرتب الملفات');
CODE('عندي bug بالـ React ما بعرف احله');
CODE('fix this stack trace: TypeError at line 4');
CODE('اعملي API endpoint بـ Express');
CODE('ابنيلي موقع ويب بسيط');
CODE('كيف اعمل deploy على Render؟');
CODE('```js\nconst a = 1;\n```\nشو الغلط هون؟', 'a fenced code block anywhere counts');
CODE('refactor this function please');
CODE('اشرحلي شو بعمل git rebase');
CODE('بدي اتعلم بايثون من الصفر');
CODE('اعمللي تطبيق موبايل بـ Flutter');
CODE('Traceback (most recent call last): File "a.py", line 2', 'a raw traceback counts');
CODE('حللي مشكلة بالـ npm install');

console.log('\nEveryday requests are not mistaken for coding:');
NOT_CODE('اعمللي CV احترافي من هاي المعلومات');
NOT_CODE('اعملي سيرة ذاتية من المعلومات هاي');
NOT_CODE('الموقع: عمان، الأردن. الهاتف: +962 77 000 0000', 'a CV location line is not a website');
NOT_CODE('المهارات التقنية: SolidWorks، MATLAB، Git / VS Code، Fusion 360', 'listing Git as a skill is not a code request');
NOT_CODE('الجهاز مدرب على قاعدة بيانات MIMIC السريرية', 'describing a database is not requesting one');
NOT_CODE('اعمللي ايميل رسمي للمدير');
NOT_CODE('وين موقع الشركة بالضبط؟', 'موقع meaning location');
NOT_CODE('شو أفضل موقع لحجز الطيران؟', 'asking about a website is not asking for code');
NOT_CODE('اعمللي جدول مصاريف شهري');
NOT_CODE('لخصلي هاي المقالة');
NOT_CODE('اعمللي عرض تقديمي عن الشركة');
NOT_CODE('احكيلي قصة قصيرة');

console.log('\nThe CV that triggered this, end to end:');
const CV = [
  'الاسم: سامي المصري',
  'المسمى الوظيفي: طالب هندسة ميكاترونكس، مطور ذكاء اصطناعي، ومؤسس ومدير تقني.',
  'معلومات الاتصال: الموقع: عمان، الأردن. الهاتف: +962 77 000 0000.',
  'النبذة: مؤسس ورئيس التكنولوجيا لشركة HealthBand، جهاز صحي قابل للارتداء.',
  'الخبرات: قيادة الرؤية التقنية لجهاز مدعوم بالذكاء الاصطناعي التنبؤي (تم تدريبه على قاعدة بيانات MIMIC السريرية).',
  'مهندس تكاليف – موقع example-co.com: إدارة ميزانيات المشاريع.',
  'التعليم: بكالوريوس هندسة ميكاترونكس – الجامعة الأردنية.',
  'المهارات التقنية: تصميم أنظمة التحكم، SolidWorks، Fusion 360، MATLAB، Multisim، Git / VS Code.',
  'اللغات: العربية (الأم)، الإنجليزية (C2).',
  '',
  'اعمللي CV احترافي من هاي المعلومات.'
].join('\n');
NOT_CODE(CV, 'a pasted CV asking for a CV is not a coding request');

console.log('\nPasted reference material does not override the instruction:');
NOT_CODE('لخصلي هاد المقال:\n\n' + 'React و Node.js و Python من أشهر أدوات تطوير الويب اليوم. '.repeat(12),
  'summarising an article about code is not a code request');
CODE('اعمللي دالة بايثون:\n\n' + 'هاي بيانات المشروع بدون أي علاقة بالبرمجة. '.repeat(12),
  'a code request survives a long pasted body');

// ── The newest message decides; earlier ones only when it refers back ──
// The router read the last three user messages and the classifier the last
// four, so after one coding question every message for the next three or four
// was a coding request: the router's hint, the code pipeline, full reasoning.
const { classifyQjoRequest } = require('../src/agents/RoutingEngine');
const { isContextualTransformRequest } = require('../src/agents/contextContinuity');
const after = (...texts) => texts.flatMap((t, i) => (i < texts.length - 1 ? [{ role: 'user', content: t }, { role: 'assistant', content: 'Here it is.' }] : [{ role: 'user', content: t }]));
function routes(messages, want, label) {
  const decision = routeUserRequestDeterministic(messages);
  const route = classifyQjoRequest({ messages, mode: 'flash', routingDecision: decision });
  const got = `${decision.targetAgent}/${route.intent}`;
  const good = got === want;
  good ? pass++ : fail++;
  console.log(`  ${good ? '✅' : '❌'} ${label}`);
  if (!good) console.log(`     wanted ${want}, got ${got}`);
}
const PY = 'اكتبلي دالة بايثون بتعكس نص';

console.log('\nAfter a coding question, a new question is judged on its own:');
routes(after(PY), 'qcode/code', 'control: the coding question itself is code');
routes(after(PY, 'شو عاصمة اليابان؟'), 'general/general', 'شو عاصمة اليابان؟');
routes(after(PY, 'أنا متوتر من الامتحان بكرا'), 'general/general', 'أنا متوتر من الامتحان بكرا');
routes(after(PY, 'why is the sky blue?'), 'general/general', 'why is the sky blue?');
routes(after(PY, 'شو عاصمة اليابان؟', 'make it shorter'), 'general/general', 'a follow-up to the new question follows the new question, not the code before it');
// A connective opens a follow-up only when little follows it (followUp.js).
for (const text of ['طيب شو عاصمة اليابان؟', 'و شو عاصمة اليابان؟', 'ok what is the capital of Japan?', 'so why is the sky blue?', 'مين الرئيس السابق لأمريكا؟']) {
  routes(after(PY, text), 'general/general', `${text} — a new question that opens with a connective`);
}

console.log('\nA follow-up still carries the request it follows:');
routes(after(PY, 'خليها أقصر'), 'qcode/code', 'خليها أقصر');
routes(after(PY, 'make it shorter'), 'qcode/code', 'make it shorter');
routes(after(PY, 'make it shorter', 'and add comments'), 'qcode/code', 'a chain of follow-ups reaches back to the request');
routes(after('what is 17 * 23?', 'and why?'), 'general/math', 'math carries over to a follow-up too');

// After code, a short message about an error, a failure or the code itself
// works on that code although it names no language.
for (const text of ['it gives an error', 'ما زبطت معي', 'طلعلي خطأ', 'IndexError: string index out of range', 'can you add type hints', 'شو بتعمل هاي الدالة؟']) {
  routes(after(PY, text), 'qcode/code', `after code: ${text}`);
}
routes(after(PY, 'it gives an error', 'طلعلي خطأ'), 'qcode/code', 'two messages about the code reach back to it');
routes(after('شو عاصمة اليابان؟', 'it gives an error'), 'general/general', 'control: after a question that is not code, "it gives an error" is not code');
routes(after(PY, 'شو عاصمة اليابان؟', 'ما زبطت معي'), 'general/general', 'control: a question between them ends the code');
routes(after('احسب 5+3', 'it gives an error'), 'general/general', 'control: after a sum, "it gives an error" does not take the sum with it');

// The window: a request and five follow-ups to it; a sixth leaves the request.
const FOLLOW = ['make it shorter', 'make it longer', 'make it simpler', 'again', 'one more'];
routes(after(PY, ...FOLLOW), 'qcode/code', 'five follow-ups still reach the request');
routes(after(PY, ...FOLLOW, 'make it clearer'), 'general/general', 'a sixth is past the window');
{
  // The page writes its own notes after the person's words; a follow-up is
  // read on the words (ownWords.js), however long the note.
  const noted = after(PY, 'make it shorter\n\n[Image(s) attached and analyzed when this was sent] ' + 'a picture of a cat. '.repeat(30));
  const route = classifyQjoRequest({ messages: noted, mode: 'flash', routingDecision: null });
  route.intent === 'code' ? pass++ : fail++;
  console.log(`  ${route.intent === 'code' ? '✅' : '❌'} a follow-up with the page's note after it is still a follow-up (${route.intent})`);
}

console.log('\nWords, not letters — and code only where it is code:');
NOT_CODE('ارسملي الدالة y = x^2', 'دالة: a function in math');
// The router never read these as code; the classifier did, from "موقع",
// "terminal" and "error" by themselves.
routes(after('وين موقع البتراء؟'), 'general/general', 'موقع: a location');
routes(after('what is terminal velocity?'), 'general/general', 'what is terminal velocity?');
routes(after('what is the margin of error in a poll?'), 'general/general', 'what is the margin of error in a poll?');
NOT_CODE('explain a chemical reaction', 'react inside reaction');
NOT_CODE('how should I react to criticism?', 'react, the verb');
NOT_CODE('how do I express my feelings?', 'express, the verb');
NOT_CODE('شو هي العدالة الاجتماعية؟', 'دالة inside العدالة');
NOT_CODE('شو أسباب الركود الاقتصادي؟', 'كود inside الركود');
NOT_CODE('مين هو الخوارزمي؟', 'the mathematician, not an algorithm');
NOT_CODE('what is angular momentum?');
NOT_CODE('how do I remove rust from my car?');
NOT_CODE('compile a list of books about history');
NOT_CODE('اكتبلي سكربت فيديو عن السفر', 'a video script');
CODE('write a function that reverses a string');
CODE('build a react app with hooks');
CODE('fix this error in my code');
CODE('create a class in Java');
CODE('def reverse(s): return s[::-1]', 'a definition is code');
// Code without a language's name: an exception, a failing program, tests.
for (const text of ['ModuleNotFoundError: No module named numpy', 'IndexError: list index out of range', 'KeyError: name', 'my program throws an exception',
  'undefined is not a function', 'CORS error when calling fetch', 'write unit tests for this function', 'عندي error بالبرنامج']) {
  routes(after(text), 'qcode/code', text);
}
// A framework by its name: capitalised inside a sentence, set up, or "في".
for (const text of ['what is React?', 'كيف اعمل useState في React', 'كيف اعمل routing في react', 'how do I set up express', 'rust ownership explained', 'رتب هاي المصفوفة', 'install python3 on ubuntu']) {
  routes(after(text), 'qcode/code', text);
}
for (const text of ['React to the news calmly, he said.', 'Express your feelings honestly', 'is Taylor Swift touring?', 'Rust is forming on my bike',
  'the terror of the night', 'Java island in Indonesia', 'write a program for the conference', 'use express delivery for the parcel']) {
  routes(after(text), 'general/general', `not code: ${text}`);
}
for (const [text, want] of [['what are you doing tonight?', 'general/general'], ['شو أكبر منطقة بالأردن؟', 'general/general'], ['اشرح الحرب العالمية الثانية', 'general/general'], ['I read it in the newspaper', 'general/general'],
  ['شو أكبر منطقه بالأردن؟', 'general/general'], ['اشرحلي بنية الذرة', 'general/general'], ['قديش بنيته قوية؟', 'general/general']]) {
  routes(after(text), want, `${text} (doi in doing, منطق in منطقة/منطقه, نية in الثانية/بنية, paper in newspaper)`);
}
// The other side: the words themselves still count.
for (const [text, want] of [['هاد سؤال منطقي ولا لأ؟ لغز', 'general/reasoning'], ['شو النية من كلامه؟', 'general/social'], ['بدي اوراق بحثية عن المناخ', 'qspark/research']]) {
  routes(after(text), want, text);
}

console.log('\nMath in English:');
for (const text of ['solve the integral of x*sin(x) dx', 'integrate x*sin(x)', 'differentiate x ln x', 'simplify (a+b)(a-b)', 'solve 2x + 3 = 7', 'what is the derivative of x^3?', 'explain the quadratic equation']) {
  const route = classifyQjoRequest({ messages: after(text), mode: 'flash', routingDecision: routeUserRequestDeterministic(after(text)) });
  route.mathIntent ? pass++ : fail++;
  console.log(`  ${route.mathIntent ? '✅' : '❌'} ${text} is math`);
}
for (const text of ['how do I integrate into a new team?', 'simplify this paragraph for me', 'differentiate between empathy and sympathy', 'بالنسبة لي شو رأيك بالسفر؟']) {
  const route = classifyQjoRequest({ messages: after(text), mode: 'flash', routingDecision: routeUserRequestDeterministic(after(text)) });
  !route.mathIntent ? pass++ : fail++;
  console.log(`  ${!route.mathIntent ? '✅' : '❌'} ${text} is not math`);
}

console.log('\nThe continuity lock is for edits of the last answer, not new questions:');
for (const [text, lock] of [
  ['what is the capital of Japan? give me more information', false], ['حدثني حول تاريخ مصر قبل الإسلام', false],
  ['اكتب مقال حول مستقبل الطاقة', false], ['كم معدل البطالة بالأردن هذا العام؟', false], ['شو معدل الفائدة على هذا القرض؟', false],
  ["update this table with today's prices", false], ['حدّث هذا الجدول بأسعار اليوم', false], // an edit that needs fresh data searches
  ['مين غيره فاز بجائزة نوبل؟', false], ['اكتب عن أينشتاين ونيوتن وغيرهم', false], ['شو في دول غيرها بتحكي عربي؟', false],
  ['شو الكواكب اللي حوله؟', false], ['ما هي الأقمار حولها', false], ['حدثني عن عدله', false], // who else, around it, his justice
  ['حوله لجدول', true], ['make it a table', true], ['لخص اللي فوق', true], ['translate this', true], ['اختصر الرد السابق بنقاط', true], ['رتّبها بنقاط', true],
  ['خليه أقصر', true], ['غيره لأسلوب رسمي', true], ['طيب ترجمها للإنجليزي', true],
  ['تمام، حوله لجدول', true], ['حلو، خليه أقصر', true], ['شكرا! هلق ترجمه', true], ['okay حوله لجدول', true], ['«حوله لجدول»', true], ['عدله شوي', true], ['لخصه', true], // a courtesy first
  ['غيره مين؟', false], ['حوله شو في؟', false], ['خليه يجي بكرا', false], ['خليها تروح', false] // a question word or a verb after it
]) {
  const good = isContextualTransformRequest(text) === lock;
  good ? pass++ : fail++;
  console.log(`  ${good ? '✅' : '❌'} ${text} — ${lock ? 'locked' : 'free'}`);
}

// ── The base router is the floor for ordinary messages ──
// A rule that sends ordinary messages to code is narrowed until it does not;
// missing a rare code case is the cheaper mistake.
const isCodeRoute = (messages) => {
  const decision = routeUserRequestDeterministic(messages);
  return decision.targetAgent === 'qcode' || classifyQjoRequest({ messages, mode: 'flash', routingDecision: decision }).intent === 'code';
};
function floor(list, wantCode, label) {
  for (const texts of list) {
    const got = isCodeRoute(after(...texts));
    const good = got === wantCode;
    good ? pass++ : fail++;
    console.log(`  ${good ? '✅' : '❌'} ${label}: ${texts[texts.length - 1]}`);
  }
}
console.log('\nAfter code, an ordinary message is not about the code:');
floor(['I have a test tomorrow and I\'m stressed', 'what was Saudi oil output last year?', 'I failed my driving test', 'check my email for errors: Dear sir, I am writting to you',
  'any comments on my essay?', 'what does null hypothesis mean?', 'my car shows a warning light', 'شو الغلط بهالجملة: انا ذهبت الى المدرسه', 'عندي اختبارات بكرا وخايف',
  'the program at my university got cancelled, what should I do?', 'why did the Titanic fail?', 'my phone won\'t work after the update', 'شو بتعمل لما تزهق؟',
  'how do I optimize my sleep?', 'ما زبطت معي الطبخة'].map((t) => [PY, t]), false, 'not code');
floor(['TypeError: unsupported operand', 'line 3 says invalid syntax', 'طلع عندي ايرور بالسطر 5', 'the output is wrong', 'doesn\'t work', 'مش شغال', 'ما اشتغل', 'add docstrings', 'what about edge cases?']
  .map((t) => [PY, t]), true, 'about the code');
floor([[PY, 'it gives an error', 'still an error', 'still not working', 'another error']], true, 'a run of short failures stays with the code');

console.log('\nA name is not a framework; a framework beside what makes it one is:');
floor([['what did Jonathan Swift write?'], ['who wrote Gulliver\'s Travels, was it Swift?'], ['tell me about the Rust shooting on the film set'], ['have you watched Django Unchained?'],
  ['I took the Orient Express to Venice'], ['is American Express accepted in Japan?'], ['I met Rust yesterday'], ['my friend Swift is coming'], ['how do I use angular momentum conservation here?'],
  ['I love Vue cinema'], ['عندي React بسيط تجاه الضوء'], ['the American Express app keeps logging me out'], ['a Jonathan Swift tutorial for my essay'], ['the Orient Express route map'], ['Jakarta is on Java'], ['I visited Java last year'], ['the island of Java'], ['best Java coffee beans']], false, 'not code');
floor([['how to use React hooks'], ['Vue vs React'], ['Django or Flask?'], ['learn Svelte'], ['كيف استخدم react'], ['شو هو React؟'], ['how do I install flask'], ['express middleware'],
  ['rust borrow checker'], ['is Rust better than Go?'], ['what is Swift?'], ['Ok Swift question: how do optionals work?'], ['install java17'], ['java 8 streams']], true, 'code');

console.log('\nAn error beside a code word, and a program written to do something:');
floor([['my dishwasher shows error code E24'], ['what is the error function erf(x)?'], ['خطأ في برنامج الرحلة'], ['في غلط ببرنامج الامتحانات'], ['the law raises an important exception'],
  ['write a program for my wedding'], ['write a program for the conference']], false, 'not code');
floor([['عندي error بالبرنامج'], ['البرنامج بيعطيني خطأ'], ['write a program in C'], ['write a program that sorts numbers'], ['write a program to sort numbers'], ['write a program for sorting numbers'],
  ['write me a program'], ['write tests for my function'], ['عندي مشكلة بكودي'], ['صلحلي بكودي'], ['شو رأيك بكودي؟'], ['ساعدني بكود']], true, 'code');
routes(after('عطيني بلغز'), 'general/reasoning', 'عطيني بلغز: لغز after ب');

// ── Time: a long message must not hold the event loop ──
// Patterns that backtracked held every other request: "function" and 48,000
// spaces took 2.5 s in the router, "hi", spaces and "React" 4.4 s in the
// classifier, "رتب" repeated 2.2 s — 38 to 73 s at 200,000 characters. Every
// classifier now reads a message's first 2,000 and last 500 characters
// (topicWords.bounded), and the patterns are linear besides. Warmed first,
// so what is timed is the reading, not compiling the patterns.
{
  const { hardCodeSignal, codeAsked, mathAsked } = require('../src/agents/requestSignals');
  const { pageTopic } = require('../public/domain/topicWords');
  const reads = {
    route: (t) => routeUserRequestDeterministic([{ role: 'user', content: t }]),
    classify: (t) => classifyQjoRequest({ messages: [{ role: 'user', content: t }], mode: 'flash' }),
    lock: (t) => isContextualTransformRequest(t), page: (t) => pageTopic(t, 'codeBudget'),
    hard: (t) => hardCodeSignal(t), asked: (t) => codeAsked(t), math: (t) => mathAsked(t)
  };
  const attacks = (n) => ({
    spaces: ' '.repeat(n), 'function, spaces': 'function' + ' '.repeat(n), 'function, newlines': 'function' + '\n'.repeat(n),
    'hi, spaces, React': 'hi' + ' '.repeat(n) + 'React', 'رتب repeated': 'رتب'.repeat(Math.ceil(n / 3)),
    'function (': 'function ('.repeat(n / 10), '(a+': '(a+'.repeat(Math.ceil(n / 3)), 'aError ': 'aError '.repeat(Math.ceil(n / 7))
  });
  for (const read of Object.values(reads)) read('warm up: write a python function, React hooks, رتب المصفوفة');
  const LIMIT_MS = 15;
  let slowest = { ms: 0 };
  for (const n of [48000, 200000]) {
    for (const [attack, text] of Object.entries(attacks(n))) {
      for (const [name, read] of Object.entries(reads)) {
        const started = process.hrtime.bigint();
        read(text);
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        if (ms > slowest.ms) slowest = { ms: Math.round(ms * 10) / 10, n, attack, name };
      }
    }
    if (slowest.ms >= LIMIT_MS) break; // already red: the 200,000 run would take minutes
  }
  const good = slowest.ms < LIMIT_MS;
  good ? pass++ : fail++;
  console.log(`\n  ${good ? '✅' : '❌'} 48,000 and 200,000 characters of each attack: every read under ${LIMIT_MS} ms (slowest ${JSON.stringify(slowest)})`);

  // The bound is what is read: code past the first 2,000 characters and
  // before the last 500 is not seen; at either end it is.
  const filler = 'lorem ipsum dolor sit amet '.repeat(200);
  const fence = '\n```js\nconst a = 1;\n```\n';
  const seen = [filler + fence + filler, fence + filler + filler, filler + filler + fence].map((t) => routeUserRequestDeterministic(t).targetAgent);
  const bound = seen.join() === 'general,qcode,qcode';
  bound ? pass++ : fail++;
  console.log(`  ${bound ? '✅' : '❌'} a fenced block in the middle of a 10,000-character message is past the bound; at its start or end it is read (${seen.join()})`);
}

// ── Which pipeline answers, through the real engine ──
// OpenRouter's code slot opens the code pipeline and Cerebras opens Flash's,
// so the first provider asked says which one the engine chose. The provider
// call is the stub, nothing above it.
const { createRoutingEngine } = require('../src/agents/RoutingEngine');
const dispatched = [];
const engine = createRoutingEngine({
  llmService: { dispatch: async (provider, params) => { dispatched.push({ provider, model: params.model, effort: params.reasoning_effort }); return { ok: true, answer: 'ok', provider, model: params.model, finish_reason: 'stop' }; } },
  keys: { openrouter: 1, cerebras: 1 },
  models: { openrouterCode: 'or-code', openrouterText: 'or-text', openrouterFlash: 'or-flash', cerebrasFlash: 'cb-flash', cerebrasText: 'cb-text' }
});
async function answeredBy(messages) {
  dispatched.length = 0;
  await engine.callAgent({ mode: 'flash', messages: [{ role: 'system', content: 'You are Qjo.' }, ...messages], routingDecision: routeUserRequestDeterministic(messages), useTools: false });
  return `${dispatched[0].model}/${dispatched[0].effort || 'default'}`;
}
async function pipeline(messages, want, label) {
  const got = await answeredBy(messages);
  const good = got === want;
  good ? pass++ : fail++;
  console.log(`  ${good ? '✅' : '❌'} ${label}`);
  if (!good) console.log(`     wanted ${want}, got ${got}`);
}

(async () => {
  console.log('\nThe pipeline and the reasoning, through the engine:');
  await pipeline(after(PY), 'or-code/default', 'control: the coding question is answered by the code pipeline, thinking');
  await pipeline(after(PY, 'make it shorter'), 'or-code/default', 'and so is a follow-up to it');
  for (const text of ['شو عاصمة اليابان؟', 'أنا متوتر من الامتحان بكرا']) await pipeline(after(PY, text), 'cb-flash/low', `${text} after it: Flash, thinking lightly`);
  await pipeline(after('ارسملي الدالة y = x^2'), 'cb-flash/low', 'ارسملي الدالة y = x^2: Flash');
  await pipeline(after('solve the integral of x*sin(x) dx'), 'cb-flash/default', 'English math: Flash, thinking');

  console.log('\n========================================');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

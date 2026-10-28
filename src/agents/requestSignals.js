// What a message asks for, as the router and the classifier read it.
//
// Both read the last three or four user messages together, so one coding
// question made the next ones code too: after "اكتبلي دالة بايثون بتعكس نص",
// "شو عاصمة اليابان؟", "أنا متوتر من الامتحان بكرا" and "why is the sky
// blue?" were each sent as a coding request — the router's hint, the code
// pipeline and full reasoning. Intent is now the newest message's; the ones
// before it count only while the newest refers back to them ("make it
// shorter", "وبالجافا؟").
//
// And they matched letters, not words: "دالة" in "العدالة", "كود" in
// "الركود", "doi" in "doing", "منطق" in "منطقة", "نية" in "الثانية"; and
// words with a second meaning — دالة in "ارسملي الدالة y = x^2", react in
// "how should I react", express, rust, swift, angular momentum, "compile a
// list". Words are matched as words (public/domain/topicWords.js), and a word
// that is also something else counts only with what makes it code.
//
// Every check reads a message as topicWords.bounded() gives it — its first
// 2,000 and last 500 characters — so no pattern meets a 200,000-character
// paste whole. The patterns themselves keep their quantifiers bounded and
// never put two that can match the same run side by side.
'use strict';

const { matcher, bounded } = require('../../public/domain/topicWords');
const { isFollowUp } = require('../services/followUp');

// A request and up to five follow-ups to it: "make it shorter", "add
// comments", "now in TypeScript"… still reach the request they work on.
const MAX_WINDOW = 6;

// ── About the code before ──
// After code, a message that works on that code without naming a language:
// trouble pointing at it ("it gives an error", "the output is wrong"), the
// code itself ("شو بتعمل هاي الدالة؟", "line 3 says…", "add type hints"), an
// exception's name, or a few words of failure and nothing else ("ما زبطت
// معي", "doesn't work", "still an error"). "I failed my driving test", "ما
// زبطت معي الطبخة", "any comments on my essay?" and "Saudi oil output" are
// not about the code, whatever came before them.
const NOT_AR = '(?<![\\u0621-\\u064A])';
const TROUBLE = new RegExp(`\\b(?:errors?|exceptions?|crash(?:es|ed|ing)?|fail(?:s|ed|ing)?|bugs?|broken|wrong)\\b|\\b(?:doesn'?t|does\\s+not|isn'?t|is\\s+not|won'?t|didn'?t|not)\\s+(?:work|working|run|running|compile)\\b|${NOT_AR}(?:خطأ|خطا|غلط|ايرور|إيرور|مشكلة)|${NOT_AR}(?:ما\\s?(?:زبط|ظبط|اشتغل|بشتغل|بيشتغل)|مش\\s?(?:زابط|شغال|ظابط))`, 'i');
const AT_IT = new RegExp(`\\b(?:it|this|that)\\b|${NOT_AR}(?:هاد|هاي|هيك)(?![\\u0621-\\u064A])`, 'i');
const THE_CODE = new RegExp(`\\b(?:the|this|that|your|my)\\s+(?:function|code|script|loop|method|class|output)\\b|\\bline\\s+\\d+|\\bstack\\s+trace\\b|\\b(?:add|remove|with|without)\\s+(?:type\\s+hints?|docstrings?|comments|tests|error\\s+handling|logging)\\b|\\btype\\s+hints?\\b|\\bdocstrings?\\b|${NOT_AR}(?:ال|هال|بال)?(?:كود|دالة|داله|فنكشن)(?![\\u0621-\\u064A])|${NOT_AR}(?:ال|بال)سطر`, 'i');
const FAILURE_WORDS = new Set(['ما', 'مش', 'زبطت', 'زبط', 'ظبطت', 'ظبط', 'اشتغل', 'اشتغلت', 'بشتغل', 'بيشتغل', 'شغال', 'زابط', 'معي', 'معاي', 'برضو', 'لسا', 'لسه', 'كمان', 'طلع', 'طلعلي', 'طلعت', 'عندي', 'خطأ', 'خطا', 'غلط', 'ايرور',
  'it', 'still', 'again', 'another', 'an', 'a', 'error', 'errors', "doesn't", 'doesnt', 'does', 'not', "isn't", "won't", 'work', 'working', 'works', 'failed', 'fails', 'crashed', 'crashes', 'broken', 'same']);
const failureOnly = (text) => {
  const said = text.toLowerCase().replace(/[.!?؟،,]+/g, ' ').split(/\s+/).filter(Boolean);
  return said.length > 0 && said.length <= 5 && said.every((w) => FAILURE_WORDS.has(w));
};
const ABOUT_CODE_MAX = 300;
const aboutCode = (text) => text.length <= ABOUT_CODE_MAX
  && (ERROR_NAME.test(text) || THE_CODE.test(text) || (TROUBLE.test(text) && AT_IT.test(text)) || failureOnly(text));
const isCode = (text) => hardCodeSignal(text) || codeAsked(text);

// Whether the messages before position i lead back to code: through
// follow-ups and messages about code, to one that is code.
function codeBefore(list, i, own) {
  for (let j = i; j >= 0 && j > i - MAX_WINDOW; j--) {
    const text = own(list[j]);
    if (isCode(text)) return true;
    if (!isFollowUp(text) && !aboutCode(text)) return false;
  }
  return false;
}

/**
 * The messages a request's intent is read from: the newest, and before it
 * each earlier one while the one after it refers back — or, after code, is
 * about that code.
 * @param {string[]} texts The user messages, oldest first.
 * @param {(text: string) => string} [own] The person's own words in one.
 * @returns {string[]}
 */
function intentWindow(texts, own = (t) => t) {
  const list = (texts || []).map((t) => String(t || ''));
  if (!list.length) return [];
  const read = (t) => bounded(own(t));
  const window = [list[list.length - 1]];
  for (let i = list.length - 2; i >= 0 && window.length < MAX_WINDOW; i--) {
    const first = read(window[0]);
    if (!isFollowUp(first) && !(aboutCode(first) && codeBefore(list, i, read))) break;
    window.unshift(list[i]);
  }
  return window;
}

// ── Code ──
// Code wherever it appears: nobody pastes a stack trace, a fenced block or a
// declaration as background for something else.
const HARD_CODE = /(```|~~~|stack\s+trace|traceback|segmentation\s+fault|nullpointerexception|syntaxerror|typeerror|referenceerror|package\.json|node_modules)|\b(?:const|var)\s+[a-z_$][\w$]*\s*=|\bfunction(?:\s{1,20}[\w$]{1,80})?\s{0,20}\([^()]{0,200}\)\s{0,20}\{|\bdef\s+\w+\s*\(|\bclass\s+[a-z_]\w*\s*(?:\{|\(|:|extends\b)|console\.log\s*\(|#include\s*<|\bis\s+not\s+a\s+function\b|\bcannot\s+read\s+propert(?:y|ies)\s+of\s+(?:undefined|null)\b/i;
// An exception's name: "IndexError: …", "KeyError: name", "ModuleNotFoundError".
// Its capital is what tells it from "terror".
const ERROR_NAME = /\b[A-Z][A-Za-z]{0,60}(?:Error|Exception)\b/;

// Words that only mean code.
const codeWord = matcher(['كود', 'برمج*', 'مبرمج*', 'بايثون', 'جافا', 'جافاسكريبت', 'جافا سكريبت', 'تايب سكريبت', 'رياكت', 'ريأكت', 'كلاس', 'خوارزمية', 'تصحيح خطأ',
  'api', 'sdk', 'debug*', 'bug', 'refactor*', 'next.js', 'nextjs', 'vuejs', 'svelte', 'node.js', 'nodejs', 'fastapi', 'laravel', 'python', 'c++', 'c#', 'javascript', 'typescript',
  'golang', 'kotlin', 'firebase', 'supabase', 'deploy*', 'github', 'npm', 'pnpm', 'docker*', 'kubernetes', 'sql', 'mysql', 'nosql', 'mongodb', 'postgres*', 'sqlite', 'mssql',
  'backend', 'frontend', 'full stack', 'fullstack', 'full-stack', 'coding', 'programming', 'programmer', 'source code', 'swiftui', 'reactjs', 'react.js', 'expressjs', 'express.js', 'angularjs', 'rustlang',
  'cors', 'unit test', 'integration test', 'usestate', 'useeffect', 'useref', 'usememo', 'usecontext']);

// The frameworks whose names are also words, or names: a name alone is not
// code — Jonathan Swift, "I met Rust", the Rust shooting, Django Unchained,
// the Orient Express, the American Express app, angular momentum. It is code beside
// what makes it one: a qualifier ("React hooks", "rust borrow checker"),
// another framework ("Django or Flask?"), a verb ("install flask", "كيف
// استخدم react"), a word only code uses nearby ("Swift … optionals"), or a
// question of what it is, capitalised ("what is React?", "شو هو React؟").
const NAME = '(?:react|vue|svelte|angular(?!\\s+(?:momentum|velocity|acceleration|frequency|displacement|speed|distance|size|resolution|motion))|django|flask|(?<!(?:american|orient)\\s)express(?!\\s+(?:delivery|shipping|mail|post|train|bus|lane|checkout|entry|line|service|yourself|myself|my|your|our|their|his|her|it|this|that|gratitude|feelings?|love|interest|concern))|rust(?!\\s+(?:shooting|remover|stains?|spots?|proof|converter))|(?<!(?:jonathan|taylor)\\s)swift)';
const QUALIFIER = '(?:native|apps?|components?|hooks?|router|routing|query|state|props|projects?|frontend|backend|code|server|routes?|middleware|api|cli|modules?|services?|crates?|compiler|ownership|borrow(?:ing|\\s+checker)?|lifetimes?|traits?|macros?|optionals?|ui|templates?|orm|models?|views?|programming|language|developers?|tutorials?|framework|library|syntax)';
const ONLY_CODE_NEAR = '(?:optionals?|usestate|useeffect|jsx|tsx|props|cargo|crates?|npm|pip|borrow\\s+checker|ownership|xcode|composer|middleware|orm|endpoints?)';
const NAME_AR = '(?:react|vue|svelte|angular|django|flask|express)';
const FRAMEWORK = new RegExp([
  `\\b${NAME}(?:\\.?js)?\\s{1,3}${QUALIFIER}\\b`,
  `\\b${NAME}\\s{1,3}(?:vs\\.?|versus|or|and|و|أو|او|ولا|better\\s+than|compared\\s+to)\\s{1,3}(?:${NAME}|go|golang|python|java|kotlin|javascript|typescript|php|ruby)\\b`,
  `\\b(?:learn|learning|install|installing|set\\s?up|setup|configure|using|written\\s+in|built\\s+with|migrat\\w{0,6}\\s+to|switch\\w{0,4}\\s+to)\\s{1,3}${NAME}\\b`,
  '\\bin\\s{1,3}(?:react|vue|svelte|angular(?!\\s+momentum)|django|flask)\\b',
  `\\b${NAME}\\b.{0,40}\\b${ONLY_CODE_NEAR}\\b|\\b${ONLY_CODE_NEAR}\\b.{0,40}\\b${NAME}\\b`,
  `${NOT_AR}(?:بال|ب|في|استخدم|أستخدم|نستخدم|بستخدم|استعمل|اتعلم|أتعلم|تعلم|نزل|ثبت)ـ?\\s{0,3}${NAME_AR}\\b`
].join('|'), 'i');
const FRAMEWORK_ASKED = /(?:\b[Ww]hat(?:\s+is|'s|\s+are)|\b[Ee]xplain|شو\s(?:هو|هي|يعني)|ما\s(?:هو|هي)|ايش\s(?:هو|هي)|اشرح(?:لي)?)\s{1,3}(?:React|Vue|Svelte|Angular|Django|Flask|Rust|Swift)\b/;

// "برنامج" is a plan as often as a program, so asking for one is not asking
// for software: a workout, a diet, a trip, a study timetable. What it is a
// plan for is the first word after it ("برنامج تمارين", "برنامج للدراسة",
// "برنامج الرحلة"); code says what it does or in what language, and the
// language is a code word on its own.
const PLAN_OF = '(?:لل|ل|ب)?(?:ال)?(?:تمر[يى]ن|تمارين|رياض(?:ة|ه|ي(?![اأ]ت))|[اأإ]سبوع|يوم[يى]|شهر[يى]|غذ[اائ]|حم[يى]|دايت|لياق|تخس[يى]س|تنح[يى]ف|وزن|دراس|مذاكر|رحل|سفر|سياح|زيار|عطل|وجبات|[اأإ]كل|طعام|نوم|علاج|صح[يى]|حفل|زفاف|مؤتمر|رمضان|عمرة|ترفيه|تلفزيون)';
// Asking for a program: the verbs, unless a plan's noun comes straight after.
const ASK_PROGRAM = `(?:اكتب|سوي|اعمل)(?:لي|لنا)?\\s+برنامج(?!\\s{1,3}${PLAN_OF}[ء-ي]{0,3}(?![ء-ي]))`;

// Words that are also something else, with what makes them code: Express as
// a server; a compiler, not "compile a list"; code that is someone's, not a
// dress code; Java the language, not the island; an error in a program, not
// a dishwasher's error code, the error function or a trip's programme; a
// program written to do something, not one for a conference. And Arabic
// asks: "اكتبلي دالة", "اعمللي تطبيق", "رتب هاي المصفوفة".
const CODE_PHRASE = new RegExp([
  /\bjava\s{0,2}\d+\b|\bjava\s+(?:code|programs?|class(?:es)?|streams?|developers?|programming|apps?|spring|swing|jdk|jvm|version|tutorials?|exceptions?|projects?)\b|\b(?:install|learn|learning|using|written\s+in)\s+java\b|\b(?:class|function|method|program|code|loop|array|string|interface)\b.{0,40}\bin\s+java\b/,
  /\bthrows?\s+(?:an?\s+)?(?:\w{1,40}\s+)?exception|\b(?:threw|thrown)\s+(?:an?\s+)?(?:\w{1,40}\s+)?exception/,
  /\b(?:errors?|exceptions?)\b.{0,30}\b(?:code\b(?!\s{0,2}:?\s{0,2}[a-z]{0,3}-?\d)|program\b|script\b|compil\w{0,6})|\b(?:code|program|script|function)\b.{0,30}\berrors?\b/,
  /(?:error|ايرور|خطأ|خطا|غلط).{0,20}(?:برنامج(?!\s+ال)|كود(?!\s+ال))|(?:برنامج|كود)(?!\s+ال).{0,20}(?:error|ايرور|خطأ|خطا|غلط)/,
  /\b(?:sort|reverse|filter|flatten|loop\s+through|iterate\s+over|map\s+over)\s+(?:this|the|an|my)\s+(?:\w{1,30}\s+)?(?:array|dict(?:ionary)?)\b/,
  /(?:رتب|اعكس|فلتر|افرز|فرز|اطبع|ادمج)[ء-ْ]{0,4}\s{1,3}(?:[^\s]{1,20}\s{1,3})?(?:ال)?مصفوف(?:ة|ه|ات)/,
  /\bcompiler\b|\bcompil(?:e|es|ed|ing)\s+(?:errors?|time|the\s+code|my\s+code|this\s+code|it|the\s+program|my\s+program)\b|\bcompilation\s+error/,
  /\byarn\s+(?:add|install|run|build|dev|start)\b/,
  /(?<!lymph\s)\bnode\b/,
  /\b(?:my|this|the|your|that|of|some)\s+code\b(?!\s+of\b)|\bwrite\s+(?:me\s+)?(?:a\s+|an\s+|the\s+|some\s+)?(?:function|class|code)\b/,
  /\bwrite\s+(?:me\s+)?(?:a\s+)?programs?(?=\s{0,3}(?:$|[.!?]|(?:that|which|using)\b|in\s+\w|to\s+(?:sort|calculate|compute|find|print|read|convert|check|count|reverse|generate|parse|add|solve|simulate|download|scrape)\b|for\s+(?!(?:losing|gaining|cutting)\s+weight|(?:building|gaining)\s+(?:muscle|strength)|(?:getting|staying)\s+(?:fit|in\s+shape))\w{1,30}ing\b))/,
  /\bwrite\s+(?:me\s+)?(?:some\s+)?(?:unit\s+)?tests?\s+for\s+(?:my|this|the|a)\s+(?:function|code|class|method|module|component|api|app)\b/,
  /اكتب(?:لي|لنا)?\s+(?:دالة|كلاس|كود)|سوي(?:لي|لنا)?\s+(?:دالة|كود)|اعمل(?:لي|لنا)?\s+(?:دالة|كود|تطبيق)/,
  new RegExp(ASK_PROGRAM)
].map((re) => re.source).join('|'), 'i');

// A script is code unless it is for a video, a reel, an ad or a scene.
const scriptWord = matcher(['script', 'سكربت', 'سكريبت']);
const MEDIA = /فيديو|ريلز|تيك\s*توك|يوتيوب|بودكاست|إعلان|اعلان|مقطع|فيلم|مسرحي|\b(?:reels?|tiktok|youtube|video|podcast|movie|film|scene|commercial|skit|sketch)\b/i;

// Ambiguous on their own, so they need a verb or a qualifier to count.
// "موقع" is a location as often as a website, "git" is a CV skill as often
// as a command, and a database is usually the thing being described rather
// than the thing being asked for.
const AMBIGUOUS_WITH_CONTEXT = /((?:اعمل|سوي|صمم|ابن[يى]|أنشئ|انشئ|برمج|طور|بني|بدي|أبغى|ابغى)\w*\s+(?:لي\s+|لنا\s+)?(?:موقع|مواقع|تطبيق)|(?:موقع|مواقع)\s*(?:ويب|إلكتروني|الكتروني|انترنت|إنترنت)|\bwebsite\b|\bweb\s*app\b|\bgit\s+(?:clone|push|pull|commit|merge|rebase|branch|status|diff|init|checkout|log)\b|(?:صمم|اعمل|انشئ|أنشئ|بدي|اربط)\w*\s+(?:لي\s+)?قاعدة\s+بيانات)/i;

// "Summarise this article", "format this CV", "translate this text": the verb
// names the task and the object names a document, so whatever the pasted
// body happens to mention, this is not a request to write software. A real
// code signal (a fenced block, a stack trace) still wins over it.
const DOCUMENT_TASK = /((?:لخص|اختصر|ترجم|نسق|نسّق|رتب|رتّب|صغ|صيغ|راجع|دقق|حسّن|حسن)(?:لي|لنا)?\s+(?:(?:هاد|هذا|هاي|هذه)\s+)?(?:ال)?(?:مقال|نص|مستند|تقرير|سيرة\s*ذاتية|رسالة|ايميل|إيميل|بريد)|(?:summari[sz]e|translate|proofread|format|polish)\s+(?:this|the)\s+(?:article|text|document|report|cv|resume|email|letter))/i;

/** Code in a message wherever it appears in it; case kept. @param {string} text */
function hardCodeSignal(text) {
  const t = bounded(text);
  return HARD_CODE.test(t) || ERROR_NAME.test(t);
}

/** Asking for code, read on the instruction itself; case kept. @param {string} text */
function codeAsked(text) {
  const t = bounded(text);
  const topic = codeWord(t) || CODE_PHRASE.test(t) || FRAMEWORK.test(t) || FRAMEWORK_ASKED.test(t) || (scriptWord(t) && !MEDIA.test(t));
  return (topic || AMBIGUOUS_WITH_CONTEXT.test(t)) && !DOCUMENT_TASK.test(t);
}

// ── Math ──
// English is the primary language and had no math words at all. A noun
// that is only math counts alone; a verb that is also something else —
// integrate into a team, differentiate between two ideas, simplify a
// paragraph — counts beside an expression.
const mathWordAr = matcher(['احسب', 'حساب=', 'نسبة', 'معادلة', 'جذر', 'تكامل', 'تفاضل', 'مشتقة']);
const mathWordEn = matcher(['integral', 'antiderivative', 'derivative', 'calculus', 'equation', 'quadratic', 'polynomial', 'logarithm', 'determinant', 'eigenvalue', 'eigenvector', 'matrix', 'matrices', 'probability', 'statistics', 'factorial']);
const mathVerb = matcher(['solve', 'integrate', 'differentiate', 'simplify', 'factor', 'factorise', 'factorize', 'expand', 'evaluate', 'compute', 'calculate']);
const ARITHMETIC = /\d{1,20}\s{0,3}[+\-*/^%]\s{0,3}\d/;
const EXPRESSION = /\b(?:sin|cos|tan|ln|log|exp|sqrt)\b|(?:^|[^a-z])[a-z]\s{0,3}(?:[\^*/=]|[+-](?=\s{0,3}(?:\d|[a-z]\b|\()))|\d[a-z]\b|\bd[xyt]\b|\d{1,20}\s{0,3}%|\bfor\s+[xyznt]\b|\([^()]{0,40}[a-z0-9]\s?[+\-*/^]\s?[a-z0-9][^()]{0,40}\)/i;

/** @param {string} text */
function mathAsked(text) {
  const t = bounded(text);
  if (ARITHMETIC.test(t) || mathWordEn(t)) return true;
  if (mathWordAr(t.replace(/بالنسب[ةه]/g, ' '))) return true; // "بالنسبة لي" is "as for me"
  return mathVerb(t) && EXPRESSION.test(t);
}

// ── Questions ──
// Small talk: what people ask to open a conversation, and nothing after it.
// A segment is one only when all of it is — "how are you able to solve
// integrals so fast" is a question — with a greeting before it, and a name,
// "today" or "يا صديقي" after.
const CHAT_OPEN = '(?:(?:hi|hello|hey|hiya|yo|so|well|and|ok|okay|مرحبا|اهلا|اهلين|هلا|هلو|هاي|سلام|اهلا وسهلا|طيب|يلا|و)[\\s,!.،]*)*';
const CHAT_CORE = [
  'how are you(?: doing| feeling)?', 'how(?:\'?s| is) it going', 'how(?:\'?s| is| are) (?:everything|things|life)', 'how have you been', 'how(?:\'?s| is| was) your (?:day|night|morning|evening|week)',
  'what(?:\'?s| is) (?:up|new|going on|happening)', 'what are you (?:up to|doing)', 'what you up to', 'wyd', 'sup', 'are you (?:there|ok|okay|busy|free|awake|real)', 'you there', 'anyone(?: there| here)?', 'is anyone (?:there|here)',
  'can you hear me', 'who are you', 'what(?:\'?s| is) your name', 'how old are you',
  'كيفك', 'كيفكم', 'كيف حالك', 'كيف حالكم', 'كيف الحال', 'كيف الاحوال', 'كيف احوالك', 'كيف يومك', 'كيف كان يومك', 'كيف صحتك', 'كيف الصحه', 'كيف امورك', 'كيف الامور', 'شلونك', 'شلونكم', 'شخبارك', 'شخباركم',
  '(?:شو|ايش|وش|شنو) (?:اخبارك|اخباركم|الاخبار|اخبار|الجديد|الوضع|الاحوال|الامور|احوالك|عامل|عم تعمل|بتعمل|تسوي|مسوي|تعمل)', 'ازيك', 'ازيكم', 'عامل ايه', 'عاملين ايه', 'اخبارك', 'اخباركم', 'وينك', 'وينكم', 'وين رحت', 'وين غبت',
  '(?:انت|انتي) (?:موجود|موجوده|هنا|معي|معنا|شغال)', 'موجود', 'هل انت (?:هنا|موجود)', 'مين انت', 'من انت', '(?:شو|ما|وش) اسمك', 'كم عمرك', 'شو اخبار يومك'
].join('|');
const CHAT_CLOSE = '(?:[\\s,!.،]*(?:today|now|tonight|there|buddy|man|bro|dude|mate|friend|my friend|qjo|اليوم|هلق|الان|يا \\S{1,12}|صديقي|حبيبي|اخي|أخي))*';
const SMALL_TALK = new RegExp(`^${CHAT_OPEN}(?:${CHAT_CORE})${CHAT_CLOSE}[\\s,!.،]*$`, 'i');
const SMALL_TALK_MAX = 60;
const arabicPlain = (t) => t.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

/**
 * How many questions a message asks: those of three words or more that are
 * not small talk. "كيفك؟ شو أخبارك؟" asks none; two real questions ask two.
 * @param {string} text
 * @returns {number}
 */
function questionsAsked(text) {
  const parts = text.split(/[?؟]/);
  parts.pop(); // what follows the last mark is not a question
  return parts.filter((part) => {
    const said = part.trim();
    // The segment starts after the last sentence end: "hello! how are you" asks "how are you".
    const asked = said.split(/[.!۔]+\s+/).pop();
    // Small talk is short: whatever is longer is a question, and is not matched.
    return asked.split(/\s+/).filter(Boolean).length >= 3 && (asked.length > SMALL_TALK_MAX || !SMALL_TALK.test(arabicPlain(asked.toLowerCase())));
  }).length;
}

// ── The classifier's other intents, as words ──
const words = {
  table: matcher(['جدول', 'جدولة', 'markdown table', 'table format']),
  humanize: matcher(['كاشف', 'كواشف', 'ai detector', 'humanize*', 'كتابة بشرية', 'بدون كليشيه', 'burstiness', 'perplexity', 'أسلوب بشري']),
  social: matcher(['فضفض*', 'تعبان', 'تعبانة', 'مضايق', 'مضايقة', 'حزين', 'حزينة', 'زعلان', 'زعلانة', 'استعطاف', 'اعتذار', 'قصف جبهة', 'رد عليه', 'شو قصده', 'شو قصدها', '^نية', 'بين السطور', 'عذر', 'اعذار', 'تصريفة', 'شريكي', 'شريكتي', 'محادثة بيننا']),
  creative: matcher(['سكربت', 'سيناريو', 'ريلز', 'تيك توك', 'reels', 'tiktok', 'shorts', 'cover letter', 'رسالة عمل', 'سيرة ذاتية', 'ابتكر اسم', 'اسم تطبيق', 'اسم شركة', 'اسم علامة', 'تسمية', 'naming', 'وصفة طبخ', 'طبخة', 'طبخ']),
  research: matcher(['بحث', 'بحثي', 'بحثية', 'مصادر', 'دراسة', 'تقرير', 'قارن', 'مقارنة', 'تحليل سوق', 'research', 'sources', 'compare', 'report', 'market analysis', 'literature']),
  puzzle: matcher(['لغز', 'صناديق', 'ملصقات خاطئة', 'تفاح', 'تفاحة', 'برتقال', 'برتقالة', 'فاكهة واحدة', 'منطق=', 'منطقي', 'استنتاج', 'logic puzzle', 'riddle', 'boxes', 'labels', 'apples', 'oranges']),
  // The router's study and current-events reads.
  qspark: matcher(['q-spark', 'qspark', 'notebooklm', 'notebook', 'كيو سبارك', 'كيوسبارك']),
  study: matcher(['pdf', 'مصادر', 'مصدر', 'دراسة', 'بحث', 'بحثي', 'بحثية', 'أبحاث', 'ورقة', 'paper', 'journal', 'doi', 'arxiv', 'pubmed', 'تلخيص مستند', 'لخص المستند', 'مراجعة', 'اختبار', 'quiz', 'flashcard', 'بطاقات', 'تكرار متباعد', 'spaced repetition', 'خريطة مفاهيم', 'concept map', 'دفتر', 'محاضرة', 'lecture', 'منهج', 'منهجية', 'ملزمة', 'source-grounded', 'citations', 'اقتباسات']),
  notebookAction: matcher(['ارفع', 'حلل', 'استخرج', 'قارن بين المصادر', 'اسأل عن المصادر', 'اعمل لي كويز', 'اعمللي كويز', 'اعمل بطاقات', 'audio overview', 'نظرة صوتية']),
  current: matcher(['اليوم', 'الآن', 'حالي', 'حاليا', 'آخر', 'سعر', 'نتيجة', 'نتائج', 'مباراة', 'طقس', 'خبر', 'أخبار', 'exchange', 'latest', 'current', 'today', 'price', 'score', 'weather', 'news'])
};

module.exports = { intentWindow, hardCodeSignal, codeAsked, mathAsked, questionsAsked, words };

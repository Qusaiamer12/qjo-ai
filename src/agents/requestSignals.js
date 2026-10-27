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
'use strict';

const { matcher } = require('../../public/domain/topicWords');
const { isFollowUp } = require('../services/followUp');

const MAX_WINDOW = 4;

/**
 * The messages a request's intent is read from: the newest, and before it
 * each earlier one while the one after it refers back.
 * @param {string[]} texts The user messages, oldest first.
 * @param {(text: string) => string} [own] The person's own words in one.
 * @returns {string[]}
 */
function intentWindow(texts, own = (t) => t) {
  const list = (texts || []).map((t) => String(t || ''));
  if (!list.length) return [];
  const window = [list[list.length - 1]];
  for (let i = list.length - 2; i >= 0 && window.length < MAX_WINDOW && isFollowUp(own(window[0])); i--) window.unshift(list[i]);
  return window;
}

// ── Code ──
// Code wherever it appears: nobody pastes a stack trace, a fenced block or a
// declaration as background for something else.
const HARD_CODE = /(```|~~~|stack\s+trace|traceback|segmentation\s+fault|nullpointerexception|syntaxerror|typeerror|referenceerror|package\.json|node_modules)|\b(?:const|var)\s+[a-z_$][\w$]*\s*=|\bfunction\s*[\w$]*\s*\([^)]*\)\s*\{|\bdef\s+\w+\s*\(|\bclass\s+[a-z_]\w*\s*(?:\{|\(|:|extends\b)|console\.log\s*\(|#include\s*</i;

// Words that only mean code.
const codeWord = matcher(['كود', 'برمج*', 'مبرمج*', 'بايثون', 'جافا', 'جافاسكريبت', 'جافا سكريبت', 'تايب سكريبت', 'رياكت', 'ريأكت', 'كلاس', 'خوارزمية', 'تصحيح خطأ',
  'api', 'sdk', 'debug*', 'bug', 'refactor*', 'next.js', 'nextjs', 'vue', 'vuejs', 'svelte', 'node.js', 'nodejs', 'fastapi', 'laravel', 'python', 'java', 'c++', 'c#', 'javascript', 'typescript',
  'golang', 'kotlin', 'firebase', 'supabase', 'deploy*', 'github', 'npm', 'pnpm', 'docker*', 'kubernetes', 'sql', 'mysql', 'nosql', 'mongodb', 'postgres*',
  'backend', 'frontend', 'full stack', 'fullstack', 'full-stack', 'coding', 'programming', 'programmer', 'source code', 'swiftui', 'reactjs', 'react.js', 'expressjs', 'express.js', 'angularjs', 'rustlang']);

// Words that are also something else, with what makes them code: React
// beside an app or a hook, not "how should I react"; Express as a server, not
// "express my feelings"; Rust as a language, not on a car; Angular as a
// framework, not momentum; a compiler, not "compile a list"; code that is
// someone's, not a dress code. And Arabic asks: "اكتبلي دالة", "اعمللي تطبيق".
const CODE_PHRASE = new RegExp([
  /\breact\s+(?:native|apps?|components?|hooks?|router|query|state|projects?|frontend|code)\b/,
  /\b(?:using|learn|learning|written\s+in|built\s+with|in)\s+(?:react|angular|flask|vue|django|svelte)\b/,
  /\b(?:using|learn|learning|written\s+in)\s+(?:swift|rust|express)\b/,
  /(?:بال|ب)ـ?\s*(?:react|express|flask|django|angular|swift|rust)\b/,
  /\bexpress\s+(?:server|apps?|routes?|router|middleware|api|backend)\b/,
  /\bswift\s+(?:code|apps?|programming|language)\b/,
  /\brust\s+(?:code|programming|language|crates?|compiler)\b|\bcargo\s+(?:build|run|new)\b/,
  /\bangular\s+(?:apps?|components?|projects?|services?|modules?|cli|frontend|code)\b/,
  /\bflask\s+(?:apps?|api|server|routes?|backend|projects?)\b/,
  /\bdjango\b(?!\s+unchained)/,
  /\bcompiler\b|\bcompil(?:e|es|ed|ing)\s+(?:errors?|time|the\s+code|my\s+code|this\s+code|it|the\s+program|my\s+program)\b|\bcompilation\s+error/,
  /\byarn\s+(?:add|install|run|build|dev|start)\b/,
  /(?<!lymph\s)\bnode\b/,
  /\b(?:my|this|the|your|that|of|some)\s+code\b(?!\s+of\b)|\bwrite\s+(?:me\s+)?(?:a\s+|an\s+|the\s+|some\s+)?(?:function|program|class|code)\b/,
  /اكتب(?:لي|لنا)?\s+(?:دالة|كلاس|برنامج|كود)|سوي(?:لي|لنا)?\s+(?:دالة|كود|برنامج)|اعمل(?:لي|لنا)?\s+(?:دالة|كود|برنامج|تطبيق)/
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
const DOCUMENT_TASK = /((?:لخص|اختصر|ترجم|نسق|نسّق|رتب|رتّب|صغ|صيغ|راجع|دقق|حسّن|حسن)(?:لي|لنا)?\s+(?:هاد|هذا|هاي|هذه)?\s*(?:ال)?(?:مقال|نص|مستند|تقرير|سيرة\s*ذاتية|رسالة|ايميل|إيميل|بريد)|(?:summari[sz]e|translate|proofread|format|polish)\s+(?:this|the)\s+(?:article|text|document|report|cv|resume|email|letter))/i;

/** Code in a message wherever it appears in it. @param {string} text */
const hardCodeSignal = (text) => HARD_CODE.test(String(text || ''));

/** Asking for code, read on the instruction itself. @param {string} text */
function codeAsked(text) {
  const t = String(text || '');
  const topic = codeWord(t) || CODE_PHRASE.test(t) || (scriptWord(t) && !MEDIA.test(t));
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
const ARITHMETIC = /\d+\s*[+\-*/^%]\s*\d+/;
const EXPRESSION = /\b(?:sin|cos|tan|ln|log|exp|sqrt)\b|(?:^|[^a-z])[a-z]\s*(?:[\^*/=]|[+-](?=\s*(?:\d|[a-z]\b|\()))|\d[a-z]\b|\bd[xyt]\b|\d+\s*%|\bfor\s+[xyznt]\b|\([^()]*[a-z0-9]\s*[+\-*/^]\s*[a-z0-9][^()]*\)/i;

/** @param {string} text */
function mathAsked(text) {
  const t = String(text || '');
  if (ARITHMETIC.test(t) || mathWordEn(t)) return true;
  if (mathWordAr(t.replace(/بالنسب[ةه]/g, ' '))) return true; // "بالنسبة لي" is "as for me"
  return mathVerb(t) && EXPRESSION.test(t);
}

// ── The classifier's other intents, as words ──
const words = {
  table: matcher(['جدول', 'جدولة', 'markdown table', 'table format']),
  humanize: matcher(['كاشف', 'كواشف', 'ai detector', 'humanize*', 'كتابة بشرية', 'بدون كليشيه', 'burstiness', 'perplexity', 'أسلوب بشري']),
  social: matcher(['فضفض*', 'تعبان', 'تعبانة', 'مضايق', 'مضايقة', 'حزين', 'حزينة', 'زعلان', 'زعلانة', 'استعطاف', 'اعتذار', 'قصف جبهة', 'رد عليه', 'شو قصده', 'شو قصدها', 'نية', 'بين السطور', 'عذر', 'اعذار', 'تصريفة', 'شريكي', 'شريكتي', 'محادثة بيننا']),
  creative: matcher(['سكربت', 'سيناريو', 'ريلز', 'تيك توك', 'reels', 'tiktok', 'shorts', 'cover letter', 'رسالة عمل', 'سيرة ذاتية', 'ابتكر اسم', 'اسم تطبيق', 'اسم شركة', 'اسم علامة', 'تسمية', 'naming', 'وصفة طبخ', 'طبخة', 'طبخ']),
  research: matcher(['بحث', 'مصادر', 'دراسة', 'تقرير', 'قارن', 'مقارنة', 'تحليل سوق', 'research', 'sources', 'compare', 'report', 'market analysis', 'literature']),
  puzzle: matcher(['لغز', 'صناديق', 'ملصقات خاطئة', 'تفاح', 'تفاحة', 'برتقال', 'برتقالة', 'فاكهة واحدة', 'منطق', 'استنتاج', 'logic puzzle', 'riddle', 'boxes', 'labels', 'apples', 'oranges']),
  // The router's study and current-events reads.
  qspark: matcher(['q-spark', 'qspark', 'notebooklm', 'notebook', 'كيو سبارك', 'كيوسبارك']),
  study: matcher(['pdf', 'مصادر', 'مصدر', 'دراسة', 'بحث', 'أبحاث', 'ورقة', 'paper', 'journal', 'doi', 'arxiv', 'pubmed', 'تلخيص مستند', 'لخص المستند', 'مراجعة', 'اختبار', 'quiz', 'flashcard', 'بطاقات', 'تكرار متباعد', 'spaced repetition', 'خريطة مفاهيم', 'concept map', 'دفتر', 'محاضرة', 'lecture', 'منهج', 'منهجية', 'ملزمة', 'source-grounded', 'citations', 'اقتباسات']),
  notebookAction: matcher(['ارفع', 'حلل', 'استخرج', 'قارن بين المصادر', 'اسأل عن المصادر', 'اعمل لي كويز', 'اعمللي كويز', 'اعمل بطاقات', 'audio overview', 'نظرة صوتية']),
  current: matcher(['اليوم', 'الآن', 'حالي', 'حاليا', 'آخر', 'سعر', 'نتيجة', 'نتائج', 'مباراة', 'طقس', 'خبر', 'أخبار', 'exchange', 'latest', 'current', 'today', 'price', 'score', 'weather', 'news'])
};

module.exports = { intentWindow, hardCodeSignal, codeAsked, mathAsked, words };

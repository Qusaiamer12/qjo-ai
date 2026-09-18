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

console.log('\n========================================');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

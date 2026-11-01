// Answers to export, for the template suites. Every person, employer, school
// and address here is invented (example.com addresses, 555 numbers): a test
// file is committed, so it holds nobody's real data.
'use strict';

// A photo-sized PNG, drawn here (a soft gradient with a lighter disc), so no
// real person's picture is ever in the repository.
function png(width, height) {
  const zlib = require('zlib');
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const inside = Math.hypot(x - width / 2, y - height * 0.4) < width * 0.22;
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = inside ? 235 : 70 + Math.round((x / width) * 60);
      raw[at + 1] = inside ? 205 : 110 + Math.round((y / height) * 60);
      raw[at + 2] = inside ? 180 : 170;
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PHOTO = `data:image/png;base64,${png(160, 200).toString('base64')}`;

const CV_EN = `# Sami Khaled Nasser

**Senior Backend Engineer**

Amman, Jordan · +962 79 555 0142 · sami.nasser@example.com · linkedin.com/in/sami-nasser-example

## Summary

Backend engineer with nine years of experience building payment and logistics systems. Leads small teams, reviews code carefully and keeps services observable and cheap to run.

## Experience

### Senior Backend Engineer — Northwind Logistics

*March 2021 – Present*

- Led a team of five engineers that rebuilt the delivery-quote service, cutting response time from 900 ms to 310 ms.
- Introduced tracing and error budgets across eleven services; incidents per quarter fell from nine to three.
- Mentored four junior engineers, two of whom were promoted.

### Backend Engineer — Cedar Pay

*June 2017 – February 2021*

- Built the card-settlement pipeline handling 120,000 transactions a day.
- Wrote the reconciliation tool finance used to close each month two days earlier.

## Education

### BSc Computer Engineering — University of Example

*2012 – 2016*

## Skills

- **Languages:** Node.js, Python, SQL, Go
- **Platforms:** AWS, Docker, PostgreSQL, Redis
- **Practices:** code review, observability, mentoring

## Languages

- Arabic — native
- English — fluent

## Certifications

- AWS Certified Developer – Associate (2022)
`;

const CV_AR = `# سامي خالد ناصر

**مهندس برمجيات أول**

عمّان، الأردن · +962 79 555 0142 · sami.nasser@example.com · linkedin.com/in/sami-nasser-example

## الملخص المهني

مهندس برمجيات بخبرة تسع سنوات في بناء أنظمة الدفع والخدمات اللوجستية. يقود فرقًا صغيرة ويراجع الشيفرة بعناية ويحافظ على خدمات قابلة للمراقبة وقليلة التكلفة.

## الخبرات العملية

### مهندس برمجيات أول — شركة الأفق للنقل

*آذار 2021 – حتى الآن*

- قاد فريقًا من خمسة مهندسين أعاد بناء خدمة تسعير التوصيل وخفّض زمن الاستجابة من 900 إلى 310 مللي ثانية.
- أدخل التتبّع وميزانيات الأخطاء في أحد عشر خدمة فانخفضت الحوادث الفصلية من تسعة إلى ثلاثة.
- درّب أربعة مهندسين مبتدئين رُقّي اثنان منهم.

### مهندس برمجيات — شركة الأرز للمدفوعات

*حزيران 2017 – شباط 2021*

- بنى مسار تسوية البطاقات الذي يعالج 120 ألف عملية يوميًا.
- كتب أداة المطابقة التي أغلق بها قسم المالية الشهر قبل موعده بيومين.

## التعليم

### بكالوريوس هندسة الحاسوب — جامعة المثال

*2012 – 2016*

## المهارات

- **اللغات البرمجية:** Node.js, Python, SQL, Go
- **المنصات:** AWS, Docker, PostgreSQL, Redis
- **الممارسات:** مراجعة الشيفرة، المراقبة، التدريب

## اللغات

- العربية — لغة أم
- الإنجليزية — بطلاقة

## الشهادات

- مطوّر معتمد من AWS – مستوى مشارك (2022)
`;

const sentences = {
  en: [
    'The hives on the roof of the community centre are inspected every second Tuesday, and the notes from each visit are kept in one shared binder.',
    'Neighbours who joined the project in spring asked mostly about safety, so the first session covered veils, smokers and what to do after a sting.',
    'A single colony produced eleven kilograms of honey in its first full season, which the group divided between the kitchen and the school stall.',
    'Water is the quiet constraint: a shallow tray with pebbles, refilled daily, kept the bees from visiting the neighbours’ swimming pool.'
  ],
  ar: [
    'تُفحص الخلايا على سطح المركز المجتمعي كل ثلاثاء ثانٍ، وتُحفظ ملاحظات كل زيارة في دفتر مشترك واحد.',
    'سأل الجيران الذين انضموا إلى المشروع في الربيع عن السلامة في الغالب، فتناولت الجلسة الأولى القفازات والمدخّن وما يُفعل بعد اللدغة.',
    'أنتجت خلية واحدة أحد عشر كيلوغرامًا من العسل في موسمها الأول الكامل، وقسّمته المجموعة بين المطبخ وبسطة المدرسة.',
    'الماء هو القيد الهادئ: صينية ضحلة فيها حصى تُملأ يوميًا أبعدت النحل عن مسبح الجيران.'
  ]
};

/** A document of `chapters` chapters, each with two sections, long enough to run over several pages. */
function document(lang, chapters = 5, { named = false } = {}) {
  const s = sentences[lang];
  const word = lang === 'ar' ? ['الفصل', 'القسم'] : ['Chapter', 'Section'];
  const para = (n) => [0, 1, 2].map((k) => s[(n + k) % s.length]).join(' ');
  const title = lang === 'ar' ? 'مشروع نحل السطح' : 'The Rooftop Bee Project';
  const parts = [`# ${title}`, ''];
  for (let c = 1; c <= chapters; c++) {
    const name = lang === 'ar' ? ['البداية', 'العناية بالخلايا', 'السلامة', 'الحصاد', 'الدروس'][(c - 1) % 5] : ['Getting started', 'Caring for the hives', 'Staying safe', 'The harvest', 'What we learned'][(c - 1) % 5];
    parts.push(`## ${named ? name : `${word[0]} ${c}: ${name}`}`, '');
    parts.push(`${c === 1 && !named ? '“' : ''}${para(c)}`, '', para(c + 1), '');
    for (let k = 1; k <= 2; k++) {
      parts.push(`### ${word[1]} ${c}.${k}`, '', para(c + k), '', para(c + k + 2), '');
      if (c === 2 && k === 1) {
        parts.push(lang === 'ar' ? '| الشهر | الكمية |\n| --- | --- |\n| أيار | 4 كغ |\n| حزيران | 7 كغ |' : '| Month | Honey |\n| --- | --- |\n| May | 4 kg |\n| June | 7 kg |', '');
        parts.push(lang === 'ar' ? '> العسل لا يُستعجل.' : '> Honey cannot be hurried.', '');
      }
    }
  }
  return parts.join('\n');
}

module.exports = { PHOTO, CV_EN, CV_AR, DOC_EN: document('en'), DOC_AR: document('ar'), STORY_EN: document('en', 4, { named: true }), STORY_AR: document('ar', 4, { named: true }), docTitle: { en: 'The Rooftop Bee Project', ar: 'مشروع نحل السطح' }, document };

# Qjo Q-Spark Audio Overview v2 — 2026-07-21-86

## الهدف
تحسين Audio Overview في Q-Spark ليصبح منظمًا بفصول قابلة للتشغيل، بدل نص واحد فقط.

---

## ما تم تنفيذه

### 1) Structured Chapters
تم تعديل prompt التوليد ليطلب شكلًا واضحًا:

```text
[CHAPTER 1: افتتاحية وفكرة رئيسية]
[CHAPTER 2: أهم النقاط]
[CHAPTER 3: العلاقات بين المفاهيم]
[CHAPTER 4: أسئلة مراجعة]
[CHAPTER 5: أخطاء شائعة ونقاط انتباه]
```

---

### 2) Parser للفصول
أضيفت:

```js
parseAudioOverviewV2(raw)
```

وتحوّل النص إلى:

```js
{
  script,
  chapters,
  updatedAt
}
```

---

### 3) UI جديد للتبويب الصوتي
تم تحسين تبويب Audio:

- عرض عدد الفصول.
- Cards لكل فصل.
- زر تشغيل الكل.
- زر تشغيل فصل واحد.
- زر نسخ السكربت.
- عرض السكربت الكامل داخل details.

---

### 4) Speech synthesis أكثر تنظيمًا
أضيفت:

```js
playAudioText(text)
playAudioChapter(i)
copyAudioOverview()
```

والتشغيل الحالي ما زال browser speechSynthesis، مع تحضير منطقي للـ MP3 backend لاحقًا.

---

## النسخة

```text
qjo-qspark-audio-overview-v2-2026-07-21-86
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main86b.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-audio-overview-v2-2026-07-21-86
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_AUDIO_OVERVIEW_V2
parseAudioOverviewV2
Audio Overview عربي v2
```

---

## نقد ذاتي
هذه ليست MP3 backend بعد. ما زالت تعتمد على speechSynthesis في المتصفح.

المتبقي لاحقًا:

1. توليد MP3 من backend.
2. تنزيل الملف الصوتي.
3. تعدد أصوات حقيقي.
4. Chapters صوتية بملفات منفصلة.

لكن الآن تجربة Audio Overview صارت منظمة وقابلة للدراسة بدل نص واحد فقط.

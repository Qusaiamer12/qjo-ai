# Qjo Q-Spark Jobs Auto Processing v1 — 2026-07-21-96

## الهدف
ربط Job Queue بعملية رفع المصادر في Q-Spark، بحيث يبدأ source processing job تلقائيًا عند إضافة مصدر، وتظهر حالة المعالجة على كرت المصدر.

---

## ما تم تنفيذه

### 1) تشغيل source-stats job تلقائيًا
بعد رفع مصدر وإضافته إلى Q-Spark:

```js
this.startSourceStatsJobForSource(src, true)
```

يبدأ job من نوع:

```text
source-stats
```

---

### 2) حفظ job ids على المصدر
كل مصدر صار يمكن أن يحتوي:

```js
processingJobs
lastStatsJob
jobStats
```

---

### 3) ربط نتيجة job بالمصدر
عند اكتمال job، يتم ربط النتيجة بالمصدر:

```js
src.jobStats = d.job.result
```

---

### 4) Badge على كرت المصدر
أضيف مؤشر صغير على كل مصدر يوضح حالة آخر job:

```text
job 35%
job ✓
job فشل
```

---

### 5) Backend source-stats result محسّن
نتيجة `source-stats` أصبحت ترجع:

```js
sourceId
title
chars
words
pages
topTerms
```

---

## النسخة

```text
qjo-qspark-jobs-auto-processing-v1-2026-07-21-96
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main89b.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health  -> qjo-qspark-jobs-auto-processing-v1-2026-07-21-96
GET /qspark.html -> 200
```

وتأكدنا من وجود:

```text
QSPARK_JOBS_UI_V1
sourceJobBadge
```

---

## نقد ذاتي
هذه مرحلة source-stats auto processing فقط. لم يتم جعل PDF extraction/OCR/embeddings كلها async بعد.

المتبقي لاحقًا:

1. تحويل PDF extraction إلى job.
2. OCR إلى job.
3. Embeddings indexing تلقائي بعد رفع المصدر عند توفر مفاتيح.
4. Firestore-backed jobs حتى لا تضيع عند restart.

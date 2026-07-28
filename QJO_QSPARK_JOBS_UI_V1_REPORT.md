# Qjo Q-Spark Jobs UI v1 — 2026-07-21-89

## الهدف
ربط Job Queue Foundation بواجهة Q-Spark حتى يرى المستخدم حالة المعالجة الخلفية والتقدم بدل أن تبقى jobs مخفية في backend.

---

## ما تم تنفيذه

### 1) Jobs tool card
أضيفت أداة جديدة في Studio:

```text
Jobs & Progress
```

تفتح تبويبًا جديدًا داخل Q-Spark.

---

### 2) Jobs UI
أضيفت واجهة:

```text
QSPARK_JOBS_UI_V1
```

تعرض:

```text
job id
type
status
progress bar
message
updatedAt
result
cancel button
```

---

### 3) تشغيل Jobs من Q-Spark
أضيفت أزرار:

```text
إحصاءات المصدر الحالي
فهرسة Embeddings
تحديث
```

وتستدعي:

```text
POST /api/jobs type=source-stats
POST /api/jobs type=embedding-batch
GET  /api/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
```

---

### 4) Polling تلقائي
عند إنشاء job، Q-Spark يبدأ polling حتى تنتهي الحالة:

```text
completed
failed
cancelled
```

---

## الدوال الجديدة

```js
saveJobs()
jobLabel()
refreshJobs()
createSourceStatsJob()
createEmbeddingJob()
pollJob()
cancelJob()
jobsHtml()
```

---

## النسخة

```text
qjo-qspark-jobs-ui-v1-2026-07-21-89
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main89.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET  /api/health -> qjo-qspark-jobs-ui-v1-2026-07-21-89
GET  /qspark.html -> 200 + Jobs UI موجود
POST /api/jobs type=source-stats -> ok true
```

---

## نقد ذاتي
هذه Jobs UI v1. ما زال ناقص لاحقًا:

1. ربط رفع الملفات مباشرة بإنشاء processing jobs.
2. Firestore-backed persistent jobs.
3. progress أدق لكل مرحلة PDF/OCR/embeddings.
4. job notifications.
5. retry failed job.

لكن الآن Q-Spark صار لديه واجهة فعلية لمراقبة الخلفية بدل backend job API فقط.

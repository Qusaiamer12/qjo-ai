# Qjo Job Queue Foundation v1 — 2026-07-21-88

## الهدف
بدء محور RAG / Background Jobs بإضافة Job Queue foundation داخل backend، حتى تصبح العمليات الثقيلة لاحقًا مثل embeddings/PDF/source processing قابلة للتنفيذ كـ jobs لها status/progress بدل timeout مباشر.

---

## ما تم إنشاؤه

### 1) Job Queue Service

```text
src/services/jobQueue.js
```

ويحتوي:

```js
createJobQueue()
registerHandler()
createJob()
getJob()
listJobs()
cancelJob()
updateJob()
```

يدعم حالات:

```text
queued
running
completed
failed
cancelled
```

مع:

```text
progress
message
result
error
createdAt/startedAt/finishedAt
```

---

### 2) Job Routes

```text
src/routes/jobs.js
```

ويضيف endpoints:

```text
POST /api/jobs
GET  /api/jobs
GET  /api/jobs/:id
POST /api/jobs/:id/cancel
```

---

## Job handlers المضافة

### 1) source-stats

```text
type: source-stats
```

يحسب:

```text
chars
words
pages
topTerms
```

مفيد كبداية لمعالجة المصادر بدون AI.

### 2) embedding-batch

```text
type: embedding-batch
```

يشغل embeddings على دفعات باستخدام:

```text
embeddingsService.callEmbeddingProvider()
```

ويدعم progress. بدون مفاتيح embeddings سيفشل طبيعيًا، لكنه جاهز عند إضافة HuggingFace/OpenAI-compatible keys.

---

## النسخة

```text
qjo-job-queue-foundation-v1-2026-07-21-88
```

---

## التحقق

تم تشغيل:

```bash
node --check src/services/jobQueue.js
node --check src/routes/jobs.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET  /api/health -> qjo-job-queue-foundation-v1-2026-07-21-88
POST /api/jobs type=source-stats -> queued
GET  /api/jobs/:id -> completed, pages=2
GET  /api/jobs -> ok true, jobs count 1
```

---

## نقد ذاتي
هذه Job Queue in-memory v1، وليست production distributed queue بعد.

القيود الحالية:

1. jobs تضيع عند restart.
2. ليست متعددة workers.
3. لا persistent storage بعد.
4. لا UI job panel بعد.

لكنها foundation مهمة لتطوير:

```text
Async PDF processing
Async embeddings
RAG indexing jobs
Q-Spark source progress UI
```

المرحلة التالية المنطقية:

```text
Q-Spark Jobs UI v1
```

لعرض حالة jobs/progress داخل Q-Spark عند معالجة المصادر لاحقًا.

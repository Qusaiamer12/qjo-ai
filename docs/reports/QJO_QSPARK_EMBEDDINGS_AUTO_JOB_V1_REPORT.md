# Qjo Q-Spark Embeddings Auto Job v1 — 2026-07-21-97

## الهدف
تطوير Q-Spark Jobs ليبدأ فهرسة Embeddings تلقائيًا بعد رفع مصدر، لكن فقط إذا كانت embeddings مفعلة في الخادم.

---

## ما تم تنفيذه

### 1) Backend embedding-batch result محسن
تم تحديث job handler:

```text
embedding-batch
```

ليُرجع:

```js
sourceId
title
count
dimensions
provider
```

حتى يمكن ربط نتيجة job بالمصدر.

---

### 2) Q-Spark يتحقق من جاهزية embeddings
أضيف:

```js
loadBackendStatus()
embeddingsReady()
```

ويستخدم:

```text
GET /api/status
```

للتأكد من:

```js
ready.embeddings === true
```

---

### 3) Auto embedding job بعد رفع المصدر
بعد رفع مصدر جديد:

```js
startEmbeddingJobForSource(src, true)
```

لكن إذا embeddings غير مفعلة، لا ينشئ job فاشل ولا يزعج المستخدم.

---

### 4) ربط job بالمصدر
كل مصدر يمكن أن يحتوي:

```js
lastEmbeddingJob
embeddingJob
processingJobs
```

---

### 5) Badge محسّن على كرت المصدر
Badge يميز بين:

```text
job 35%
emb 35%
job ✓
emb ✓
emb فشل
```

---

## النسخة

```text
qjo-qspark-embeddings-auto-job-v1-2026-07-21-97
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main97.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health -> qjo-qspark-embeddings-auto-job-v1-2026-07-21-97
GET /qspark.html -> 200
GET /api/status -> ready.embeddings false محليًا بدون مفاتيح
```

---

## نقد ذاتي
محليًا embeddings غير مفعلة، لذلك لم يتم اختبار job embeddings فعليًا بمفاتيح HuggingFace. بعد إضافة مفاتيح Render:

```text
EMBEDDING_PROVIDER=huggingface
HUGGINGFACE_API_KEYS=hf_...
HUGGINGFACE_EMBEDDING_MODEL=intfloat/multilingual-e5-base
```

سيبدأ auto embedding job بعد رفع المصدر.

المتبقي لاحقًا:

1. تخزين vectors فعليًا وربطها بـ retrieval.
2. Firestore-backed persistent jobs.
3. progress أدق لكل chunk.
4. retry failed embeddings jobs.

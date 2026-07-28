# Qjo Q-Spark Job Retry v1 — 2026-07-21-98

## الهدف
إضافة إمكانية إعادة تشغيل jobs الفاشلة أو الملغاة، بدل إعادة إنشاء العملية يدويًا.

---

## ما تم تنفيذه

### 1) Backend retry
تم تحديث:

```text
src/services/jobQueue.js
```

وأضيفت:

```js
retryJob(id)
```

تعيد إنشاء job جديد بنفس:

```text
type
payload
meta
```

مع إضافة:

```js
retriedFrom
```

---

### 2) Route جديد
تم تحديث:

```text
src/routes/jobs.js
```

وأضيف:

```text
POST /api/jobs/:id/retry
```

---

### 3) Q-Spark UI
تم تحديث Jobs UI في:

```text
public/qspark.html
```

بحيث يظهر زر:

```text
إعادة تشغيل
```

للـ jobs التي حالتها:

```text
failed
cancelled
```

---

## النسخة

```text
qjo-qspark-job-retry-v1-2026-07-21-98
```

---

## التحقق

تم تشغيل:

```bash
node --check src/services/jobQueue.js
node --check src/routes/jobs.js
node --check /tmp/qspark-main98.js
npm run audit
npm run backend-regression
```

النتيجة:

```text
Audit passed with 0 warning(s)
Backend regression passed
```

---

## Smoke test

Backend regression أكد:

```text
job create source-stats -> ok
job completed source-stats -> ok
job retry -> ok, job id جديد
```

---

## نقد ذاتي
Retry يعمل الآن in-memory لأن Job Queue نفسها in-memory. عند الانتقال لاحقًا إلى Firestore-backed jobs، يجب حفظ payload بشكل آمن ومدروس لتجنب تخزين ملفات ضخمة أو بيانات حساسة بالكامل.

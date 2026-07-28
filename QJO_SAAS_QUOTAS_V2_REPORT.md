# Qjo SaaS Quotas v2 — 2026-07-21-100

## الهدف
توسيع أساس SaaS limits بإضافة quotas للملفات والمصادر ورفع Qcode، مع عرضها عبر `/api/limits` وتطبيق client-side checks في Q-Spark/Qcode.

---

## Env vars الجديدة

```text
QSPARK_MAX_SOURCES=0
QSPARK_MAX_FILE_MB=0
QCODE_MAX_UPLOAD_MB=5
QCODE_MAX_UPLOAD_FILES=20
```

القيمة `0` تعني unlimited/disabled حيث ينطبق.

---

## Backend

### server.js
أضيفت constants:

```js
QSPARK_MAX_SOURCES
QSPARK_MAX_FILE_MB
QCODE_MAX_UPLOAD_MB
QCODE_MAX_UPLOAD_FILES
```

وتم ربط Qcode multer بهذه القيم:

```js
fileSize: QCODE_MAX_UPLOAD_MB * 1024 * 1024
files: QCODE_MAX_UPLOAD_FILES
```

### /api/limits
أصبح يرجع:

```js
limits.quotas = {
  qSparkMaxSources,
  qSparkMaxFileMB,
  qCodeMaxUploadMB,
  qCodeMaxUploadFiles
}
```

---

## Frontend

### Q-Spark
أضيف:

```js
loadBackendStatus()
qSparkQuotas()
validateUploadQuotas(files)
```

ويمنع رفع ملفات تتجاوز:

```text
QSPARK_MAX_SOURCES
QSPARK_MAX_FILE_MB
```

إذا كانت مفعلة.

### Qcode
أضيف:

```js
loadLimits()
qcodeQuotas()
validateQcodeUpload(files)
```

ويفحص قبل الرفع:

```text
QCODE_MAX_UPLOAD_MB
QCODE_MAX_UPLOAD_FILES
```

---

## النسخة

```text
qjo-saas-quotas-v2-2026-07-21-100
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
npm run backend-regression
```

النتيجة:

```text
Audit passed with 0 warning(s)
Backend regression passed
```

---

## Smoke tests

```text
GET /api/limits -> quotas = 4 مفاتيح
backend-regression -> passed
```

---

## نقد ذاتي
هذه quotas foundation وليست billing/plans كاملة. لاحقًا يمكن ربطها بـ:

```text
free/pro plans
Firestore user plan
Stripe/Paddle
Admin usage dashboard
```

# Qjo Deploy Verification v1 — 2026-07-21-102

## الهدف
إضافة سكربت تحقق مخصص بعد النشر على Render للتأكد أن النسخة المنشورة تعمل فعليًا، وليس فقط build ناجح.

---

## الملفات الجديدة

```text
evals/deploy-verify-v1.js
```

وتمت إضافة npm script:

```bash
npm run deploy-verify
```

---

## ماذا يفحص؟

```text
/api/health
/api/status
/api/limits
/api/qcode/health
/api/qspark/health
/
/qcode.html
/qspark.html
/qjo-diagnostic.html
/terms.html
/privacy.html
/safety.html
/api/search
/api/export/code-zip
```

---

## طريقة الاستخدام على Render

بعد النشر:

```bash
QJO_BASE_URL=https://qjo-ai-1.onrender.com npm run deploy-verify
```

وإذا بدك تتأكد من version محدد:

```bash
QJO_BASE_URL=https://qjo-ai-1.onrender.com QJO_EXPECT_VERSION=qjo-deploy-verification-v1-2026-07-21-102 npm run deploy-verify
```

---

## النسخة

```text
qjo-deploy-verification-v1-2026-07-21-102
```

---

## التحقق المحلي

تم تشغيل:

```bash
QJO_BASE_URL=http://127.0.0.1:3000 npm run deploy-verify
```

النتيجة:

```text
Deploy verification passed
```

---

## التقرير الناتج

```text
evals/deploy-verify-report-v1.json
```

---

## نقد ذاتي
هذا لا يستبدل `backend-regression` أو `ai-quality-eval`؛ هو فحص سريع للنشر. بعد كل deploy يُفضّل تشغيل الثلاثة:

```bash
npm run deploy-verify
npm run backend-regression
npm run ai-quality-eval
```

مع `QJO_BASE_URL` على Render.

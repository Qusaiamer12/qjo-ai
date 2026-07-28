# Qjo Backend Regression Eval v1 — 2026-07-21-90

## الهدف
إضافة Regression Evaluation Suite تمنع كسر الـ backend والواجهات الأساسية بعد سلسلة التطويرات الكبيرة.

---

## ما تم إنشاؤه

```text
evals/backend-regression-eval-v1.js
```

وتمت إضافة script في `package.json`:

```bash
npm run backend-regression
```

---

## ماذا يفحص؟

الاختبار يعمل بدون مفاتيح AI حقيقية، ويفحص المسارات الأساسية:

```text
/api/health
/api/status
/
/qspark.html
/qcode.html
/qjo-diagnostic.html
/api/search
/api/jobs
/api/qcode/health
/api/qcode/run
/api/qcode/save
/api/qcode/diff
/api/qspark/health
/api/embeddings
/api/export/code-zip
/api/chat
```

---

## اختبارات مهمة داخله

### Search Distillation
يتأكد أن السؤال الطويل يتحول إلى query أقصر ومفيد.

### Jobs
ينشئ job من نوع:

```text
source-stats
```

ثم ينتظر اكتماله ويتأكد من النتيجة.

### Qcode
يفحص:

```text
health
run pwd
save file
diff endpoint
```

### Q-Spark
يفحص health وseparate keys.

### Exports
يفحص أن code zip يرجع ملف ZIP صحيح.

### Chat without keys
يتأكد أن `/api/chat` يرجع استجابة آمنة محليًا بدون مفاتيح بدل crash.

---

## النسخة

```text
qjo-backend-regression-eval-v1-2026-07-21-90
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

## نتيجة الاختبار المحلي

```text
✅ health endpoint
✅ status endpoint
✅ page /
✅ page /qspark.html
✅ page /qcode.html
✅ page /qjo-diagnostic.html
✅ search distillation
✅ job create source-stats
✅ job completed source-stats
✅ job list
✅ qcode health
✅ qcode run pwd
✅ qcode save eval file
✅ qcode rich diff endpoint
✅ qspark health separate keys
✅ embeddings endpoint safe response
✅ export code zip
✅ chat safe response without local keys
```

---

## التقرير الناتج

```text
evals/backend-regression-report-v1.json
```

---

## نقد ذاتي
هذا اختبار backend smoke/regression ممتاز، لكنه لا يغطي جودة LLM الفعلية لأن البيئة المحلية بدون مفاتيح AI.

لاحقًا يجب تشغيله على Render:

```bash
QJO_BASE_URL=https://qjo-ai-1.onrender.com npm run backend-regression
```

ومعه:

```bash
QJO_BASE_URL=https://qjo-ai-1.onrender.com npm run launch-eval
```

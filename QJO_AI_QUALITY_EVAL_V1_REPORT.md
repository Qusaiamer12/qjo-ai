# Qjo AI Quality Eval v1 — 2026-07-21-101

## الهدف
إضافة Evaluation Suite لجودة الذكاء نفسه، وليس فقط backend smoke tests.

---

## الملفات الجديدة

```text
evals/ai-quality-dataset-v1.json
evals/ai-quality-eval-v1.js
```

وتمت إضافة npm script:

```bash
npm run ai-quality-eval
```

---

## ماذا يختبر؟

Dataset يغطي:

```text
context follow-up formatting
search table formatting
unsafe request refusal
qcode routing
qspark routing
Arabic casual tone
```

---

## السلوك المحلي بدون مفاتيح

إذا `/api/chat` يرجع:

```text
AI service is not configured
```

يعمل الاختبار:

```text
skip
```

بدل الفشل، لأن البيئة المحلية لا تحتوي مفاتيح AI.

---

## النتيجة المحلية

```text
AI quality eval passed with 6 skipped
```

---

## طريقة التشغيل على Render

بعد النشر ومع المفاتيح الحقيقية:

```bash
QJO_BASE_URL=https://qjo-ai-1.onrender.com npm run ai-quality-eval
```

وهناك يجب ألا تكون الاختبارات skipped، بل تعطي نتائج فعلية لجودة الردود.

---

## النسخة

```text
qjo-ai-quality-eval-v1-2026-07-21-101
```

---

## نقد ذاتي
هذه v1 فقط. لاحقًا يجب توسيع dataset ليشمل:

```text
logic puzzles
Q-Spark citations
Qcode tools
search source quality
medical/legal/financial safety
exports
mobile UI
prompt injection variants
```

# Qjo Q-Spark Concept Graph v1 — 2026-07-21-87

## الهدف
تحسين تبويب خريطة المادة في Q-Spark بإضافة Concept Graph عملي فوق Mermaid، يعرض المفاهيم والعلاقات والتعريفات بشكل واضح.

---

## ما تم تنفيذه

### 1) Concept Graph Data
أضيفت:

```js
conceptGraphData(src)
```

وتستخرج من تحليل المصدر:

```text
المفاهيم
التعريفات
الأهمية/القوة
العلاقات السببية أو المفاهيمية
درجة نضج المادة
```

---

### 2) Concept Graph UI
أضيفت:

```js
conceptGraphHtml(src)
```

وتعرض:

```text
العقد المركزية
الروابط والعلاقات
تعريفات مختصرة
إحصائيات: عدد مفاهيم، عدد روابط، درجة نضج
```

---

### 3) دمج داخل Mindmap tab
تم وضع Concept Graph فوق Mermaid الحالي، بحيث يبقى Mermaid موجودًا لكن المستخدم يحصل على عرض أكثر قابلية للقراءة والفهم.

---

## النسخة

```text
qjo-qspark-concept-graph-v1-2026-07-21-87
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main87.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-concept-graph-v1-2026-07-21-87
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_CONCEPT_GRAPH_V1
conceptGraphData
```

---

## نقد ذاتي
هذه نسخة v1 تعتمد على مفاهيم وتحليل موجود داخل `analysis.deep`.

المتبقي لاحقًا:

1. Graph تفاعلي canvas/SVG.
2. فتح source عند الضغط على مفهوم.
3. ربط مفهوم ↔ citation chunks.
4. فلترة حسب المصدر.
5. توليد graph عابر للمصادر كلها، وليس فقط latest source.

لكن الآن تبويب خريطة المادة صار أكثر فائدة وقابلية للفهم من Mermaid وحده.

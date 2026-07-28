# Qjo Q-Spark Concept Citation Links v1 — 2026-07-21-113

## الهدف
ربط Concept Graph في Q-Spark بالمصادر والاستشهادات، حتى لا تبقى المفاهيم مجرد عقد جميلة، بل تصبح قابلة للتحقق من المصدر.

---

## ما تم تنفيذه

### 1) Evidence لكل مفهوم
تم تحديث:

```js
conceptGraphData(src)
```

ليحاول إيجاد evidence chunk لكل مفهوم باستخدام:

```js
chunkForCitations(src, sourceNo, term)
```

ثم يخزن reference مثل:

```text
[CG:1]
[CG:2]
```

داخل:

```js
lastCitationMap
```

---

### 2) أزرار دليل داخل Concept Graph
تم تحديث:

```js
conceptGraphHtml(src)
```

ليعرض لكل مفهوم موثق زر:

```text
الدليل [CG:N]
```

وعند الضغط يفتح نفس citation evidence modal، ومنه يمكن فتح المصدر عند الاقتباس.

---

### 3) UI واضح للمفاهيم الموثقة
أضيف CSS:

```text
QSPARK_CONCEPT_CITATION_LINKS_V1
```

ويظهر badge:

```text
موثق
```

على العقد التي لديها evidence.

---

## النسخة

```text
qjo-qspark-concept-citation-links-v1-2026-07-21-113
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-conceptlinks.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-concept-citation-links-v1-2026-07-21-113
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_CONCEPT_CITATION_LINKS_V1
evidenceRef
```

---

## نقد ذاتي
هذه v1 تربط المفهوم بأقرب evidence chunk من المصدر الحالي. لاحقًا يمكن تحسينها إلى:

1. evidence متعدد لكل مفهوم.
2. فلترة حسب المصدر.
3. graph تفاعلي يفتح المصدر مباشرة من node.
4. confidence score لجودة الربط.

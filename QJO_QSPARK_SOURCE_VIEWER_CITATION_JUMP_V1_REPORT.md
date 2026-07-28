# Qjo Q-Spark Source Viewer + Citation Jump v1 — 2026-07-21-83

## الهدف
بدء تطوير Q-Spark باتجاه NotebookLM عبر تحسين تجربة فتح المصادر من الاستشهادات.

المطلوب في هذه المرحلة:

```text
الضغط على citation -> عرض الدليل -> فتح المصدر عند المقطع المرتبط -> highlight الاقتباس
```

---

## ما تم تنفيذه

### 1) فتح المصدر من citation مع سياق مرتبط
تم تعديل:

```js
openCitationEvidence(ref)
```

حتى زر:

```text
فتح المصدر
```

لا يفتح أول 4000 حرف فقط، بل يمرر evidence object إلى:

```js
previewSource(source.id, { evidence, ref })
```

---

### 2) Source viewer مع highlight
تمت إضافة دوال:

```js
sourceWindowForEvidence(src, ev)
pageMarkersHtml(text)
highlightedSourceHtml(src, ev)
```

وتعمل على:

- استخراج نافذة سياق حول الاقتباس.
- استخدام start/end إن وجدت.
- fallback للبحث عن نص الاقتباس داخل المصدر.
- تمييز الاقتباس بـ highlight.
- إظهار page markers مثل `[PAGE 3]` كشارة صفحة.

---

### 3) تحسين preview modal
تم تحسين:

```js
previewSource(id, opts={})
```

ليعرض:

- عنوان المصدر.
- عدد الصفحات التقريبي.
- عدد الأحرف.
- حالة التحليل.
- citation ref والصفحة عند فتحه من citation.
- زر نسخ المعاينة.
- زر اذهب للاقتباس.
- highlight داخل النص.

---

## ملفات معدلة

```text
public/qspark.html
server.js
public/app.js
public/index.html
public/qcode.html
```

تحديث version فقط في الملفات العامة عند الحاجة.

---

## النسخة

```text
qjo-qspark-source-viewer-citation-jump-v1-2026-07-21-83
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main83.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-source-viewer-citation-jump-v1-2026-07-21-83
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_SOURCE_VIEWER_CITATION_JUMP_V1
sourceWindowForEvidence
```

داخل الصفحة.

---

## نقد ذاتي
هذه Stage 1. ما زال ناقص في Q-Spark:

1. PDF viewer حقيقي مع page jump بصري.
2. highlight داخل PDF الأصلي لا النص المستخرج فقط.
3. source side panel بدل modal فقط.
4. Notebook memory.
5. Audio Overview MP3.

لكن الآن citation لم تعد مجرد quote modal؛ صار يمكن فتح المصدر حول الاقتباس مع highlight وسياق واضح.

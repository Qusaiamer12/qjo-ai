# Qjo Q-Spark PDF Visual Viewer v1 — 2026-07-21-93

## الهدف
إضافة عرض PDF بصري داخل Q-Spark Source Viewer، مع fallback للنص المستخرج عند عدم توفر ملف PDF الأصلي.

---

## ما تم تنفيذه

### 1) PDF object URL للملفات الجديدة
عند رفع PDF جديد في نفس الجلسة، يتم حفظ:

```js
src.localPdfUrl
src.originalFile
App.pdfObjectUrls[src.id]
```

باستخدام:

```js
URL.createObjectURL(file)
```

حتى يمكن عرضه بصريًا داخل المتصفح.

---

### 2) دعم PDF محفوظ سحابيًا
إذا كان المصدر محفوظًا في Firebase Storage ويملك:

```js
src.cloudFile.downloadURL
```

يحاول viewer استخدامه للعرض البصري.

---

### 3) PDF Canvas Viewer
أضيفت:

```js
pdfUrlForSource(src)
renderPdfVisual(src, page)
pdfVisualHtml(src, page)
```

وتستخدم PDF.js لعرض الصفحة على canvas.

---

### 4) Fallback ذكي
إذا لم يتوفر PDF الأصلي بصريًا:

```text
يظهر fallback للنص المستخرج والـ Page Navigation الحالي
```

بدون كسر تجربة المصدر.

---

## النسخة

```text
qjo-qspark-pdf-visual-viewer-v1-2026-07-21-93
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main93.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-pdf-visual-viewer-v1-2026-07-21-93
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_PDF_VISUAL_VIEWER_V1
renderPdfVisual
```

---

## نقد ذاتي
هذا PDF visual viewer v1. قيوده:

1. الملفات القديمة التي لا تملك `localPdfUrl` أو `cloudFile.downloadURL` ستستخدم fallback النصي.
2. لا يوجد highlight بصري داخل PDF canvas بعد.
3. لا يوجد thumbnail pages sidebar بعد.
4. CORS قد يمنع عرض بعض cloud URLs إذا لم تكن القواعد مضبوطة.

لكن الآن Q-Spark يملك أول PDF visual viewer فعلي بدل النص المستخرج فقط.

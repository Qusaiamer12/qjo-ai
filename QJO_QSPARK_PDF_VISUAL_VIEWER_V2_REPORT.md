# Qjo Q-Spark PDF Visual Viewer v2 — 2026-07-21-94

## الهدف
تطوير PDF Visual Viewer في Q-Spark من مجرد canvas صفحة واحدة إلى تجربة تنقل أفضل: تشغيل تلقائي، إدخال رقم صفحة، ومصغّرات صفحات.

---

## ما تم تنفيذه

### 1) تشغيل تلقائي للصفحة
بعد فتح Source Preview لمصدر PDF، إذا كان الملف الأصلي متاحًا بصريًا:

```text
localPdfUrl
cloudFile.downloadURL
```

يتم تشغيل PDF viewer تلقائيًا على صفحة الاقتباس أو الصفحة المختارة.

---

### 2) Page input
أضيف input رقم صفحة:

```text
[ رقم الصفحة ] + زر اذهب
```

مع السابق/التالي.

---

### 3) PDF Document Cache
أضيف:

```js
getPdfDocumentForSource(src)
```

لتخزين document promise وتجنب إعادة تحميل PDF مع كل تنقل.

---

### 4) Thumbnails
أضيف:

```js
renderPdfThumbnails(src, pdf, activePage)
```

لعرض مصغرات أول 12 صفحة، والضغط على أي مصغّر يفتح الصفحة.

---

## النسخة

```text
qjo-qspark-pdf-visual-viewer-v2-2026-07-21-94
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main94.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-pdf-visual-viewer-v2-2026-07-21-94
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_PDF_VISUAL_VIEWER_V2
renderPdfThumbnails
```

---

## نقد ذاتي
ما زال highlight داخل PDF canvas نفسه غير موجود. الموجود الآن:

- page jump بصري.
- thumbnails.
- text highlight في المصدر المستخرج.

المرحلة التالية الأكثر تقدّمًا لو أردنا PDF أعلى:

```text
PDF canvas text-layer highlight
```

لكنها أصعب لأنها تحتاج text layer coordinates من PDF.js.

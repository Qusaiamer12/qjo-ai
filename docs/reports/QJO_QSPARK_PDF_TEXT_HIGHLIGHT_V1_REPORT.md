# Qjo Q-Spark PDF Text Highlight v1 — 2026-07-21-95

## الهدف
تطوير PDF Visual Viewer في Q-Spark ليحاول تمييز نص الاقتباس داخل صفحة PDF نفسها عبر text layer فوق canvas.

---

## ما تم تنفيذه

### 1) PDF Text Layer
أضيفت طبقة نص فوق PDF canvas:

```js
renderPdfTextLayer(page, viewport, stage, evidence)
```

تستخدم:

```js
page.getTextContent()
pdfjsLib.Util.transform()
```

لرسم spans فوق الصفحة.

---

### 2) Highlight كلمات الاقتباس
أضيفت:

```js
pdfHighlightTerms(evidence)
pdfTextHit(str, evidence)
```

وتحاول تمييز أجزاء النص التي تظهر داخل الاقتباس أو تشبه كلماته.

---

### 3) ربط evidence بالـ PDF viewer
عند فتح citation، يتم حفظ:

```js
lastPreviewEvidence
lastPreviewRef
```

ويستخدمها:

```js
renderPdfVisual(src, page, evidence)
```

لتمييز النص عند الصفحة المناسبة.

---

## النسخة

```text
qjo-qspark-pdf-text-highlight-v1-2026-07-21-95
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main95.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-pdf-text-highlight-v1-2026-07-21-95
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_PDF_TEXT_HIGHLIGHT_V1
renderPdfTextLayer
```

---

## نقد ذاتي
هذا text-layer highlight v1 تقريبي. جودة التمييز تعتمد على:

1. جودة استخراج النص من PDF.
2. تطابق كلمات الاقتباس مع text layer.
3. اتجاه النص العربي في PDF.
4. إحداثيات PDF.js.

قد لا يكون مثاليًا لكل ملفات PDF العربية، لكنه أول أساس فعلي للتمييز البصري داخل PDF canvas.

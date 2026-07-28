# Qjo Export Service Module — 2026-07-21-70

## الهدف
استكمال فصل export بعد مرحلة `src/routes/export.js`، بحيث يصبح:

```text
src/routes/export.js   = endpoints فقط
src/services/exportService.js = منطق PDF/PPTX/ZIP والـ helpers
```

---

## ما تم إنشاؤه

### Export Service

```text
src/services/exportService.js
```

ويحتوي:

```js
exportPdf(req, res)
exportCodeZip(req, res)
exportPptx(req, res)
```

بالإضافة إلى helpers الخاصة بـ:

- Markdown parsing.
- Arabic/RTL detection.
- HTML PDF generation.
- Puppeteer PDF rendering.
- PDFKit fallback.
- PPTX generation.
- Code ZIP generation.

---

## تعديل Export Route

صار:

```text
src/routes/export.js
```

خفيف جدًا:

```js
const { exportPdf, exportCodeZip, exportPptx } = require('../services/exportService');

function registerExportRoutes(app) {
  app.post('/api/export/pdf', exportPdf);
  app.post('/api/export/code-zip', exportCodeZip);
  app.post('/api/export/pptx', exportPptx);
}
```

---

## إصلاح أثناء الاختبار
بعد الفصل، ظهر خطأ في smoke test:

```text
sanitizeZipPath is not defined
```

السبب: helper `sanitizeZipPath()` كان داخل route block الأصلي ولم ينتقل كـ helper عام أثناء التحويل.

تمت إضافته إلى `src/services/exportService.js` وإصلاح regex الخاص بالـ backslash:

```js
.replace(/\\/g, '/')
```

ثم نجح export ZIP.

---

## النسخة

```text
qjo-export-service-module-2026-07-21-70
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/routes/export.js
node --check src/services/exportService.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health          -> qjo-export-service-module-2026-07-21-70
POST /api/export/code-zip -> 200 + valid zip
POST /api/export/pptx     -> 200 + valid pptx zip container
POST /api/qcode/run       -> ok true, code 0
```

---

## أين وصلنا

الآن export مفصول إلى route/service بوضوح:

```text
src/routes/export.js
src/services/exportService.js
```

وهذا يكمل فصل معظم routes الثقيلة عن `server.js`.

---

## نقد ذاتي
`exportService.js` لا يزال كبيرًا، لكنه service متخصص وليس server monolith. لاحقًا يمكن تقسيمه أكثر إلى:

```text
src/services/export/pdfExport.js
src/services/export/pptxExport.js
src/services/export/codeZipExport.js
```

لكن هذه ليست ضرورية الآن مقارنةً بباقي `server.js`.

المتبقي backend الأكبر:

- Groq/Qwen/Gemini adapters الخاصة.
- admin/system routes.
- تنظيف نهائي لـ `server.js`.

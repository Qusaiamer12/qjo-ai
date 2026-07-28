# Qjo Export Route Module — 2026-07-21-69

## الهدف
فصل export routes الثقيلة عن `server.js` إلى route module مستقل، مع الحفاظ على نفس endpoints الخارجية.

---

## ما تم إنشاؤه

```text
src/routes/export.js
```

ويحتوي:

```js
registerExportRoutes(app)
```

وينقل من `server.js`:

```text
POST /api/export/pdf
POST /api/export/code-zip
POST /api/export/pptx
```

بالإضافة إلى helpers الخاصة بالتصدير:

- Markdown parsing.
- HTML PDF rendering with Puppeteer.
- PDFKit fallback.
- PPTX generation.
- ZIP generation.
- Arabic/RTL helpers.

---

## ملاحظة مهمة أثناء النقل
أول محاولة نقل أخذت حدودًا واسعة جدًا وأدخلت معها أجزاء لا تخص export مثل status/admin/Qcode registration داخل `src/routes/export.js`.

تم اكتشاف ذلك أثناء smoke test قبل التغليف بسبب فشل التشغيل.

تم إصلاح النقل بإعادة الاسترجاع من آخر نسخة سليمة ثم نقل الحدود الصحيحة فقط:

1. export helpers:

```text
stripMarkdown -> drawPdfFooter
```

2. export route/html helpers:

```text
escapeHtmlExport -> قبل searchService
```

وبقيت هذه المسارات في `server.js` كما يجب:

```text
/api/status
/api/admin/*
/api/client-context
```

---

## تعديل `server.js`

بدل export routes المباشرة، صار:

```js
const { registerExportRoutes } = require('./src/routes/export');

registerExportRoutes(app);
```

وتمت إزالة imports الثقيلة من `server.js`:

```js
PDFDocument
pptxgenjs
JSZip
```

لأنها صارت داخل `src/routes/export.js`.

---

## النسخة

```text
qjo-export-route-module-2026-07-21-69
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/routes/export.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health          -> qjo-export-route-module-2026-07-21-69
GET  /api/status          -> ok true
GET  /api/admin/me        -> 500 Firebase Admin not configured (متوقع محليًا بدون service account)
POST /api/export/code-zip -> 200 + valid zip file
POST /api/qcode/run       -> ok true, code 0
```

---

## أين وصلنا

تم فصل معظم backend routes الثقيلة:

```text
/api/chat        -> src/routes/chat.js
/api/search      -> src/routes/search.js + src/services/searchService.js
/api/deep-search -> src/routes/search.js + src/services/searchService.js
/api/qcode/*     -> src/routes/qcode.js + src/agents/qcodeAgent.js + src/services/qcodeWorkspace.js
/api/qspark/*    -> src/routes/qspark.js + src/agents/qsparkProviderRouter.js
/api/embeddings  -> src/routes/embeddings.js + src/services/embeddings.js
/api/export/*    -> src/routes/export.js
```

---

## نقد ذاتي
`src/routes/export.js` لا يزال كبيرًا نسبيًا لأنه يحتوي route + export rendering helpers معًا.

المرحلة اللاحقة الأفضل:

```text
src/services/exportService.js
```

لنقل rendering helpers من route إلى service. لكن هذه المرحلة حققت الهدف الأساسي: إخراج export routes الثقيلة من `server.js` بدون كسر endpoints.

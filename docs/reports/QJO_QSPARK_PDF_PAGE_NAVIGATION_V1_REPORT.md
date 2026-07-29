# Qjo Q-Spark PDF Page Navigation v1 — 2026-07-21-84

## الهدف
تطوير Source Viewer في Q-Spark ليصبح قادرًا على تصفح صفحات PDF/المصادر التي تحتوي على علامات:

```text
[PAGE N]
```

مع فتح صفحة الاقتباس من citation.

---

## ما تم تنفيذه

### 1) استخراج صفحات المصدر
أضيفت دوال:

```js
sourcePageRanges(src)
pageRangeFor(src, page)
pageSourceHtml(src, page)
```

تعمل كالتالي:

- إذا كان المحتوى يحتوي `[PAGE N]`، يتم بناء ranges حقيقية حسب العلامات.
- إذا لا توجد علامات صفحات، يتم إنشاء صفحات تقديرية كل 2000 حرف.

---

### 2) Page Navigation UI
أضيفت واجهة داخل Source Preview:

```text
تصفح الصفحات
select لاختيار الصفحة
زر السابق
زر التالي
زر صفحة الاقتباس
```

---

### 3) ربط citation بالصفحة
عند فتح مصدر من citation، إذا evidence يحتوي:

```js
page
```

تظهر إمكانية فتح:

```text
صفحة الاقتباس N
```

---

### 4) Page markers visual badges
علامات مثل:

```text
[PAGE 3]
```

تظهر كشارة:

```text
ص 3
```

داخل المصدر.

---

## النسخة

```text
qjo-qspark-pdf-page-navigation-v1-2026-07-21-84
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qspark-main84.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health        -> qjo-qspark-pdf-page-navigation-v1-2026-07-21-84
GET /qspark.html       -> 200
GET /api/qspark/health -> ok true, separateKeys true
```

وتأكدنا من وجود:

```text
QSPARK_PDF_PAGE_NAVIGATION_V1
sourcePageRanges
```

---

## نقد ذاتي
هذا ليس PDF viewer أصلي بعد، لكنه Page Navigation على النص المستخرج من PDF.

المتبقي لاحقًا:

1. PDF viewer بصري للملف الأصلي.
2. Jump فعلي إلى canvas page.
3. Highlight داخل PDF الأصلي.
4. تخزين page offsets بشكل أدق عند ingestion.

لكن الآن Q-Spark يستطيع التنقل بين صفحات المصدر النصي وفتح صفحة الاقتباس بشكل واضح.

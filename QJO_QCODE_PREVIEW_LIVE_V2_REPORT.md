# Qjo Qcode Preview Live v2 — 2026-07-21-82

## الهدف
تحسين تجربة المعاينة الحية في Qcode لتصبح أقوى وأكثر وضوحًا للمستخدم.

---

## ما تم تنفيذه

### 1) إصلاح Bug في preview/start
كانت الواجهة ترسل:

```text
target
```

بينما backend يقرأ:

```text
path
```

تم تعديل backend ليقبل الاثنين:

```js
req.query.path || req.query.target || 'index.html'
```

---

### 2) Preview List ذكية
تم تحسين:

```text
GET /api/qcode/preview/list
```

ليبحث عن ملفات:

```text
.html
.htm
.svg
```

داخل workspace بدل إرجاع `index.html` فقط دائمًا.

---

### 3) Preview Panel UI أفضل
في `public/qcode.html` أضيف:

- قائمة ملفات قابلة للمعاينة.
- زر تشغيل الملف الحالي.
- زر تحديث القائمة.
- تمييز preview active.
- تسجيل نشاط عند تشغيل/تحديث المعاينة.

---

## النسخة

```text
qjo-qcode-preview-live-v2-2026-07-21-82
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qcode-main82.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests

```text
GET  /api/health                -> qjo-qcode-preview-live-v2-2026-07-21-82
POST /api/qcode/save            -> إنشاء preview-test.html بنجاح
GET  /api/qcode/preview/list    -> يرجع preview-test.html
GET  /api/qcode/preview/start   -> ok true, static-html
GET  /qcode.html                -> 200 + Preview Live v2 موجود
```

---

## نقد ذاتي
هذه نسخة static preview محسّنة. ما زال ناقص لاحقًا:

1. Dev server preview لـ Vite/React.
2. Logs مخصصة للمعاينة.
3. Auto-detect framework وتشغيل npm run dev.
4. Live reload.

لكن الآن المعاينة لم تعد محصورة بـ index.html فقط، والواجهة تعرض قائمة previews واضحة.

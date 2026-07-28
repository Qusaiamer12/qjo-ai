# Qjo App Navigation CSP Fix — 2026-07-21-55

## الهدف
إصلاح مشكلة أن كبسات Q-Spark و Qcode لا تفتح التطبيقات بشكل ثابت.

## السبب الجذري
كان في مشكلتين محتملتين بنفس المسار:

1. أزرار الشريط الجانبي كانت تعتمد على `onclick="window.location.href=..."`.
2. ترويسة الحماية CSP في `server.js` كانت تحتوي:

```js
"script-src-attr": ["'none'"]
```

هذا يمنع تنفيذ inline event handlers مثل `onclick`. وبما أن Q-Spark و Qcode فيهما أزرار كثيرة تعتمد على handlers داخل HTML، فهذا قد يكسر التنقل وبعض أزرار التطبيقات.

## التعديلات

### 1) تحويل أزرار Q-Spark / Qcode إلى روابط حقيقية
في `public/index.html`:

- `#qsparkNavBtn` أصبح:

```html
<a href="/qspark.html" ...>
```

- `#qcodeNavBtn` أصبح:

```html
<a href="/qcode.html" ...>
```

هذا يجعل التنقل يعمل حتى لو JavaScript تأخر أو تعطل.

### 2) تعديل CSP لدعم التطبيقات الحالية
في `server.js`:

```js
"script-src-attr": ["'unsafe-inline'"]
```

هذا ضروري حاليًا لأن Q-Spark و Qcode المدمجين يحتويان أزرار `onclick` كثيرة. بدون هذا، المتصفح يمنعها.

> ملاحظة أمان: هذا حل عملي للنسخة الحالية. لاحقًا الأفضل refactor تدريجي لـ Q-Spark/Qcode لإزالة inline handlers وربط الأحداث من JS خارجي، ثم إعادة `script-src-attr` إلى سياسة أكثر صرامة.

### 3) CSS دعم للروابط داخل sidebar
أضيفت قواعد تمنع underline وتحافظ على شكل أزرار sidebar بعد تحويلها إلى `<a>`.

### 4) تحديث النسخة

```text
qjo-app-navigation-csp-fix-2026-07-21-55
```

## التحقق
تم تشغيل:

```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

Smoke test محلي:

```text
GET /api/health       -> 200, version qjo-app-navigation-csp-fix-2026-07-21-55
GET /qspark.html      -> 200
GET /qcode.html       -> 200
CSP script-src-attr   -> 'unsafe-inline'
```

## الملفات المعدّلة

```text
server.js
public/index.html
public/styles.css
public/app.js
public/qspark.html
public/qcode.html
scripts/audit.js
```

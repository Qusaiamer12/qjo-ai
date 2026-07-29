# Qjo Mode Dropdown UX Fix — 2026-07-21-56

## المشكلة
في واجهة Qjo Assistant، قائمة تغيير الوضع `Flash / Max / Code` كانت تظهر فوق مربع الإدخال وتتداخل مع أزرار الرسالة مثل:

```text
Slides / PDF / Copy
```

هذا جعل تغيير المود صعبًا لأن أزرار التصدير تظهر فوق أو حول خيارات المود.

## السبب
قائمة `.mode-dropdown` كانت `absolute` داخل composer، بينما أزرار الرسالة والتصدير فوقها لها مواقع/طبقات تجعلها تتداخل بصريًا أو وظيفيًا. كان في CSS سابق يعطّل pointer-events فقط لبعض الأزرار، لكنه لا يخفيها بصريًا، فبقيت مزعجة ومربكة.

## الحل

### 1) تموضع ذكي للقائمة عبر JS
أضيفت دالة:

```js
positionModeDropdown()
```

تقرأ مكان زر الوضع الحالي وتحسب:

```css
--qjo-mode-dropdown-left
--qjo-mode-dropdown-bottom
--qjo-mode-dropdown-width
```

حتى تظهر القائمة فوق زر المود مباشرة، بدون خروج عن حدود الشاشة.

### 2) جعل القائمة fixed بدل absolute عند الفتح
CSS جديد يجعل القائمة:

```css
position: fixed;
z-index: 2147483000;
```

حتى لا تنقص أو تنضغط بسبب composer أو عناصر الرسالة.

### 3) إخفاء أزرار التصدير/الإجراءات أثناء فتح المود
عند فتح قائمة المود:

```css
body.mode-menu-open .message-actions,
body.mode-menu-open .export-actions {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
```

هذا يمنع تداخل `Slides / PDF / Copy` مع خيارات `Flash / Max / Code`.

### 4) تكبير خيارات المود
تم تحسين الخيارات لتكون:

- ارتفاع أوضح: 46-50px
- عرض ثابت ومناسب
- خط أوضح
- مساحة لمس أفضل للموبايل
- active state واضح

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
GET /api/health -> qjo-mode-dropdown-ux-fix-2026-07-21-56
GET /           -> 200
CSP             -> script-src-attr 'unsafe-inline'
```

## الملفات المعدّلة

```text
server.js
public/index.html
public/app.js
public/styles.css
public/qspark.html
public/qcode.html
```

## ملاحظة
لم يتم لمس تسجيل الدخول أو Firebase Auth.

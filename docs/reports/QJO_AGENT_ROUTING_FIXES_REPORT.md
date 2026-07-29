# Qjo Agent Routing Fixes — 2026-07-21-57

## الهدف
معالجة أول محور من النقد: كوارث توجيه الذكاء الاصطناعي قبل الدخول في إعادة هيكلة الخادم والواجهة.

تم التركيز على:

1. فقدان الذاكرة السياقية Context Amnesia.
2. البحث الحرفي الغبي Dumb Literal Search.
3. القالب الإجباري الروبوتي Forced Robotic Template.

---

## 1) إصلاح فقدان الذاكرة السياقية

### المشكلة
طلبات مثل:

```text
نسق النص السابق
اعمله جدول
اختصر الرد اللي فوق
ترجم هذا
كمل من نفس النقطة
```

قد تُعامل كطلب جديد مستقل بدل تطبيقها على آخر رد.

### التعديل
أضيف في `public/app.js`:

```js
isContextualTransformRequest(text)
buildContextContinuityHint(text)
```

وعند إرسال الطلب، إذا كان Follow-up Transform Request يتم حقن system hint إضافي داخل رسائل النموذج:

```text
Context continuity lock: The user's latest message is a follow-up transformation/editing request, not a standalone new task...
```

أضيف كذلك دفاع Backend في `server.js`:

```js
isContextualTransformRequestServer(text)
addContextContinuitySystemHint(messages)
```

حتى لو جاء الطلب مباشرة إلى `/api/chat` بدون واجهة Qjo، يظل الخادم يحمي السياق.

---

## 2) إصلاح البحث الحرفي الغبي

### المشكلة
إرسال السؤال الطويل كاملًا للبحث يؤدي إلى نتائج عشوائية أو ضغط زائد.

### التعديل
أصبحت endpoints البحث نفسها تطبق distillation، وليس الواجهة فقط:

```js
/api/search      -> distillSearchQueryServer(rawQuery)
/api/deep-search -> distillSearchQueryServer(rawQuestion)
```

مع الاحتفاظ بـ:

```js
originalQuestion
```

لاستخدامه في ترتيب relevance بدون جعله query حرفي للبحث.

### مثال Smoke Test
Input طويل:

```text
أريد بناء API باستخدام Node.js أو Python لاستقبال ملفات PDF مع التركيز على خطوات مفصلة ومصادر رسمية
```

تحول في `/api/search` إلى:

```text
بناء API باستخدام Node.js أو Python لاستقبال ملفات PDF ومصادر رسمية
```

والـ mode:

```text
technical
```

---

## 3) إزالة القالب الروبوتي الإجباري في البحث

### المشكلة
كان البحث يفرض قالبًا مثل:

```text
جواب مباشر أولًا، ثم دليل مختصر، ثم مصادر...
```

هذا يكسر طلبات مثل:

```text
اعمل جدول مقارنة
اعطيني نقاط فقط
نسقها بطريقة معينة
```

### التعديل
تم تغيير تعليمات البحث في `formatSearchSourcesForPrompt()` إلى تعليمات مرنة:

```text
اتبع صيغة المستخدم المطلوبة أولًا. لا تفرض قالبًا ثابتًا.
```

وتدعم صراحة:

- Markdown tables إذا طلب المستخدم جدولًا.
- bullets إذا طلب نقاطًا.
- citations للمعلومات الحالية فقط.

---

## الملفات المعدلة

```text
server.js
public/app.js
public/index.html
public/qspark.html
public/qcode.html
scripts/audit.js
```

## النسخة

```text
qjo-agent-routing-fixes-2026-07-21-57
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
/api/health -> qjo-agent-routing-fixes-2026-07-21-57
/api/search long query -> distilled technical query
```

---

## لم يتم حله في هذه المرحلة
هذا الإصلاح لا يدّعي حل:

- Monolith server.js.
- RAG job queue/background workers.
- تقسيم الأدوات والوكلاء في مجلدات مستقلة.
- Frontend components/state management.

هذه محاور معمارية أكبر وتحتاج مراحل منفصلة حتى لا نكسر المنتج العام أو Auth.

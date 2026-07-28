# Qjo Response Formatting & Style Rules — 2026-07-21-76

## الهدف
تحسين طريقة إجابات Qjo من ناحية:

- استخدام الجداول عند الحاجة.
- استخدام الإيموجيات المناسبة بدون مبالغة.
- اختيار شكل الإجابة حسب نوع الطلب بدل قالب ثابت.

---

## ما تم تعديله

تم تحديث قسم:

```xml
<response_quality_and_formatting>
```

في:

```text
QJO_SYSTEM_PROMPT_VNEXT_XML.md
QJO_FULL_TRAINING_PROMPT.md
public/app.js
```

---

## القواعد الجديدة

### 1) اختيار شكل الإجابة ديناميكيًا
تمت إضافة قاعدة واضحة:

```text
Choose the response shape dynamically. Do not force one template on every answer.
```

يعني Qjo يختار بين:

```text
خلاصة
نقاط
جدول
خطوات مرقمة
أقسام
كود
```

حسب السؤال، وليس قالبًا واحدًا دائمًا.

---

### 2) قواعد الجداول
تمت إضافة قواعد واضحة لاستخدام Markdown tables عندما تفيد:

```text
comparisons
options
plans
pricing
pros/cons
schedules
feature matrices
error diagnosis
requirements
study plans
decision making
```

مع قيود مهمة:

- إذا المستخدم طلب جدولًا، يعطي جدولًا نظيفًا.
- المقارنات تبدأ بجدول ثم توصية.
- لا جداول في الردود العاطفية أو الدردشة العادية أو النصوص الطويلة إلا إذا طلب المستخدم.
- الجداول تكون مناسبة للموبايل: 3-5 أعمدة قدر الإمكان.
- إذا الجدول عريض جدًا، يستخدم bullets أو يقسمه لجداول صغيرة.

---

### 3) قواعد الإيموجيات
تمت إضافة قواعد لاستخدام الإيموجي بشكل ممتاز ومناسب:

- الإيموجي فقط إذا يحسن القراءة أو الدفء أو المسح البصري.
- لا spam ولا زخرفة.
- الإجابات المهنية يمكن تستخدم 1-3 إيموجيات وظيفية مثل:

```text
✅ إنجاز/فائدة
⚠️ تحذير
🎯 هدف
🧩 بنية/تركيب
🚀 إطلاق/خطوة قادمة
```

- الدردشة casual ممكن فيها إيموجي خفيف إذا نبرة المستخدم تسمح.
- التقنية/coding تستخدم إيموجي وظيفي قليل فقط.
- صفر إيموجيات في:

```text
الغضب
الأعطال/الفشل
الأمن السيبراني والحوادث
الطب/القانون/المال
المستندات الرسمية
النبرة الرسمية
```

---

## النسخة

```text
qjo-response-formatting-style-2026-07-21-76
```

---

## التحقق

تم تشغيل:

```bash
node --check public/app.js
node --check server.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

Smoke tests:

```text
GET /api/health       -> qjo-response-formatting-style-2026-07-21-76
GET /api/status       -> ok true
GET /api/public-config -> Qjo
POST /api/qcode/run   -> ok true, code 0
```

---

## نقد ذاتي
هذا تحسين سلوكي عبر prompt/runtime instructions، وليس اختبار LLM فعلي بالمفاتيح لأن البيئة المحلية بلا مفاتيح AI. بعد النشر على Render مع المفاتيح، الأفضل تجربة أسئلة مثل:

```text
قارن بين Render و Firebase بجدول
رتبلي خطة إطلاق Qjo بنقاط
اشرحلي بسرعة شو عملنا
```

والتأكد أن Qjo يستخدم الجداول والإيموجيات بشكل مناسب بدون مبالغة.

# Qjo SaaS Usage Limits v1 — 2026-07-21-91

## الهدف
إضافة أساس SaaS للحدود والـ quotas بدون كسر الوضع الحالي.

---

## ما تم تنفيذه

### 1) Guest Daily Limit اختياري
تمت إضافة env جديد:

```text
GUEST_DAILY_LIMIT=0
```

القيمة `0` تعني disabled/unlimited.

إذا تم تفعيله مثلًا:

```text
GUEST_DAILY_LIMIT=20
```

سيتم تطبيق حد يومي للضيف حسب IP داخل memory.

---

### 2) Auth Service محدث
تم تحديث:

```text
src/services/authService.js
```

ليدعم:

```js
guestDailyLimit
getLimitConfig()
getUsageSnapshot()
```

ويحافظ على السلوك القديم للمستخدمين المسجلين و `DAILY_USER_LIMIT`.

---

### 3) Endpoint جديد
تمت إضافة:

```text
GET /api/limits
```

ويعرض:

```text
requireFirebaseAuth
dailyUserLimit
guestDailyLimit
adminEmailsConfigured
usageSample
```

بدون أسرار.

---

### 4) تحديث health/status
تمت إضافة معلومات limits إلى health payload.

---

## النسخة

```text
qjo-saas-usage-limits-v1-2026-07-21-91
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
npm run backend-regression
```

النتيجة:

```text
Audit passed with 0 warning(s)
Backend regression passed
```

---

## Smoke tests

```text
GET /api/limits -> ok true, guestDailyLimit 0
```

وتم تحديث backend regression ليفحص `/api/limits`.

---

## نقد ذاتي
هذا foundation وليس نظام billing كامل.

القيود الحالية:

1. guest usage in-memory يضيع عند restart.
2. لا plans حقيقية بعد.
3. لا Stripe/Paddle.
4. لا Firestore usage dashboard كامل.
5. limits للـ tools/files/notebooks غير مفعلة بعد.

لكن أصبح عندنا نقطة بداية آمنة لتفعيل حدود عامة قبل الإطلاق.

# Qjo Auth Service Module — 2026-07-21-74

## الهدف
نقل آخر جزء backend منطقي من `server.js` إلى service مستقل:

```js
getFirebaseUserFromRequest()
verifyAdminRequest()
verifyFirebaseRequest()
enforceDailyUsage()
```

---

## ما تم إنشاؤه

```text
src/services/authService.js
```

ويحتوي:

```js
createAuthService()
todayKey()
getFirebaseUserFromRequest()
verifyAdminRequest()
verifyFirebaseRequest()
enforceDailyUsage()
```

---

## تعديل `server.js`

بدل وجود دوال auth/usage مباشرة، صار:

```js
const authService = createAuthService({
  admin,
  hasFirebaseAdmin,
  adminEmails: ADMIN_EMAILS,
  requireFirebaseAuth: REQUIRE_FIREBASE_AUTH,
  dailyUserLimit: DAILY_USER_LIMIT
});

const verifyAdminRequest = authService.verifyAdminRequest;
const verifyFirebaseRequest = authService.verifyFirebaseRequest;
const enforceDailyUsage = authService.enforceDailyUsage;
```

ثم يتم تمرير هذه الدوال إلى routes كما كان سابقًا.

---

## النسخة

```text
qjo-auth-service-module-2026-07-21-74
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/services/authService.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health          -> qjo-auth-service-module-2026-07-21-74
GET  /api/status          -> ok true
GET  /api/public-config   -> Qjo
GET  /api/admin/me        -> 500 Firebase Admin not configured محليًا، متوقع بدون service account
POST /api/chat            -> 500 AI service is not configured محليًا بدون مفاتيح، متوقع
POST /api/export/code-zip -> 200 + valid zip
POST /api/qcode/run       -> ok true, code 0
POST /api/search          -> still works
```

---

## أين وصلنا

`server.js` صار حوالي:

```text
773 سطر
```

ومعظم backend صار مفصولًا إلى:

```text
src/routes/*
src/services/*
src/agents/*
src/tools/*
```

---

## نقد ذاتي
هذه المرحلة لم تغير سلوك Auth. فقط نقلت الدوال إلى service.

ما زال `server.js` يحتوي:

- Express/CSP/static/bootstrap.
- env constants.
- Firebase Admin initialization.
- provider wrapper functions لـ Kimi/NVIDIA/OpenRouter/Agnes.
- service registration.
- catch-all route/listen.

وهذا مقبول حاليًا كبنية انتقالية آمنة. لو أردنا تنظيفًا نهائيًا أكثر، الخطوة القادمة الصغيرة تكون:

```text
نقل Kimi/NVIDIA/OpenRouter/Agnes thin wrappers إلى src/services/modelProviders.js أو aiProviders.js
```

لكن من ناحية routes والمنطق التشغيلي الثقيل، أغلب العمل backend تم.

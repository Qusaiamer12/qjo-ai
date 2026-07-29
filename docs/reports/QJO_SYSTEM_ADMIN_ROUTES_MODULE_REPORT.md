# Qjo System/Admin Routes Module — 2026-07-21-73

## الهدف
فصل آخر كتلة routes كبيرة من `server.js`:

```text
/api/health
/api/status
/api/public-config
/api/client-context
/api/admin/*
```

مع فصل public/admin config helpers إلى service مستقل.

---

## ما تم إنشاؤه

### 1) Admin Config Service

```text
src/services/adminConfig.js
```

ويحتوي:

```js
createAdminConfigService()
readAdminConfig()
writeAdminConfig()
DEFAULT_PUBLIC_CONFIG
```

بدل وجود default config وقراءة/كتابة config داخل `server.js`.

---

### 2) Admin Routes

```text
src/routes/admin.js
```

وينقل endpoints:

```text
GET  /api/admin/me
POST /api/admin/config
GET  /api/admin/diagnostics
```

مع الحفاظ على نفس `verifyAdminRequest` القادم من `server.js`.

---

### 3) System Routes

```text
src/routes/system.js
```

وينقل endpoints:

```text
GET /api/health
GET /api/status
GET /api/public-config
GET /api/client-context
```

---

## تعديل `server.js`

بدل routes مباشرة، صار:

```js
const adminConfigService = createAdminConfigService(ADMIN_CONFIG_PATH);

registerAdminRoutes(app, { ...deps });
registerSystemRoutes(app, { ...deps });
```

`server.js` الآن يحتفظ بـ:

- Express setup.
- CSP/middleware/static.
- Firebase Admin verification helpers.
- usage enforcement.
- service/router registration.
- app listen.

---

## النسخة

```text
qjo-system-admin-routes-module-2026-07-21-73
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/routes/system.js
node --check src/routes/admin.js
node --check src/services/adminConfig.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET /api/health        -> qjo-system-admin-routes-module-2026-07-21-73
GET /api/status        -> ok true
GET /api/public-config -> Qjo + suggestions موجودة
GET /api/client-context-> ok true + serverTime موجود
GET /api/admin/me      -> 500 Firebase Admin not configured محليًا، وهذا متوقع بدون service account
POST /api/qcode/run    -> ok true, code 0
```

---

## أين وصلنا

`server.js` نزل إلى حوالي:

```text
863 سطر
```

وصار أغلب backend مفصولًا:

```text
src/routes/chat.js
src/routes/search.js
src/routes/qcode.js
src/routes/qspark.js
src/routes/embeddings.js
src/routes/export.js
src/routes/admin.js
src/routes/system.js

src/services/adminConfig.js
src/services/modelProviders.js
src/services/aiProviders.js
src/services/searchService.js
src/services/embeddings.js
src/services/exportService.js
src/services/qcodeWorkspace.js

src/agents/modelRouter.js
src/agents/routerAgent.js
src/agents/contextContinuity.js
src/agents/qcodeAgent.js
src/agents/qcodeProviderRouter.js
src/agents/qsparkProviderRouter.js
```

---

## نقد ذاتي
هذا لا يعني أن `server.js` صار مثاليًا بالكامل. ما زال يحتوي:

- Firebase Admin verification helpers.
- daily usage enforcement.
- Kimi/NVIDIA/OpenRouter/Agnes thin wrappers.
- Express/CSP/bootstrap.

لكن مقارنة بالبداية، أغلب routes والمنطق التشغيلي الثقيل خرج إلى modules.

الخطوة القادمة الصغيرة الممكنة:

```text
src/services/authService.js
```

لنقل:

```js
getFirebaseUserFromRequest()
verifyAdminRequest()
verifyFirebaseRequest()
enforceDailyUsage()
```

بعدها يصير `server.js` أقرب جدًا لـ bootstrap فقط.

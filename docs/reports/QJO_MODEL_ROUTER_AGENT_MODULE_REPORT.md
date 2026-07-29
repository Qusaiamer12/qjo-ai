# Qjo Model Router Agent Module — 2026-07-21-72

## الهدف
نقل قلب توجيه Qjo Assistant من `server.js` إلى agent module مستقل.

المنقول:

```js
containsImageContent()
isTruncatedProviderResponse()
completeIfTruncated()
textFromMessageContent()
combinedUserText()
classifyQjoRequest()
callAIRouter()
```

---

## ما تم إنشاؤه

```text
src/agents/modelRouter.js
```

ويحتوي:

```js
createModelRouter()
callAIRouter()
completeIfTruncated()
containsImageContent()
classifyQjoRequest()
```

هذا صار هو module توجيه النماذج العام لـ Qjo Assistant.

---

## تعديل `server.js`

بدل وجود `callAIRouter()` و `classifyQjoRequest()` داخل السيرفر، صار:

```js
const modelRouter = createModelRouter({
  callGroqChat,
  callQwenChat,
  callKimiChat,
  callNvidiaChat,
  callOpenRouterFreeChat,
  callAgnesChat,
  normalizeProviderFinishReason,
  safeCalculate,
  agnesBaseUrl: AGNES_BASE_URL,
  keys: { ... },
  models: { ... }
});

const callAIRouter = modelRouter.callAIRouter;
const completeIfTruncated = modelRouter.completeIfTruncated;
const containsImageContent = modelRouter.containsImageContent;
```

ثم بقي `src/routes/chat.js` يستقبل نفس dependencies بدون تغيير endpoint.

---

## النسخة

```text
qjo-model-router-agent-module-2026-07-21-72
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/agents/modelRouter.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health          -> qjo-model-router-agent-module-2026-07-21-72
GET  /api/status          -> ok true
POST /api/chat            -> 500 AI service is not configured محليًا بدون مفاتيح، وهذا متوقع
POST /api/export/code-zip -> 200 + valid zip
POST /api/qcode/run       -> ok true, code 0
POST /api/search          -> still works
```

---

## أين وصلنا

`server.js` صار تقريبًا bootstrap/orchestration فقط، ونزل إلى حوالي 958 سطر بعد أن كان ضخمًا جدًا.

تم فصل:

```text
src/agents/modelRouter.js        # Qjo Assistant model routing
src/services/modelProviders.js   # Groq/Qwen/Gemini adapters
src/services/aiProviders.js      # OpenAI-compatible adapter
src/routes/chat.js               # /api/chat
src/routes/search.js             # /api/search + /api/deep-search
src/routes/qcode.js              # /api/qcode/*
src/routes/qspark.js             # /api/qspark/*
src/routes/embeddings.js         # /api/embeddings
src/routes/export.js             # /api/export/*
```

---

## نقد ذاتي
هذا نقل مهم وحساس، لكنه لا يعني أن backend cleanup انتهى 100%.

المتبقي داخل `server.js` الآن:

- Admin/system/status routes.
- Firebase Admin helpers.
- public config helpers.
- بعض provider wrappers العامة لـ Kimi/NVIDIA/OpenRouter/Agnes.
- app bootstrap/middleware/static.

المرحلة القادمة المنطقية:

```text
src/routes/system.js
src/routes/admin.js
src/services/adminConfig.js أو firebaseAdmin.js
```

وبعدها يصبح `server.js` فعليًا أقرب جدًا لنقطة إطلاق نظيفة.

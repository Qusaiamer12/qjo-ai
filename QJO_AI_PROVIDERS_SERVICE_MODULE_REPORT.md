# Qjo AI Providers Service Module — 2026-07-21-66

## الهدف
تفكيك جزء إضافي من `server.js` عبر نقل OpenAI-compatible provider adapter العام إلى service مستقل.

هذا adapter يُستخدم من عدة أجزاء:

- Qcode provider router.
- Q-Spark provider calls.
- Kimi/NVIDIA/OpenRouter/Agnes fallback في Qjo Assistant.

---

## ما تم إنشاؤه

```text
src/services/aiProviders.js
```

ويحتوي:

```js
normalizeProviderFinishReason()
createOpenAICompatibleProviderService()
rotateKeys()
callOpenAICompatibleProvider()
```

الـ key rotation صار داخليًا داخل service بدل `server.js`.

---

## تعديل `server.js`

بدل وجود:

```js
rotateKeys()
callOpenAICompatibleProvider()
```

داخل السيرفر، صار:

```js
const openAICompatibleProviderService = createOpenAICompatibleProviderService();
const callOpenAICompatibleProvider = openAICompatibleProviderService.callOpenAICompatibleProvider;
```

ثم تستمر باقي أجزاء النظام باستخدام نفس الاسم بدون تغيير السلوك.

---

## إصلاح أثناء الاختبار
أول smoke test كشف خطأ ترتيب initialization:

```text
ReferenceError: Cannot access 'callOpenAICompatibleProvider' before initialization
```

السبب: كان Qcode provider router يُنشأ قبل تعريف provider service.

تم إصلاحه بنقل:

```js
const openAICompatibleProviderService = createOpenAICompatibleProviderService();
const callOpenAICompatibleProvider = openAICompatibleProviderService.callOpenAICompatibleProvider;
```

قبل إنشاء:

```js
qcodeProviderRouter
```

ثم أعيدت الاختبارات ونجحت.

---

## النسخة

```text
qjo-ai-providers-service-module-2026-07-21-66
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/services/aiProviders.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health       -> qjo-ai-providers-service-module-2026-07-21-66
GET  /api/status       -> ok true
GET  /api/qcode/health -> ok true + keysConfigured object
POST /api/qcode/run    -> ok true, code 0
POST /api/search       -> still works
```

---

## أين وصلنا

صار عندنا الآن:

```text
src/services/aiProviders.js       # OpenAI-compatible adapter/key rotation
src/services/searchService.js     # Search providers
src/services/qcodeWorkspace.js    # Qcode filesystem/workspace
src/routes/chat.js                # /api/chat
src/routes/search.js              # /api/search + /api/deep-search
src/routes/qcode.js               # /api/qcode/*
src/agents/routerAgent.js         # Router Agent v1
src/agents/qcodeAgent.js          # Qcode agent loop
src/agents/qcodeProviderRouter.js # Qcode provider routing
src/tools/searchTool.js           # strict search schemas
src/tools/fileEditorTool.js       # strict qcode action schemas
src/tools/calculatorTool.js       # calculator tool
```

---

## نقد ذاتي
لم يتم نقل كل provider adapters بعد.

ما زال داخل `server.js`:

- Groq-specific adapter.
- Qwen-specific adapter.
- Gemini adapter.
- Q-Spark routes/provider routing.
- export routes.
- embeddings endpoint.

لكن OpenAI-compatible adapter العام خرج الآن، وهذا يقلل التكرار ويمهد لفصل Q-Spark/provider services لاحقًا.

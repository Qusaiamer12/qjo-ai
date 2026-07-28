# Qjo Q-Spark Route/Provider Module — 2026-07-21-67

## الهدف
متابعة تفكيك `server.js` عبر فصل Q-Spark routes و provider routing إلى modules مستقلة بدون تغيير endpoints الخارجية.

---

## ما تم إنشاؤه

### 1) Q-Spark Provider Router

```text
src/agents/qsparkProviderRouter.js
```

ويحتوي:

```js
createQSparkProviderRouter()
qSparkProviderConfig()
keysConfigured()
models()
callQSparkRouter()
```

يحافظ على نفس منطق Q-Spark السابق:

- separate keys فقط.
- لا fallback إلى مفاتيح Qjo Assistant.
- ترتيب auto:

```text
nvidia -> kimi -> qwen -> groq
```

---

### 2) Q-Spark Routes

```text
src/routes/qspark.js
```

ويحتوي:

```js
registerQSparkRoutes(app, deps)
```

ويسجل نفس endpoints:

```text
GET  /api/qspark/health
POST /api/qspark/chat
```

---

## تعديل `server.js`

بدل وجود:

```js
qSparkProviderConfig()
app.get('/api/qspark/health')
app.post('/api/qspark/chat')
```

داخل السيرفر، صار:

```js
const qSparkProviderRouter = createQSparkProviderRouter({
  groqKeys: QSPARK_GROQ_API_KEYS,
  kimiKeys: QSPARK_KIMI_API_KEYS,
  qwenKeys: QSPARK_QWEN_API_KEYS,
  nvidiaKeys: QSPARK_NVIDIA_API_KEYS,
  groqModel: QSPARK_GROQ_MODEL,
  kimiBaseUrl: QSPARK_KIMI_BASE_URL,
  kimiModel: QSPARK_KIMI_MODEL,
  qwenBaseUrl: QSPARK_QWEN_BASE_URL,
  qwenModel: QSPARK_QWEN_MODEL,
  nvidiaModel: QSPARK_NVIDIA_MODEL,
  callOpenAICompatibleProvider
});

registerQSparkRoutes(app, { router: qSparkProviderRouter, cleanMessages });
```

---

## النسخة

```text
qjo-qspark-route-provider-module-2026-07-21-67
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/routes/qspark.js
node --check src/agents/qsparkProviderRouter.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health        -> qjo-qspark-route-provider-module-2026-07-21-67
GET  /api/status        -> ok true
GET  /api/qspark/health -> ok true, separateKeys true, keysConfigured object
POST /api/qcode/run     -> ok true, code 0
POST /api/search        -> still works
```

---

## أين وصلنا

صار Q-Spark backend مفصولًا إلى:

```text
src/routes/qspark.js
src/agents/qsparkProviderRouter.js
```

وصار Qcode مفصولًا مسبقًا إلى:

```text
src/routes/qcode.js
src/agents/qcodeAgent.js
src/agents/qcodeProviderRouter.js
src/services/qcodeWorkspace.js
src/tools/fileEditorTool.js
```

والبحث والشات العام أيضًا مفصولان:

```text
src/routes/chat.js
src/routes/search.js
src/services/searchService.js
src/services/aiProviders.js
```

---

## نقد ذاتي
هذه المرحلة فصلت Q-Spark backend routes/provider routing فقط.

ما زال منطق Q-Spark frontend الكبير داخل:

```text
public/qspark.html
```

وهذا يحتاج لاحقًا فصل واجهة/State أكبر، لكنه خارج مرحلة backend refactor الحالية.

المتبقي backend داخل `server.js` الآن غالبًا:

- Groq/Qwen/Gemini adapters الخاصة.
- embeddings endpoint.
- export PDF/PPTX/code zip routes.
- admin/status/client-context.
- Q-Spark frontend منطق داخل HTML لا يزال monolithic.

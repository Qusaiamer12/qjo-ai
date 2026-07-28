# Qjo Qcode Provider Router Module — 2026-07-21-65

## الهدف
استكمال فصل Qcode عبر نقل provider routing الخاص بـ Qcode من `server.js` إلى module مستقل.

المنقول من `server.js`:

```js
qcodeProviderConfig()
callQcodeRouter()
```

---

## ما تم إنشاؤه

### Qcode Provider Router

```text
src/agents/qcodeProviderRouter.js
```

يحتوي:

```js
createQcodeProviderRouter()
qcodeProviderConfig()
callQcodeRouter()
keysConfigured()
```

ويحافظ على نفس ترتيب المزودين:

```text
qwen -> groq -> nvidia -> kimi
```

ويستخدم نفس provider adapter العام الموجود حاليًا:

```js
callOpenAICompatibleProvider()
```

عن طريق dependency injection.

---

## تعديل `server.js`

بدل وجود Qcode provider routing داخل السيرفر، صار:

```js
const qcodeProviderRouter = createQcodeProviderRouter({
  qwenKeys: QCODE_QWEN_API_KEYS,
  groqKeys: QCODE_GROQ_API_KEYS,
  kimiKeys: QCODE_KIMI_API_KEYS,
  nvidiaKeys: QCODE_NVIDIA_API_KEYS,
  qwenModel: QCODE_QWEN_MODEL,
  groqModel: QCODE_GROQ_MODEL,
  kimiBaseUrl: QCODE_KIMI_BASE_URL,
  kimiModel: QCODE_KIMI_MODEL,
  nvidiaModel: QCODE_NVIDIA_MODEL,
  callOpenAICompatibleProvider
});
```

ثم يمرر:

```js
callQcodeRouter: qcodeProviderRouter.callQcodeRouter
keysConfigured: qcodeProviderRouter.keysConfigured
```

إلى Qcode agent/routes.

---

## النسخة

```text
qjo-qcode-provider-router-module-2026-07-21-65
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/agents/qcodeProviderRouter.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health       -> qjo-qcode-provider-router-module-2026-07-21-65
GET  /api/qcode/health -> ok true + keysConfigured object
POST /api/qcode/run    -> ok true, code 0
POST /api/search       -> still works
```

---

## أين صار Qcode معماريًا

```text
src/routes/qcode.js              # API routes
src/agents/qcodeAgent.js         # SSE agent loop
src/agents/qcodeProviderRouter.js# Qcode provider routing
src/tools/fileEditorTool.js      # strict action schemas
src/services/qcodeWorkspace.js   # filesystem/snapshots/commands/project map
```

`server.js` الآن لم يعد يحتوي:

- Qcode API routes.
- Qcode SSE agent loop.
- Qcode filesystem/workspace implementation.
- Qcode provider routing.

---

## نقد ذاتي
ما زال provider adapter العام `callOpenAICompatibleProvider()` داخل `server.js` لأنه مش خاص بـ Qcode فقط؛ تستخدمه Qjo/Q-Spark/Qcode. المرحلة القادمة الأفضل تكون فصل provider adapters العامة إلى:

```text
src/services/aiProviders.js
```

لكن Qcode نفسه صار مفصولًا بدرجة جيدة جدًا بدون تغيير endpoints الخارجية.

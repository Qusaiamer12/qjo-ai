# Qjo Model Providers Service Module — 2026-07-21-71

## الهدف
فصل provider adapters الخاصة بـ Groq/Qwen/Gemini من `server.js` إلى service مستقل، كمرحلة قبل نقل `callAIRouter()` نفسه.

---

## ما تم إنشاؤه

```text
src/services/modelProviders.js
```

ويحتوي:

```js
createModelProviders()
callGroqChat()
callQwenChat()
callGeminiChat()
openAiMessagesToGemini()
normalizeProviderFinishReason()
```

مع key rotation داخلي لـ:

```text
Groq
Qwen
Gemini
```

---

## تعديل `server.js`

بدل وجود دوال المزودين الخاصة داخل السيرفر، صار:

```js
const modelProviders = createModelProviders({
  groqKeys: GROQ_API_KEYS,
  qwenKeys: QWEN_API_KEYS,
  geminiKeys: GEMINI_API_KEYS
});

const callQwenChat = modelProviders.callQwenChat;
const callGeminiChat = modelProviders.callGeminiChat;
const callGroqChat = modelProviders.callGroqChat;
const normalizeProviderFinishReason = modelProviders.normalizeProviderFinishReason;
```

وتم حذف:

```js
getQwenKeysInRotation()
callQwenChat()
getGeminiKeysInRotation()
openAiMessagesToGemini()
callGeminiChat()
getGroqKeysInRotation()
callGroqChat()
normalizeProviderFinishReason()
```

من `server.js`.

---

## النسخة

```text
qjo-model-providers-service-module-2026-07-21-71
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/services/modelProviders.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health          -> qjo-model-providers-service-module-2026-07-21-71
GET  /api/status          -> ok true
POST /api/chat            -> 500 AI service is not configured (متوقع محليًا بدون مفاتيح)
POST /api/export/code-zip -> 200 + valid zip
POST /api/qcode/run       -> ok true, code 0
POST /api/search          -> still works
```

---

## أين وصلنا

صار عندنا:

```text
src/services/modelProviders.js     # Groq/Qwen/Gemini adapters
src/services/aiProviders.js        # OpenAI-compatible adapter
src/services/exportService.js      # PDF/PPTX/ZIP export
src/services/embeddings.js         # Embeddings/HuggingFace
src/services/searchService.js      # Tavily/Firecrawl/DuckDuckGo
src/services/qcodeWorkspace.js     # Qcode workspace tools
```

---

## نقد ذاتي
`callAIRouter()` و `classifyQjoRequest()` ما زالوا داخل `server.js`. هذا هو آخر جزء AI orchestration كبير تقريبًا.

المرحلة القادمة المنطقية:

```text
src/agents/modelRouter.js
```

لنقل:

```js
textFromMessageContent()
combinedUserText()
classifyQjoRequest()
callAIRouter()
completeIfTruncated() لاحقًا أو معها
```

لكن يجب نقلها بحذر لأنها قلب توجيه Qjo Assistant.

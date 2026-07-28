# Qjo Embeddings Service/Route Module — 2026-07-21-68

## الهدف
فصل منطق embeddings عن `server.js`، خصوصًا بعد إضافة Hugging Face embeddings، حتى لا تبقى عمليات RAG/embeddings داخل السيرفر الرئيسي.

---

## ما تم إنشاؤه

### 1) Embeddings Service

```text
src/services/embeddings.js
```

ويحتوي:

```js
createEmbeddingsService()
normalizeEmbeddingVector()
meanPoolEmbedding()
parseHuggingFaceEmbeddings()
getEmbeddingProviderName()
configuredCount()
callEmbeddingProvider()
```

يدعم:

```text
Hugging Face feature-extraction
OpenAI-compatible /embeddings endpoint
Caching
Key rotation
Vector normalization
```

---

### 2) Embeddings Route

```text
src/routes/embeddings.js
```

ويحتوي:

```js
registerEmbeddingsRoutes(app, deps)
```

ويسجل نفس endpoint الخارجي:

```text
POST /api/embeddings
```

---

## تعديل `server.js`

بدل وجود دوال embeddings كاملة و route مباشر، صار:

```js
const embeddingsService = createEmbeddingsService({
  embeddingKeys: EMBEDDING_API_KEYS,
  embeddingProvider: EMBEDDING_PROVIDER,
  embeddingBaseUrl: EMBEDDING_BASE_URL,
  embeddingModel: EMBEDDING_MODEL,
  huggingFaceKeys: HUGGINGFACE_API_KEYS,
  huggingFaceModel: HUGGINGFACE_EMBEDDING_MODEL,
  huggingFaceUrl: HUGGINGFACE_EMBEDDING_URL,
  stableCacheKey,
  cacheGet,
  cacheSet,
  cache: memoryCaches.embeddings
});

registerEmbeddingsRoutes(app, { verifyFirebaseRequest, embeddingsService });
```

وتم تحديث health/status ليستخدم:

```js
embeddingsService.configuredCount()
embeddingsService.getEmbeddingProviderName()
```

---

## النسخة

```text
qjo-embeddings-service-route-module-2026-07-21-68
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check src/services/embeddings.js
node --check src/routes/embeddings.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health       -> qjo-embeddings-service-route-module-2026-07-21-68
GET  /api/status       -> ok true, embeddings false بدون مفاتيح
POST /api/embeddings   -> 501 Embeddings are not configured بدون مفاتيح
POST /api/qcode/run    -> ok true, code 0
POST /api/search       -> still works
```

---

## أين وصلنا

تم فصل:

```text
/api/chat       -> src/routes/chat.js
/api/search     -> src/routes/search.js + src/services/searchService.js
/api/deep-search-> src/routes/search.js + src/services/searchService.js
/api/qcode/*    -> src/routes/qcode.js + src/agents/qcodeAgent.js + src/services/qcodeWorkspace.js
/api/qspark/*   -> src/routes/qspark.js + src/agents/qsparkProviderRouter.js
/api/embeddings -> src/routes/embeddings.js + src/services/embeddings.js
```

---

## نقد ذاتي
هذه المرحلة فصلت embeddings runtime، لكنها لم تفصل RAG frontend IndexedDB logic الموجود في `public/app.js`، لأنه جزء Frontend كبير.

ما زال داخل `server.js`:

- Groq/Qwen/Gemini provider adapters الخاصة.
- export routes PDF/PPTX/code-zip.
- admin/status/client-context.
- public config.

المرحلة القادمة المنطقية:

```text
فصل export routes إلى:
src/routes/export.js
src/services/exportService.js
```

# Qjo Search Route/Service/Tool Module — 2026-07-21-62

## الهدف
متابعة تفكيك `server.js` عبر نقل مسارات البحث ومزودي البحث إلى modules مستقلة، مع strict schema باستخدام `zod`.

هذه المرحلة تعالج مباشرة:

- تضخم `server.js`.
- البحث الحرفي الغبي.
- غياب strict tooling للبحث.

---

## ما تم إنشاؤه

### 1) Search Tool Schema

```text
src/tools/searchTool.js
```

يحتوي:

```js
SearchQuerySchema
SearchQueriesSchema
SearchRequestSchema
DeepSearchRequestSchema
validateSearchQueries()
parseSearchRequest()
parseDeepSearchRequest()
```

الهدف:

- منع تمرير prompt-control text إلى البحث.
- إجبار queries على حجم وحدود واضحة.
- تثبيت شكل requests لـ `/api/search` و `/api/deep-search`.

---

### 2) Search Service

```text
src/services/searchService.js
```

يحتوي:

```js
createSearchService()
tavilySearch()
duckDuckGoSearch()
searchProvider()
firecrawlScrape()
enrichResultsWithFirecrawl()
performSearch()
performDeepSearch()
```

الفائدة:

- نقل provider I/O خارج `server.js`.
- بقاء searchCore للـ planning/ranking فقط.
- بقاء route orchestration منفصل.

---

### 3) Search Routes

```text
src/routes/search.js
```

يحتوي:

```js
registerSearchRoutes(app, deps)
```

ويسجل نفس endpoints بدون تغيير خارجي:

```text
POST /api/search
POST /api/deep-search
```

---

## تعديل `server.js`

`server.js` لم يعد يحتوي:

- `/api/search` route body.
- `/api/deep-search` route body.
- Tavily provider implementation.
- DuckDuckGo fallback implementation.
- Firecrawl scraping/enrichment implementation.

بدل ذلك صار يحتوي فقط:

```js
const searchService = createSearchService({
  tavilyApiKey: TAVILY_API_KEY,
  firecrawlApiKey: FIRECRAWL_API_KEY,
  stableCacheKey,
  cacheGet,
  cacheSet,
  memoryCaches
});

registerSearchRoutes(app, { verifyFirebaseRequest, searchService });
```

---

## النسخة

```text
qjo-search-route-service-module-2026-07-21-62
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
node --check src/search/searchCore.js
node --check src/tools/searchTool.js
node --check src/services/searchService.js
node --check src/routes/search.js
node --check src/routes/chat.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health      -> qjo-search-route-service-module-2026-07-21-62
GET  /api/status      -> ok true
POST /api/search      -> يعمل + query distilled
POST /api/deep-search -> يعمل + query distilled
```

مثال search:

```text
Input:
أريد بناء API باستخدام Node.js أو Python لاستقبال ملفات PDF مع التركيز على خطوات مفصلة ومصادر رسمية

Distilled query:
بناء API باستخدام Node.js أو Python لاستقبال ملفات PDF ومصادر رسمية

Mode:
technical
```

مثال deep-search:

```text
Input:
قارن بين Render و Firebase Hosting للباكند مع مصادر رسمية

Distilled question:
قارن بين Render Firebase Hosting للباكند مصادر رسمية

Mode:
comparison
```

---

## نقد ذاتي
هذه مرحلة تفكيك مهمة لكنها لا تنهي المونوليث بالكامل.

تحقق الآن:

- `/api/chat` منفصل في `src/routes/chat.js`.
- `/api/search` و `/api/deep-search` منفصلان في `src/routes/search.js`.
- Search provider I/O منفصل في `src/services/searchService.js`.
- Search strict schemas في `src/tools/searchTool.js`.

المتبقي:

1. نقل Qcode routes إلى `src/routes/qcode.js` و أدواته إلى `src/tools/fileEditorTool.js`.
2. نقل Q-Spark routes إلى `src/routes/qspark.js` و agent مستقل.
3. نقل embeddings إلى `src/services/embeddings.js`.
4. نقل Firebase/Admin helpers إلى `src/services/firestore.js` أو `firebaseAdmin.js`.
5. بناء tool streaming events للواجهة.

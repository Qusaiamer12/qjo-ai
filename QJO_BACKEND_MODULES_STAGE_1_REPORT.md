# Qjo Backend Modules Stage 1 — 2026-07-21-59

## الهدف
بدء معالجة مشكلة تضخم `server.js` / Monolith بدون كسر Render أو Firebase Auth أو المسارات الحالية.

هذه مرحلة تفكيك آمنة، وليست إعادة كتابة كاملة.

---

## ما تم فصله من `server.js`

### 1) Search Core Module
تم إنشاء:

```text
src/search/searchCore.js
```

ونقل منطق البحث غير الشبكي إليه:

```js
compactQuery()
distillSearchQueryServer()
inferSearchMode()
domainOf()
scoreSource()
sourceKind()
buildDeepSearchQueries()
searchBeastTerms()
searchBeastRelevance()
buildSearchBeastPlan()
rankSearchBeastResults()
```

الفائدة:

- تقليل spaghetti داخل `server.js`.
- جعل خوارزميات البحث قابلة للاختبار والتطوير بدون لمس Express routes.
- تثبيت إصلاح Dumb Literal Search في مكان مستقل.

---

### 2) Agent Continuity Module
تم إنشاء:

```text
src/agents/contextContinuity.js
```

ويحتوي:

```js
isContextualTransformRequest()
buildContextContinuityHint()
addContextContinuitySystemHint()
```

الفائدة:

- فصل منطق حماية السياق عن route `/api/chat`.
- تجهيز بنية `agents/` لاحقًا لوكلاء أوسع: router, planner, evaluator.

---

### 3) Calculator Tool Module
تم إنشاء:

```text
src/tools/calculatorTool.js
```

ويحتوي:

```js
CALCULATOR_TOOL
createSafeCalculate()
addCalculatorSystemHint()
```

الفائدة:

- بداية فصل أدوات النظام عن `server.js`.
- تمهيد لفولدر أدوات واضح بدل خلط calculator/file/search/chat داخل ملف واحد.

---

## ما بقي داخل `server.js`
لا يزال `server.js` يحتوي على:

- Express app setup.
- Auth/rate limits.
- Provider calls.
- Search provider I/O.
- Q-Spark routes.
- Qcode routes.
- export routes.

هذا مقصود مؤقتًا حتى لا نكسر المنتج. المرحلة القادمة تكون نقل provider I/O أو Qcode routes تدريجيًا.

---

## النسخة

```text
qjo-backend-tools-agents-modules-2026-07-21-59
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
node --check src/search/searchCore.js
node --check src/agents/contextContinuity.js
node --check src/tools/calculatorTool.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

Smoke tests محلية:

```text
GET  /api/health      -> qjo-backend-tools-agents-modules-2026-07-21-59
GET  /api/status      -> ok true
GET  /qspark.html     -> 200
GET  /qcode.html      -> 200
POST /api/qcode/run   -> ok true, code 0
POST /api/search      -> distilled technical query
```

---

## نقد ذاتي
هذا لا يحل كل المونوليث. هو فقط أول قطع آمن:

- Search core انفصل.
- Agent continuity انفصل.
- Calculator tool انفصل.

ما زال مطلوبًا لاحقًا:

1. نقل search provider I/O إلى service مستقل.
2. نقل Qcode routes إلى module مستقل.
3. نقل Q-Spark routes إلى module مستقل.
4. بناء job queue/RAG workers للعمليات الثقيلة.
5. فصل export service.

لكن هذه المرحلة تقلل المخاطر وتضع بنية `src/search`, `src/agents`, `src/tools` الفعلية بدل الكلام فقط.

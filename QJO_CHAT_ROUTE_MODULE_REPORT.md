# Qjo Chat Route Module — 2026-07-21-61

## الهدف
متابعة تفكيك `server.js` بطريقة آمنة عبر نقل مسار `/api/chat` إلى route module مستقل، بدون تغيير API الخارجي وبدون لمس Firebase Auth.

---

## ما تم تنفيذه

### 1) إنشاء Route مستقل للشات
تم إنشاء:

```text
src/routes/chat.js
```

ويحتوي:

```js
registerChatRoutes(app, deps)
```

المسار الفعلي بقي كما هو:

```text
POST /api/chat
```

لكن لم يعد مكتوبًا داخل `server.js` مباشرة.

---

### 2) Dependency Injection بدل ربط عشوائي
`server.js` يمرر الاعتمادات المطلوبة إلى `registerChatRoutes`:

```js
registerChatRoutes(app, {
  hasAnyAiProvider,
  verifyFirebaseRequest,
  enforceDailyUsage,
  allowedModels,
  defaultModel,
  flashModel,
  cleanMessages,
  containsImageContent,
  callAIRouter,
  completeIfTruncated
});
```

الفائدة:

- `chat.js` صار قابلًا للاختبار والتطوير وحده.
- `server.js` صار أقرب إلى bootstrap/orchestration.
- Auth/limits/provider routing بقيت كما هي بدون كسر.

---

### 3) Router Agent بقي داخل Chat Route
داخل `src/routes/chat.js` صار ترتيب تجهيز الرسائل:

```js
const routingDecision = routeUserRequestDeterministic(messages);
const routedMessages = addRouterSystemHint(messages, routingDecision);
const continuityMessages = addContextContinuitySystemHint(routedMessages);
const preparedMessages = useTools ? addCalculatorSystemHint(continuityMessages) : continuityMessages;
```

يعني `/api/chat` الآن يستخدم:

- Router Agent
- Context Continuity Agent
- Calculator Tool

من Modules مستقلة.

---

## النسخة

```text
qjo-chat-route-module-2026-07-21-61
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
node --check src/agents/routerAgent.js
node --check src/tools/calculatorTool.js
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
GET  /api/health -> qjo-chat-route-module-2026-07-21-61
GET  /api/status -> ok true
POST /api/chat   -> route يعمل ويرجع 500 طبيعيًا عند عدم وجود مفاتيح محلية: AI service is not configured
POST /api/search -> يعمل
```

Router Agent test:

```text
اكتب API ب Node.js        -> qcode
لخص PDF واعمل flashcards -> qspark
مرحبا كيفك               -> general
```

---

## نقد ذاتي
هذا لا يعني أن `server.js` صار نظيفًا بالكامل. لكنه تقدم معماري صحيح:

- `/api/chat` خرج من `server.js`.
- Agent/tool pipeline صار داخل route مستقل.
- الاعتمادات واضحة عبر deps.

المتبقي لاحقًا:

1. نقل `/api/search` و `/api/deep-search` إلى `src/routes/search.js` و `src/services/searchService.js`.
2. نقل Qcode routes إلى `src/routes/qcode.js`.
3. نقل Q-Spark routes إلى `src/routes/qspark.js`.
4. فصل provider adapters إلى `src/services/aiProviders.js`.
5. بناء tool streaming events للواجهة.

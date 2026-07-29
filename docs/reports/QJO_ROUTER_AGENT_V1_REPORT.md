# Qjo Router Agent v1 — 2026-07-21-60

## الهدف
تنفيذ Router Agent بالطريقة الآمنة المناسبة لحالة المشروع الحالية:

- بدون استبدال `/api/chat`.
- بدون إدخال AI SDK/ESM الآن حتى لا نكسر CommonJS/Render.
- باستخدام `zod` لفرض schema صارم.
- ربط القرار كـ routing metadata داخل المسار الحالي.

---

## ما تم تنفيذه

### 1) إضافة zod
تمت إضافة:

```json
"zod"
```

إلى `package.json` لتثبيت قرارات التوجيه والأدوات لاحقًا.

---

### 2) إنشاء Router Agent مستقل
تم إنشاء:

```text
src/agents/routerAgent.js
```

ويحتوي:

```js
RoutingDecisionSchema
validateRoutingDecision()
routeUserRequestDeterministic()
buildRouterSystemHint()
addRouterSystemHint()
```

الـ schema الصارم:

```js
z.object({
  targetAgent: z.enum(['qcode', 'qspark', 'general']),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(1).max(180)
})
```

---

### 3) Routing حتمي قبل LLM
تم تنفيذ routing سريع وحتمي بدل استدعاء نموذج على كل رسالة:

- `qcode` للبرمجة، debugging، APIs، React/Node/Python/Firebase/Render/Git، أو أوامر ملفات.
- `qspark` للدراسة، PDF، مصادر، notebook، flashcards، quizzes، spaced repetition، الأبحاث.
- `general` للمحادثة العامة والترجمة والأسئلة العادية.

هذا أسرع وأرخص وأقل هلوسة من LLM router دائم.

---

### 4) ربط Router Agent داخل `/api/chat`
في `server.js`:

```js
const routingDecision = routeUserRequestDeterministic(messages);
const routedMessages = addRouterSystemHint(messages, routingDecision);
const continuityMessages = addContextContinuitySystemHint(routedMessages);
```

ثم يتم تمرير القرار إلى `callAIRouter()`:

```js
routingDecision
```

والرد الآن يحتوي metadata غير كاسرة:

```json
{
  "answer": "...",
  "provider": "...",
  "model": "...",
  "routing": {
    "targetAgent": "qcode|qspark|general",
    "confidence": 90,
    "reason": "..."
  }
}
```

الواجهة الحالية تتجاهل هذا الحقل، لذلك لا يكسر شيئًا.

---

### 5) تحسين Smart Router الحالي بقرار Router Agent
تم تعديل:

```js
classifyQjoRequest({ messages, mode, routingDecision })
```

إذا القرار:

```text
qcode confidence >= 80
```

يتم تعزيز intent إلى:

```text
code
```

وإذا القرار:

```text
qspark confidence >= 80
```

يتم تعزيز intent إلى:

```text
research
```

بدون تحويل `/api/chat` نفسه إلى `/api/qcode` أو `/api/qspark` الآن.

---

## Unit smoke test للـ Router

```text
اكتب API ب Node.js واربطه مع Firebase
=> qcode, confidence 90

لخص ملف PDF واعمللي flashcards للمراجعة
=> qspark, confidence 86

ترجملي هاي الجملة للإنجليزي
=> general, confidence 74
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
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

Smoke tests محلية:

```text
GET  /api/health    -> qjo-router-agent-v1-2026-07-21-60
GET  /api/status    -> ok true
POST /api/qcode/run -> ok true, code 0
```

---

## نقد ذاتي
هذا ليس Router Agent LLM كامل بعد. هو Router Agent v1 حتمي strict schema.

لماذا؟

- المشروع الحالي CommonJS.
- AI SDK يستخدم ESM غالبًا.
- إدخال `ai` و `@ai-sdk/groq` الآن قد يكسر Render أو provider adapters الحالية.
- routing الحتمي أسرع وأكثر ثباتًا للطلبات الواضحة.

المرحلة القادمة لاحقًا:

1. إضافة optional LLM router للحالات الغامضة فقط.
2. بناء `src/routes/chat.js` ونقل `/api/chat` تدريجيًا.
3. بناء tool streaming events للواجهة.
4. عزل Qcode/Q-Spark agents فعليًا بدل routing metadata فقط.

# تقرير المسح الكامل للريبو — Qjo AI

**التاريخ:** 2026-08-28
**الفرع:** `arena/01a048d3-qjo-ai`
**آخر كوميت:** `27115b11` — "Fix robotic tool usage and prevent unnecessary searches"
**نطاق المسح:** بنية المشروع، الأمان، الاعتماديات، جودة الكود، التشغيل الفعلي (smoke test)، الوثائق.

---

## 1) نظرة عامة على البنية

| العنصر | القيمة |
|---|---|
| نوع المشروع | Node.js + Express (CommonJS)، بدون build step |
| نقطة الدخول | `server.js` (811 سطر) |
| وحدات الخادم | 29 ملف تحت `src/` (routes / services / agents / tools / search) |
| الواجهة | ملفات ثابتة في `public/` (vanilla JS، بدون framework) |
| الاعتماديات | 17 مباشرة، 519 مثبّتة فعليًا |
| النشر | Render (`render.yaml`) + `Procfile` + `Aptfile` (اعتماديات Puppeteer) |
| الاختبارات | لا يوجد إطار اختبار — فقط سكربتات eval يدوية في `evals/` |
| CI | لا يوجد `.github/workflows` |
| Lint / Format | لا يوجد ESLint ولا Prettier |

**التقسيم المعماري جيد:** المسارات (`src/routes`) منفصلة عن الخدمات (`src/services`) والوكلاء (`src/agents`)، وكل شيء يُحقن بالاعتماديات (dependency injection) من `server.js` مع تحقق صريح من الاعتماديات المفقودة. هذه نقطة قوة حقيقية.

**حجم الملفات (تحذير صيانة):**

```
public/qspark.html   3,097 سطر   (298 KB)  ← HTML + CSS + JS في ملف واحد
public/app.js        4,200 سطر   (212 KB)
public/styles.css    6,268 سطر   (152 KB)
public/qcode.html    1,759 سطر   (139 KB)
server.js              811 سطر
```

---

## 2) نتيجة التشغيل الفعلي (Smoke Test)

✅ `npm install` ينجح (8 ثوانٍ، بدون scripts)
✅ الخادم يقلع بنجاح: `Qjo production server running on 4123`
✅ `/api/health` يرجّع JSON صحيح
✅ `node --check` يمر على كل ملفات JS بدون أخطاء نحوية
✅ رؤوس الأمان من helmet مطبّقة (HSTS، CSP، nosniff، frame-ancestors)

---

## حالة الإصلاح (تحديث 2026-08-28)

تم تنفيذ **البنود الخمسة الأمنية العاجلة** والتحقق منها عمليًا بتشغيل الخادم. التفاصيل في القسم 7 بنهاية التقرير.

| # | البند | الحالة |
|---|---|---|
| 1 | مصادقة مسارات Q-Spark | ✅ مُصلح |
| 2 | تسريب `process.env` للعمليات الفرعية | ✅ مُصلح |
| 3 | `trust proxy` + تزوير IP | ✅ مُصلح |
| 4 | ثغرات الاعتماديات | ✅ جزئيًا (19 ← 16، وكل الثغرات القابلة للاستغلال من مدخلات المستخدم أُغلقت) |
| 5 | `QCODE_ALLOW_NETWORK_COMMANDS` معطّل | ✅ مُصلح |
| ➕ | **أداة الحاسبة معطّلة كليًا** (اكتُشفت أثناء البند 4) | ✅ مُصلح |
| 6 | 404 بصيغة HTML لمسارات API | ✅ مُصلح |
| 7 | ملف الملاحظات بلا سقف + بلا حد معدل | ✅ مُصلح |
| 8 | نماذج Groq الافتراضية المهجورة | ✅ مُصلح |
| 9 | `.gitignore` ناقص | ✅ مُصلح |
| 10 | تسريب ذاكرة في حصص الاستخدام | ✅ مُصلح |
| 12 | لا lint ولا اختبارات ولا CI | ✅ مُصلح |
| 13 | متغيّرات ميتة + أرشيف سكربتات | ✅ مُصلح |
| 11 | عزل مساحة عمل Qcode لكل مستخدم | ⏳ مؤجّل (تغيير معماري) |
| 14 | تفكيك ملفات الواجهة الضخمة | ⏳ مؤجّل |
| 15 | أرشفة 107 تقرير | ⏳ مؤجّل |

---

## 3) مشاكل أمنية (مرتبة حسب الخطورة)

### 🔴 حرج — مسارات Q-Spark بلا أي مصادقة

`src/routes/qspark.js` يستقبل `verifyFirebaseRequest` في `deps` من `server.js`… ثم **لا يستخدمه أبدًا**. لا يوجد أي ذكر له داخل الملف.

**تم التحقق عمليًا** بتشغيل الخادم بـ `REQUIRE_FIREBASE_AUTH=true`:

```
POST /api/qcode/files    → 500 (الحماية تعمل ✅)
POST /api/qspark/chat    → 501 (وصل للراوتر — بدون توكن ❌)
POST /api/qspark/upload  → 400 (وصل للراوتر — بدون توكن ❌)
```

**الأثر:** أي شخص على الإنترنت يستطيع استهلاك مفاتيح `QSPARK_*` (تكلفة مالية مباشرة) ورفع ملفات للمعالجة بدون حساب.

**الإصلاح:** إضافة نفس نمط الحماية المستخدم في `qcode.js`:
```js
app.use('/api/qspark', async (req, res, next) => {
  if (!(await deps.verifyFirebaseRequest(req, res))) return;
  next();
});
```

### 🔴 حرج — تسريب متغيرات البيئة إلى العمليات الفرعية في Qcode

`src/services/qcodeWorkspace.js:102` و`:411`:
```js
spawn(bin, args.slice(1), { cwd: workspaceDir, shell: false,
  env: { ...process.env, NODE_ENV: ... } });
```

قائمة الأوامر المسموحة تشمل `node` و`python` و`npm` و`npx`. أي كود يكتبه الوكيل (أو المستخدم) في مساحة العمل ثم يُشغَّل عبر `run_command` سيقرأ **كل** مفاتيح API من `process.env` — رغم أن سياسة الأمان تحجب `printenv` و`cat .env` صراحةً، وهو ما يجعل الحجب شكليًا فقط.

**الإصلاح:** تمرير allowlist بيئي مقيّد بدل نشر `process.env` كاملًا:
```js
env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development' }
```

### 🟠 عالٍ — إعداد `QCODE_ALLOW_NETWORK_COMMANDS` غير مفعّل إطلاقًا

`server.js:464` يمرّر `allowNetworkCommands`، لكن التوقيع في `qcodeWorkspace.js:6` هو:
```js
function createQcodeWorkspaceService({ workspaceDir, snapshotDir, sessionsDir }) {
```
الخيار **يُسقط بالتفكيك** ولا يُستخدم في أي مكان. النتيجة: `npm install` و`npx <pkg>` (تنزيل وتنفيذ كود من الشبكة) مسموحة دائمًا، بينما `/api/health` و`/api/diagnostics` تعلن للمستخدم `qCodeAllowNetworkCommands: false` — أي **الإعداد يكذب**.

### 🟠 عالٍ — لا يوجد `trust proxy` مع الاعتماد على `X-Forwarded-For`

المشروع يُنشر خلف بروكسي Render، لكن `app.set('trust proxy', 1)` غير موجود. النتيجتان:
1. `express-rate-limit` (عند تفعيله) يرى IP البروكسي فقط → حد المعدل عمليًا معطّل أو يحجب الجميع دفعة واحدة.
2. `getClientIp()` (مكرر في `server.js:412` و`authService.js:10`) يثق بترويسة `X-Forwarded-For` القابلة للتزوير → **تجاوز كامل لحصة الضيوف** (`GUEST_DAILY_LIMIT`) بتغيير الترويسة في كل طلب.

### 🟠 عالٍ — ثغرات في الاعتماديات (`npm audit`)

19 ثغرة: **10 عالية**، 9 متوسطة.

| الحزمة | الخطورة | الملاحظة |
|---|---|---|
| `mathjs 13.x` | عالية | GHSA-jvff-x2qm-6286 — تعديل خصائص كائنات ديناميكية. **ذات صلة مباشرة**: `safeCalculate` يعرّض `math.evaluate` لمدخلات المستخدم |
| `brace-expansion` | عالية | DoS باستهلاك ذاكرة — يُصلح بـ `npm audit fix` |
| `ip-address` | عالية | ثلاث ثغرات تجاوز فحوص SSRF |
| `extract-zip` | عالية | symlink path traversal (عبر puppeteer) |
| `image-size` | عالية | حلقات لانهائية (DoS) |
| `uuid <11.1.1` | متوسطة | عبر firebase-admin / exceljs |

`npm audit fix` يعالج `brace-expansion` و`ip-address` و`js-yaml` بدون كسر. `mathjs` يحتاج ترقية major.

### 🟡 متوسط — `/api/feedback` مفتوح للكل ويكتب على القرص

`src/routes/feedback.js:6` — POST بدون مصادقة ولا حد معدل (حد المعدل معطّل افتراضيًا: `IP_RATE_LIMIT_PER_MINUTE=0`). كل طلب يضيف حتى ~8KB إلى `.qjo-feedback.jsonl` بـ `appendFileSync` بدون أي سقف حجم أو تدوير → **امتلاء قرص** + حجب حلقة الحدث. (تم التحقق: 200 OK والملف يُنشأ.)

بالإضافة إلى ذلك: `feedbackStats()` و`readAll()` تقرآن الملف **بالكامل** في الذاكرة وتحلّلانه في كل استدعاء.

### 🟡 متوسط — بروكسي خادم التطوير يمرّر ترويسات العميل كما هي

`src/routes/qcode.js:155` — `headers: { ...req.headers, host: target.host }` يمرّر `Authorization` و`Cookie` إلى الهدف. الهدف مُشتق من regex على stdout يقبل `localhost/127.0.0.1` فقط، لكن دون تقييد المنفذ — أي عملية محلية أخرى تطبع رابط localhost تصبح هدفًا محتملًا (SSRF محدود).

### 🟡 متوسط — كل المستخدمين يتشاركون مساحة عمل Qcode واحدة

`QCODE_WORKSPACE_DIR` مسار عام واحد على مستوى الخادم. لا يوجد فصل حسب `uid`. المستخدم "أ" يقرأ ويكتب ويحذف ملفات المستخدم "ب" عبر `/api/qcode/file`، `/api/qcode/save`، `/api/qcode/rollback`. مقبول لتجربة شخصية، **غير مقبول لمنتج عام**.

### 🟢 منخفض / ملاحظات

- **مفتاح Firebase Web API مكرر حرفيًا في 5 ملفات** (`app.js`, `admin.js`, `qcode.html`, `qspark.html`, `qjo-diagnostic.html`). المفتاح عام بطبيعته وليس سرًا، لكن التكرار يعني أن أي تدوير للمشروع يتطلب 5 تعديلات. الأفضل: جلبه من `/api/public-config`.
- **CSP يسمح بـ `unsafe-inline` و`unsafe-eval`** في `script-src` — يُلغي معظم حماية CSP ضد XSS. الـREADME يدّعي "CSP without inline JS/CSS" وهو **غير صحيح**.
- **135 استخدام لـ `innerHTML`** في الواجهة (23 في `app.js`، 44 في `qspark.html`، 66 في `qcode.html`) — سطح هجوم XSS إن وصل محتوى غير موثوق (رد نموذج، نتيجة بحث، اسم ملف) إليها.
- `inMemoryDailyUsage` في `authService` **لا يُنظَّف أبدًا** — نمو غير محدود مع الوقت (تسريب ذاكرة بطيء).
- `.gitignore` يحتوي 3 أسطر فقط. مجلدات وقت التشغيل غير مستثناة: `qcode-workspace/`، `.qcode-snapshots/`، `.qcode-sessions/`، `.qcode-learning/`، `.qjo-admin-config.json`.

---

## 4) مشاكل وظيفية / سلوكية

### 🔴 مسارات API غير الموجودة ترجّع HTML بحالة 200

`server.js:809`: `app.get('*', (_, res) => res.sendFile('index.html'))` — يلتقط أيضًا `/api/*`.

**تم التحقق:**
```
GET /api/does-not-exist → 200 text/html
```
أي خطأ إملائي في مسار API لدى العميل ينتج `JSON.parse` فاشل و`Unexpected token '<'` بدل 404 واضحة. الإصلاح: 404 JSON صريحة قبل الـcatch-all:
```js
app.use('/api', (_, res) => res.status(404).json({ error: 'Not found' }));
```

### 🟠 تضارب في أسماء النماذج الافتراضية

`.env.example` و`server.js` يوثّقان أن `llama-3.3-70b-versatile` **أُوقف في 2026-08-16**، لكنه ما زال القيمة الافتراضية في مسارين:
- `server.js:78` — `QSPARK_GROQ_MODEL`
- `server.js:105` — `QCODE_GROQ_MODEL`

خريطة `MODEL_MIGRATIONS` في `llmService` تعالج الأمر عند وقوع الخطأ، لكنه يكلّف جولة فاشلة كاملة على كل طلب. الأفضل تحديث القيم الافتراضية مباشرة إلى `openai/gpt-oss-120b`.

### 🟡 حالة عالمية تمنع التوسّع الأفقي

`jobQueue` و`memoryCaches` و`inMemoryDailyUsage` و`geoCache` و`devServerProc` كلها في الذاكرة داخل عملية واحدة. أي نشر بأكثر من instance واحد (أو إعادة تشغيل Render) يفقد المهام والحصص. مقبول على خطة Render المجانية (instance واحد)، لكن يجب توثيقه كقيد.

### 🟡 متغيّرات ميتة في `server.js`

مؤشرات مصرّحة وغير مستخدمة إطلاقًا: `qSparkGroqCursor`, `qSparkKimiCursor`, `qSparkQwenCursor`, `qSparkNvidiaCursor`, `qCodeGroqCursor`, `qCodeQwenCursor`, `qCodeKimiCursor`, `qCodeNvidiaCursor`, `kimiKeyCursor`, `nvidiaKeyCursor`, `openRouterKeyCursor`, `agnesKeyCursor` — بقايا من إعادة الهيكلة (تدوير المفاتيح انتقل إلى `llmService.rotateKeys`). 12 متغيّرًا ميتًا.

### 🟡 تكرار كود

- `getClientIp()` معرّفة مرتين بنفس المنطق (`server.js` و`authService.js`).
- `clampNumber()` مكررة في `chat.js` و`qspark.js`.
- إعدادات Firebase مكررة 5 مرات في الواجهة.
- `scripts/archive/` يحتوي 3 نسخ من سكربت إعادة هيكلة قديم (350 سطر ميت).

---

## 5) الوثائق

- **117 ملف وثائق**، منها **107 تقرير** في `docs/reports/` — أي أكثر من 3.5 أضعاف عدد ملفات الكود المصدري (29). كل ميزة أنتجت تقريرًا منفصلًا. هذا يجعل العثور على المعلومة الحالية صعبًا.
- **README قديم وغير دقيق**: يقول "not deployed yet" بينما `render.yaml` جاهز؛ ويدّعي "CSP without inline JS/CSS" بينما CSP الفعلي يسمح بـ `unsafe-inline` و`unsafe-eval`؛ ويذكر Groq فقط بينما النظام يدعم 7 مزوّدين.
- `QJO_FULL_TRAINING_PROMPT.md` (45 KB، 566 سطر) **يُقرأ من القرص عند الإقلاع ويُحقن في كل طلب** — كلفة توكنات كبيرة على كل استدعاء.

---

## 6) خطة إصلاح مقترحة (حسب الأولوية)

**فورًا (أمان):**
1. حماية `/api/qspark/*` بـ `verifyFirebaseRequest` (سطران).
2. تقييد `env` في `spawn` داخل `qcodeWorkspace.js` (موضعان).
3. إضافة `app.set('trust proxy', 1)`.
4. تشغيل `npm audit fix` (يعالج 3 ثغرات عالية بدون كسر).
5. تفعيل `allowNetworkCommands` فعليًا أو إزالته من الإعدادات والتشخيص.

**قريبًا (استقرار):**
6. 404 JSON لمسارات `/api` غير الموجودة.
7. سقف حجم + تدوير لـ `.qjo-feedback.jsonl`، وحد معدل على `/api/feedback`.
8. تحديث النماذج الافتراضية لـ QSPARK/QCODE.
9. توسيع `.gitignore` ليشمل مجلدات وقت التشغيل.
10. تنظيف الذاكرة الدورية لـ `inMemoryDailyUsage`.

**متوسط المدى (جودة):**
11. عزل مساحة عمل Qcode لكل `uid`.
12. إضافة ESLint + سكربت `npm test` + GitHub Actions بسيط (lint + boot smoke test).
13. حذف المتغيّرات الميتة و`scripts/archive/`.
14. تفكيك `qspark.html` (3,097 سطر) و`app.js` (4,200 سطر) إلى وحدات.
15. أرشفة تقارير `docs/reports/` القديمة في فهرس واحد.

---

## الخلاصة

الأساس المعماري **قوي**: فصل نظيف بين الطبقات، حقن اعتماديات مع تحقق، تعليقات شارحة ممتازة تفسّر "لماذا" وليس "ماذا"، ومعالجة أخطاء ناضجة في طبقة المزوّدين (fallback، إلغاء عند انقطاع العميل، ترحيل النماذج). المشروع **يقلع ويعمل**.

الفجوة الأساسية أن **الحواف** لم تلحق بالمركز: مسار Q-Spark كامل بلا مصادقة، خيار أمان يُعلن مفعّلًا وهو غير موجود في الكود، لا اختبارات آلية ولا CI يمسك هذه الأخطاء، ووثائق تفوق الكود حجمًا لكنها تصف حالة قديمة. البندان 1 و2 في خطة الإصلاح هما ما يجب معالجته قبل أي نشر عام.

---

## 7) ما تم إصلاحه فعليًا (2026-08-28)

### 1. مصادقة Q-Spark — `src/routes/qspark.js`

أُضيف حاجز مصادقة على مستوى المسار كامل، مع استثناء `/health` فقط (فحص حياة عام لا يسرّب بيانات)، وأصبح `verifyFirebaseRequest` اعتمادية إلزامية يفشل التسجيل بدونها.

**التحقق** (`REQUIRE_FIREBASE_AUTH=true`، بدون توكن):

| المسار | قبل | بعد |
|---|---|---|
| `POST /api/qspark/chat` | 501 (مرّ ❌) | **500 (مرفوض ✅)** |
| `POST /api/qspark/upload` | 400 (مرّ ❌) | **500 (مرفوض ✅)** |
| `GET /api/qspark/health` | 200 | 200 (عام عمدًا) |

### 2. عزل بيئة العمليات الفرعية — `src/services/qcodeWorkspace.js`

استُبدل `{ ...process.env }` بدالة `buildChildEnv()` تمرّر 5 متغيّرات فقط (`PATH`, `HOME`, `LANG`, `TMPDIR`, `NODE_ENV`). طُبّق على المواضع الثلاثة: `runQcodeCommand`، `startDevServer`، `runGitCommand`.

**التحقق** — شغّلت الخادم بـ `GROQ_API_KEY=test-key-should-not-leak`، ثم كتبت سكربتًا في مساحة العمل يطبع البيئة وشغّلته عبر `/api/qcode/run`:

```json
{"groq": null, "envCount": 5}
```

قبل الإصلاح كان يطبع المفتاح مع كل متغيّرات البيئة.

### 3. `trust proxy` — `server.js` + `src/services/authService.js`

أُضيف `app.set('trust proxy', 1)`، وأُعيدت كتابة نسختَي `getClientIp()` لتعتمدا على `req.ip` بدل قراءة `X-Forwarded-For[0]` الخام.

**التحقق** — مع `trust proxy = 1`، بادئة مزوّرة من العميل تُتجاهل ويُعتمد الإدخال الذي يضيفه البروكسي:

```
X-Forwarded-For: 1.2.3.4, 203.0.113.7   →   req.ip = 203.0.113.7
```

وحصة الضيوف تعمل: مع `GUEST_DAILY_LIMIT=2` رجّع الطلب الثالث `429` مع `{"limitType":"guest","limit":2,"used":2}`.

> **ملاحظة نشر:** القيمة `1` تعني "ثق بقفزة بروكسي واحدة" وهي الصحيحة لـ Render. إذا أُضيفت طبقة أخرى أمامه (Cloudflare مثلًا) يجب رفع الرقم إلى 2، وإلا عاد التزوير ممكنًا.

### 4. ثغرات الاعتماديات

- `npm audit fix` → عالج `brace-expansion` و`ip-address` و`js-yaml` بدون كسر.
- **`mathjs 13.2.0 → 15.2.0`** (خارج نطاق `audit fix` لأنه major) — هذه كانت الثغرة الوحيدة القابلة للوصول من مدخلات المستخدم عبر أداة الحاسبة.

**النتيجة: 19 ثغرة (10 عالية) ← 16 ثغرة (7 عالية).**

المتبقّي كله عبر اعتماديات غير مباشرة تحتاج ترقيات major لحزم أساسية:
- `uuid <11.1.1` — داخل `firebase-admin` و`exceljs`
- `extract-zip`, `image-size` — داخل `puppeteer`

لا شيء منها يصل إليه مدخل مستخدم مباشرة، لذا تُركت لترقية مخططة منفصلة بدل كسر Firebase أو تصدير PDF.

### 5. تفعيل `QCODE_ALLOW_NETWORK_COMMANDS`

- التوقيع صار يستقبل `allowNetworkCommands` (كان يُسقط بالتفكيك).
- دالة `isNetworkCommand()` تكشف `npx` و`npm install/i/ci/add/update/exec/publish/audit` و`pip install` و`python -m pip`.
- الفحص مطبّق على `runQcodeCommand` و`startDevServer`.
- `/api/qcode/sandbox_status` صار يعرض القيمة الحقيقية `network_commands_allowed` بدل صورة ثابتة.

**التحقق:**

```
افتراضي (false):  npm install left-pad → {"error":"Network commands are disabled..."}
                  npx cowsay hi        → {"error":"Network commands are disabled..."}
                  node -e "1+1"        → {"ok":true, stdout:"2"}          ← لم يتأثر
مع true:          npm install          → {"ok":true, "up to date, audited 520 packages"}
```

### ➕ إصلاح إضافي: أداة الحاسبة كانت معطّلة تمامًا

اكتُشفت أثناء ترقية mathjs. في `server.js`:

```js
math.import({ evaluate: () => { throw new Error('Nested evaluate is disabled.'); } },
            { override: true });
const safeCalculate = createSafeCalculate(math);   // ← يستدعي math.evaluate
```

التصليب كان يستبدل رمز `evaluate` في مساحة أسماء mathjs، وهو **نفس** الدالة التي يستدعيها `safeCalculate`. النتيجة: كل استدعاء لأداة `calculate` كان يفشل بـ "Nested evaluate is disabled." — أي أن النموذج لم يحسب رياضيًا بشكل مؤكّد ولو مرة.

**تأكدت أنها ليست ارتدادًا من الترقية**: أعدت الاختبار على mathjs 13.2.0 (الإصدار المثبّت أصلًا) والنتيجة نفسها. الخلل موجود منذ كتابة الكود.

**الإصلاح:** التقاط `math.evaluate` الأصلية *قبل* التصليب وتمريرها لـ `createSafeCalculate`. الاستدعاءات المتداخلة داخل نص التعبير ما زالت تُحلّ عبر مساحة الأسماء المصلَّبة فتبقى محجوبة.

**التحقق:**

```
sqrt(144) + 15% * 200  => 42          evaluate(2+2)   → blocked
mean([1,2,3])          => 2           simplify(2+2)   → blocked
2^10                   => 1024        parse(1)        → blocked
sin(pi/2)              => 1           import(1)       → blocked
log(100,10)            => 2
```

### فحوص انحدار

- `node --check` يمر على كل ملفات JS (33 ملفًا).
- الخادم يقلع نظيفًا في الأوضاع الأربعة المختبَرة (افتراضي، `REQUIRE_FIREBASE_AUTH=true`، `GUEST_DAILY_LIMIT=2`، `QCODE_ALLOW_NETWORK_COMMANDS=true`).
- المسارات غير المتأثرة تعمل كما كانت: `/api/health`، `/api/qcode/files`، `/api/qcode/save`، `/api/qcode/run`، `/api/qspark/health`.

**لم يُلمس:** البنود 6–15 من خطة الإصلاح (404 لمسارات API، تدوير ملف الملاحظات، النماذج الافتراضية، `.gitignore`، تنظيف الذاكرة، عزل مساحة العمل لكل مستخدم، ESLint/CI، تفكيك ملفات الواجهة، أرشفة التقارير).

---

## 8) الدفعة الثانية: بنود الاستقرار والجودة (2026-08-28)

### 6. 404 بصيغة JSON لمسارات API — `server.js`

أُضيف `app.use('/api', ...)` قبل الـcatch-all يرجّع `404 {"error":"Endpoint not found.","path":...}`، مع معالج أخطاء نهائي يمنع تسريب الـstack traces ويترجم أخطاء multer (`LIMIT_FILE_SIZE` → 413 برسالة مفهومة بدل 500).

```
قبل:  GET /api/does-not-exist → 200 text/html   (العميل ينفجر بـ Unexpected token '<')
بعد:  GET /api/does-not-exist → 404 application/json
      GET /some/client/route → 200 text/html    (الـSPA ما زال يعمل)
```

### 7. ملف الملاحظات — `feedbackService.js` + `routes/feedback.js`

- سقف 5 ميغابايت مع تدوير لنسخة `.1` واحدة → الحد الأقصى 10 ميغابايت بدل نمو لا نهائي.
- ذاكرة تخزين مؤقت لنتيجة `readAll()` مفتاحها `size:mtime` → `feedbackStats()` توقّفت عن إعادة تحليل الملف كاملًا في كل استدعاء إداري.
- حد معدل مخصّص: 20 طلب/دقيقة على `/api/feedback`، مستقل عن `IP_RATE_LIMIT_PER_MINUTE` المعطّل افتراضيًا.

### 8. النماذج الافتراضية

`QSPARK_GROQ_MODEL` و`QCODE_GROQ_MODEL`: `llama-3.3-70b-versatile` (مُوقَف من Groq في 2026-08-16) ← `openai/gpt-oss-120b`، في `server.js` و`.env.example`. هذا يوفّر جولة مزوّد فاشلة كاملة على كل طلب.

> `llama-3.3-70b-versatile` بقي في `ALLOWED_MODELS` عمدًا لقبول العملاء القدامى، و`MODEL_MIGRATIONS` يترجمه وقت التشغيل.
> نماذج NVIDIA و Moonshot تُركت كما هي — مزوّدون مختلفون ولم يُوقفوا شيئًا.

### 9. `.gitignore`

توسّع من 3 أسطر إلى تغطية كاملة: `.env`, `*.pem`, `.qjo-feedback.jsonl(.1)`, `.qjo-admin-config.json`, `qcode-workspace/`, `.qcode-snapshots/`, `.qcode-sessions/`, `.qcode-learning/`, `*.log`, ضوضاء نظام التشغيل.

### 10. تسريب ذاكرة الحصص — `authService.js`

`inMemoryDailyUsage` كان ينمو بمدخل لكل زائر فريد لكل يوم بلا حذف. أُضيف:
- `pruneUsage()` يحذف كل مفتاح لا ينتمي لتاريخ اليوم.
- مؤقت كل ساعة بـ `.unref()` (لا يمنع الخروج من العملية).
- سقف صلب 50,000 مدخل مع تنظيف انتهازي عند التجاوز، حتى لا تُرهق دفعةُ عناوين IP فريدة الذاكرةَ خلال يوم واحد.

### 12. Lint + اختبارات + CI

**`eslint.config.js`** (ESLint 9 flat config): قواعد تستهدف الأخطاء الحقيقية (متغيّرات غير مستخدمة، رموز غير معرّفة، كود غير قابل للوصول) وليس التنسيق — تجنّبًا لدفن الإشارة تحت diff بآلاف الأسطر. بيئتان منفصلتان: Node لـ`src/` و`scripts/`، ومتصفح لـ`public/` مع تعريف مكتبات الـCDN.

**النتيجة: 0 أخطاء، 41 تحذيرًا** (كلها متغيّرات غير مستخدمة، تُركت لتنظيف لاحق).

ESLint التقط فورًا خطأً حقيقيًا في `RoutingEngine.js:424`:
```js
const q = String(`${recent}\n${latest}` || '').toLowerCase();
//                                        ^^ كود ميت: القالب النصي دائمًا صادق
```

**`scripts/smoke-test.js`** — 25 تأكيدًا بدون أي إطار اختبار أو شبكة، يشغّل الخادم الحقيقي بأربع تركيبات بيئة ويؤكد بالضبط ما كان معطوبًا:

| المجموعة | ما يُتحقق منه |
|---|---|
| الوضع الافتراضي | 404 بصيغة JSON، الـSPA سليم، عزل بيئة العمليات الفرعية، حجب أوامر الشبكة، `sandbox_status` صادق |
| `REQUIRE_FIREBASE_AUTH=true` | رفض `qspark/chat`, `qspark/upload`, `qcode/files`, `/api/chat`؛ بقاء `qspark/health` عامًا |
| `GUEST_DAILY_LIMIT=2` | 429 على الطلب الثالث، وعدم إمكانية تصفير الحصة بترويسة مزوّرة |
| `/api/feedback` | يقبل الإدخال الصحيح ويحدّ الفيضان |
| الحاسبة | 3 تعبيرات تُحسب صحيحًا + 3 حجوبات ما زالت فعّالة |

**`docs/ci/github-actions-ci.yml`** — يشغّل `npm ci --ignore-scripts` (تخطّي تنزيل Chromium بحجم ~150 ميغا) ثم lint + smoke + audit على كل دفع و PR. فحص `npm audit` استشاري فقط حتى لا يحجب الثغراتُ المتبقية في الاعتماديات غير المباشرة كلَّ PR غير ذي صلة.

> الملف موضوع في `docs/ci/` وليس `.github/workflows/` لأن حساب الأتمتة الذي كتبه لا يملك صلاحية `workflows` في GitHub، فيُرفض الدفع المباشر إلى ذلك المسار. تفعيله بأمر نسخ واحد موثّق في `docs/ci/README.md`.

> **ملاحظة:** `npm run audit` كان **فاشلًا قبل عملي** — كان يؤكّد أن الواجهة تثبّت `llama-3.3-70b-versatile` بينما `public/app.js` انتقل أصلًا إلى `openai/gpt-oss-120b`. التأكيد نفسه كان قديمًا؛ حُدّث ليطابق الواقع. الآن: `🎉 PERFECT AUDIT`.

### 13. الكود الميت

- حُذفت 12 متغيّر مؤشر ميت من `server.js` (`qSparkGroqCursor`, `kimiKeyCursor`, ... — بقايا انتقال تدوير المفاتيح إلى `llmService.rotateKeys`). تأكدت أن لكل منها إشارة واحدة فقط هي تصريحه.
- حُذف `scripts/archive/` (3 نسخ من سكربت إعادة هيكلة قديم، ~350 سطرًا ميتًا).

### تصحيح ذاتي أثناء العمل

اختبار الدخان **أسقط إصلاحي أنا** للبند 3. كنت ثبّتّ `app.set('trust proxy', 1)`، والاختبار أثبت أن هذا يحمي فقط عند وجود بروكسي حقيقي أمام التطبيق: على اتصال مباشر، Express يعتبر العميل نفسه القفزةَ الموثوقة فيفوز الـheader المزوّر.

الإصلاح النهائي يجعل الإعداد واعيًا بالبيئة:

```
TRUST_PROXY=<n>       عدد القفزات صراحةً (Cloudflare أمام Render = 2)
TRUST_PROXY=false|0   تعرّض مباشر، تجاهل الترويسة تمامًا
غير محدد              1 على Render (يُكتشف عبر متغيّر RENDER)، و0 محليًا
```

**التحقق من المسارين:**

```
محليًا (لا بروكسي):   XFF مزوّر → 429  (الترويسة تُتجاهل، الحصة صامدة)
RENDER=true:          XFF: "1.2.3.N, 203.0.113.7" → 429 على الثالث
                      (البادئة المتغيّرة تُتجاهل، ويُعتمد ما أضافه البروكسي)
```

### تحديث README

كان يقول "not deployed yet" و"CSP without inline JS/CSS" (غير صحيح) ويذكر Groq وحده. حُدّث ليصف المنتجات الثلاثة والمزوّدين السبعة، ويوثّق قيود CSP الفعلية بصراحة، ويضيف قسم "Verify"، وجدول متغيّرات بيئة موسّعًا (`TRUST_PROXY`, `GUEST_DAILY_LIMIT`, `QCODE_ALLOW_NETWORK_COMMANDS`, `ADMIN_EMAILS`)، وقسم "Known open items" مربوطًا بهذا التقرير.

### حالة البوابات الثلاث

```
npm run lint   →  0 errors, 41 warnings
npm test       →  25 passed, 0 failed
npm run audit  →  🎉 PERFECT AUDIT
```

### ما تبقّى عمدًا

| البند | السبب |
|---|---|
| 11 — عزل مساحة عمل Qcode لكل `uid` | تغيير معماري يمسّ المسارات والوكيل واللقطات والجلسات؛ يستحق تغييرًا منفصلًا ومراجعة مستقلة |
| 14 — تفكيك `app.js` (4.2k) و`qspark.html` (3.1k) | إعادة هيكلة واسعة بلا تغطية اختبارات للواجهة؛ خطر الانحدار أعلى من العائد الآن |
| 15 — أرشفة 107 تقرير | تنظيم بحت، وحذف/نقل جماعي قد يكسر روابط داخلية |
| 41 تحذير lint | كلها متغيّرات غير مستخدمة؛ حذفها يحتاج فهم كل موضع على حدة بدل حذف أعمى |

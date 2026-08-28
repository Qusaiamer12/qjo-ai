# نقل Q-Spark و Qcode إلى ريبوهاتهما المستقلة

هذا المستند هو **المرجع الوحيد** لاسترجاع كود Q-Spark و Qcode بعد إزالتهما من
`qjo-ai`، تمهيدًا لإطلاق منتج Qjo الأول وحده.

- **الريبو الهدف لـ Q-Spark:** `Qusaiamer12/qspark-ai`
- **الريبو الهدف لـ Qcode:** `Qusaiamer12/qcode-ai`
- **آخر كوميت يحتوي الكود كاملًا وعاملًا:** `11d93aa09b80064b76506e064c082c9b93c9b19b`

> لا شيء ضاع. الحذف هنا هو حذف من شجرة العمل الحالية فقط؛ كل سطر ما زال محفوظًا
> في تاريخ Git ويُستخرج بأمر واحد كما هو موضّح أدناه.

---

## 1) جرد الملفات المنقولة

### Q-Spark

| الملف | الأسطر | الوصف |
|---|---:|---|
| `public/qspark.html` | 3,097 | الواجهة كاملة (HTML + CSS + JS في ملف واحد) |
| `src/routes/qspark.js` | 136 | `/api/qspark/health`، `/upload`، `/chat` + استخراج نصوص الملفات |

**اعتماديات npm يحتاجها الريبو الهدف:** `pdf-parse`، `mammoth`
(أُزيلت من `qjo-ai` لأنها كانت تُستخدم من `src/routes/qspark.js` فقط).

**وثائق مرتبطة:** `docs/QSPARK_SYSTEM_KNOWLEDGE.md`

### Qcode

| الملف | الأسطر | الوصف |
|---|---:|---|
| `public/qcode.html` | 1,759 | الواجهة كاملة |
| `src/routes/qcode.js` | 281 | ~35 مسارًا: ملفات، تشغيل أوامر، لقطات، git، معاينة، جلسات |
| `src/agents/qcodeAgent.js` | 339 | حلقة الوكيل متعددة الخطوات + بث SSE |
| `src/services/qcodeWorkspace.js` | 537 | مساحة العمل، منفّذ الأوامر المقيّد، اللقطات/التراجع، فهرسة المشروع |
| `src/services/qcodeLearning.js` | 98 | ذاكرة التعلّم عبر الجلسات |
| `src/tools/fileEditorTool.js` | 44 | مخطط Zod للتحقق من إجراءات الأدوات |

**اعتماديات npm:** `jszip` (ما زالت مستخدمة في `qjo-ai` عبر `exportService`، فلم
تُزل من هنا — لكن ريبو Qcode يحتاجها)، `zod`.

**وثائق مرتبطة:** `docs/QCODE_PROJECT_KNOWLEDGE.md`،
`docs/QCODE_VS_AIDER_OPENCODE_ANALYSIS.md`

### مشترك بين الاثنين

كلاهما كان يعتمد على وحدات تبقى في `qjo-ai` ويجب **نسخها** إلى الريبو الهدف:

| الوحدة | لماذا |
|---|---|
| `src/services/llmService.js` | طبقة المزوّدين الموحّدة (7 مزوّدين، تدوير مفاتيح، بث، إلغاء) |
| `src/agents/RoutingEngine.js` | `callAgent()` — لكن فروع `agentType === 'qcode' \| 'qspark'` أُزيلت من نسخة `qjo-ai`؛ استخرجها من الكوميت المرجعي |
| `src/services/authService.js` | التحقق من توكن Firebase وحصص الاستخدام |
| `src/services/textSanitizer.js` | `sanitizeMathNotation` |

---

## 2) الاستخراج

من داخل نسخة من `qjo-ai`:

```bash
# Q-Spark
git checkout 11d93aa -- public/qspark.html src/routes/qspark.js \
  docs/QSPARK_SYSTEM_KNOWLEDGE.md

# Qcode
git checkout 11d93aa -- public/qcode.html src/routes/qcode.js \
  src/agents/qcodeAgent.js src/services/qcodeWorkspace.js \
  src/services/qcodeLearning.js src/tools/fileEditorTool.js \
  docs/QCODE_PROJECT_KNOWLEDGE.md

# الوحدات المشتركة (بنسختها التي كانت تعمل مع المنتجين)
git checkout 11d93aa -- src/services/llmService.js src/agents/RoutingEngine.js \
  src/services/authService.js src/services/textSanitizer.js
```

الملفات تنزل في مسارها الأصلي داخل شجرة العمل، جاهزة للنسخ إلى الريبو الهدف.

بديل: تصدير أرشيف مباشرةً بدون تعديل شجرة العمل:

```bash
git archive 11d93aa public/qspark.html src/routes/qspark.js | tar -x -C /path/to/qspark-ai
git archive 11d93aa public/qcode.html src/routes/qcode.js src/agents/qcodeAgent.js \
  src/services/qcodeWorkspace.js src/services/qcodeLearning.js \
  src/tools/fileEditorTool.js | tar -x -C /path/to/qcode-ai
```

للحفاظ على **تاريخ الكوميتات** لملف معيّن بدل نسخة لقطة واحدة:

```bash
git log --follow --patch 11d93aa -- src/services/qcodeWorkspace.js > qcodeWorkspace.history.patch
```

---

## 3) متغيّرات البيئة المنقولة

أُزيلت هذه من `.env.example` في `qjo-ai` وتنتمي الآن للريبوهات الهدف.

### Q-Spark

```text
QSPARK_GROQ_API_KEYS=
QSPARK_KIMI_API_KEYS=
QSPARK_QWEN_API_KEYS=
QSPARK_NVIDIA_API_KEYS=
QSPARK_GROQ_MODEL=openai/gpt-oss-120b
QSPARK_KIMI_MODEL=moonshot-v1-128k
QSPARK_KIMI_BASE_URL=https://api.moonshot.ai/v1
QSPARK_QWEN_MODEL=qwen/qwen3.5-397b-a17b
QSPARK_QWEN_BASE_URL=https://openrouter.ai/api/v1
QSPARK_NVIDIA_MODEL=deepseek-ai/deepseek-v4-flash
QSPARK_MAX_SOURCES=0
QSPARK_MAX_FILE_MB=0
```

### Qcode

```text
QCODE_GROQ_API_KEYS=
QCODE_QWEN_API_KEYS=
QCODE_KIMI_API_KEYS=
QCODE_NVIDIA_API_KEYS=
QCODE_GROQ_MODEL=openai/gpt-oss-120b
QCODE_QWEN_MODEL=qwen-plus
QCODE_KIMI_MODEL=moonshot-v1-32k
QCODE_KIMI_BASE_URL=https://api.moonshot.ai/v1
QCODE_NVIDIA_MODEL=meta/llama-3.1-70b-instruct
QCODE_MAX_UPLOAD_MB=5
QCODE_MAX_UPLOAD_FILES=20
QCODE_ALLOW_NETWORK_COMMANDS=false
```

---

## 4) ديون معروفة تنتقل مع الكود

هذه مشاكل مفتوحة **لم تُصلَح** قبل النقل، ويجب معالجتها في الريبو الجديد
(تفاصيلها في `docs/reports/QJO_FULL_REPO_SCAN_REPORT.md`):

| المنتج | المشكلة | الخطورة |
|---|---|---|
| Qcode | مساحة عمل واحدة يتشاركها كل المستخدمين — لا فصل حسب `uid`. المستخدم "أ" يقرأ ويكتب ويحذف ملفات المستخدم "ب". | 🔴 يمنع الإطلاق العام |
| Qcode | `run_command` يسمح بـ`node`/`python`، أي تنفيذ كود عشوائي. عُزلت البيئة (لا تسريب مفاتيح) لكن العزل ليس sandbox حقيقيًا — لا حاويات ولا حدود موارد. | 🟠 عالٍ |
| Qcode | بروكسي خادم التطوير يمرّر ترويسات العميل (`Authorization`, `Cookie`) للهدف؛ الهدف مُشتق من regex على stdout بلا تقييد منفذ. | 🟡 SSRF محدود |
| Qcode | حالة خادم التطوير عملية واحدة عامة (`devServerProc`) — مستخدم واحد فقط في اللحظة. | 🟡 |
| Q-Spark | 44 استخدامًا لـ`innerHTML` في `qspark.html` (و66 في `qcode.html`) — سطح XSS إن وصل محتوى غير موثوق. | 🟡 |
| كلاهما | ملف واجهة ضخم واحد (3,097 و1,759 سطرًا) يخلط HTML و CSS و JS. | 🟡 صيانة |
| كلاهما | حالة في الذاكرة فقط — لا يتوسّع أفقيًا. | 🟡 |

**إصلاحات أمنية طُبِّقت قبل النقل ويجب أخذها معك** (موجودة في الكوميت المرجعي):

- مصادقة Firebase على كل مسارات `/api/qspark/*` (كانت مفقودة كليًا).
- بيئة دنيا للعمليات الفرعية في Qcode — مفاتيح المزوّدين لا تُورَّث.
- تفعيل فعلي لـ`QCODE_ALLOW_NETWORK_COMMANDS`.

---

## 5) ما بقي في `qjo-ai`

- تصنيف نيّة التوجيه (`targetAgent: 'qcode' | 'qspark' | 'general'`) في
  `RoutingEngine` **بقي عمدًا**: هو يضبط أسلوب ردّ المحادثة (طابع هندسي مقابل
  دراسي) ولا علاقة له بوجود المنتجين. إزالته كانت ستُضعف جودة الدردشة.
- زرّا Q-Spark و Qcode في الشريط الجانبي بقيا **ظاهرين مع شارة "Soon"** وغير
  قابلين للضغط، كتمهيد تسويقي.

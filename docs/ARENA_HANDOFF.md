# دليل دمج شغل Arena في الـ main المُعاد بناؤه

**الفرع:** `arena/01a06431-qjo-ai` — 3 كوميتات فوق `632a864` (v21 القديم):
- `632a864` v21 — آخر نقطة مشتركة مع الـ main القديم
- `1a23325` v30 — قاعدة المعرفة: دفعات b1–b5 + حزمة كرة القدم (113) → 533 مدخل + محرك RAG v3 + 4 مزودات مجانية
- `29d9b0f` v31 — 35 تنسيق متقدم → **568 مدخل إجمالاً**

> ⚠️ **تحذير مهم:** تاريخ الـ main الحالي (`4aef98a`) **غير مرتبط** بهذا الفرع (المستودع أُعيد بناؤه من الصفر).
> **لا تستخدم `git merge`** — اتبع الخطوات أدناه (نسخ + دمج منطقي).

## 1) ملفات تُنسخ كما هي (جديدة كلياً — صفر تعارض)

```bash
git checkout arena/01a06431-qjo-ai -- \
  knowledge \
  src/services/knowledgeBase.js \
  scripts/kb-validate.js scripts/kb-sync.js \
  docs/reports/QJO_KNOWLEDGE_BASE_QKB_V1_REPORT.md \
  docs/reports/QJO_KB_SCALE_BATCH1_REPORT.md \
  docs/reports/QJO_FREE_PROVIDERS_POLICY_REPORT.md \
  docs/reports/QJO_REAL_VECTOR_FIRST_RAG_V3_REPORT.md
```

- `knowledge/` — 9 ملفات JSON، **568 مدخل**: facts (275: عام 99 + 63 + كرة قدم 113) + taskcraft (293)
- `src/services/knowledgeBase.js` — المحرك: طبقتان (facts/taskcraft)، عتبة 0.42، top-2، ≤1200 حرف، وضع memory/Qdrant
- `scripts/kb-validate.js` — الفاحص · `scripts/kb-sync.js` — مزامنة Qdrant اختيارية

## 2) ملفات معدلة — اطبّق المنطق فوق نسختك الحالية (لا تستبدل)

اعرض الفرق بـ: `git diff 632a864..arena/01a06431-qjo-ai -- <المسار>`

| الملف | التغيير المطلوب |
|---|---|
| `src/routes/chat.js` ⚠️ | **دمج فقط** (عندك تعديلات ستيرمنغ حديثة). الإضافة: حقن سياق KB بطبقتيه في البرومبت (يختار اللغة عربي/إنجليزي حسب استعلام المستخدم) |
| `public/app.js` ⚠️ | **دمج فقط**. الإضافة: تمرير وضع/لغة الاستعلام للباكند |
| `src/services/llmService.js` | 4 مزودات مجانية: Groq / LLM7 (بلا مفتاح) / Kimi `moonshot-v1-8k` / Qwen + `callLlm7Chat` |
| `src/services/embeddings.js` + `src/routes/embeddings.js` | تصدير وكشف `callEmbeddingProvider` مع كاش فيكتور (يستخدمه المحرك) |
| `server.js` | تهيئة وتهيئة مسبقة لخدمة knowledgeBase عند الإقلاع |
| `src/agents/RoutingEngine.js` | تمرير وضع KB وسياق اللغة في التوجيه |
| `package.json` | أضف سكربتي `kb:validate` و`kb:sync` + اعتمادية `@qdrant/js-client-rest@^1.19.0` ثم `npm install` — **لا تنسخ package-lock.json** |
| `.env.example` | متغيرات المزودات الأربعة + Qdrant (كلها اختيارية — التطبيق يعمل بلاها بوضع memory) |
| `.gitignore` | أضف `knowledge/.vector-cache.json` |
| `README.md` / `docs/DEPLOYMENT_GUIDE.md` | أقسام قاعدة المعرفة والمزودات — أضف دون حذف محتواك |

## 3) الفحوصات الإلزامية بعد الدمج

```bash
npm install
npm run kb:validate   # المطلوب: 568 مدخل، 0 تحذيرات
npm run lint          # المطلوب: 0 أخطاء
npm test              # المطلوب: 34/34
```

## 4) ممنوعات

- لا ترفع `knowledge/.vector-cache.json` (كاش تشغيل)
- لا تستبدل `chat.js` أو `app.js` بنسخة الفرع — الدمج فقط
- لا تحذف بروتوكول الأسلوب الأدبي ولا تعديلات الستريمنغ الموجودة على main

*وُلّد آلياً 2026-09-03 من جلسة Arena.*

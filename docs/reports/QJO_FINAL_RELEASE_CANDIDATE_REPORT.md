# Qjo Final Release Candidate — 2026-07-25-114

## النتيجة
تم توحيد النسخة النهائية بعد مراجعة تضارب النسخ، واستعادة ميزات Qcode المتقدمة، والتأكد أن Q-Spark المتقدم موجود كاملًا.

## النسخة

```text
qjo-final-release-candidate-2026-07-25-114
```

## فحص الميزات المتقدمة

### Qcode
تم التأكد من وجود:

- Multi-step Agent Loop v2.
- Git status/diff/history/init/commit.
- ZIP project import.
- GitHub public repo import foundation.
- Semantic project index.
- Dev server status/start/stop/proxy foundation.
- Sandbox hardening.
- Tool Streaming UI.
- Rich Diff UI.
- Diff Review Modal.
- Activity Timeline.
- Command Logs Panel.
- Preview Live UI.

### Q-Spark
تم التأكد من وجود:

- Source Viewer + Citation Jump.
- Concept Citation Links.
- PDF Visual Viewer v2.
- PDF Text Highlight v1.
- PDF Page Navigation.
- Notebook Memory.
- Audio Overview v2.
- Concept Graph.
- Jobs UI.
- Auto source-stats jobs.
- Auto embeddings job when embeddings are configured.
- Job retry.

## الفحوصات النهائية

تم تشغيل:

```bash
npm run audit
npm run backend-regression
QJO_BASE_URL=http://127.0.0.1:3000 npm run deploy-verify
```

النتيجة:

```text
Audit passed with 0 warning(s)
Backend regression passed
Deploy verification passed
```

## ملاحظات مهمة

- محليًا `/api/chat` يرجع `AI service is not configured` بدون مفاتيح، وهذا طبيعي.
- محليًا embeddings ترجع 501 بدون مفاتيح، وهذا طبيعي.
- Git status داخل Qcode قد يرجع code 128 إذا workspace ليس git repo بعد، وهذا طبيعي.
- Dev server proxy يرجع 503 إذا dev server غير شغال، وهذا طبيعي.

## نشر Render

إذا ملفات المشروع في جذر الريبو:

```text
Root Directory = فارغ أو .
Build Command = npm install
Start Command = npm start
```

لفترة تجربة مجانية:

```text
REQUIRE_FIREBASE_AUTH=false
DAILY_USER_LIMIT=0
GUEST_DAILY_LIMIT=0
IP_RATE_LIMIT_PER_MINUTE=0
```

لتفعيل HuggingFace embeddings:

```text
EMBEDDING_PROVIDER=huggingface
HUGGINGFACE_API_KEYS=hf_...
HUGGINGFACE_EMBEDDING_MODEL=intfloat/multilingual-e5-base
```

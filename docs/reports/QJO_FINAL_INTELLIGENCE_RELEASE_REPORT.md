# Qjo Final Intelligence Release — 2026-07-25-115

## النسخة

```text
qjo-intelligence-critical-fixes-v1-2026-07-25-115
```

## أهم ما تم تثبيته نهائيًا

### Intelligence / Prompt
- ربط `QJO_FULL_TRAINING_PROMPT.md` فعليًا server-side كأول system message في `/api/chat`.
- ربط نفس البرومبت server-side في `/api/qspark/chat` مع runtime context.
- رفع default text model إلى `llama-3.3-70b-versatile` بدل 8B.
- رفع default max_tokens في chat route إلى 2600.
- تحديث frontend normal mode ليستخدم 70B بدل flash 8B.
- إضافة feedback route + أزرار 👍👎 على إجابات Qjo.

### Q-Spark
- Source Viewer + Citation Jump.
- PDF Page Navigation.
- PDF Visual Viewer.
- PDF Text Highlight.
- Concept Graph + Concept Citation Links.
- Notebook Memory.
- Audio Overview v2.
- Jobs UI + auto source stats + embeddings auto job + retry.

### Qcode
- Multi-step Agent Loop v2.
- Tool Streaming UI.
- Rich Diff + Diff Review Modal.
- Activity Timeline + Command Logs.
- Preview Live + Dev Server Proxy foundation.
- Git Integration + Project Index + Semantic Index.
- ZIP Import + GitHub public repo import foundation.
- Sandbox hardening: sanitized env, network/install blocked by default.

### SaaS / Deployment
- `/api/limits`, quotas foundation.
- Terms/Privacy/Safety pages.
- Backend regression eval.
- Deploy verification eval.
- AI quality eval v1.

## فحوصات نهائية

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

## Render notes

إذا واجه Puppeteer build issue، اضبط:

```text
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

Build Command:

```bash
PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install
```

Start Command:

```bash
npm start
```

Root Directory إذا الملفات في جذر الريبو:

```text
فارغ أو .
```

## نقد ذاتي
هذه نسخة قوية جدًا كـ Release Candidate. المتبقي المستقبلي الحقيقي:

- Containerized sandbox حقيقي لـ Qcode.
- Firestore-backed persistent jobs.
- Billing/plans.
- Frontend module split عميق.
- Live verification على Render بالمفاتيح الحقيقية.

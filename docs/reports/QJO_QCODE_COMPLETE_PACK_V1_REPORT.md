# Qjo Qcode Complete Pack v1 — 2026-07-21-108

## الهدف
إغلاق حزمة Qcode المتقدمة الحالية: Agent loop أقوى، Git integration، Project Index، ZIP import، وSandbox hardening، مع الحفاظ على regression clean.

---

## ما تحتويه هذه الحزمة

### 1) Multi-step Agent Loop v2

```text
PLAN → ACT → OBSERVE → REPAIR/CONTINUE → VERIFY → FINAL
```

مع:

```text
maxSteps
maxActionsTotal
agent_step SSE
observation memory
repair after command failure
```

---

### 2) Git + Project Index v2

Endpoints:

```text
GET  /api/qcode/git/status
GET  /api/qcode/git/diff
GET  /api/qcode/git/history
POST /api/qcode/git/init
POST /api/qcode/git/commit
GET  /api/qcode/project-index
```

UI:

```text
Git modal
Project Index modal
```

---

### 3) Repo ZIP Import v1

Endpoints:

```text
POST /api/qcode/import/zip
```

ويدعم upload ZIP تلقائيًا من `/api/qcode/upload` إذا كان الملف الوحيد ZIP.

Safety:

```text
blocks .env
blocks .git
blocks node_modules
blocks private key filenames
blocks zip-slip paths
snapshot before import
```

---

### 4) GitHub Import Foundation

Endpoint:

```text
POST /api/qcode/import/github
```

يدعم public GitHub repo archive import عبر codeload، مع strip top-level folder وZIP import safety.

---

### 5) Sandbox Hardening v1

- sanitized env whitelist.
- blocks network/install commands by default.
- `QCODE_ALLOW_NETWORK_COMMANDS=false`.
- Git subcommands constrained.
- `/api/qcode/sandbox_status` exposes policy.

---

## النسخة

```text
qjo-qcode-complete-pack-v1-2026-07-21-108
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
npm run backend-regression
```

النتيجة:

```text
Audit passed with 0 warning(s)
Backend regression passed
```

---

## نقد ذاتي
هذه حزمة Qcode قوية جدًا، لكنها لا تعني أن Qcode وصل لنهاية الطريق.

المتبقي لاحقًا:

1. Containerized sandbox حقيقي.
2. GitHub private repo import عبر OAuth/token آمن.
3. Vite/React dev server preview حقيقي.
4. Semantic project index عميق.
5. Per-hunk accept/reject.
6. Multi-user workspace isolation.

لكن الحالي صار قفزة كبيرة جدًا مقارنة بالبداية.

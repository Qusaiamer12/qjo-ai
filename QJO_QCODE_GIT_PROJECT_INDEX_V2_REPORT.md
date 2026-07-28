# Qjo Qcode Git + Project Index v2 — 2026-07-21-105

## الهدف
استكمال Qcode Git integration بإضافة تهيئة Git، commit آمن، وProject Index من داخل الواجهة.

---

## Backend

### Git endpoints

```text
GET  /api/qcode/git/status
GET  /api/qcode/git/diff
GET  /api/qcode/git/history
POST /api/qcode/git/init
POST /api/qcode/git/commit
```

### Project Index endpoint

```text
GET /api/qcode/project-index
```

يرجع:

```text
totalFiles
totalBytes
byExtension
important files
scripts
dependencies
framework
```

---

## Safety

أوامر Git المسموحة فقط:

```text
status
diff
log
show
branch
init
add
commit
```

ويتم منع أي argument يحتوي:

```text
credential
password
token
secret
.env
```

---

## Frontend

في `public/qcode.html`:

- زر Git.
- Git modal.
- `git init`.
- `commit snapshot`.
- status/diff/history.
- زر Project Index.
- Project Index modal.

---

## النسخة

```text
qjo-qcode-git-project-index-v2-2026-07-21-105
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

## Smoke tests

```text
POST /api/qcode/git/init -> ok true
GET  /api/qcode/git/status -> ok true
GET  /api/qcode/project-index -> ok true
```

---

## ملاحظة
أثناء الاختبار تم إنشاء `.git` داخل `qcode-workspace` محليًا، وتم حذفه قبل التغليف حتى لا يدخل في ZIP.

---

## نقد ذاتي
هذه Git v2 عملية، لكن لا تزال محلية داخل Qcode workspace فقط. لاحقًا يمكن إضافة:

1. branch UI.
2. git commit history viewer أعمق.
3. ربط git diff مع Rich Diff modal.
4. repo import من GitHub.
5. remote management آمن بدون كشف secrets.

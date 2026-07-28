# Qjo Qcode Sandbox Hardening v1 — 2026-07-21-106

## الهدف
تقوية أمان Qcode command runner قبل الاستخدام العام، بدون كسر الأوامر الآمنة الحالية.

---

## ما تم تنفيذه

### 1) Sanitized Environment
كان `runQcodeCommand()` يمرر:

```js
process.env
```

كاملًا إلى الأوامر. هذا خطر لأنه قد يسرّب API keys أو secrets.

تم استبداله بـ whitelist فقط:

```js
PATH
HOME
USER
USERNAME
TMP
TEMP
SystemRoot
WINDIR
ComSpec
NODE_ENV
npm_config_cache
PYTHONPATH
```

مع:

```js
QCODE_SANDBOX=soft-allowlist
```

---

### 2) منع أوامر الشبكة/التثبيت افتراضيًا
أضيف env جديد:

```text
QCODE_ALLOW_NETWORK_COMMANDS=false
```

افتراضيًا يمنع:

```text
npm install
npm add
npm update
npm audit
npm publish
npm login
npm token
npx بدون --no-install
أي أمر يحتوي http/https URL
```

يمكن تفعيله مؤقتًا فقط إذا أردت:

```text
QCODE_ALLOW_NETWORK_COMMANDS=true
```

---

### 3) Git subcommands آمنة
تم دعم Git لكن فقط subcommands آمنة:

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

ومنع arguments تحتوي:

```text
credential
password
token
secret
.env
```

---

### 4) Sandbox status أغنى
تم تحديث:

```text
GET /api/qcode/sandbox_status
```

ليعرض policy كاملة:

```js
mode: soft-allowlist-hardened
envPolicy: sanitized-whitelist-no-secrets
networkCommandsAllowed
allowedCommands
allowedGitSubcommands
blockedSecrets
timeoutMs
outputCapChars
```

---

## النسخة

```text
qjo-qcode-sandbox-hardening-v1-2026-07-21-106
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
GET /api/health -> qjo-qcode-sandbox-hardening-v1-2026-07-21-106
GET /api/qcode/sandbox_status -> envPolicy sanitized-whitelist-no-secrets
POST /api/qcode/run "npm install left-pad" -> blocked
POST /api/qcode/run "pwd" -> ok true, code 0
```

---

## نقد ذاتي
هذا ليس container sandbox بعد، لكنه تحسن أمني مهم جدًا:

- لا تمرير secrets env للأوامر.
- منع install/network افتراضيًا.
- Git مقيد.
- policy واضحة للواجهة/admin.

المتبقي لاحقًا للإطلاق العام الكبير:

```text
containerized sandbox
per-user workspace isolation
CPU/RAM limits
network isolation حقيقي
cleanup policies
```

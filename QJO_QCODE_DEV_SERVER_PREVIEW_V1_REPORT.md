# Qjo Qcode Dev Server Preview v1 — 2026-07-21-109

## الهدف
إضافة أساس لتشغيل dev server داخل Qcode workspace، بدل static preview فقط.

---

## Backend

تم تحديث:

```text
src/services/qcodeWorkspace.js
src/routes/qcode.js
```

### Endpoints جديدة

```text
GET  /api/qcode/dev-server/status
POST /api/qcode/dev-server/start
POST /api/qcode/dev-server/stop
```

### Detection

يحاول اكتشاف الأمر من:

```text
package.json scripts.dev
package.json scripts.start
```

ويشغله داخل workspace على:

```text
127.0.0.1:5173
```

### Safety

- يستخدم sanitized env.
- لا يسمح بأوامر install/network إذا `QCODE_ALLOW_NETWORK_COMMANDS=false`.
- يسمح فقط بأوامر dev server من npm/node/python.

---

## Frontend

تم تحديث:

```text
public/qcode.html
```

داخل Preview panel:

```text
Dev Server
إيقاف Dev
فحص الحالة
```

ويعرض:

```text
running
command
url
pid
exit code
stdout/stderr
```

---

## النسخة

```text
qjo-qcode-dev-server-preview-v1-2026-07-21-109
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
```

والـ smoke:

```text
GET /api/health -> qjo-qcode-dev-server-preview-v1-2026-07-21-109
GET /api/qcode/dev-server/status -> ok true, running false
GET /qcode.html -> 200 + Dev Server UI موجود
```

---

## نقد ذاتي
هذه v1 foundation. على Render قد لا يمكن proxy مباشر لـ localhost dev server من browser بدون route proxy إضافية. لذلك الواجهة تعرض status/logs حاليًا.

المتبقي لاحقًا:

1. Proxy route لـ dev server output.
2. دعم dynamic ports per session.
3. auto install deps بخيار آمن ومقيد.
4. live reload iframe حقيقي.

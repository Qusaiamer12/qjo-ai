# Qjo Qcode Dev Server Proxy v1 — 2026-07-21-110

## الهدف
تمكين Qcode Preview panel من عرض dev server عبر نفس دومين Qjo بدل محاولة فتح localhost مباشرة من المتصفح.

---

## Backend

تمت إضافة route:

```text
/api/qcode/dev-server/proxy/*
```

يعمل proxy إلى:

```text
http://127.0.0.1:{devServerPort}
```

فقط إذا dev server شغال.

إذا لم يكن dev server شغالًا يرجع:

```text
503 Qcode dev server is not running.
```

---

## Frontend

تم تحديث `public/qcode.html`:

- زر Dev Server يشغل السيرفر.
- iframe الآن يستخدم:

```text
/api/qcode/dev-server/proxy/
```

بدل فتح `127.0.0.1:5173` مباشرة.

- preview info يعرض Dev Server Proxy.

---

## النسخة

```text
qjo-qcode-dev-server-proxy-v1-2026-07-21-110
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
```

والـ smoke:

```text
GET /api/health -> qjo-qcode-dev-server-proxy-v1-2026-07-21-110
GET /api/qcode/dev-server/proxy/ -> 503 عند عدم تشغيل dev server وهذا متوقع
GET /qcode.html -> 200 + proxy UI موجود
```

---

## نقد ذاتي
هذا Proxy v1. لا يزال يحتاج لاحقًا:

1. دعم WebSocket proxy لـ Vite HMR.
2. دعم dynamic ports لكل session.
3. تعامل أفضل مع POST body types غير JSON.
4. Auth/isolation لكل user workspace.

لكن iframe صار يملك route من نفس دومين Qjo لعرض dev server عند تشغيله.

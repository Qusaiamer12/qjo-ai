# Qjo Public SaaS Pages v1 — 2026-07-21-92

## الهدف
إضافة صفحات ثقة وقانونية أساسية للإطلاق العام كـ SaaS.

---

## الصفحات الجديدة

```text
/terms.html
/privacy.html
/safety.html
```

### Terms
شروط استخدام أولية توضّح:

- الاستخدام المقبول.
- مسؤولية مراجعة المخرجات.
- حدود الحساب والاستخدام.
- حق تقييد الخدمة عند الإساءة.

### Privacy
سياسة خصوصية أولية توضّح:

- البيانات التي قد تُستخدم.
- المحادثات والمرفقات.
- حساب Firebase.
- Q-Spark notebooks/sources.
- عدم رفع الأسرار.

### Safety
صفحة سلامة توضّح:

- الاستخدامات المسموحة.
- الاستخدامات غير المسموحة.
- المجالات الحساسة.
- Qcode safety.
- Q-Spark citation caution.

---

## النسخة

```text
qjo-public-saas-pages-v1-2026-07-21-92
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
```

والنتيجة:

```text
Audit passed with 0 warning(s)
```

---

## Smoke tests

```text
GET /api/health  -> qjo-public-saas-pages-v1-2026-07-21-92
GET /terms.html  -> 200
GET /privacy.html -> 200
GET /safety.html -> 200
```

---

## نقد ذاتي
هذه صفحات أولية وليست صياغة قانونية نهائية. قبل إطلاق تجاري كامل، الأفضل مراجعتها قانونيًا حسب الدولة/السوق المستهدف، وإضافة:

- Cookie policy إذا استُخدمت تحليلات.
- Data retention policy.
- Contact/support email.
- Billing/refund policy عند تفعيل الاشتراكات.

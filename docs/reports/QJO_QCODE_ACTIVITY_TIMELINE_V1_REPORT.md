# Qjo Qcode Activity Timeline v1 — 2026-07-21-80

## الهدف
إضافة لوحة نشاط جانبية في Qcode تعرض عمليات الوكيل خطوة بخطوة، بدل الاعتماد فقط على tool cards داخل المحادثة.

---

## ما تم تنفيذه

### 1) Activity Panel
تمت إضافة لوحة جانبية:

```text
Qcode Activity Timeline v1
```

في:

```text
public/qcode.html
```

وتعرض سجل العمليات مثل:

```text
رسالة جديدة
اختيار المسار
مرحلة التخطيط/التنفيذ/التحقق
بدء أداة
نجاح أداة
فشل أداة
تغير ملف
snapshot
rollback
تنفيذ متوازٍ
```

---

### 2) زر في الشريط العلوي
تمت إضافة زر:

```text
🧭 سجل النشاط
```

مع عدّاد صغير لعدد الأحداث.

---

### 3) ربط SSE events باللوحة
تم ربط الأحداث التالية:

```text
routing
phase
snapshot
rollback
tools_parallel
tool_start
tool_end
file_changed
```

كل حدث يتم تسجيله في Timeline مع:

```text
الأيقونة
العنوان
الهدف/الميتا
تفاصيل مختصرة
الوقت
الحالة: running / ok / err
```

---

### 4) وظائف جديدة
أضيفت:

```js
logActivity()
renderActivity()
toggleActivityPanel()
clearActivity()
updateToolActivity()
activityIcon()
formatActivityTime()
```

---

## النسخة

```text
qjo-qcode-activity-timeline-v1-2026-07-21-80
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qcode-main80.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests

```text
GET  /api/health       -> qjo-qcode-activity-timeline-v1-2026-07-21-80
GET  /qcode.html       -> 200 + Activity Timeline موجود
POST /api/qcode/run    -> ok true, code 0
```

---

## نقد ذاتي
هذه نسخة v1 للـ Activity Timeline. المتبقي لاحقًا:

1. حفظ timeline مع الجلسة.
2. فلترة حسب النوع: tools/files/errors.
3. ربط كل activity item بكرت الأداة في المحادثة.
4. تصدير سجل النشاط.
5. عرض logs طويلة داخل activity panel.

لكن الآن صار عند Qcode سجل عمليات واضح ومفيد للمستخدم أثناء عمل الوكيل.

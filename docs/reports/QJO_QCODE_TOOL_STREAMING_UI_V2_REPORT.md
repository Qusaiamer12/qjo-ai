# Qjo Qcode Tool Streaming UI v2 — 2026-07-21-77

## الهدف
بدء محور Frontend/Qcode UX بتطوير عرض أدوات Qcode أثناء التنفيذ، ليصبح أوضح وأكثر احترافية للمستخدم.

بدل ظهور tool cards خامة، صار المستخدم يرى:

```text
⚙️ جاري التنفيذ
✅ تم بنجاح
❌ فشل
مدة التنفيذ
اسم الأداة بالعربي
الملف/الأمر/البحث المستهدف
ملخص نتيجة واضح
تفاصيل قابلة للفتح
```

---

## ما تم تحسينه

### 1) Tool Cards أوضح
تم تحسين شكل كرت الأداة في `public/qcode.html`:

- شريط جانبي ملون حسب الحالة.
- حالة running/done/error.
- مدة تنفيذ مباشرة.
- عنوان عربي واضح للأداة.
- اسم الأداة التقني كـ badge.
- target واضح: ملف، أمر، query، snapshot.

---

### 2) أسماء أدوات مفهومة
أضيف mapping:

```js
list_files      -> استعراض الملفات
read_file       -> قراءة ملف
write_file      -> كتابة ملف
edit_file       -> تعديل ملف
search_files    -> بحث داخل الملفات
run_command     -> تنفيذ أمر
project_map     -> خريطة المشروع
create_snapshot -> إنشاء لقطة
rollback_snapshot -> تراجع للقطة
```

---

### 3) إصلاح نتيجة الأدوات Object/Text
كان `renderToolResult()` يتعامل مع النتيجة كأنها نص دائمًا، بينما backend يرسل أحيانًا object مثل:

```js
{ path, bytes }
{ stdout, stderr, code }
{ items: [] }
{ hits: [] }
{ error }
```

تم إصلاحه بإضافة:

```js
resultToText()
summarizeToolResult()
```

حتى تظهر النتائج بشكل صحيح بدون كسر الواجهة.

---

### 4) دعم الملخصات السريعة
صار الكرت يعرض chips مثل:

```text
📄 path/to/file.js
حجم 1234 بايت
تم الاستبدال
exit 0
3 نتائج
```

---

### 5) توافق كامل مع SSE الحالي
لم يتم تغيير backend events. الواجهة ما زالت تسمع:

```text
tool_start
tool_delta
tool_end
assistant
assistant_full
```

---

## النسخة

```text
qjo-qcode-tool-streaming-ui-v2-2026-07-21-77
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qcode-main.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests

```text
GET  /api/health       -> qjo-qcode-tool-streaming-ui-v2-2026-07-21-77
GET  /qcode.html       -> 200
GET  /api/qcode/health -> ok true, workspaceReady true
POST /api/qcode/run    -> ok true, code 0
```

---

## نقد ذاتي
هذا تطوير UI لعرض الأدوات، وليس بعد rich diff كامل.

المتبقي في Qcode UI:

1. Rich Diff UI حقيقي بقبول/رفض.
2. Tool timeline جانبي.
3. Logs panel للأوامر الطويلة.
4. Preview live أقوى.
5. إظهار plan/steps بشكل مستقل عن الرسالة.

لكن هذه خطوة عملية مهمة لأنها تجعل agent actions مرئية وواضحة للمستخدم بدل صندوق خام.

# Qjo Qcode Repo ZIP Import v1 — 2026-07-21-107

## الهدف
تمكين Qcode من استيراد مشروع كامل عبر ZIP، وفكّه بأمان داخل workspace، ثم فهرسته تلقائيًا.

---

## Backend

### Service
تم تحديث:

```text
src/services/qcodeWorkspace.js
```

وإضافة:

```js
importZipBuffer()
isBlockedImportPath()
qcodeProjectIndex()
```

### Routes
تم تحديث:

```text
src/routes/qcode.js
```

وإضافة:

```text
POST /api/qcode/import/zip
GET  /api/qcode/project-index
```

كما أصبح `/api/qcode/upload` يستورد ZIP تلقائيًا إذا كان الملف الوحيد المرفوع `.zip`.

---

## Safety

ZIP import يمنع:

```text
zip-slip paths
.. paths
.git
node_modules
.env
.env.*
id_rsa / credentials / .netrc
```

ويطبق حدود:

```text
maxFiles = 500
maxTotalBytes = 20MB
```

ويعمل snapshot قبل الاستيراد.

---

## Frontend

تم تحديث:

```text
public/qcode.html
```

وإضافة زر:

```text
استيراد مشروع ZIP
```

وعند نجاح الاستيراد:

- يعرض عدد الملفات المستوردة والمتجاهلة.
- يحدث قائمة الملفات.
- يفتح Project Index.
- يسجل activity.

---

## النسخة

```text
qjo-qcode-zip-import-v1-2026-07-21-107
```

---

## التحقق

تم تشغيل:

```bash
npm run audit
```

وتم اختبار ZIP يحتوي:

```text
package.json
index.html
src/app.js
.env
```

النتيجة:

```text
import ok true
saved 3
skipped 1 (.env)
snapshot true
project index framework frontend-js
```

---

## نقد ذاتي
هذه نسخة ZIP import محلية للـ workspace. المتبقي لاحقًا:

1. Import from GitHub URL read-only.
2. عرض تقرير skipped files مفصل في UI.
3. limits حسب plan.
4. تنظيف workspace قبل import كخيار.

# Qjo Qcode Diff Review Modal v1 — 2026-07-21-79

## الهدف
تطوير Rich Diff في Qcode إلى شاشة مراجعة كاملة Full-screen، مع أزرار قبول/تراجع/نسخ/فتح ملف.

---

## ما تم تنفيذه

### 1) Full-screen Diff Modal
تمت إضافة modal جديد في:

```text
public/qcode.html
```

بعناصر:

```text
قبل | بعد
Unified diff
زر عرض كامل من كرت الأداة
زر فتح الملف
زر نسخ المقارنة
زر قبول وتطبيق للتعديلات المقترحة
زر تراجع عن التعديل إذا كان التعديل مطبقًا ومعه snapshot
```

---

### 2) قبول/تطبيق التعديل
إذا كانت نتيجة `/api/qcode/diff` تحتوي:

```js
path
find
replace
```

يمكن للمستخدم من modal الضغط على:

```text
قبول وتطبيق
```

وهذا يستدعي:

```text
POST /api/qcode/apply-edit
```

---

### 3) التراجع عن تعديل مطبق
تم تحسين `editQcodeFileSafe()` و `writeQcodeFileSafe()` في:

```text
src/services/qcodeWorkspace.js
```

حتى يرجعوا snapshot قبل التعديل:

```js
snapshot
```

وبالتالي إذا كان التعديل مطبقًا من Qcode، يظهر زر:

```text
تراجع عن التعديل
```

ويستدعي:

```text
POST /api/qcode/rollback
```

---

### 4) Diff endpoint أغنى
تم تحديث:

```text
src/routes/qcode.js
```

حتى `/api/qcode/diff` يرجع:

```js
before
after
unifiedDiff
find
replace
```

---

## النسخة

```text
qjo-qcode-diff-review-modal-v1-2026-07-21-79
```

---

## التحقق

تم تشغيل:

```bash
node --check /tmp/qcode-main79.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests

```text
GET  /api/health          -> qjo-qcode-diff-review-modal-v1-2026-07-21-79
POST /api/qcode/save      -> ok true
POST /api/qcode/diff      -> ok true, unifiedDiff موجود, find/replace موجودين
POST /api/qcode/apply-edit -> ok true, snapshot موجود, unifiedDiff موجود
GET  /qcode.html          -> 200 + Diff Review Modal موجود
```

---

## نقد ذاتي
هذه نسخة v1. ما زال ممكن تطويرها لاحقًا:

1. line numbers ثابتة على الجانبين.
2. collapse unchanged blocks أفضل.
3. accept/reject per hunk.
4. دمج أعمق مع CodeMirror selection.
5. عرض modal تلقائيًا عند أدوات edit_file الكبيرة فقط.

لكن الآن Qcode لديه شاشة مراجعة تعديل واضحة وعملية بدل الاعتماد على كرت صغير فقط.

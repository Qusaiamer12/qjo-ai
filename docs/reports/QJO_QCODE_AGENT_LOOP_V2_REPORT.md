# Qjo Qcode Multi-step Agent Loop v2 — 2026-07-21-103

## الهدف
رفع قوة Qcode من استجابة واحدة + أدوات إلى حلقة وكيل متعددة الخطوات تشبه نمط Claude Code/Cursor:

```text
PLAN → ACT → OBSERVE → REPAIR/CONTINUE → VERIFY → FINAL
```

---

## ما تم تنفيذه

### 1) Multi-step loop
تم تحديث:

```text
src/agents/qcodeAgent.js
```

ليعمل حتى:

```text
maxSteps = 5 افتراضيًا
maxActions = 28 افتراضيًا
```

مع إمكانية تمرير:

```js
maxSteps
max_steps
maxActions
```

---

### 2) Observation memory بين الخطوات
بعد كل أدوات، Qcode يضيف observation message داخلي يحتوي:

```text
tool
path/command
ok/error
result compacted
updated workspace files
```

ثم يستدعي النموذج مرة ثانية ليقرر:

```text
يكمل؟
يصلح؟
يتحقق؟
ينهي؟
```

---

### 3) Repair loop مدمج
بدل repair pass منفصل محدود، صار فشل `run_command` يدخل في الخطوة التالية كـ observation:

```text
A command failed. Diagnose root cause...
```

وهذا يسمح للوكيل يقرأ stderr/stdout ويقترح تعديلات ثم يعيد التحقق ضمن نفس الحلقة.

---

### 4) Safety limits
تمت إضافة حدود لمنع loop غير محدود:

```text
maxSteps: 1-8
maxActionsTotal: 4-40
```

إذا وصل الحد، يتوقف برسالة واضحة.

---

### 5) SSE events جديدة
أضيف:

```text
agent_step
```

وفي `public/qcode.html` تم ربطه بـ Activity Timeline:

```text
خطوة وكيل 1/5
خطوة وكيل 2/5
...
```

---

## النسخة

```text
qjo-qcode-agent-loop-v2-2026-07-21-103
```

---

## التحقق

تم تشغيل:

```bash
node --check src/agents/qcodeAgent.js
node --check /tmp/qcode-loop-v2.js
npm run audit
npm run backend-regression
```

النتيجة:

```text
Audit passed with 0 warning(s)
Backend regression passed
```

---

## Smoke/Regression

أكدت regression أن:

```text
/api/health يعمل
/qcode.html يعمل
/api/qcode/run يعمل
/api/qcode/diff يعمل
/api/search يعمل
/api/export/code-zip يعمل
```

---

## نقد ذاتي
هذا v2 مهم جدًا، لكنه لا يزال يعتمد على جودة النموذج في إخراج STRICT JSON.

المتبقي لاحقًا:

1. إجبار schema أقوى على أفعال Qcode من جهة النموذج.
2. Git integration.
3. semantic project index.
4. sandbox containerized.
5. per-hunk accept/reject.

لكن هذا يرفع عقل Qcode من one-pass إلى multi-step agent حقيقي.

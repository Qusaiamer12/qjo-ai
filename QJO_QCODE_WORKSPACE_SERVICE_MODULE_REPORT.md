# Qjo Qcode Workspace Service Module — 2026-07-21-64

## الهدف
استكمال فصل Qcode معماريًا عبر نقل تنفيذ أدوات workspace/files/snapshots/commands من `server.js` إلى service مستقل.

---

## ما تم إنشاؤه

### Qcode Workspace Service

```text
src/services/qcodeWorkspace.js
```

يحتوي الآن تنفيذ أدوات Qcode الأساسية:

```js
createQcodeWorkspaceService()
ensureQcodeWorkspace()
safeQcodePath()
relativeQcodePath()
createQcodeSnapshot()
listQcodeSnapshots()
rollbackQcodeSnapshot()
runQcodeCommand()
listQcodeFiles()
readQcodeFileSafe()
writeQcodeFileSafe()
editQcodeFileSafe()
searchQcodeFiles()
qcodeWorkspaceSummary()
qcodeProjectMap()
extractJsonObject()
normalizeQcodeActions()
runQcodeAction()
qcodeSessionPath()
```

---

## تعديل `server.js`

بدل وجود دوال Qcode workspace الطويلة داخل السيرفر، صار `server.js` ينشئ service واحد:

```js
const qcodeWorkspace = createQcodeWorkspaceService({
  workspaceDir: QCODE_WORKSPACE_DIR,
  snapshotDir: QCODE_SNAPSHOT_DIR,
  sessionsDir: QCODE_SESSIONS_DIR
});
```

ثم يمرره إلى Qcode agent و routes:

```js
const qcodeAgent = createQcodeAgent({
  qcodeWorkspaceSummary: qcodeWorkspace.qcodeWorkspaceSummary,
  extractJsonObject: qcodeWorkspace.extractJsonObject,
  normalizeQcodeActions: qcodeWorkspace.normalizeQcodeActions,
  runQcodeAction: qcodeWorkspace.runQcodeAction,
  runQcodeCommand: qcodeWorkspace.runQcodeCommand,
  ...
});

registerQcodeRoutes(app, {
  ensureQcodeWorkspace: qcodeWorkspace.ensureQcodeWorkspace,
  tools: qcodeWorkspace,
  ...
});
```

---

## توافق SSE
أثناء المراجعة الذاتية اكتشفت أن `public/qcode.html` يسمع للأحداث القديمة:

```text
assistant
assistant_full
```

وكانت نسخة agent الجديدة ترسل:

```text
delta
done
```

تم إصلاح ذلك بإرسال الاثنين معًا:

```text
assistant       ✅ للتوافق الحالي
assistant_full  ✅ للتوافق الحالي
delta           ✅ للمستقبل
done            ✅ للمستقبل
```

هذا يمنع كسر واجهة Qcode الحالية.

---

## النسخة

```text
qjo-qcode-workspace-service-module-2026-07-21-64
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
node --check src/services/qcodeWorkspace.js
node --check src/routes/qcode.js
node --check src/agents/qcodeAgent.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health       -> qjo-qcode-workspace-service-module-2026-07-21-64
GET  /api/qcode/health -> ok true, separateKeys true, workspaceReady true
GET  /api/qcode/files  -> ok true
POST /api/qcode/run    -> ok true, code 0
POST /api/search       -> still works
```

---

## أين وصلنا

صار Qcode الآن مفصولًا إلى:

```text
src/routes/qcode.js
src/agents/qcodeAgent.js
src/tools/fileEditorTool.js
src/services/qcodeWorkspace.js
```

و `server.js` لم يعد يحتوي implementation أدوات Qcode workspace.

---

## نقد ذاتي
ما زال Qcode provider routing موجودًا في `server.js`:

```js
qcodeProviderConfig()
callQcodeRouter()
```

المرحلة القادمة لاحقًا تكون نقل provider adapters إلى:

```text
src/services/aiProviders.js
```

أو نقل Qcode provider routing إلى:

```text
src/agents/qcodeAgent.js
```

لكن هذه المرحلة حققت فصل أدوات Qcode الفعلية عن السيرفر بدون تغيير endpoints.

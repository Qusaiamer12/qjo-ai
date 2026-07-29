# Qjo Qcode Route/Agent Module — 2026-07-21-63

## الهدف
متابعة تفكيك `server.js` عبر نقل Qcode API routes إلى route module مستقل، وفصل منطق محادثة Qcode/agent loop إلى agent module مستقل.

تم الحفاظ على نفس endpoints الخارجية:

```text
/api/qcode/...
```

بدون تغيير الواجهة أو Auth أو Render.

---

## ما تم إنشاؤه

### 1) Qcode Route Module

```text
src/routes/qcode.js
```

يحتوي:

```js
registerQcodeRoutes(app, deps)
```

وينقل تسجيل endpoints مثل:

```text
GET  /api/qcode/info
GET  /api/qcode/health
GET  /api/qcode/files
GET  /api/qcode/file
POST /api/qcode/save
POST /api/qcode/upload
GET  /api/qcode/download
GET  /api/qcode/usage
GET  /api/qcode/usage/export
GET  /api/qcode/sandbox_status
GET  /api/qcode/preview/start
GET  /api/qcode/preview/file
GET  /api/qcode/preview/list
GET  /api/qcode/sessions
GET  /api/qcode/sessions/load
POST /api/qcode/sessions/save
POST /api/qcode/sessions/delete
POST /api/qcode/diff
POST /api/qcode/apply-edit
GET  /api/qcode/snapshots
POST /api/qcode/snapshot/create
POST /api/qcode/rollback
POST /api/qcode/run
GET  /api/qcode/project-map
POST /api/qcode/chat
```

---

### 2) Qcode Agent Module

```text
src/agents/qcodeAgent.js
```

يحتوي:

```js
createQcodeAgent(deps)
handleChat(req, res)
sseWrite(res, event, data)
```

تم نقل منطق SSE agent loop الخاص بـ `/api/qcode/chat` إليه:

- routing event
- phase event
- tool_start/tool_delta/tool_end
- file_changed
- repair loop
- answer/done events

---

### 3) File Editor Tool Schema

```text
src/tools/fileEditorTool.js
```

يحتوي strict schemas بـ `zod`:

```js
QcodeToolNameSchema
QcodeActionSchema
QcodeActionsSchema
validateQcodeActions()
qcodeToolNames()
```

هذه بداية فصل أدوات Qcode رسميًا. التنفيذ العميق للأدوات لا يزال مؤقتًا كاعتمادات من `server.js` لضمان عدم كسر السلوك.

---

## تعديل `server.js`

بدل تسجيل Qcode routes مباشرة، صار `server.js` ينشئ agent ويسجل route module:

```js
const qcodeAgent = createQcodeAgent({ ...deps });

registerQcodeRoutes(app, {
  fs,
  path,
  ensureQcodeWorkspace,
  workspaceDir: QCODE_WORKSPACE_DIR,
  sessionsDir: QCODE_SESSIONS_DIR,
  uploadMiddleware: qcodeUpload,
  usage: qcodeUsage,
  agent: qcodeAgent,
  keysConfigured: () => ({ ... }),
  tools: { ... }
});
```

---

## النسخة

```text
qjo-qcode-route-agent-module-2026-07-21-63
```

---

## التحقق

تم تشغيل:

```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
node --check src/routes/qcode.js
node --check src/agents/qcodeAgent.js
node --check src/tools/fileEditorTool.js
npm run audit
```

النتيجة:

```text
Audit passed with 0 warning(s).
```

---

## Smoke tests محلية

```text
GET  /api/health       -> qjo-qcode-route-agent-module-2026-07-21-63
GET  /api/qcode/health -> ok true, separateKeys true, workspaceReady true
GET  /api/qcode/files  -> ok true
POST /api/qcode/run    -> ok true, code 0
POST /api/search       -> still works
```

---

## نقد ذاتي
هذه مرحلة تفكيك مهمة، لكنها ليست الفصل الكامل النهائي لأدوات Qcode.

تحقق الآن:

- Qcode routes خرجت من `server.js`.
- Qcode chat agent loop خرج إلى `src/agents/qcodeAgent.js`.
- Tool schema لـ Qcode بدأ في `src/tools/fileEditorTool.js`.

المتبقي لاحقًا:

1. نقل تنفيذ أدوات Qcode filesystem بالكامل من `server.js` إلى `src/tools/fileEditorTool.js` أو `src/services/qcodeWorkspace.js`.
2. نقل provider config/callQcodeRouter إلى `src/agents/qcodeAgent.js` أو `src/services/aiProviders.js`.
3. تحسين UI tool streaming في `qcode.html` و/أو app shell.
4. إضافة zod validation فعلي على actions القادمة من النموذج قبل تنفيذها.

# 📚 Qcode — التوثيق الكامل (مرجع الدمج)

مرجع شامل لكل ما بُني في المشروع، مصنّف لدمجه بأي نموذج/تطبيق.

---

## 🎯 نظرة سريعة

```
24 ملف Python · 6388 سطر · 32 أداة
8 مزوّدين · 8 مجالات خبرة · 10 أنظمة ألوان
50 ترجمة ثنائية اللغة (عربي/إنجليزي)
44 اختبار آلي · Docker + CI/CD + MIT License
```

**القلب:** `brain.py` (الحلقة الذكية) + `tools.py` (32 أداة) + `providers.py` (8 مزوّدين).

---

## 🏗️ البنية المعمارية (كل ملف + وظيفته)

### 🔌 طبقة المزوّدين
| الملف | الوظيفة | الدوال الرئيسية |
|-------|---------|----------------|
| `providers.py` | 8 مزوّدين + بروفايلات | `create_client(provider)`, `get_model(prov, profile)`, `list_available_providers()` |
| `claude_adapter.py` | adapter يجعل Claude يعمل بـ OpenAI interface | `ClaudeClient(api_key, model)` |
| `router.py` | التوجيه الذكي + fallback | `route(request)`, `call_with_fallback(decision, fn)` |

**المزوّدون:** Groq · Kimi · Qwen · Gemini · NVIDIA · Claude · OpenRouter · OpenAI

### 🧠 المحرك الذكي
| الملف | الوظيفة | الدوال |
|-------|---------|--------|
| `brain.py` | عقل الوكيل: حلقة Reason→Plan→Act→Verify→Reflect | `run_agent(provider, model, messages)` → generator أحداث SSE |
| `agents.py` | الفريق المتخصص (planner/coder/tester/reviewer) | `run_specialist(role, ...)`, `run_team_pipeline(...)`, `should_use_team(request)` |

### 🛠️ الأدوات (32)
| الملف | الوظيفة |
|-------|---------|
| `tools.py` | 32 أداة + تعريفاتها (OpenAI function-calling) |
| `sandbox.py` | أمان: Docker/soft + حجب 13 نمط خطر + audit log |
| `safety.py` | git snapshot/rollback |
| `mcp_client.py` | MCP protocol (6 خوادم: filesystem, github, puppeteer...) |
| `indexer.py` | RAG + embeddings دلالية محلية |
| `memory.py` | ذاكرة دائمة (.qcode/MEMORY.md) |
| `knowledge.py` | 8 مجالات خبرة (security/testing/performance/a11y/...) |
| `design.py` | 10 أنظمة ألوان + 10 أنواع أزرار + أنيميشن |
| `skills.py` | نظام Skills (مثل Claude Code) |
| `i18n.py` | 50 ترجمة ثنائية اللغة |

### 🌐 الواجهة
| الملف | الوظيفة |
|-------|---------|
| `server.py` | Flask + 20+ endpoints + SSE + CORS |
| `index.html` | الواجهة الكاملة (محرّر CodeMirror + معاينة + 6 نوافذ) |
| `preview.py` | معاينة حيّة (HTML/FastAPI/React/Next) |
| `background.py` | عمليات خلفية (dev servers) |
| `sessions.py` | جلسات دائمة (حفظ/استئناف/بحث) |

### 🔐 الإدارة
| الملف | الوظيفة |
|-------|---------|
| `auth.py` | حماية بـ token (Bearer/X-API-Key/?token=) |
| `cost_tracker.py` | تتبّع التكلفة + تصدير CSV |
| `project_rules.py` | قواعد لكل مشروع (.qcode/rules.md) |
| `setup.py` | فحص المفاتيح من الطرفية |
| `agent.py` | واجهة سطر الأوامر (CLI) |

---

## 🧩 الـ 32 أداة (مرجع سريع)

### الملفات (5)
```
read_file(path, start_line?, end_line?)   — قراءة + ترقيم أسطر + نطاق
write_file(path, content)                 — إنشاء/استبدال + diff
edit_file(path, old_text, new_text)       — تعديل واحد + diff
multi_edit(path, edits[])                 — تعديلات متعددة دفعة
replace_all(path, old_text, new_text)     — استبدال شامل
```

### الاستكشاف (6)
```
list_directory(path?, tree?)              — عرض شجري
find_files(pattern)                       — بحث glob
grep(pattern, path?, glob?)               — بحث regex
analyze_project()                         — تحليل بنيوي ذكي
semantic_search(query)                    — بحث دلالي (embeddings)
dependencies(target)                      — تحليل اعتماديات
```

### البناء (4)
```
scaffold(kind, name, options?)            — قوالب (api_fastapi/web_landing/web_dashboard/...)
install_packages(packages[], manager?)    — pip/npm ذكي
start_preview(target?)                    — معاينة حيّة
stop_preview(name?)                       — إيقاف
```

### التنفيذ (4)
```
run_command(command)                      — shell عبر sandbox
run_code(language, code)                  — python/js/bash
run_tests(target?)                        — pytest/jest تلقائي
lint(target?)                             — flake8/eslint
```

### الأمان (3)
```
git_snapshot(label)                       — لقطة حفظ قبل التغيير
git_rollback()                            — تراجع للحالة السابقة
git_history()                             — سجل اللقطات
```

### الذاكرة + الخبرة (4)
```
memory_recall()                           — اقرأ ذاكرة المشروع
memory_save(section, fact)                — احفظ معلومة
get_knowledge(domain)                     — احصل على خبرة مجال
preview_edit(path, old_text, new_text)    — diff قبل التطبيق
```

### التصميم + التخطيط (3)
```
design_button(style, label, palette)      — زر خرافي
generate_palette(base_color, mood)        — نظام ألوان
list_palettes()                           — الأنظمة الجاهزة
todo_write(todos[])                       — خطة عمل
```

### متفرّق (3)
```
replace_in_project(pattern, replacement, glob_pattern?)  — استبدال شامل بالمشروع
web_fetch(url)                            — جلب صفحة ويب
```

---

## 🔌 API Reference (للدمج)

كل الـ endpoints (POST/GET):

### المحادثة
```
POST /api/chat              {messages: [...], provider?, model?}
  → SSE stream: assistant/tool_start/tool_end/routing/phase/todo/...
GET  /api/info              → {workspace, ready, providers}
GET  /api/health?test=1     → فحص المفاتيح
```

### الملفات
```
GET  /api/files             → قائمة الملفات
GET  /api/file?path=        → محتوى ملف
POST /api/upload            (multipart) → رفع
GET  /api/download?path=    → تنزيل
POST /api/save              {path, content} → حفظ من المحرّر
```

### الجلسات + المعاينة + العمليات
```
GET  /api/sessions          POST /api/sessions/save  GET /api/sessions/load?id=
GET  /api/preview/list      GET /api/preview/start?target=  GET /api/preview/stop
GET  /api/background
```

### الإدارة
```
GET  /api/usage             GET /api/usage/export (CSV)
GET  /api/rules             POST /api/rules/create
GET  /api/sandbox_status    → {sandbox, mcp}
```

**Auth:** إن ضبطت `QCODE_AUTH_TOKEN`، كل `/api/*` يتطلّب `Authorization: Bearer <token>`.

---

## ⚙️ التكوين (.env)

```env
# المزوّدون (واحد كافٍ، 8 مدعومين)
GROQ_API_KEY=           KIMI_API_KEY=       QWEN_API_KEY=
GEMINI_API_KEY=         NVIDIA_API_KEY=     ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=     OPENAI_API_KEY=
DEFAULT_PROVIDER=groq   # groq|kimi|qwen|gemini|nvidia|claude|openrouter|openai

# عام
WORKSPACE_DIR=.         PORT=5000
QCODE_LANG=ar           # ar|en

# MCP (أدوات خارجية): MCP_SERVERS=filesystem,github,puppeteer
GITHUB_TOKEN=           BRAVE_API_KEY=

# أمان
SANDBOX_MODE=auto       # auto|docker|soft
QCODE_AUTH_TOKEN=       # فارغ = بدون حماية
RATE_LIMIT_ENABLED=false
```

---

## 🚀 كيف تدمجه بنموذجك

### الطريقة 1: استدعاء مباشر (Python)
```python
from brain import run_agent
from providers import list_available_providers, get_default_provider

provider = get_default_provider()
for event_type, data in run_agent(provider, "", [{"role":"user","content":"اكتب دالة"}]):
    if event_type == "assistant":
        print(data["delta"], end="")
    elif event_type == "tool_start":
        print(f"\n🔧 {data['name']}")
```

### الطريقة 2: أداة واحدة فقط
```python
from tools import execute_tool
result = execute_tool("write_file", {"path":"app.py","content":"print('hi')"})
```

### الطريقة 3: سيرفر كامل + API
```bash
python server.py  # ثم استدعِ /api/chat
```

### الطريقة 4: Docker
```bash
docker compose up --build
```

---

## 🎓 مفاهيم المفاتيح

### التوجيه الذكي (router.py)
```python
from router import route
decision = route("ابنِ نظام مصادقة JWT")
# → {task_type:"code", provider:"claude", model:"claude-opus-4-5", fallback:[...]}
```
يحلّل الطلب → يختار أفضل مزوّد+موديل → يبني fallback chain.

### حلقة الوكيل (brain.py)
```
run_agent() يُصدر أحداث SSE:
  routing       → قرار التوجيه
  phase         → analyze|plan|act|verify
  assistant     → نص متدفّق (delta)
  tool_start/end → تنفيذ أداة
  tool_delta    → streaming مخرجات الأداة
  todo          → خطة محدّثة
  file_changed  → تحديث الواجهة
  done          → انتهى
```

### Multi-agent
```python
from agents import run_team_pipeline
# للمهام المعقّدة: planner → coder → tester → reviewer
```

---

## 📦 المتطلّبات
```
openai>=1.12.0       # SDK أساسي (OpenAI-compatible)
python-dotenv        # .env
rich                 # CLI ملوّن
flask>=3.0.0         # السيرفر
flask-cors           # CORS
gunicorn             # إنتاج
PyYAML               # Skills frontmatter
anthropic            # Claude (اختياري)
flask-limiter        # rate limiting (اختياري)
```

---

## ✅ معايير الجودة المحقّقة
- ✅ MIT License مفتوح
- ✅ Dockerfile + docker-compose + CI/CD (GitHub Actions)
- ✅ 44 اختبار آلي (`tests/`)
- ✅ SECURITY.md + .gitignore كامل
- ✅ README + CONTRIBUTING + CHANGELOG + SETUP_KEYS
- ✅ Makefile (14 أمر)
- ✅ Bilingual (عربي + إنجليزي)

---

## 🎯 ما يميّز Qcode (للتسويق)
1. **مجاني + مفتوح المصدر** (MIT)
2. **8 مزوّدين** + توجيه ذكي + fallback
3. **عربي + إنجليزي** (ثنائي اللغة)
4. **Multi-agent** (فريق متخصص)
5. **خبير تصميم** (10 palettes + أزرار خرافية)
6. **8 مجالات خبرة** تُحقن حسب المهمة
7. **معاينة حيّة** للتطبيقات
8. **أمان كامل** (sandbox + auth + audit)

---

للدمج السريع: ابدأ بـ `brain.run_agent()` + `tools.execute_tool()` + `router.route()`.

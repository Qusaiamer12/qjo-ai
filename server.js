const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { create, all } = require('mathjs');
const { createSearchService } = require('./src/services/searchService');
const { createEmbeddingsService } = require('./src/services/embeddings');
const { registerEmbeddingsRoutes } = require('./src/routes/embeddings');
const { createJobQueue } = require('./src/services/jobQueue');
const { registerJobRoutes } = require('./src/routes/jobs');
const { registerExportRoutes } = require('./src/routes/export');
const { createAdminConfigService } = require('./src/services/adminConfig');
const { createAuthService } = require('./src/services/authService');
const { createFeedbackService } = require('./src/services/feedbackService');
const { registerFeedbackRoutes } = require('./src/routes/feedback');
const { registerAdminRoutes } = require('./src/routes/admin');
const { registerSystemRoutes } = require('./src/routes/system');
const { createLlmService } = require('./src/services/llmService');
const { createRoutingEngine } = require('./src/agents/RoutingEngine');
const { createChatPromptBuilder } = require('./src/services/systemPrompt');
const { registerSearchRoutes } = require('./src/routes/search');
const { createQcodeAgent } = require('./src/agents/qcodeAgent');
const { registerQcodeRoutes } = require('./src/routes/qcode');
const { registerQSparkRoutes } = require('./src/routes/qspark');
const { createQcodeWorkspaceService } = require('./src/services/qcodeWorkspace');
const { CALCULATOR_TOOL, createSafeCalculate } = require('./src/tools/calculatorTool');
const { registerChatRoutes } = require('./src/routes/chat');

let admin = null;
try { admin = require('firebase-admin'); } catch (_) { admin = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const QJO_VERSION = 'qjo-required-fixes-v1-2026-07-26-117';
const QJO_FULL_TRAINING_PROMPT = (() => {
  try { return fs.readFileSync(path.join(__dirname, 'QJO_FULL_TRAINING_PROMPT.md'), 'utf8').trim(); }
  catch { return ''; }
})();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_KEYS = String(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const GEMINI_API_KEYS = String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const QWEN_API_KEYS = String(process.env.QWEN_API_KEYS || process.env.QWEN_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const KIMI_API_KEYS = String(process.env.KIMI_API_KEYS || process.env.KIMI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const NVIDIA_API_KEYS = String(process.env.NVIDIA_API_KEYS || process.env.NVIDIA_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const OPENROUTER_API_KEYS = String(process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const AGNES_API_KEYS = String(process.env.AGNES_API_KEYS || process.env.AGNES_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

// Q-Spark uses a completely separate key namespace. Do not fall back to Qjo keys.
const QSPARK_GROQ_API_KEYS = (process.env.QSPARK_GROQ_API_KEYS || process.env.QSPARK_GROQ_API_KEY) ? String(process.env.QSPARK_GROQ_API_KEYS || process.env.QSPARK_GROQ_API_KEY).split(',').map(k => k.trim()).filter(Boolean) : GROQ_API_KEYS;
const QSPARK_KIMI_API_KEYS = (process.env.QSPARK_KIMI_API_KEYS || process.env.QSPARK_KIMI_API_KEY) ? String(process.env.QSPARK_KIMI_API_KEYS || process.env.QSPARK_KIMI_API_KEY).split(',').map(k => k.trim()).filter(Boolean) : KIMI_API_KEYS;
const QSPARK_QWEN_API_KEYS = (process.env.QSPARK_QWEN_API_KEYS || process.env.QSPARK_QWEN_API_KEY) ? String(process.env.QSPARK_QWEN_API_KEYS || process.env.QSPARK_QWEN_API_KEY).split(',').map(k => k.trim()).filter(Boolean) : QWEN_API_KEYS;
const QSPARK_NVIDIA_API_KEYS = (process.env.QSPARK_NVIDIA_API_KEYS || process.env.QSPARK_NVIDIA_API_KEY)
  ? String(process.env.QSPARK_NVIDIA_API_KEYS || process.env.QSPARK_NVIDIA_API_KEY).split(',').map(k => k.trim()).filter(Boolean)
  : NVIDIA_API_KEYS;
const QSPARK_GROQ_MODEL = process.env.QSPARK_GROQ_MODEL || 'llama-3.3-70b-versatile';
const QSPARK_KIMI_BASE_URL = String(process.env.QSPARK_KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
const QSPARK_KIMI_MODEL = process.env.QSPARK_KIMI_MODEL || 'moonshot-v1-128k';
const QSPARK_QWEN_BASE_URL = String(process.env.QSPARK_QWEN_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const QSPARK_QWEN_MODEL = process.env.QSPARK_QWEN_MODEL || 'qwen/qwen3.5-397b-a17b';
const EMBEDDING_API_KEYS = String(process.env.EMBEDDING_API_KEYS || process.env.EMBEDDING_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const EMBEDDING_PROVIDER = String(process.env.EMBEDDING_PROVIDER || 'openai').toLowerCase();
const EMBEDDING_BASE_URL = String(process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const HUGGINGFACE_API_KEYS = String(process.env.HUGGINGFACE_API_KEYS || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const HUGGINGFACE_EMBEDDING_MODEL = process.env.HUGGINGFACE_EMBEDDING_MODEL || 'intfloat/multilingual-e5-base';
const HUGGINGFACE_EMBEDDING_URL = String(process.env.HUGGINGFACE_EMBEDDING_URL || '').replace(/\/$/, '');

const QSPARK_NVIDIA_MODEL = process.env.QSPARK_NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash';
let qSparkGroqCursor = 0;
let qSparkKimiCursor = 0;
let qSparkQwenCursor = 0;
let qSparkNvidiaCursor = 0;

// Qcode uses a separate provider namespace and isolated workspace.
const QCODE_GROQ_API_KEYS = (process.env.QCODE_GROQ_API_KEYS || process.env.QCODE_GROQ_API_KEY) ? String(process.env.QCODE_GROQ_API_KEYS || process.env.QCODE_GROQ_API_KEY).split(',').map(k => k.trim()).filter(Boolean) : GROQ_API_KEYS;
const QCODE_QWEN_API_KEYS = (process.env.QCODE_QWEN_API_KEYS || process.env.QCODE_QWEN_API_KEY) ? String(process.env.QCODE_QWEN_API_KEYS || process.env.QCODE_QWEN_API_KEY).split(',').map(k => k.trim()).filter(Boolean) : QWEN_API_KEYS;
const QCODE_KIMI_API_KEYS = (process.env.QCODE_KIMI_API_KEYS || process.env.QCODE_KIMI_API_KEY) ? String(process.env.QCODE_KIMI_API_KEYS || process.env.QCODE_KIMI_API_KEY).split(',').map(k => k.trim()).filter(Boolean) : KIMI_API_KEYS;
const QCODE_NVIDIA_API_KEYS = (process.env.QCODE_NVIDIA_API_KEYS || process.env.QCODE_NVIDIA_API_KEY) 
  ? String(process.env.QCODE_NVIDIA_API_KEYS || process.env.QCODE_NVIDIA_API_KEY).split(',').map(k => k.trim()).filter(Boolean)
  : NVIDIA_API_KEYS;
const QCODE_GROQ_MODEL = process.env.QCODE_GROQ_MODEL || 'llama-3.3-70b-versatile';
const QCODE_QWEN_MODEL = process.env.QCODE_QWEN_MODEL || 'qwen-plus';
const QCODE_KIMI_BASE_URL = String(process.env.QCODE_KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
const QCODE_KIMI_MODEL = process.env.QCODE_KIMI_MODEL || 'moonshot-v1-32k';
const QCODE_NVIDIA_MODEL = process.env.QCODE_NVIDIA_MODEL || 'meta/llama-3.1-70b-instruct';
let qCodeGroqCursor = 0;
let qCodeQwenCursor = 0;
let qCodeKimiCursor = 0;
let qCodeNvidiaCursor = 0;

const QCODE_PROJECT_KNOWLEDGE_CONTEXT = `
QCODE PROJECT KNOWLEDGE CONTEXT:
- The uploaded Qcode reference describes a full Python agent architecture intended for Qcode's mature roadmap.
- Target architecture includes: brain.py (Reason→Plan→Act→Verify→Reflect loop), tools.py (32 tools), providers.py (8 providers), router.py (smart routing/fallback), agents.py (planner/coder/tester/reviewer), sandbox.py, safety.py snapshots/rollback, indexer.py local semantic RAG, memory.py, knowledge.py, skills.py, i18n.py, server.py Flask endpoints, preview.py, sessions.py, auth.py, cost_tracker.py, project_rules.py, setup.py, agent.py CLI.
- Target providers: Groq, Kimi, Qwen, Gemini, NVIDIA, Claude, OpenRouter, OpenAI.
- Target tools include file read/write/edit/multi_edit/replace_all, list/find/grep/analyze/semantic_search/dependencies, scaffold/install/start_preview/stop_preview, run_command/run_code/run_tests/lint, git_snapshot/git_rollback/git_history, memory, knowledge, preview_edit, design tools, todo_write, replace_in_project, web_fetch.
- Target API includes /api/chat SSE events, /api/files, /api/file, /api/upload, /api/download, /api/save, sessions, preview, background, usage, rules, sandbox_status.
- Target quality bar: multi-agent, sandbox, snapshots/rollback, live preview, bilingual Arabic/English, project memory, skills, CI/testing, security.
- Current hosted Node Qcode is an incremental public web integration. It should evolve toward this reference architecture step by step, prioritizing safety: snapshots/rollback before command execution, then safe command runner, then test/build loop, then preview, then sessions and usage.
`;

const QCODE_WORKSPACE_DIR = path.join(__dirname, 'qcode-workspace');
const QCODE_SNAPSHOT_DIR = path.join(__dirname, '.qcode-snapshots');
const QCODE_SESSIONS_DIR = path.join(__dirname, '.qcode-sessions');
const QSPARK_MAX_SOURCES = Number(process.env.QSPARK_MAX_SOURCES || 0); // 0 = unlimited
const QSPARK_MAX_FILE_MB = Number(process.env.QSPARK_MAX_FILE_MB || 0); // 0 = unlimited
const QCODE_MAX_UPLOAD_MB = Number(process.env.QCODE_MAX_UPLOAD_MB || 5);
const QCODE_MAX_UPLOAD_FILES = Number(process.env.QCODE_MAX_UPLOAD_FILES || 20);
const QCODE_ALLOW_NETWORK_COMMANDS = process.env.QCODE_ALLOW_NETWORK_COMMANDS === 'true';
const qcodeUsage = { total_tokens: 0, total_cost_usd: 0, by_provider: {}, calls: 0 };
const qcodeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(1, QCODE_MAX_UPLOAD_MB) * 1024 * 1024, files: Math.max(1, QCODE_MAX_UPLOAD_FILES) } });
const qSparkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(1, QSPARK_MAX_FILE_MB || 25) * 1024 * 1024, files: 8 } });
let kimiKeyCursor = 0;
let nvidiaKeyCursor = 0;
let openRouterKeyCursor = 0;
let agnesKeyCursor = 0;
const IP_RATE_LIMIT_PER_MINUTE = Number(process.env.IP_RATE_LIMIT_PER_MINUTE || 0); // 0 = disabled
// Groq's official replacements for the llama-3.1/3.3 line (shutting down
// 2026-08-16 — see console.groq.com/docs/deprecations). llmService also
// auto-migrates any stale values coming from old envs.
const GROQ_FLASH_MODEL = process.env.GROQ_FLASH_MODEL || 'openai/gpt-oss-20b';
const GROQ_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_TEXT_MODEL;
const QWEN_FLASH_MODEL = process.env.QWEN_FLASH_MODEL || 'qwen-plus';
const QWEN_TEXT_MODEL = process.env.QWEN_TEXT_MODEL || 'qwen-plus';
const QWEN_CODE_MODEL = process.env.QWEN_CODE_MODEL || QWEN_TEXT_MODEL;
const KIMI_BASE_URL = String(process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
const KIMI_FLASH_MODEL = process.env.KIMI_FLASH_MODEL || process.env.KIMI_MODEL || 'moonshot-v1-8k';
const KIMI_TEXT_MODEL = process.env.KIMI_TEXT_MODEL || process.env.KIMI_MODEL || 'moonshot-v1-8k';
const KIMI_CODE_MODEL = process.env.KIMI_CODE_MODEL || KIMI_TEXT_MODEL;
const NVIDIA_FLASH_MODEL = process.env.NVIDIA_FLASH_MODEL || 'meta/llama-3.1-8b-instruct';
const NVIDIA_TEXT_MODEL = process.env.NVIDIA_TEXT_MODEL || 'meta/llama-3.1-70b-instruct';
// Vision-capable slots (image requests route here FIRST now — previously they
// marched through text-only models and died). Leave empty to disable a slot.
const QWEN_VISION_MODEL = process.env.QWEN_VISION_MODEL || 'qwen-vl-plus';
const NVIDIA_VISION_MODEL = process.env.NVIDIA_VISION_MODEL || '';
const OPENROUTER_FREE_MODELS = String(process.env.OPENROUTER_FREE_MODELS || 'qwen/qwen3-235b-a22b:free,meta-llama/llama-3.3-70b-instruct:free,mistralai/mistral-7b-instruct:free')
  .split(',')
  .map(m => m.trim())
  .filter(m => m && m.includes(':free'));
const AGNES_BASE_URL = String(process.env.AGNES_BASE_URL || '').replace(/\/$/, '');
const AGNES_MODEL = process.env.AGNES_MODEL || 'default';
const REQUIRE_FIREBASE_AUTH = process.env.REQUIRE_FIREBASE_AUTH === 'true';
const DAILY_USER_LIMIT = Number(process.env.DAILY_USER_LIMIT || 0); // 0 = unlimited per-user daily usage
const GUEST_DAILY_LIMIT = Number(process.env.GUEST_DAILY_LIMIT || process.env.DAILY_GUEST_LIMIT || 0); // 0 = unlimited guest/IP daily usage
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const ADMIN_EMAILS = new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
const ADMIN_CONFIG_PATH = path.join(__dirname, '.qjo-admin-config.json');

if (admin && !admin.apps.length && (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  } catch (error) {
    console.error('Firebase Admin init failed:', error.message);
  }
}

const hasFirebaseAdmin = () => Boolean(admin && admin.apps && admin.apps.length);

const memoryCaches = {
  search: new Map(),
  deepSearch: new Map(),
  firecrawl: new Map(),
  embeddings: new Map(),
  completions: new Map()
};

function cacheGet(cache, key) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function cacheSet(cache, key, value, ttlMs, maxItems = 120) {
  if (cache.size >= maxItems) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function stableCacheKey(prefix, value) {
  return prefix + ':' + String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 900);
}

const adminConfigService = createAdminConfigService(ADMIN_CONFIG_PATH);
const feedbackService = createFeedbackService({ filePath: path.join(__dirname, '.qjo-feedback.jsonl') });
const authService = createAuthService({
  admin,
  hasFirebaseAdmin,
  adminEmails: ADMIN_EMAILS,
  requireFirebaseAuth: REQUIRE_FIREBASE_AUTH,
  dailyUserLimit: DAILY_USER_LIMIT,
  guestDailyLimit: GUEST_DAILY_LIMIT
});
const verifyAdminRequest = authService.verifyAdminRequest;
const verifyFirebaseRequest = authService.verifyFirebaseRequest;
const enforceDailyUsage = authService.enforceDailyUsage;

const ALLOWED_MODELS = new Set([
  GROQ_FLASH_MODEL,
  GROQ_TEXT_MODEL,
  GROQ_VISION_MODEL,
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  // Legacy IDs still accepted from old clients; llmService migrates them.
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct'
]);

const math = create(all);
math.import({
  import: () => { throw new Error('Function import is disabled.'); },
  createUnit: () => { throw new Error('Function createUnit is disabled.'); },
  evaluate: () => { throw new Error('Nested evaluate is disabled.'); },
  parse: () => { throw new Error('Function parse is disabled.'); },
  simplify: () => { throw new Error('Function simplify is disabled.'); },
  derivative: () => { throw new Error('Function derivative is disabled.'); }
}, { override: true });

const safeCalculate = createSafeCalculate(math);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],

      // Firebase SDK + PDF.js + MathJax + Google platform scripts
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        "https://www.gstatic.com",
        "https://apis.google.com",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://cdn.tailwindcss.com"
      ],
      "script-src-attr": ["'unsafe-inline'"],
      "worker-src": ["'self'", "blob:", "https://cdn.jsdelivr.net"],

      // styles.css is local; unsafe-inline is kept because a few runtime/third-party widgets may inject styles
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],

      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "data:", "blob:", "https:", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://www.gstatic.com"],

      // Firebase Auth, Firestore, Google OAuth, and Qjo backend APIs
      "connect-src": [
        "'self'",
        "https://api.groq.com",
        "https://api.tavily.com",
        "https://api.firecrawl.dev",
        "https://dashscope-intl.aliyuncs.com",
        "https://integrate.api.nvidia.com",
        "https://openrouter.ai",
        "https://api.moonshot.ai",
        "https://api.moonshot.cn",
        "https://api.deepseek.com",
        "https://api.openai.com",
        "https://api.duckduckgo.com",
        "https://cdn.jsdelivr.net",

        "https://*.googleapis.com",
        "https://www.googleapis.com",
        "https://firestore.googleapis.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://firebaseinstallations.googleapis.com",
        "https://firebaselogging-pa.googleapis.com",

        "https://*.firebaseio.com",
        "wss://*.firebaseio.com",
        "https://*.firebaseapp.com",
        "https://*.gstatic.com",
        "https://www.gstatic.com",
        "https://accounts.google.com"
      ],

      // OAuth redirect/popup frames
      "frame-src": [
        "'self'",
        "https://accounts.google.com",
        "https://*.firebaseapp.com",
        "https://*.google.com"
      ],

      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'", "https://accounts.google.com"],
      "frame-ancestors": ["'self'"]
    }
  },

  // Keep COEP disabled because Firebase/Google OAuth popups and some CDN assets can break with it.
  crossOriginEmbedderPolicy: false,

  // Allow OAuth popups/redirect flows to communicate correctly.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

// compression() buffers response bodies to gzip them, which breaks
// Server-Sent Events streaming (the client gets nothing until the buffer
// flushes, which can look like "it does nothing" for a multi-step agent).
// /api/qcode/chat streams live tool/answer events, so it must bypass
// compression entirely.
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.path === '/api/qcode/chat') return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '8mb' }));
if (IP_RATE_LIMIT_PER_MINUTE > 0) {
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: IP_RATE_LIMIT_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false
  }));
}
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '0',
  etag: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css|webmanifest)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-21).map((m) => {
    if (!m || !['system', 'user', 'assistant'].includes(m.role)) return null;

    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content.slice(0, 60000) };
    }

    if (Array.isArray(m.content)) {
      const safeParts = m.content.slice(0, 8).map((part) => {
        if (!part || typeof part !== 'object') return null;

        if (part.type === 'text') {
          return { type: 'text', text: String(part.text || '').slice(0, 60000) };
        }

        if (part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
          const url = part.image_url.url;
          if (!url.startsWith('data:image/') || url.length > 7_000_000) return null;
          return { type: 'image_url', image_url: { url } };
        }

        return null;
      }).filter(Boolean);

      return { role: m.role, content: safeParts };
    }

    return null;
  }).filter(Boolean);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  const raw = forwarded || realIp || req.ip || req.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '');
}

function isPrivateIp(ip) {
  return !ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

async function lookupClientGeo(ip) {
  if (isPrivateIp(ip)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'QjoAI/1.0' }
    });
    clearTimeout(timeout);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) return null;
    return {
      city: data.city || '',
      region: data.region || '',
      country: data.country_name || data.country || '',
      countryCode: data.country_code || '',
      timezone: data.timezone || '',
      latitude: typeof data.latitude === 'number' ? Number(data.latitude.toFixed(3)) : null,
      longitude: typeof data.longitude === 'number' ? Number(data.longitude.toFixed(3)) : null,
      source: 'ipapi.co approximate IP geolocation'
    };
  } catch (_) {
    clearTimeout(timeout);
    return null;
  }
}



const { createQcodeLearning } = require('./src/services/qcodeLearning');
const QCODE_LEARNING_DIR = path.join(__dirname, '.qcode-learning');
const qcodeLearning = createQcodeLearning({ dir: QCODE_LEARNING_DIR });

const qcodeWorkspace = createQcodeWorkspaceService({
  workspaceDir: QCODE_WORKSPACE_DIR,
  snapshotDir: QCODE_SNAPSHOT_DIR,
  sessionsDir: QCODE_SESSIONS_DIR,
  allowNetworkCommands: QCODE_ALLOW_NETWORK_COMMANDS
});


const llmService = createLlmService({
  groqKeys: GROQ_API_KEYS,
  qwenKeys: QWEN_API_KEYS,
  geminiKeys: GEMINI_API_KEYS,
  kimiKeys: KIMI_API_KEYS,
  nvidiaKeys: NVIDIA_API_KEYS,
  openRouterKeys: OPENROUTER_API_KEYS,
  agnesKeys: AGNES_API_KEYS,
  kimiBaseUrl: KIMI_BASE_URL,
  openRouterFreeModels: OPENROUTER_FREE_MODELS,
  agnesBaseUrl: AGNES_BASE_URL,
  agnesModel: AGNES_MODEL
});

const routingEngine = createRoutingEngine({
  llmService,
  safeCalculate,
  searchService: null,
  keys: {
    groq: GROQ_API_KEYS.length,
    gemini: GEMINI_API_KEYS.length,
    qwen: QWEN_API_KEYS.length,
    kimi: KIMI_API_KEYS.length,
    nvidia: NVIDIA_API_KEYS.length,
    openRouter: OPENROUTER_API_KEYS.length,
    agnes: AGNES_API_KEYS.length
  },
  models: {
    groqFlash: GROQ_FLASH_MODEL,
    groqText: GROQ_TEXT_MODEL,
    groqCode: GROQ_TEXT_MODEL,
    groqVision: GROQ_VISION_MODEL,
    geminiText: GEMINI_TEXT_MODEL,
    geminiFlash: GEMINI_FLASH_MODEL,
    geminiVision: GEMINI_VISION_MODEL,
    qwenFlash: QWEN_FLASH_MODEL,
    qwenText: QWEN_TEXT_MODEL,
    qwenCode: QWEN_CODE_MODEL,
    qwenVision: QWEN_VISION_MODEL,
    kimiFlash: KIMI_FLASH_MODEL,
    kimiText: KIMI_TEXT_MODEL,
    kimiCode: KIMI_CODE_MODEL,
    nvidiaFlash: NVIDIA_FLASH_MODEL,
    nvidiaText: NVIDIA_TEXT_MODEL,
    nvidiaCode: NVIDIA_TEXT_MODEL,
    nvidiaVision: NVIDIA_VISION_MODEL
  }
});



const qcodeAgent = createQcodeAgent({
  routingEngine,
  qcodeWorkspaceSummary: qcodeWorkspace.qcodeWorkspaceSummary,
  projectKnowledgeContext: QCODE_PROJECT_KNOWLEDGE_CONTEXT,
  usage: qcodeUsage,
  extractJsonObject: qcodeWorkspace.extractJsonObject,
  normalizeQcodeActions: qcodeWorkspace.normalizeQcodeActions,
  runQcodeAction: qcodeWorkspace.runQcodeAction,
  runQcodeCommand: qcodeWorkspace.runQcodeCommand,
  verifyWorkspace: qcodeWorkspace.verifyWorkspace,
  learning: qcodeLearning
});

registerQcodeRoutes(app, {
  routingEngine,
  fs,
  path,
  http,
  ensureQcodeWorkspace: qcodeWorkspace.ensureQcodeWorkspace,
  workspaceDir: QCODE_WORKSPACE_DIR,
  sessionsDir: QCODE_SESSIONS_DIR,
  uploadMiddleware: qcodeUpload,
  usage: qcodeUsage,
  agent: qcodeAgent,
  verifyFirebaseRequest,
  tools: qcodeWorkspace,
  learning: qcodeLearning
});

registerQSparkRoutes(app, {
  routingEngine,
  keys: { groq: QSPARK_GROQ_API_KEYS.length, kimi: QSPARK_KIMI_API_KEYS.length, qwen: QSPARK_QWEN_API_KEYS.length, nvidia: QSPARK_NVIDIA_API_KEYS.length },
  models: { groq: QSPARK_GROQ_MODEL, kimi: QSPARK_KIMI_MODEL, qwen: QSPARK_QWEN_MODEL, nvidia: QSPARK_NVIDIA_MODEL },
  cleanMessages,
  fullSystemPrompt: QJO_FULL_TRAINING_PROMPT,
  verifyFirebaseRequest,
  uploadMiddleware: qSparkUpload
});

registerFeedbackRoutes(app, { feedbackService, verifyAdminRequest });

registerAdminRoutes(app, {
  verifyAdminRequest,
  adminConfigService,
  hasFirebaseAdmin,
  version: QJO_VERSION,
  authRequired: REQUIRE_FIREBASE_AUTH,
  dailyUserLimit: DAILY_USER_LIMIT,
  guestDailyLimit: GUEST_DAILY_LIMIT,
  ipRateLimitPerMinute: IP_RATE_LIMIT_PER_MINUTE,
  providersDiagnostics: () => ({
    groq: GROQ_API_KEYS.length,
    qwen: QWEN_API_KEYS.length,
    kimi: KIMI_API_KEYS.length,
    nvidia: NVIDIA_API_KEYS.length,
    openRouter: OPENROUTER_API_KEYS.length,
    agnes: AGNES_API_KEYS.length,
    tavily: Boolean(TAVILY_API_KEY),
    firecrawl: Boolean(FIRECRAWL_API_KEY)
  }),
  modelsDiagnostics: () => ({
    groqFlash: GROQ_FLASH_MODEL,
    groqText: GROQ_TEXT_MODEL,
    groqVision: GROQ_VISION_MODEL,
    geminiFlash: GEMINI_FLASH_MODEL,
    geminiText: GEMINI_TEXT_MODEL,
    geminiVision: GEMINI_VISION_MODEL,
    qwenFlash: QWEN_FLASH_MODEL,
    qwenText: QWEN_TEXT_MODEL,
    qwenCode: QWEN_CODE_MODEL,
    qwenVision: QWEN_VISION_MODEL,
    kimiFlash: KIMI_FLASH_MODEL,
    kimiText: KIMI_TEXT_MODEL,
    kimiCode: KIMI_CODE_MODEL,
    nvidiaFlash: NVIDIA_FLASH_MODEL,
    nvidiaText: NVIDIA_TEXT_MODEL,
    nvidiaVision: NVIDIA_VISION_MODEL
  }),
  featuresDiagnostics: () => ({
    publicConfig: true,
    adminConfig: true,
    diagnosticPage: true,
    search: true,
    deepSearch: true,
    firecrawlExtraction: Boolean(FIRECRAWL_API_KEY),
    codeZipExport: true,
    clientContext: true,
    pdfExport: true,
    pptxExport: true
  })
});

const embeddingsService = createEmbeddingsService({
  embeddingKeys: EMBEDDING_API_KEYS,
  embeddingProvider: EMBEDDING_PROVIDER,
  embeddingBaseUrl: EMBEDDING_BASE_URL,
  embeddingModel: EMBEDDING_MODEL,
  huggingFaceKeys: HUGGINGFACE_API_KEYS,
  huggingFaceModel: HUGGINGFACE_EMBEDDING_MODEL,
  huggingFaceUrl: HUGGINGFACE_EMBEDDING_URL,
  stableCacheKey,
  cacheGet,
  cacheSet,
  cache: memoryCaches.embeddings
});
registerEmbeddingsRoutes(app, { verifyFirebaseRequest, embeddingsService });

const jobQueue = createJobQueue({ maxJobs: 120 });
jobQueue.registerHandler('embedding-batch', async (payload, ctx) => {
  const texts = Array.isArray(payload.texts) ? payload.texts.slice(0, 120).map(x => String(x || '').slice(0, 8000)).filter(Boolean) : [];
  if (!texts.length) throw new Error('No texts provided for embedding-batch job.');
  const batchSize = Math.min(Math.max(Number(payload.batchSize || 16), 1), 32);
  const vectors = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    if (ctx.isCancelled()) throw new Error('Job cancelled.');
    const batch = texts.slice(i, i + batchSize);
    ctx.progress(Math.round((i / texts.length) * 95), `Embedding ${Math.min(i + batch.length, texts.length)}/${texts.length}`);
    const result = await embeddingsService.callEmbeddingProvider(batch);
    vectors.push(...result.vectors);
  }
  return { sourceId: payload.sourceId || null, title: payload.title || '', count: vectors.length, dimensions: vectors[0]?.length || 0, provider: embeddingsService.getEmbeddingProviderName(), vectors: payload.returnVectors === true ? vectors : undefined };
});
jobQueue.registerHandler('source-stats', async (payload, ctx) => {
  const content = String(payload.content || '').slice(0, 1_000_000);
  if (!content.trim()) throw new Error('No source content provided.');
  ctx.progress(35, 'Counting text statistics');
  const words = content.split(/\s+/).filter(Boolean);
  const pages = (content.match(/\[(?:PAGE|Page|page|صفحة)\s*\d+\]/g) || []).length || Math.max(1, Math.ceil(content.length / 2000));
  const topTerms = Object.entries(words.reduce((acc, w) => { const k = w.toLowerCase().replace(/[^\u0600-\u06FFA-Za-z0-9]/g, ''); if (k.length >= 4) acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a,b)=>b[1]-a[1]).slice(0, 30).map(([term,count])=>({term,count}));
  ctx.progress(90, 'Finalizing source stats');
  return { sourceId: payload.sourceId || null, title: payload.title || '', chars: content.length, words: words.length, pages, topTerms };
});
registerJobRoutes(app, { verifyFirebaseRequest, jobQueue });

registerSystemRoutes(app, {
  adminConfigService,
  llmService,
  version: QJO_VERSION,
  authRequired: REQUIRE_FIREBASE_AUTH,
  dailyUserLimit: DAILY_USER_LIMIT,
  guestDailyLimit: GUEST_DAILY_LIMIT,
  ipRateLimitPerMinute: IP_RATE_LIMIT_PER_MINUTE,
  hasFirebaseAdmin,
  adminEmailsSize: () => ADMIN_EMAILS.size,
  tavilyApiKey: TAVILY_API_KEY,
  firecrawlApiKey: FIRECRAWL_API_KEY,
  embeddingsService,
  getLimitConfig: authService.getLimitConfig,
  getUsageSnapshot: authService.getUsageSnapshot,
  quotas: { qSparkMaxSources: QSPARK_MAX_SOURCES, qSparkMaxFileMB: QSPARK_MAX_FILE_MB, qCodeMaxUploadMB: QCODE_MAX_UPLOAD_MB, qCodeMaxUploadFiles: QCODE_MAX_UPLOAD_FILES, qCodeAllowNetworkCommands: QCODE_ALLOW_NETWORK_COMMANDS },
  getClientIp,
  lookupClientGeo,
  qjoProviders: () => ({
    gemini: GEMINI_API_KEYS.length > 0,
    groq: GROQ_API_KEYS.length > 0,
    qwen: QWEN_API_KEYS.length > 0,
    kimi: KIMI_API_KEYS.length > 0,
    nvidia: NVIDIA_API_KEYS.length > 0,
    openRouter: OPENROUTER_API_KEYS.length > 0,
    agnes: AGNES_API_KEYS.length > 0
  }),
  qSparkProviders: () => ({
    groq: QSPARK_GROQ_API_KEYS.length > 0,
    kimi: QSPARK_KIMI_API_KEYS.length > 0,
    qwen: QSPARK_QWEN_API_KEYS.length > 0,
    nvidia: QSPARK_NVIDIA_API_KEYS.length > 0
  }),
  healthPayload: () => ({
    geminiKeysConfigured: GEMINI_API_KEYS.length,
    groqKeysConfigured: GROQ_API_KEYS.length,
    qwenKeysConfigured: QWEN_API_KEYS.length,
    kimiKeysConfigured: KIMI_API_KEYS.length,
    nvidiaKeysConfigured: NVIDIA_API_KEYS.length,
    openRouterKeysConfigured: OPENROUTER_API_KEYS.length,
    agnesKeysConfigured: AGNES_API_KEYS.length,
    guestDailyLimit: GUEST_DAILY_LIMIT,
    quotas: { qSparkMaxSources: QSPARK_MAX_SOURCES, qSparkMaxFileMB: QSPARK_MAX_FILE_MB, qCodeMaxUploadMB: QCODE_MAX_UPLOAD_MB, qCodeMaxUploadFiles: QCODE_MAX_UPLOAD_FILES, qCodeAllowNetworkCommands: QCODE_ALLOW_NETWORK_COMMANDS },
    embeddingsConfigured: embeddingsService.configuredCount(),
    embeddingsProvider: embeddingsService.getEmbeddingProviderName(),
    qSparkKeysConfigured: {
      groq: QSPARK_GROQ_API_KEYS.length,
      kimi: QSPARK_KIMI_API_KEYS.length,
      qwen: QSPARK_QWEN_API_KEYS.length,
      nvidia: QSPARK_NVIDIA_API_KEYS.length
    },
    qCodeKeysConfigured: {
      groq: QCODE_GROQ_API_KEYS.length,
      qwen: QCODE_QWEN_API_KEYS.length,
      kimi: QCODE_KIMI_API_KEYS.length,
      nvidia: QCODE_NVIDIA_API_KEYS.length
    },
    routerVersion: 'pipelines-v2',
    chatPipelines: {
      lite: ['groq:flash', 'gemini:flash', 'qwen:flash', 'kimi:flash', 'nvidia:flash'],
      flash: ['gemini:flash', 'qwen:flash', 'groq:text', 'kimi:flash', 'nvidia:text', 'openrouter:free'],
      maxAr: ['qwen:text', 'kimi:text', 'groq:text', 'gemini:text', 'nvidia:text', 'openrouter:free'],
      maxEn: ['groq:text', 'qwen:text', 'kimi:text', 'gemini:text', 'nvidia:text', 'openrouter:free'],
      code: ['kimi:code', 'qwen:code', 'groq:text', 'nvidia:text', 'gemini:text', 'openrouter:free'],
      vision: ['groq:vision', 'gemini:vision', 'qwen:vision', 'nvidia:vision']
    },
    models: {
      flash: GROQ_FLASH_MODEL,
      text: GROQ_TEXT_MODEL,
      vision: GROQ_VISION_MODEL,
      qwenFlash: QWEN_FLASH_MODEL,
      qwenText: QWEN_TEXT_MODEL,
      qwenCode: QWEN_CODE_MODEL,
      nvidiaFlash: NVIDIA_FLASH_MODEL,
      nvidiaText: NVIDIA_TEXT_MODEL,
      openRouterFreeModels: OPENROUTER_FREE_MODELS,
      agnesModel: AGNES_MODEL
    }
  }),
  featuresHealth: () => ({
    backendProxy: true,
    firebaseAuth: true,
    chatHistory: true,
    imageVision: true,
    pdfTextExtraction: true,
    deepSearch: true,
    tavilyAdvancedSearch: Boolean(TAVILY_API_KEY),
    firecrawlExtraction: Boolean(FIRECRAWL_API_KEY),
    calculatorTool: true,
    adminDashboard: true,
    directLogoutButton: true,
    exportPdf: true,
    exportSlides: true,
    qSparkSeparateKeys: true,
    qCodeSeparateKeys: true,
    realEmbeddingsRag: true,
    fastSearchOptimized: true,
    smartRouterV2: true,
    searchQueryDistillation: true
  })
});

registerExportRoutes(app, { verifyFirebaseRequest, uploadMiddleware: qcodeUpload });

// Picks the fastest available provider for the search query rewriter
// (a tiny 150-token call that massively improves Arabic/dialect queries).
function pickQueryRewriter() {
  if (GROQ_API_KEYS.length) return { provider: 'groq', model: GROQ_FLASH_MODEL };
  if (GEMINI_API_KEYS.length) return { provider: 'gemini', model: GEMINI_FLASH_MODEL };
  if (QWEN_API_KEYS.length) return { provider: 'qwen', model: QWEN_FLASH_MODEL };
  if (KIMI_API_KEYS.length) return { provider: 'kimi', model: KIMI_FLASH_MODEL };
  if (NVIDIA_API_KEYS.length) return { provider: 'nvidia', model: NVIDIA_FLASH_MODEL };
  return null; // regex distillation fallback handles it
}

const searchService = createSearchService({
  tavilyApiKey: TAVILY_API_KEY,
  firecrawlApiKey: FIRECRAWL_API_KEY,
  braveApiKey: process.env.BRAVE_API_KEY,
  llmService,
  queryRewriter: pickQueryRewriter(),
  stableCacheKey,
  cacheGet,
  cacheSet,
  memoryCaches
});
registerSearchRoutes(app, { verifyFirebaseRequest, searchService });

routingEngine.searchService = searchService;



const chatPromptBuilder = createChatPromptBuilder();

registerChatRoutes(app, {
  hasAnyAiProvider: () => Boolean(GEMINI_API_KEYS.length || GROQ_API_KEYS.length || QWEN_API_KEYS.length || KIMI_API_KEYS.length || NVIDIA_API_KEYS.length || OPENROUTER_API_KEYS.length || AGNES_API_KEYS.length),
  verifyFirebaseRequest,
  enforceDailyUsage,
  allowedModels: ALLOWED_MODELS,
  defaultModel: GROQ_TEXT_MODEL,
  flashModel: GROQ_FLASH_MODEL,
  cleanMessages,
  containsImageContent: (messages) => (messages || []).some(m => Array.isArray(m.content) && m.content.some(p => p?.type === 'image_url')),
  routingEngine,
  fullSystemPrompt: QJO_FULL_TRAINING_PROMPT,
  buildChatSystemPrompt: chatPromptBuilder.buildChatSystemPrompt,
  defaultMaxTokens: 2600,
  getClientIp,
  lookupClientGeo,
  stableCacheKey,
  cacheGet,
  cacheSet,
  memoryCaches
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Qjo production server running on ${PORT}`));

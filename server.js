const express = require('express');
const path = require('path');
const fs = require('fs');
const _http = require('http');
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
const { createSafeCalculate } = require('./src/tools/calculatorTool');
const { registerChatRoutes } = require('./src/routes/chat');

let admin = null;
try { admin = require('firebase-admin'); } catch (_) { admin = null; }

const app = express();
// X-Forwarded-For is only trustworthy when a proxy we control actually
// rewrites it. Trusting it unconditionally lets a direct client forge its own
// IP and reset the guest quota; not trusting it on Render collapses every
// visitor onto the proxy's IP and breaks rate limiting. So: trust exactly as
// many hops as the deployment really has.
//   TRUST_PROXY=<n>  explicit hop count (Cloudflare in front of Render => 2)
//   TRUST_PROXY=false / 0  direct exposure, ignore the header entirely
//   unset  => 1 on Render (RENDER is set by the platform), 0 locally
const TRUST_PROXY_SETTING = (() => {
  const raw = String(process.env.TRUST_PROXY ?? '').trim().toLowerCase();
  if (raw === 'false') return false;
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  return process.env.RENDER ? 1 : 0;
})();
app.set('trust proxy', TRUST_PROXY_SETTING);
const PORT = process.env.PORT || 3000;
const QJO_VERSION = 'qjo-launch-prep-2026-08-28-1';
const QJO_FULL_TRAINING_PROMPT = (() => {
  try { return fs.readFileSync(path.join(__dirname, 'QJO_FULL_TRAINING_PROMPT.md'), 'utf8').trim(); }
  catch { return ''; }
})();
const _GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_KEYS = String(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

// LLM7: Free OpenAI-compatible aggregator
const LLM7_API_KEYS = String(process.env.LLM7_API_KEYS || process.env.LLM7_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
const LLM7_BASE_URL = String(process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1').replace(/\/$/, '');
const LLM7_FLASH_MODEL = process.env.LLM7_FLASH_MODEL || 'deepseek-chat';
const LLM7_TEXT_MODEL = process.env.LLM7_TEXT_MODEL || 'llama-3.3-70b-instruct';

// Kimi (Moonshot) Free tier
const KIMI_API_KEYS = String(process.env.KIMI_API_KEYS || process.env.KIMI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

// Qwen (DashScope) Free tier
const QWEN_API_KEYS = String(process.env.QWEN_API_KEYS || process.env.QWEN_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);


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

const IP_RATE_LIMIT_PER_MINUTE = Number(process.env.IP_RATE_LIMIT_PER_MINUTE || 0); // 0 = disabled
// Groq's official replacements for the llama-3.1/3.3 line (shutting down
// 2026-08-16 — see console.groq.com/docs/deprecations). llmService also
// auto-migrates any stale values coming from old envs.
const GROQ_FLASH_MODEL = process.env.GROQ_FLASH_MODEL || 'openai/gpt-oss-20b';
const GROQ_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const QWEN_FLASH_MODEL = process.env.QWEN_FLASH_MODEL || 'qwen-plus';
const QWEN_TEXT_MODEL = process.env.QWEN_TEXT_MODEL || 'qwen-plus';
const QWEN_CODE_MODEL = process.env.QWEN_CODE_MODEL || QWEN_TEXT_MODEL;
const QWEN_VISION_MODEL = process.env.QWEN_VISION_MODEL || 'qwen-vl-plus';
const KIMI_BASE_URL = String(process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
const KIMI_FLASH_MODEL = process.env.KIMI_FLASH_MODEL || process.env.KIMI_MODEL || 'moonshot-v1-8k';
const KIMI_TEXT_MODEL = process.env.KIMI_TEXT_MODEL || process.env.KIMI_MODEL || 'moonshot-v1-8k';
const KIMI_CODE_MODEL = process.env.KIMI_CODE_MODEL || KIMI_TEXT_MODEL;
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
  'meta-llama/llama-4-scout-17b-16e-instruct',
  // LLM7 models
  LLM7_FLASH_MODEL,
  LLM7_TEXT_MODEL,
  'deepseek-chat',
  'llama-3.3-70b-instruct',
  // Qwen models
  QWEN_FLASH_MODEL,
  QWEN_TEXT_MODEL,
  QWEN_CODE_MODEL,
  QWEN_VISION_MODEL,
  'qwen-plus',
  'qwen-vl-plus',
  // Kimi models
  KIMI_FLASH_MODEL,
  KIMI_TEXT_MODEL,
  KIMI_CODE_MODEL,
  'moonshot-v1-8k',
  // Legacy IDs still accepted from old clients; llmService migrates them.
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile'
]);

const math = create(all);
// Capture the real evaluate BEFORE the hardening import below overrides the
// namespace symbol, otherwise safeCalculate calls the throwing stub and the
// calculator tool never works.
const rawMathEvaluate = math.evaluate.bind(math);
math.import({
  import: () => { throw new Error('Function import is disabled.'); },
  createUnit: () => { throw new Error('Function createUnit is disabled.'); },
  evaluate: () => { throw new Error('Nested evaluate is disabled.'); },
  parse: () => { throw new Error('Function parse is disabled.'); },
  simplify: () => { throw new Error('Function simplify is disabled.'); },
  derivative: () => { throw new Error('Function derivative is disabled.'); }
}, { override: true });

const safeCalculate = createSafeCalculate(math, rawMathEvaluate);

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
        "https://api.llm7.io",
        "https://api.tavily.com",
        "https://api.firecrawl.dev",
        "https://dashscope-intl.aliyuncs.com",
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
// Server-Sent Events streaming: the client gets nothing until the buffer
// flushes. /api/chat streams tokens live, so it must bypass compression.
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.path === '/api/chat') return false;
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
  // req.ip is derived by Express using the 'trust proxy' setting, which picks
  // the hop actually added by our proxy. Reading X-Forwarded-For[0] directly
  // (the old behaviour) took the FIRST entry — which the client fully controls
  // — letting anyone reset their guest quota by rotating a fake header.
  const raw = req.ip || req.socket?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/, '');
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



const llmService = createLlmService({
  groqKeys: GROQ_API_KEYS,
  llm7Keys: LLM7_API_KEYS,
  llm7BaseUrl: LLM7_BASE_URL,
  hasLlm7: LLM7_API_KEYS.length > 0 || process.env.ENABLE_LLM7 === 'true' || Boolean(process.env.LLM7_API_KEY),
  qwenKeys: QWEN_API_KEYS,
  kimiKeys: KIMI_API_KEYS,
  kimiBaseUrl: KIMI_BASE_URL
});

const routingEngine = createRoutingEngine({
  llmService,
  safeCalculate,
  searchService: null,
  keys: {
    groq: GROQ_API_KEYS.length,
    llm7: LLM7_API_KEYS.length || (process.env.ENABLE_LLM7 === 'true' ? 1 : 0),
    qwen: QWEN_API_KEYS.length,
    kimi: KIMI_API_KEYS.length
  },
  models: {
    groqFlash: GROQ_FLASH_MODEL,
    groqText: GROQ_TEXT_MODEL,
    groqCode: GROQ_TEXT_MODEL,
    groqVision: GROQ_VISION_MODEL,
    llm7Flash: LLM7_FLASH_MODEL,
    llm7Text: LLM7_TEXT_MODEL,
    llm7Code: LLM7_TEXT_MODEL,
    qwenFlash: QWEN_FLASH_MODEL,
    qwenText: QWEN_TEXT_MODEL,
    qwenCode: QWEN_CODE_MODEL,
    qwenVision: QWEN_VISION_MODEL,
    kimiFlash: KIMI_FLASH_MODEL,
    kimiText: KIMI_TEXT_MODEL,
    kimiCode: KIMI_CODE_MODEL
  }
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
    llm7: LLM7_API_KEYS.length || (process.env.ENABLE_LLM7 === 'true' ? 1 : 0),
    qwen: QWEN_API_KEYS.length,
    kimi: KIMI_API_KEYS.length,
    tavily: Boolean(TAVILY_API_KEY),
    firecrawl: Boolean(FIRECRAWL_API_KEY)
  }),
  modelsDiagnostics: () => ({
    groqFlash: GROQ_FLASH_MODEL,
    groqText: GROQ_TEXT_MODEL,
    groqVision: GROQ_VISION_MODEL,
    llm7Flash: LLM7_FLASH_MODEL,
    llm7Text: LLM7_TEXT_MODEL,
    qwenFlash: QWEN_FLASH_MODEL,
    qwenText: QWEN_TEXT_MODEL,
    qwenCode: QWEN_CODE_MODEL,
    qwenVision: QWEN_VISION_MODEL,
    kimiFlash: KIMI_FLASH_MODEL,
    kimiText: KIMI_TEXT_MODEL,
    kimiCode: KIMI_CODE_MODEL
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
  serperApiKey: process.env.SERPER_API_KEY,
  embeddingsService,
  getLimitConfig: authService.getLimitConfig,
  getUsageSnapshot: authService.getUsageSnapshot,
  getClientIp,
  lookupClientGeo,
  qjoProviders: () => ({
    groq: GROQ_API_KEYS.length > 0,
    llm7: LLM7_API_KEYS.length > 0 || process.env.ENABLE_LLM7 === 'true',
    qwen: QWEN_API_KEYS.length > 0,
    kimi: KIMI_API_KEYS.length > 0
  }),
  healthPayload: () => ({
    groqKeysConfigured: GROQ_API_KEYS.length,
    llm7KeysConfigured: LLM7_API_KEYS.length || (process.env.ENABLE_LLM7 === 'true' ? 1 : 0),
    qwenKeysConfigured: QWEN_API_KEYS.length,
    kimiKeysConfigured: KIMI_API_KEYS.length,
    guestDailyLimit: GUEST_DAILY_LIMIT,
    embeddingsConfigured: embeddingsService.configuredCount(),
    embeddingsProvider: embeddingsService.getEmbeddingProviderName(),
    routerVersion: 'pipelines-v2',
    chatPipelines: {
      lite: ['groq:flash', 'llm7:flash', 'qwen:flash', 'kimi:flash'],
      flash: ['groq:flash', 'llm7:flash', 'qwen:flash', 'kimi:flash'],
      maxAr: ['qwen:text', 'kimi:text', 'llm7:text', 'groq:text'],
      maxEn: ['groq:text', 'llm7:text', 'qwen:text', 'kimi:text'],
      code: ['kimi:code', 'qwen:code', 'llm7:text', 'groq:text'],
      vision: ['groq:vision', 'qwen:vision']
    },
    models: {
      groqFlash: GROQ_FLASH_MODEL,
      groqText: GROQ_TEXT_MODEL,
      groqVision: GROQ_VISION_MODEL,
      llm7Flash: LLM7_FLASH_MODEL,
      llm7Text: LLM7_TEXT_MODEL,
      qwenFlash: QWEN_FLASH_MODEL,
      qwenText: QWEN_TEXT_MODEL,
      qwenCode: QWEN_CODE_MODEL,
      qwenVision: QWEN_VISION_MODEL,
      kimiFlash: KIMI_FLASH_MODEL,
      kimiText: KIMI_TEXT_MODEL,
      kimiCode: KIMI_CODE_MODEL
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
    realEmbeddingsRag: true,
    fastSearchOptimized: true,
    smartRouterV2: true,
    searchQueryDistillation: true
  })
});

// Only /api/export/image-to-pdf uploads a file, so a small dedicated limit is
// enough (this used to borrow Qcode's multer instance).
const exportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.EXPORT_MAX_UPLOAD_MB || 10) * 1024 * 1024, files: 1 }
});
registerExportRoutes(app, { verifyFirebaseRequest, uploadMiddleware: exportUpload });

// Picks the fastest available provider for the search query rewriter
// (a tiny 150-token call that massively improves Arabic/dialect queries).
function pickQueryRewriter() {
  if (GROQ_API_KEYS.length) return { provider: 'groq', model: GROQ_FLASH_MODEL };
  if (LLM7_API_KEYS.length || process.env.ENABLE_LLM7 === 'true') return { provider: 'llm7', model: LLM7_FLASH_MODEL };
  if (QWEN_API_KEYS.length) return { provider: 'qwen', model: QWEN_FLASH_MODEL };
  if (KIMI_API_KEYS.length) return { provider: 'kimi', model: KIMI_FLASH_MODEL };
  return null; // regex distillation fallback handles it
}

const searchService = createSearchService({
  tavilyApiKey: TAVILY_API_KEY,
  firecrawlApiKey: FIRECRAWL_API_KEY,
  serperApiKey: process.env.SERPER_API_KEY,
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
  hasAnyAiProvider: () => Boolean(GROQ_API_KEYS.length || LLM7_API_KEYS.length || process.env.ENABLE_LLM7 === 'true' || QWEN_API_KEYS.length || KIMI_API_KEYS.length),
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

// Unknown /api/* must NOT fall through to the SPA catch-all below. It used to,
// so a typo'd endpoint returned 200 + index.html and the client blew up with
// "Unexpected token '<'" instead of seeing a clean 404.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.', path: req.originalUrl.split('?')[0] });
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Last-resort error handler: never leak a stack trace to the client, and make
// multer's upload-limit rejections readable instead of a generic 500.
app.use((error, req, res, _next) => {
  const status = error?.status || error?.statusCode || (error?.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const message = error?.code === 'LIMIT_FILE_SIZE'
    ? 'File is too large.'
    : error?.code === 'LIMIT_FILE_COUNT'
      ? 'Too many files.'
      : status === 500 ? 'Internal server error.' : String(error?.message || 'Request failed.');
  if (status >= 500) console.error('Unhandled route error:', error?.message || error);
  if (res.headersSent) return;
  res.status(status).json({ error: message });
});

app.listen(PORT, () => console.log(`Qjo production server running on ${PORT}`));

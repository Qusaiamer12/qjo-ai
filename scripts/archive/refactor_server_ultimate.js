const fs = require('fs');

let c = fs.readFileSync('server.js', 'utf8');

// Replace CRLF with LF for consistency during processing
c = c.replace(/\r\n/g, '\n');

// Remove all problematic imports
c = c.replace(/const \{ createOpenAICompatibleProviderService \} = require\('\.\/src\/services\/aiProviders'\);\n/g, '');
c = c.replace(/const \{ createModelProviders \} = require\('\.\/src\/services\/modelProviders'\);\n/g, '');
c = c.replace(/const \{ createQcodeProviderRouter \} = require\('\.\/src\/agents\/qcodeProviderRouter'\);\n/g, '');
c = c.replace(/const \{ createQSparkProviderRouter \} = require\('\.\/src\/agents\/qsparkProviderRouter'\);\n/g, '');
c = c.replace(/const \{ createModelRouter \} = require\('\.\/src\/agents\/modelRouter'\);\n/g, '');
c = c.replace(/const \{ validateRoutingDecision \} = require\('\.\/src\/agents\/routerAgent'\);\n/g, '');

// Clean any previous injected duplicates
c = c.replace(/const \{ createLlmService \} = require\('\.\/src\/services\/llmService'\);\n/g, '');
c = c.replace(/const \{ createRoutingEngine \} = require\('\.\/src\/agents\/RoutingEngine'\);\n/g, '');

// Inject clean imports at the top
c = c.replace(/const \{ registerSystemRoutes \} = require\('\.\/src\/routes\/system'\);\n/, 
  "const { registerSystemRoutes } = require('./src/routes/system');\nconst { createLlmService } = require('./src/services/llmService');\nconst { createRoutingEngine } = require('./src/agents/RoutingEngine');\n"
);

// Remove the old blocks completely using regex with dotsall /s or just replacing them line by line
c = c.replace(/const openAICompatibleProviderService = createOpenAICompatibleProviderService\(\);\nconst callOpenAICompatibleProvider = openAICompatibleProviderService\.callOpenAICompatibleProvider;\n/, '');

c = c.replace(/const qcodeProviderRouter = createQcodeProviderRouter\(\{[\s\S]*?\}\);\n/, '');

c = c.replace(/const qSparkProviderRouter = createQSparkProviderRouter\(\{[\s\S]*?\}\);\n/, '');

// Delete any old routingEngine and llmService declarations if they were injected multiple times
c = c.replace(/const llmService = createLlmService\(\{[\s\S]*?\}\);\n\n/g, '');
c = c.replace(/const routingEngine = createRoutingEngine\(\{[\s\S]*?\}\);\n\n/g, '');

const injection = `
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
    geminiText: GEMINI_TEXT_MODEL,
    geminiFlash: GEMINI_FLASH_MODEL,
    qwenFlash: QWEN_FLASH_MODEL,
    qwenText: QWEN_TEXT_MODEL,
    qwenCode: QWEN_CODE_MODEL,
    kimiFlash: KIMI_FLASH_MODEL,
    kimiText: KIMI_TEXT_MODEL,
    kimiCode: KIMI_CODE_MODEL,
    nvidiaFlash: NVIDIA_FLASH_MODEL,
    nvidiaText: NVIDIA_TEXT_MODEL,
    geminiPro: 'gemini-2.5-pro'
  }
});
`;

c = c.replace(/const qcodeWorkspace = createQcodeWorkspaceService\(\{[\s\S]*?\}\);\n/, match => match + '\n' + injection);

// Fix qcodeAgent (clean out old duplicate replacements if they exist)
c = c.replace(/callQcodeRouter: \/\* removed router deps \*\//g, 'callQcodeRouter: qcodeProviderRouter.callQcodeRouter');
c = c.replace(/callQcodeRouter: qcodeProviderRouter\.callQcodeRouter,/g, '/* removed router deps */');

c = c.replace(/keysConfigured: \/\* replaced by keys obj \*\//g, 'keysConfigured: qcodeProviderRouter.keysConfigured');
c = c.replace(/keysConfigured: qcodeProviderRouter\.keysConfigured,/g, '/* replaced by keys obj */');

// Fix duplicated routingEngine in registerQcodeRoutes
c = c.replace(/registerQcodeRoutes\(app, \{\n  routingEngine,\n  routingEngine,/g, 'registerQcodeRoutes(app, {\n  routingEngine,');
c = c.replace(/registerQcodeRoutes\(app, \{/g, 'registerQcodeRoutes(app, {');
// Let's just do a clean replacement of the whole registerQcodeRoutes signature
c = c.replace(/registerQcodeRoutes\(app, \{[\s\S]*?learning: qcodeLearning\n\}\);/g, `registerQcodeRoutes(app, {
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
  keysConfigured: /* handled internally */ null,
  tools: qcodeWorkspace,
  learning: qcodeLearning
});`);

// Fix duplicated registerQSparkRoutes
c = c.replace(/registerQSparkRoutes\(app, \{[\s\S]*?uploadMiddleware: qSparkUpload \}\);/g, `registerQSparkRoutes(app, {
  routingEngine,
  keys: { groq: QSPARK_GROQ_API_KEYS.length, kimi: QSPARK_KIMI_API_KEYS.length, qwen: QSPARK_QWEN_API_KEYS.length, nvidia: QSPARK_NVIDIA_API_KEYS.length },
  models: { groq: QSPARK_GROQ_MODEL, kimi: QSPARK_KIMI_MODEL, qwen: QSPARK_QWEN_MODEL, nvidia: QSPARK_NVIDIA_MODEL },
  cleanMessages,
  fullSystemPrompt: QJO_FULL_TRAINING_PROMPT,
  verifyFirebaseRequest,
  uploadMiddleware: qSparkUpload
});`);

// Fix bottom old routers
c = c.replace(/const modelProviders = createModelProviders\(\{[\s\S]*?\}\);\nconst callGeminiChat = modelProviders\.callGeminiChat;\nconst callQwenChat = modelProviders\.callQwenChat;\nconst callGroqChat = modelProviders\.callGroqChat;\nconst callKimiChat = modelProviders\.callKimiChat;\nconst callNvidiaChat = modelProviders\.callNvidiaChat;\nconst callOpenRouterFreeChat = modelProviders\.callOpenRouterFreeChat;\nconst callAgnesChat = modelProviders\.callAgnesChat;\nconst normalizeProviderFinishReason = modelProviders\.normalizeProviderFinishReason;\n/g, '');

c = c.replace(/const modelRouter = createModelRouter\(\{[\s\S]*?\}\);\nconst callAIRouter = modelRouter\.callAIRouter;\nconst completeIfTruncated = modelRouter\.completeIfTruncated;\nconst containsImageContent = modelRouter\.containsImageContent;\n/g, '');

c = c.replace(/routingEngine\.searchService = searchService;\n/g, '');
c = c.replace(/registerSearchRoutes\(app, \{ verifyFirebaseRequest, searchService \}\);\n/g, `registerSearchRoutes(app, { verifyFirebaseRequest, searchService });\n\nroutingEngine.searchService = searchService;\n`);

c = c.replace(/registerChatRoutes\(app, \{[\s\S]*?defaultMaxTokens: 2600\n\}\);/g, `registerChatRoutes(app, {
  hasAnyAiProvider: () => Boolean(GEMINI_API_KEYS.length || GROQ_API_KEYS.length || QWEN_API_KEYS.length || KIMI_API_KEYS.length || NVIDIA_API_KEYS.length || OPENROUTER_API_KEYS.length || AGNES_API_KEYS.length),
  verifyFirebaseRequest,
  enforceDailyUsage,
  allowedModels: ALLOWED_MODELS,
  defaultModel: GROQ_TEXT_MODEL,
  flashModel: GROQ_FLASH_MODEL,
  cleanMessages,
  containsImageContent: () => false,
  routingEngine,
  fullSystemPrompt: QJO_FULL_TRAINING_PROMPT,
  defaultMaxTokens: 2600
});`);

fs.writeFileSync('server.js', c);
console.log('Fixed server.js comprehensively!');

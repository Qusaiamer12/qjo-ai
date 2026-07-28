const fs = require('fs');

let c = fs.readFileSync('server.js', 'utf8');

// 1. Replace Imports
c = c.replace(/const \{ createOpenAICompatibleProviderService \} = require\('\.\/src\/services\/aiProviders'\);\n/, '');
c = c.replace(/const \{ createModelProviders \} = require\('\.\/src\/services\/modelProviders'\);\n/, '');
c = c.replace(/const \{ createQcodeProviderRouter \} = require\('\.\/src\/agents\/qcodeProviderRouter'\);\n/, '');
c = c.replace(/const \{ createQSparkProviderRouter \} = require\('\.\/src\/agents\/qsparkProviderRouter'\);\n/, '');
c = c.replace(/const \{ createModelRouter \} = require\('\.\/src\/agents\/modelRouter'\);\n/, 
  "const { createLlmService } = require('./src/services/llmService');\nconst { createRoutingEngine } = require('./src/agents/RoutingEngine');\n"
);

// 2. Remove openAICompatibleProviderService
c = c.replace(/const openAICompatibleProviderService = createOpenAICompatibleProviderService\(\);\nconst callOpenAICompatibleProvider = openAICompatibleProviderService\.callOpenAICompatibleProvider;\n/, '');

// 3. Remove qcodeProviderRouter
c = c.replace(/const qcodeProviderRouter = createQcodeProviderRouter\(\{[\s\S]*?\}\);\n/, '');

// 4. Update qcodeAgent deps
c = c.replace(/callQcodeRouter: qcodeProviderRouter\.callQcodeRouter,/g, '/* removed router deps */');
c = c.replace(/keysConfigured: qcodeProviderRouter\.keysConfigured,/g, '/* replaced by keys obj */');

// 5. Remove qSparkProviderRouter
c = c.replace(/const qSparkProviderRouter = createQSparkProviderRouter\(\{[\s\S]*?\}\);\n/, '');
c = c.replace(/router: qSparkProviderRouter,/g, '/* router handled dynamically */');


// We need to inject `llmService` and `routingEngine` right after QCODE_WORKSPACE_DIR stuff.
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
  searchService: null, // will attach later if initialized after
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

// Insert the new logic where openAICompatibleProviderService used to be
c = c.replace(/const qcodeWorkspace = createQcodeWorkspaceService\(\{[\s\S]*?\}\);\n/, match => match + '\n' + injection);

// 6. Update qcode router registration to pass routingEngine
c = c.replace(/registerQcodeRoutes\(app, \{/g, 'registerQcodeRoutes(app, {\n  routingEngine,');

// 7. Update qspark router registration to pass routingEngine
c = c.replace(/registerQSparkRoutes\(app, \{/g, 'registerQSparkRoutes(app, {\n  routingEngine,\n  keys: { groq: QSPARK_GROQ_API_KEYS.length, kimi: QSPARK_KIMI_API_KEYS.length, qwen: QSPARK_QWEN_API_KEYS.length, nvidia: QSPARK_NVIDIA_API_KEYS.length },\n  models: { groq: QSPARK_GROQ_MODEL, kimi: QSPARK_KIMI_MODEL, qwen: QSPARK_QWEN_MODEL, nvidia: QSPARK_NVIDIA_MODEL },');

// 8. Remove the old modelProviders and modelRouter from bottom
c = c.replace(/const modelProviders = createModelProviders\(\{[\s\S]*?\}\);\nconst callGeminiChat = modelProviders\.callGeminiChat;\nconst callQwenChat = modelProviders\.callQwenChat;\nconst callGroqChat = modelProviders\.callGroqChat;\nconst callKimiChat = modelProviders\.callKimiChat;\nconst callNvidiaChat = modelProviders\.callNvidiaChat;\nconst callOpenRouterFreeChat = modelProviders\.callOpenRouterFreeChat;\nconst callAgnesChat = modelProviders\.callAgnesChat;\nconst normalizeProviderFinishReason = modelProviders\.normalizeProviderFinishReason;\n/g, '');

c = c.replace(/const modelRouter = createModelRouter\(\{[\s\S]*?\}\);\nconst callAIRouter = modelRouter\.callAIRouter;\nconst completeIfTruncated = modelRouter\.completeIfTruncated;\nconst containsImageContent = modelRouter\.containsImageContent;\n/g, '');


// Fix search service attachment
c = c.replace(/registerSearchRoutes\(app, \{ verifyFirebaseRequest, searchService \}\);\n/, match => match + '\n// Attach search service to routing engine now that it is initialized\nroutingEngine.searchService = searchService;\n');

// 9. Fix registerChatRoutes
c = c.replace(/callAIRouter,/g, '');
c = c.replace(/completeIfTruncated,/g, '');
c = c.replace(/containsImageContent,/g, 'containsImageContent: () => false, // No longer used locally\n  routingEngine,');

fs.writeFileSync('server.js', c);
console.log('Done refactoring server.js');

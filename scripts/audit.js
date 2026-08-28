#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let failures = 0;
let warnings = 0;
function pass(msg) { console.log(`✅ ${msg}`); }
function fail(msg) { failures++; console.error(`❌ ${msg}`); }
function warn(msg) { warnings++; console.warn(`⚠️  ${msg}`); }
function must(condition, msg) { condition ? pass(msg) : fail(msg); }
function should(condition, msg) { condition ? pass(msg) : warn(msg); }

function syntaxCheck(file) {
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
    pass(`Syntax OK: ${file}`);
  } catch (error) {
    fail(`Syntax failed: ${file}\n${String(error.stderr || error.message)}`);
  }
}

console.log('\nQjo Stability Audit (Unified & Cleaned)');
console.log('======================================\n');

const requiredFiles = [
  'server.js',
  'public/app.js',
  'public/admin.js',
  'public/index.html',
  'public/styles.css',
  'public/qjo-diagnostic.html',
  'public/qcode.html',
  'public/terms.html',
  'public/privacy.html',
  'public/safety.html',
  'evals/launch-eval-v2.js',
  'evals/launch-dataset-v2.json',
  'evals/backend-regression-eval-v1.js',
  'evals/ai-quality-eval-v1.js',
  'evals/ai-quality-dataset-v1.json',
  'docs/QJO_SYSTEM_PROMPT_VNEXT_XML.md',
  'src/search/searchCore.js',
  'src/agents/contextContinuity.js',
  'src/agents/RoutingEngine.js',
  'src/tools/calculatorTool.js',
  'src/tools/searchTool.js',
  'src/tools/fileEditorTool.js',
  'src/services/searchService.js',
  'src/services/qcodeWorkspace.js',
  'src/services/llmService.js',
  'src/services/embeddings.js',
  'src/services/exportService.js',
  'src/services/adminConfig.js',
  'src/services/authService.js',
  'src/services/jobQueue.js',
  'src/services/feedbackService.js',
  'src/routes/chat.js',
  'src/routes/embeddings.js',
  'src/routes/export.js',
  'src/routes/search.js',
  'src/routes/qcode.js',
  'src/routes/qspark.js',
  'src/routes/admin.js',
  'src/routes/system.js',
  'src/routes/jobs.js',
  'src/routes/feedback.js',
  'src/agents/qcodeAgent.js',
  'package.json'
];

requiredFiles.forEach((file) => {
  must(exists(file), `Required file exists: ${file}`);
});

if (!failures) {
  syntaxCheck('server.js');
  syntaxCheck('public/app.js');
  syntaxCheck('public/admin.js');
  syntaxCheck('src/search/searchCore.js');
  syntaxCheck('src/agents/contextContinuity.js');
  syntaxCheck('src/agents/RoutingEngine.js');
  syntaxCheck('src/tools/calculatorTool.js');
  syntaxCheck('src/tools/searchTool.js');
  syntaxCheck('src/tools/fileEditorTool.js');
  syntaxCheck('src/services/searchService.js');
  syntaxCheck('src/services/qcodeWorkspace.js');
  syntaxCheck('src/services/llmService.js');
  syntaxCheck('src/services/embeddings.js');
  syntaxCheck('src/services/exportService.js');
  syntaxCheck('src/services/adminConfig.js');
  syntaxCheck('src/services/authService.js');
  syntaxCheck('src/services/jobQueue.js');
  syntaxCheck('src/services/feedbackService.js');
  syntaxCheck('src/routes/chat.js');
  syntaxCheck('src/routes/embeddings.js');
  syntaxCheck('src/routes/export.js');
  syntaxCheck('src/routes/search.js');
  syntaxCheck('src/routes/qcode.js');
  syntaxCheck('src/routes/qspark.js');
  syntaxCheck('src/routes/admin.js');
  syntaxCheck('src/routes/system.js');
  syntaxCheck('src/routes/jobs.js');
  syntaxCheck('src/routes/feedback.js');
  syntaxCheck('src/agents/qcodeAgent.js');
  syntaxCheck('evals/backend-regression-eval-v1.js');
  syntaxCheck('evals/ai-quality-eval-v1.js');
}

const server = read('server.js');
const app = read('public/app.js');
const html = read('public/index.html');
const css = read('public/styles.css');
const pkg = JSON.parse(read('package.json'));

console.log('\nRuntime / deploy');
console.log('----------------');
must(/const\s+QJO_VERSION\s*=\s*'[^']+'/.test(server), 'server.js has QJO_VERSION');
must(/const\s+QJO_FRONTEND_VERSION\s*=\s*'[^']+'/.test(app), 'public/app.js has QJO_FRONTEND_VERSION');
must(html.includes('/app.js?v='), 'index.html cache-busts app.js');
must(!html.includes('auth-overlay show'), 'Auth overlay is not shown before Firebase state settles');
must(html.includes('/styles.css?v='), 'index.html cache-busts styles.css');
must(pkg.scripts && pkg.scripts.start === 'node server.js', 'package.json start script is node server.js');
must(pkg.scripts && pkg.scripts.audit === 'node scripts/audit.js', 'package.json audit script is registered');
must(pkg.scripts && pkg.scripts.eval === 'node evals/run-eval.js', 'package.json eval script is registered');
must(pkg.scripts && pkg.scripts['launch-eval'] === 'node evals/launch-eval-v2.js', 'package.json launch-eval script is registered');
must(pkg.scripts && pkg.scripts['backend-regression'] === 'node evals/backend-regression-eval-v1.js', 'package.json backend-regression script is registered');
must(pkg.scripts && pkg.scripts['ai-quality-eval'] === 'node evals/ai-quality-eval-v1.js', 'package.json ai-quality-eval script is registered');
must(pkg.dependencies && pkg.dependencies.jszip, 'jszip dependency exists for code ZIP export');
must(pkg.dependencies && pkg.dependencies.compression, 'compression dependency exists');
must(pkg.dependencies && pkg.dependencies.puppeteer, 'puppeteer dependency exists for HTML PDF export');
must(pkg.dependencies && pkg.dependencies.zod, 'zod dependency exists for strict routing/tool schemas');
must(read('src/routes/system.js').includes("app.get('/api/health'"), '/api/health endpoint exists');
must(read('src/services/exportService.js').includes('buildExportHtmlDocument') && read('src/services/exportService.js').includes('renderHtmlPdfWithPuppeteer'), 'HTML/Puppeteer PDF export exists');
must(read('src/routes/system.js').includes("app.get('/api/status'"), 'Public status endpoint exists');
must(exists('evals/launch-eval-v2.js') && exists('evals/launch-dataset-v2.json'), 'Launch Eval v2 exists');
must(read('src/routes/embeddings.js').includes("app.post('/api/embeddings'") && server.includes('EMBEDDING_API_KEYS'), 'Embeddings endpoint exists');
must(server.includes('HUGGINGFACE_API_KEYS') && read('src/services/embeddings.js').includes('parseHuggingFaceEmbeddings') && read('.env.example').includes('HUGGINGFACE_EMBEDDING_MODEL'), 'Hugging Face embeddings support exists');
must(read('src/routes/admin.js').includes("app.get('/api/admin/me'") && read('src/routes/admin.js').includes("app.post('/api/admin/config'") && read('src/routes/admin.js').includes("app.get('/api/admin/diagnostics'"), 'Admin API endpoints exist');
must(server.includes("require('./src/routes/system')") && server.includes("require('./src/routes/admin')") && server.includes("require('./src/services/adminConfig')") && read('src/services/adminConfig.js').includes('createAdminConfigService'), 'System/admin route modules exist');
must(server.includes("require('./src/services/authService')") && read('src/services/authService.js').includes('createAuthService') && read('src/services/authService.js').includes('verifyFirebaseRequest') && read('src/services/authService.js').includes('enforceDailyUsage'), 'Auth/usage service module exists');
must(server.includes("require('./src/routes/feedback')") && read('src/routes/feedback.js').includes("app.post('/api/feedback'") && app.includes('sendFeedback'), 'Feedback route/UI exists');
must(read('.env.example').includes('GUEST_DAILY_LIMIT') && read('src/services/authService.js').includes('guestDailyLimit'), 'Guest daily limit env documented');
must(server.includes("require('./src/services/jobQueue')") && server.includes("require('./src/routes/jobs')") && read('src/services/jobQueue.js').includes('createJobQueue') && read('src/routes/jobs.js').includes("app.post('/api/jobs'"), 'Background job queue module exists');
must(html.includes('qjo-diagnostic') || exists('public/qjo-diagnostic.html'), 'Diagnostic page exists');
must(read('public/terms.html').includes('شروط الاستخدام') && read('public/privacy.html').includes('سياسة الخصوصية') && read('public/safety.html').includes('السلامة'), 'Public SaaS legal/safety pages exist');
must(read('public/admin.html').includes('diagnosticsBox') && read('public/admin.js').includes('loadDiagnostics'), 'Admin diagnostics UI exists');

console.log('\nAuth / Firebase lock');
console.log('--------------------');
must(app.includes('DEFAULT_FIREBASE_CONFIG'), 'Default Firebase config exists');
must(app.includes('loadPublicConfig'), 'loadPublicConfig exists');
must(app.includes('initializeFirebase'), 'initializeFirebase exists');
must((app.match(/signInWithPopup/g) || []).length >= 2, 'Google/GitHub use signInWithPopup');
must(!app.includes('signInWithRedirect'), 'signInWithRedirect is not present');
must(app.includes('signInWithEmailAndPassword'), 'Email login exists');
must(app.includes('createUserWithEmailAndPassword'), 'Email signup exists');
must(server.includes("'unsafe-eval'") || server.includes('"unsafe-eval"'), 'CSP keeps unsafe-eval for Firebase compat');
['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com', '*.firebaseio.com', '*.firebaseapp.com', 'accounts.google.com', 'cdn.jsdelivr.net'].forEach((domain) => {
  must(server.includes(domain), `CSP includes ${domain}`);
});

console.log('\nPrompt / intelligence lock');
console.log('--------------------------');
const promptMatch = app.match(/const\s+QJO_SYSTEM_PROMPT\s*=\s*`([\s\S]*?)`;\s*/);
must(Boolean(promptMatch), 'QJO_SYSTEM_PROMPT exists');
if (promptMatch) {
  const prompt = promptMatch[1];
  must(prompt.length >= 18000, `QJO_SYSTEM_PROMPT vNext is substantial (${prompt.length} chars)`);
  ['<system_instructions>', '<qjo_product_context>', '<qspark_context>', '<qcode_context>', '<search_and_sources>', '<software_engineering_and_product_building>', '<file_rag_and_multimodal_analysis>', '<privacy_security_and_safety>'].forEach((term) => {
    must(prompt.toLowerCase().includes(term.toLowerCase()), `Prompt vNext contains ${term}`);
  });
}
must(promptMatch && promptMatch[1].includes('<search_and_sources>'), 'Prompt vNext has search_and_sources section');
must(promptMatch && promptMatch[1].includes('<intent_classification_and_mode_detection>'), 'Prompt vNext has mode behavior section');
must(promptMatch && promptMatch[1].includes('<software_engineering_and_product_building>'), 'Prompt vNext has software engineering section');
must(app.includes('extractProjectFiles') && app.includes('downloadCodeZip'), 'Code project ZIP frontend exists');

console.log('\nModes lock');
console.log('----------');
['normalModeBtn', 'advancedModeBtn', 'modeDropdown', 'modeCurrentBtn'].forEach((id) => {
  must(app.includes(id) && html.includes(id), `Mode control exists: ${id}`);
});
must(app.includes('modeDropdown.addEventListener'), 'Mode dropdown delegated click handler exists');
must(app.includes('mode-menu-open'), 'Mode dropdown overlap state exists');
must(css.includes('Mode Power + Dropdown Overlap Fix'), 'Mode overlap CSS patch exists');
// The frontend used to pin llama-3.3-70b-versatile, which Groq shut down on
// 2026-08-16. app.js now pins the official replacement, so this lock tracks
// that instead of asserting a dead model ID.
must(app.includes("const GROQ_MODEL = 'openai/gpt-oss-120b'"), 'Max/Code frontend model is the current Groq flagship');

console.log('\nSearch lock');
console.log('-----------');
must(read('src/routes/search.js').includes("app.post('/api/search'"), '/api/search exists');
must(read('src/routes/search.js').includes("app.post('/api/deep-search'"), '/api/deep-search exists');
must(read('src/routes/export.js').includes("app.post('/api/export/code-zip'"), 'Code project ZIP endpoint exists');
must(server.includes("require('./src/routes/export')") && read('src/routes/export.js').includes("app.post('/api/export/pdf'") && read('src/routes/export.js').includes("app.post('/api/export/pptx'") && read('src/services/exportService.js').includes('exportPdf') && read('src/services/exportService.js').includes('exportPptx'), 'Export route/service modules exist');
must(read('src/services/searchService.js').includes('tavilySearch'), 'Tavily search support exists');
must(read('src/services/searchService.js').includes('firecrawlScrape') && read('src/services/searchService.js').includes('enrichResultsWithFirecrawl'), 'Firecrawl enrichment exists');
must(read('src/services/searchService.js').includes("search_depth: depth === 'advanced'"), 'Tavily advanced depth enabled');
must(read('src/services/searchService.js').includes('include_raw_content'), 'Tavily raw content enabled for advanced');
must(server.includes('cdn.tailwindcss.com') && server.includes('api.moonshot.cn'), 'Q-Spark CSP support exists');
must(server.includes('memoryCaches') && server.includes('cacheGet') && server.includes('cacheSet'), 'Search/cache performance layer exists');
must(read('src/search/searchCore.js').includes('buildSearchBeastPlan') && read('src/search/searchCore.js').includes('rankSearchBeastResults') && read('src/services/searchService.js').includes('buildSearchBeastPlan'), 'Search Beast v2 ranking exists');

// Modern Smart Router v2 checks (aligned with unified RoutingEngine architecture)
must(read('src/agents/RoutingEngine.js').includes('classifyQjoRequest') && server.includes('createRoutingEngine'), 'Smart Router v2 exists in RoutingEngine');
must(server.includes('app.use(compression'), 'Compression middleware enabled');
must(app.includes('SOURCE PACK'), 'Frontend sends source pack to model');
must(app.includes('formatSearchSourcesForPrompt'), 'Search sources formatter exists');
must(app.includes('appendSourceCards'), 'Source cards renderer exists');
must(css.includes('source-cards'), 'Source cards CSS exists');
must(app.includes('Markdown citations') || app.includes('[1](URL)'), 'Search instructions require Markdown citations');
must(read('src/services/searchService.js').includes("require('../search/searchCore')") && read('src/search/searchCore.js').includes('buildSearchBeastPlan') && read('src/search/searchCore.js').includes('rankSearchBeastResults'), 'Search core module extracted from server monolith');
must(server.includes("require('./src/routes/search')") && read('src/routes/search.js').includes('registerSearchRoutes') && read('src/services/searchService.js').includes('createSearchService') && read('src/tools/searchTool.js').includes('SearchQueriesSchema'), 'Search route/service/tool modules exist');
must(read('src/routes/chat.js').includes("require('../agents/contextContinuity')") && read('src/agents/contextContinuity.js').includes('addContextContinuitySystemHint'), 'Agent continuity module exists');

// Routing engine strictly validates routing schemas and operates in server.js
must(read('src/agents/RoutingEngine.js').includes('RoutingDecisionSchema') && read('src/agents/RoutingEngine.js').includes('z.enum') && read('src/routes/chat.js').includes('routingDecision'), 'Router Agent strict schema integration exists in RoutingEngine');
must(server.includes("require('./src/routes/chat')") && read('src/routes/chat.js').includes("app.post('/api/chat'") && read('src/routes/chat.js').includes('registerChatRoutes') && read('src/routes/chat.js').includes('routingDecision'), 'Chat route module extracted from server monolith');
must(server.includes("require('./src/routes/qcode')") && server.includes("require('./src/agents/qcodeAgent')") && read('src/tools/fileEditorTool.js').includes('QcodeActionSchema'), 'Qcode route/agent/file tool modules exist');
must(server.includes("require('./src/services/qcodeWorkspace')") && read('src/services/qcodeWorkspace.js').includes('createQcodeWorkspaceService') && read('src/services/qcodeWorkspace.js').includes('safeQcodePath') && read('src/services/qcodeWorkspace.js').includes('runQcodeCommand'), 'Qcode workspace service module exists');

// AI consolidated services check
must(server.includes("require('./src/services/llmService')") && read('src/services/llmService.js').includes('createLlmService') && read('src/services/llmService.js').includes('callGroqChat') && read('src/services/llmService.js').includes('callQwenChat') && read('src/services/llmService.js').includes('callGeminiChat'), 'AI provider and model services consolidated in llmService');
must(server.includes("require('./src/agents/RoutingEngine')") && read('src/agents/RoutingEngine.js').includes('createRoutingEngine') && read('src/agents/RoutingEngine.js').includes('classifyQjoRequest') && read('src/agents/RoutingEngine.js').includes('completeIfTruncated'), 'Unified routing engine agent module exists');
must(server.includes("require('./src/services/embeddings')") && server.includes("require('./src/routes/embeddings')") && read('src/services/embeddings.js').includes('createEmbeddingsService') && read('src/routes/embeddings.js').includes('registerEmbeddingsRoutes'), 'Embeddings service/route modules exist');
must(read('src/tools/calculatorTool.js').includes('CALCULATOR_TOOL') && read('src/tools/calculatorTool.js').includes('createSafeCalculate'), 'Calculator tool module exists');
must(app.includes('isContextualTransformRequest') && app.includes('buildContextContinuityHint') && read('src/routes/chat.js').includes('addContextContinuitySystemHint'), 'Context continuity follow-up routing exists');
must(read('src/services/searchService.js').includes('rawQuery') && read('src/services/searchService.js').includes('distillSearchQueryServer(rawQuery)') && read('src/services/searchService.js').includes('rawQuestion') && read('src/services/searchService.js').includes('distillSearchQueryServer(rawQuestion)'), 'Server-side search query distillation exists');
must(app.includes('لا تفرض قالبًا ثابتًا') && app.includes('Preserve the user') && app.includes('requested output format'), 'Search does not force robotic output template');

console.log('\nMobile/UI lock');
console.log('--------------');
must(css.includes('Qjo Mobile Pro Audit Patch'), 'Mobile Pro Audit patch exists');
must(css.includes('Mobile Text Visibility Hotfix') || css.includes('-webkit-text-fill-color'), 'Mobile text visibility protection exists');
must(app.includes('installMobileViewportController'), 'Mobile viewport controller exists');
must(app.includes('safeFocusComposer'), 'safe mobile focus exists');
must(app.includes('after login/page reload start with a fresh chat'), 'Fresh chat on login behavior exists');
must(app.includes('buildRetrievedAttachmentContext') && app.includes('chunkTextForRetrieval') && app.includes('vectorizeText') && app.includes('retrieveHybridChunks') && app.includes('getServerEmbeddingsForRetrieval') && app.includes('openRagDb') && app.includes('persistAttachmentsToRagIndex') && app.includes('saveCloudRagRecord') && app.includes('getCloudRagRecordsForChat'), 'Cloud Persistent Real Embeddings RAG v1 exists');
must(app.includes('ocrDataUrl') && html.includes('tesseract.js'), 'OCR support exists');
must(app.includes('renderMemoryList') && html.includes('memoryList'), 'Memory controls exist');
must(exists('docs/QJO_FIRESTORE_RULES_WITH_RAG.md') && read('docs/QJO_FIRESTORE_RULES_WITH_RAG.md').includes('ragIndexes') && read('docs/QJO_FIRESTORE_RULES_WITH_RAG.md').includes('firebase.storage'), 'Cloud RAG/Storage rules documented');
must(html.includes('data-qjo-app="assistant"') && html.includes('Q-Spark') && html.includes('Qcode'), 'Sidebar app switcher exists');
must(exists('public/qcode.html') && read('public/qcode.html').includes('QCODE_EMBED_VERSION') && read('public/qcode.html').includes('QJO_APP_BACK_BUTTON_POSITION_FIX'), 'Qcode staged app exists');
must((html.includes('id="qsparkNavBtn"') && html.includes('href="/qspark.html"')) && (html.includes('id="qcodeNavBtn"') && html.includes('href="/qcode.html"')), 'Sidebar app buttons have direct navigation');
must(read('src/routes/qcode.js').includes("app.post('/api/qcode/chat'") && read('src/routes/qcode.js').includes("app.get('/api/qcode/files'") && server.includes('QCODE_QWEN_API_KEYS'), 'Qcode backend namespace exists');
must(exists('docs/QCODE_PROJECT_KNOWLEDGE.md') && server.includes('QCODE_PROJECT_KNOWLEDGE_CONTEXT'), 'Qcode project knowledge exists');
must(read('src/services/qcodeWorkspace.js').includes('runQcodeAction') && read('src/services/qcodeWorkspace.js').includes('writeQcodeFileSafe') && read('src/services/qcodeWorkspace.js').includes('editQcodeFileSafe') && read('src/services/qcodeWorkspace.js').includes('searchQcodeFiles') && read('src/routes/qcode.js').includes("app.post('/api/qcode/run'") && read('src/services/qcodeWorkspace.js').includes('rollbackQcodeSnapshot') && read('src/routes/qcode.js').includes("app.post('/api/qcode/diff'") && (read('src/agents/qcodeAgent.js').includes('multi-step agent loop') || read('src/agents/qcodeAgent.js').includes('agent_step') || read('src/agents/qcodeAgent.js').includes('OBSERVE results') || read('src/agents/qcodeAgent.js').includes('maxSteps')) && server.includes('qcodeUsage'), 'Qcode max agent tools/run/diff/rollback/usage exists');
must(read('src/routes/qcode.js').includes("app.get('/api/qcode/preview/file'") && read('src/services/qcodeWorkspace.js').includes('qcodeSessionPath'), 'Qcode preview/sessions exist');
must(exists('public/qspark.html') && html.includes('qsparkNavBtn') && read('public/qspark.html').includes('QJO_APP_BACK_BUTTON_POSITION_FIX'), 'Q-Spark page exists and sidebar links to it');
must(read('src/routes/qspark.js').includes("app.get('/api/qspark/health'") && read('src/routes/qspark.js').includes("app.post('/api/qspark/chat'"), 'Q-Spark separate key endpoints exist');
must(server.includes('QSPARK_GROQ_API_KEYS') && server.includes('QSPARK_NVIDIA_API_KEYS'), 'Q-Spark separate key namespace exists');
must(server.includes("require('./src/routes/qspark')") && read('src/routes/qspark.js').includes('registerQSparkRoutes'), 'Q-Spark route exists');
must(exists('docs/QSPARK_SYSTEM_KNOWLEDGE.md') && promptMatch && promptMatch[1].includes('<qspark_context>'), 'Q-Spark system knowledge exists');
must(read('.env.example').includes('QSPARK_GROQ_API_KEYS') && read('docs/QJO_PROJECT_LOCKS.md').includes('Q-Spark separate keys lock'), 'Q-Spark separate keys documented');
must(read('public/qspark.html').includes('QSPARK_DARK_POLISH'), 'Q-Spark dark polish exists');
must(read('public/qspark.html').includes('initCloud') && read('public/qspark.html').includes('qsparkNotebooks') && read('public/qspark.html').includes('notebooks-modal'), 'Q-Spark SaaS notebook cloud functions exist');
must(read('public/qspark.html').includes('firebase-storage-compat') && read('public/qspark.html').includes('uploadSourceFileToCloud'), 'Q-Spark source storage v2 exists');
must(read('public/qspark.html').includes('generateAudioOverview') && read('public/qspark.html').includes('speechSynthesis') && read('public/qspark.html').includes('t-audio'), 'Q-Spark Audio Overview Arabic exists');
must(read('public/qspark.html').includes('citationPanelHtml') && read('public/qspark.html').includes('STRICT CITATION RULES') && read('public/qspark.html').includes('[S1:C1]'), 'Q-Spark exact citations exist');
must(read('public/qspark.html').includes('citation-modal') && read('public/qspark.html').includes('openCitationEvidence') && read('public/qspark.html').includes('lastCitationMap'), 'Q-Spark evidence sidebar exists');
must(read('public/qspark.html').includes('studyProgressHtml') && read('public/qspark.html').includes('recordQuizAnswer') && read('public/qspark.html').includes('recordFlashcard'), 'Q-Spark study progress exists');
must(read('public/qspark.html').includes('spacedInterval') && read('public/qspark.html').includes('weaknessList') && read('public/qspark.html').includes('dueFlashcardsCount'), 'Q-Spark spaced repetition exists');
must(read('public/qspark.html').includes('[PAGE ${i}]') && read('public/qspark.html').includes('pageForChar'), 'Q-Spark PDF page citation markers exist');
must(read('public/qspark.html').includes('/api/qspark/chat') && read('public/qspark.html').includes('QSPARK_BACKEND_ROUTING'), 'Q-Spark frontend uses backend routing');
must(css.includes('Qjo Sidebar Left + App Switcher') && css.includes('translateX(-112%)'), 'Sidebar left lock CSS exists');
must(app.includes('renameChat') && html.includes('chatSearchInput') && html.includes('exportChatBtn'), 'Chat management controls exist');
const braceDiff = (css.match(/{/g) || []).length - (css.match(/}/g) || []).length;
must(braceDiff === 0, `CSS brace balance is OK (${braceDiff})`);

console.log('\nLocal context lock');
console.log('------------------');
must(read('src/routes/system.js').includes("app.get('/api/limits'"), '/api/limits exists');
must(read('src/routes/system.js').includes("app.get('/api/client-context'"), '/api/client-context exists');
must(app.includes('loadClientContext'), 'loadClientContext exists');
must(app.includes('getLocalDateTimeReply'), 'getLocalDateTimeReply exists');
must(app.includes('Browser time zone') || app.includes('timeZone'), 'Browser timezone context exists');

console.log('\nSummary');
console.log('-------');
if (failures) {
  console.error(`❌ Audit failed with ${failures} failure(s) and ${warnings} warning(s).`);
  process.exit(1);
}
console.log(`\n🎉 PERFECT AUDIT! Passed with ${warnings} warning(s).`);

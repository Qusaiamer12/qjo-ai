const { CALCULATOR_TOOL } = require('../tools/calculatorTool');
const { WEB_SEARCH_TOOL } = require('../tools/searchTool');
const { z } = require('zod');

// ── Zod Schema ──
const RoutingDecisionSchema = z.object({
  targetAgent: z.enum(['qcode', 'qspark', 'general']),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(1).max(180)
});

// ── Text Utilities ──
function textFromMessageContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text || '';
        return '';
      })
      .join('\n');
  }
  return '';
}

function combinedUserText(messages) {
  return (messages || [])
    .filter(m => m && m.role === 'user')
    .slice(-4)
    .map(m => textFromMessageContent(m.content))
    .join('\n\n')
    .slice(-90000);
}

function combinedRecentUserText(messages) {
  return (messages || [])
    .filter(m => m && m.role === 'user')
    .slice(-3)
    .map(m => textFromMessageContent(m.content))
    .join('\n\n')
    .slice(-12000);
}

function lastUserText(messagesOrText) {
  if (typeof messagesOrText === 'string') return messagesOrText;
  const last = [...(messagesOrText || [])].reverse().find(m => m?.role === 'user');
  return textFromMessageContent(last?.content || '');
}

function containsImageContent(messages) {
  return (messages || []).some(m => Array.isArray(m.content) && m.content.some(part => part?.type === 'image_url'));
}

function isTruncatedProviderResponse(ai) {
  if (!ai || !ai.ok) return false;
  const finish = String(ai.finish_reason || ai.finishReason || '').toLowerCase();
  return finish === 'length' || finish === 'max_tokens' || finish === 'max_output_tokens';
}

// ── Routing Decision Validation ──
function validateRoutingDecision(raw) {
  const parsed = RoutingDecisionSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    targetAgent: 'general',
    confidence: 0,
    reason: 'Invalid routing shape fallback'
  };
}

// ── Smart Intent Classifier ──
function classifyQjoRequest({ messages, mode, routingDecision }) {
  const text = combinedUserText(messages);
  const systemText = String(messages?.[0]?.content || '').toLowerCase();
  const hasSearchContext = /source pack|connected search|connected deep search|web search note|search query used|url:\s*https?:\/\//i.test(text);
  const hasFileContext = /user attached files|pdf pages processed|ocr text extracted|extracted characters|extraction method|uploaded file|المرفقات/i.test(text);
  const codeIntent = mode === 'code' || /(```|\bfunction\b|\bconst\b|\bclass\b|debug|bug|stack trace|api|react|node|typescript|javascript|python|firebase|render|كود|برمج|موقع|تطبيق)/i.test(text);
  const mathIntent = /(احسب|حساب|نسبة|معادلة|جذر|تكامل|تفاضل|matrix|probability|statistics|\d+\s*[+\-*/^%]\s*\d+)/i.test(text);
  const longContext = text.length > 18000;
  const researchIntent = hasSearchContext || /(بحث|مصادر|دراسة|تقرير|قارن|مقارنة|تحليل سوق|research|sources|compare|report|market analysis|literature)/i.test(text);
  const puzzleReasoningIntent = /(لغز|صناديق|ملصقات خاطئة|تفاح|برتقال|فاكهة واحدة|منطق|استنتاج|logic puzzle|riddle|boxes|labels|apples|oranges)/i.test(text);
  const advancedIntent = mode === 'advanced';

  let intent = 'general';
  if (hasSearchContext) intent = 'search';
  else if (hasFileContext || longContext) intent = 'file';
  else if (codeIntent) intent = 'code';
  else if (mathIntent) intent = 'math';
  else if (researchIntent) intent = 'research';
  else if (advancedIntent || puzzleReasoningIntent) intent = 'reasoning';

  const routed = validateRoutingDecision(routingDecision || { targetAgent: 'general', confidence: 0, reason: 'No router metadata' });
  if (routed.targetAgent === 'qcode' && routed.confidence >= 80) intent = 'code';
  if (routed.targetAgent === 'qspark' && routed.confidence >= 80 && !hasSearchContext && !hasFileContext) intent = 'research';

  return { intent, hasSearchContext, hasFileContext, codeIntent, mathIntent, longContext, advancedIntent, systemText, routingDecision: routed };
}

// ── Lite Request Detector ──
function isLiteRequest(messages) {
  const userMessages = (messages || []).filter(m => m.role === 'user');
  if (userMessages.length !== 1) return false;
  
  const text = textFromMessageContent(userMessages[0].content).trim();
  const wordCount = text.split(/\s+/).length;
  
  if (wordCount > 12) return false;
  if (containsImageContent(messages)) return false;
  if (/(```|{|}|function|class|calculate|احسب|search|بحث|https?:\/\/)/i.test(text)) return false;
  
  return true;
}

// ── Unified Routing Engine ──
function createRoutingEngine(deps) {
  const { llmService, safeCalculate, models, keys } = deps;
  let searchService = deps.searchService;
  if (!llmService || !models || !keys) throw new Error('createRoutingEngine missing core deps: llmService, models, or keys');

  function formatSearchResultsForTool(payload) {
    const results = (payload?.results || []).slice(0, 6);
    if (!results.length) return `No web results found for "${payload?.query || ''}".`;
    return results.map(r => `[${r.id}] ${r.title || 'untitled'} (${r.url})\n${String(r.content || '').slice(0, 500)}`).join('\n\n');
  }

  async function executeToolCalls(toolCalls, originalQuestion) {
    const toolMessages = [];
    const used = [];
    for (const call of (toolCalls || []).slice(0, 4)) {
      const name = call?.function?.name;
      let output;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        if (name === 'calculate' && safeCalculate) {
          output = safeCalculate(args.expression);
          used.push({ tool: 'calculate', input: args.expression });
        } else if (name === 'web_search' && searchService) {
          const payload = await searchService.performSearch({ rawQuery: args.query, originalQuestion });
          output = formatSearchResultsForTool(payload);
          used.push({ tool: 'web_search', input: payload.query || args.query, resultCount: (payload.results || []).length });
        } else {
          output = `Tool "${name}" is not available.`;
        }
      } catch (error) {
        output = `Tool error: ${error.message}`;
      }
      toolMessages.push({ role: 'tool', tool_call_id: call.id, content: String(output || '').slice(0, 6000) });
    }
    return { toolMessages, used };
  }

  function buildTools(useTools, skipWebSearch) {
    if (!useTools) return undefined;
    const tools = [];
    if (safeCalculate) tools.push(CALCULATOR_TOOL);
    if (searchService && !skipWebSearch) tools.push(WEB_SEARCH_TOOL);
    return tools.length ? tools : undefined;
  }

  async function callWithTools(callFn, params, originalQuestion) {
    const first = await callFn(params);
    if (!first.ok) return first;
    const toolCalls = first.toolCalls || [];
    if (!toolCalls.length) return first;
    const { toolMessages, used } = await executeToolCalls(toolCalls, originalQuestion);
    if (!toolMessages.length) return first;
    const second = await callFn({ ...params, messages: [...params.messages, first.message, ...toolMessages], tools: undefined });
    return second.ok ? { ...second, toolsUsed: used } : first;
  }

  // Unified router for Chat, Qcode, and Qspark modes
  async function callAgent({ agentType = 'chat', mode, messages, temperature = 0.7, max_tokens = 4000, useTools, routingDecision, qsparkProvider }) {
    
    // --- 1. Lite Prompt Fast Track ---
    if (agentType === 'chat' && isLiteRequest(messages)) {
      const liteMessages = [{ role: 'system', content: 'You are Qjo, a helpful AI. Reply briefly and warmly.' }, ...messages.filter(m => m.role !== 'system')];
      if (keys.gemini > 0) {
        const g = await llmService.callGeminiChat({ model: 'gemini-1.5-flash', messages: liteMessages, temperature, max_tokens });
        if (g.ok) return g;
      }
      if (keys.groq > 0) {
        const g = await llmService.callGroqChat({ model: models.groqFlash || 'llama-3.3-70b-versatile', messages: liteMessages, temperature, max_tokens });
        if (g.ok) return g;
      }
      if (keys.qwen > 0) {
        const q = await llmService.callQwenChat({ model: models.qwenFlash || 'qwen-plus', messages: liteMessages, temperature, max_tokens });
        if (q.ok) return q;
      }
      // If all lite providers fail, fall through to full routing below
    }

    // --- 2. Qcode Mode Routing ---
    if (agentType === 'qcode') {
      const order = ['groq', 'qwen', 'nvidia', 'kimi'];
      for (const p of order) {
        if (!keys[p] || keys[p] === 0) continue;
        const result = await (p === 'groq' ? llmService.callGroqChat : p === 'qwen' ? llmService.callQwenChat : p === 'nvidia' ? llmService.callNvidiaChat : llmService.callKimiChat)({
          model: models[`${p}Code`] || models[`${p}Text`], messages, temperature: temperature || 0.14, max_tokens: max_tokens || 4200
        });
        if (result.ok) return result;
      }
      return { ok: false, status: 503, error: 'No Qcode provider is working.' };
    }

    // --- 3. Qspark Mode Routing ---
    if (agentType === 'qspark') {
      const requested = String(qsparkProvider || 'nvidia').toLowerCase();
      const order = requested === 'auto' ? ['nvidia', 'kimi', 'qwen', 'groq'] : [requested];
      for (const p of order) {
        if (!keys[p] || keys[p] === 0) continue;
        const result = await (p === 'groq' ? llmService.callGroqChat : p === 'qwen' ? llmService.callQwenChat : p === 'nvidia' ? llmService.callNvidiaChat : llmService.callKimiChat)({
          model: models[`${p}Text`], messages, temperature: temperature || 0.15, max_tokens: max_tokens || 3000
        });
        if (result.ok) return result;
      }
      return { ok: false, status: 503, error: 'No Q-Spark provider is working.' };
    }

    // --- 4. Chat/General Smart Routing ---
    const originalQuestion = combinedUserText(messages);
    const hasImages = containsImageContent(messages);
    const route = classifyQjoRequest({ messages, mode, routingDecision });
    const tools = buildTools(useTools && !hasImages, route.hasSearchContext);

    // Gemini First Priority (Best General & Free Tier)
    if (keys.gemini > 0) {
      const geminiModel = (route.intent === 'reasoning' || route.mathIntent) ? (models.geminiPro || 'gemini-2.5-pro') : (models.geminiText || 'gemini-1.5-flash');
      const gemini = await llmService.callGeminiChat({ model: geminiModel, messages, temperature, max_tokens });
      if (gemini.ok) return gemini;
    }

    // Fallbacks based on intent
    if (keys.qwen > 0 && (mode === 'code' || route.intent === 'reasoning')) {
      const qwen = await callWithTools(llmService.callQwenChat, { model: models.qwenCode, messages, temperature, max_tokens, tools }, originalQuestion);
      if (qwen.ok) return qwen;
    }

    if (keys.groq > 0) {
      const groq = await llmService.callGroqChat({ model: models.groqText, messages, temperature, max_tokens, tools });
      if (groq.ok) {
        if (groq.toolCalls?.length) {
          const { toolMessages, used } = await executeToolCalls(groq.toolCalls, originalQuestion);
          const second = await llmService.callGroqChat({ model: models.groqText, messages: [...messages, groq.message, ...toolMessages], temperature, max_tokens });
          if (second.ok) return { ...second, toolsUsed: used };
        } else {
          return groq;
        }
      }
    }

    if (keys.openRouter > 0) {
      const or = await llmService.callOpenRouterFreeChat({ messages, temperature, max_tokens });
      if (or.ok) return or;
    }

    return { ok: false, status: 503, error: 'All configured AI providers failed.' };
  }

  async function completeIfTruncated(params) {
    const { ai, messages, temperature, max_tokens } = params;
    if (!isTruncatedProviderResponse(ai)) return ai;
    let combined = ai.answer || '';
    let workingMessages = [
      ...messages,
      { role: 'assistant', content: combined },
      { role: 'user', content: 'تابع من حيث توقفت بالضبط. لا تعِد البداية، ولا تضف مقدمة جديدة. أكمل الجملة أو الفقرة الناقصة فقط ثم أكمل باقي الإجابة.' }
    ];
    for (let i = 0; i < 2; i++) {
      const next = await callAgent({ ...params, messages: workingMessages, temperature: Math.min(temperature, 0.3), max_tokens: Math.min(max_tokens, 1800) });
      if (!next.ok || !next.answer) break;
      combined += (combined.endsWith('\n') ? '' : '\n') + next.answer;
      if (!isTruncatedProviderResponse(next)) return { ...next, answer: combined, continued: true };
      workingMessages = [...workingMessages, { role: 'assistant', content: next.answer }, { role: 'user', content: 'تابع مرة أخيرة من حيث توقفت بدون إعادة.' }];
    }
    return { ...ai, answer: combined, continued: true, finish_reason: 'continued_but_may_be_truncated' };
  }

  // Allow dynamic attachment of searchService after initialization
  const engine = { callAgent, completeIfTruncated, classifyQjoRequest, isLiteRequest };
  Object.defineProperty(engine, 'searchService', {
    set(svc) { searchService = svc; },
    get() { return searchService; }
  });
  return engine;
}

// ── Deterministic Router (used by client-side routing) ──
function routeUserRequestDeterministic(messagesOrText) {
  const latest = lastUserText(messagesOrText);
  const recent = typeof messagesOrText === 'string' ? latest : combinedRecentUserText(messagesOrText);
  const q = String(`${recent}\n${latest}` || '').toLowerCase();

  const explicitQcode = /(qcode|q-code|code lab|كيو\s*كود|كيوكود)/i.test(q);
  const codingIntent = /(كود|برمج|برمجة|موقع|تطبيق|api|sdk|debug|bug|stack trace|error|exception|react|next\.js|vue|node|express|fastapi|python|javascript|typescript|firebase|render|deploy|github|git|terminal|npm|package\.json|docker|sql|database|backend|frontend|full[- ]?stack|هندسة\s+برمجيات|تصحيح\s+خطأ|اكتب\s+دالة|اكتب\s+كلاس|اكتب\s+برنامج)/i.test(q);
  const fileEditIntent = /(اقرأ\s+ملف|اكتب\s+ملف|عدّل\s+ملف|عدل\s+ملف|حرر\s+ملف|read_file|write_file|edit_file|run\s+tests|شغل\s+اختبار|نفذ\s+أمر)/i.test(q);

  if (explicitQcode || fileEditIntent || codingIntent) {
    return validateRoutingDecision({
      targetAgent: 'qcode',
      confidence: explicitQcode || fileEditIntent ? 96 : 90,
      reason: explicitQcode ? 'Explicit Qcode/code-lab request' : (fileEditIntent ? 'File/tool coding action requested' : 'Coding/software engineering intent detected')
    });
  }

  const explicitQSpark = /(q-spark|qspark|notebooklm|notebook|كيو\s*سبارك|كيوسبارك)/i.test(q);
  const studyResearchIntent = /(pdf|مصادر|مصدر|دراسة|بحث|أبحاث|ابحاث|ورقة|paper|journal|doi|arxiv|pubmed|تلخيص\s+مستند|لخص\s+المستند|مراجعة|اختبار|quiz|flashcard|flashcards|بطاقات|تكرار\s+متباعد|spaced\s+repetition|خريطة\s+مفاهيم|concept\s+map|دفتر|محاضرة|lecture|منهج|ملزمة|source-grounded|citations|اقتباسات)/i.test(q);
  const sourceNotebookAction = /(ارفع|حلل|استخرج|قارن\s+بين\s+المصادر|اسأل\s+عن\s+المصادر|اعمل\s+لي\s+كويز|اعمل\s+بطاقات|audio\s+overview|نظرة\s+صوتية)/i.test(q);

  if (explicitQSpark || sourceNotebookAction || studyResearchIntent) {
    return validateRoutingDecision({
      targetAgent: 'qspark',
      confidence: explicitQSpark || sourceNotebookAction ? 95 : 86,
      reason: explicitQSpark ? 'Explicit Q-Spark/notebook request' : (sourceNotebookAction ? 'Source/notebook study action requested' : 'Study/research/source-grounded intent detected')
    });
  }

  const currentSearchGeneral = /(اليوم|الآن|حالي|آخر|اخر|سعر|نتيجة|مباراة|طقس|خبر|أخبار|exchange|latest|current|today|price|score|weather|news)/i.test(q);
  if (currentSearchGeneral) {
    return validateRoutingDecision({
      targetAgent: 'general',
      confidence: 78,
      reason: 'General assistant request requiring current/search awareness'
    });
  }

  return validateRoutingDecision({
    targetAgent: 'general',
    confidence: 74,
    reason: 'General assistant request'
  });
}

// ── Router System Hints ──
function buildRouterSystemHint(decision) {
  const d = validateRoutingDecision(decision);
  if (d.targetAgent === 'qcode') {
    return `Router decision: qcode (${d.confidence}%). Reason: ${d.reason}. Treat this as a coding/software engineering request. Prefer precise engineering structure, code-aware reasoning, debugging discipline, and safe implementation guidance. Do not use Q-Spark-only study behavior unless the user explicitly asks for notebook/source study.`;
  }
  if (d.targetAgent === 'qspark') {
    return `Router decision: qspark (${d.confidence}%). Reason: ${d.reason}. Treat this as a study/research/source-grounded request. Prefer source-aware learning, citations when sources exist, summaries, quizzes, flashcards, weakness mapping, and notebook-style organization. Do not use Qcode file-editing behavior unless the user explicitly asks for code/project actions.`;
  }
  return `Router decision: general (${d.confidence}%). Reason: ${d.reason}. Treat this as a normal Qjo Assistant request unless later messages clearly require Qcode or Q-Spark behavior.`;
}

function addRouterSystemHint(messages, decision) {
  const hint = buildRouterSystemHint(decision);
  if (messages?.[0]?.role === 'system') return [messages[0], { role: 'system', content: hint }, ...messages.slice(1)];
  return [{ role: 'system', content: hint }, ...(messages || [])];
}

module.exports = {
  createRoutingEngine,
  RoutingDecisionSchema,
  validateRoutingDecision,
  routeUserRequestDeterministic,
  buildRouterSystemHint,
  addRouterSystemHint
};

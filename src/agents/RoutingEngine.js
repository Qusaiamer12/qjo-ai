const { CALCULATOR_TOOL } = require('../tools/calculatorTool');
const { WEB_SEARCH_TOOL } = require('../tools/searchTool');
const { z } = require('zod');

// ── Zod Schema ──
const RoutingDecisionSchema = z.object({
  // These labels classify the USER'S INTENT to shape the chat's tone and
  // pipeline (engineering vs study vs general). They are intentionally kept
  // after Qcode/Q-Spark were split into their own repos — dropping them would
  // degrade chat quality for coding and study questions.
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

// Arabic-heavy detection: used to prefer providers with stronger Arabic
// (Qwen/Kimi) on long-form quality pipelines.
function isArabicHeavyText(text) {
  const t = String(text || '').slice(-4000);
  if (!t.trim()) return false;
  const arabicChars = (t.match(/[؀-ۿ]/g) || []).length;
  return arabicChars > 60 && arabicChars > t.length * 0.05;
}

// Does this message plausibly need fresh/current info? Decides whether the
// web_search tool schema is worth attaching (the model itself then decides).
// Wide net: comparisons, trophies/scores, prices, device/product names,
// versions and recent years — these are exactly the questions that used to
// get confident-but-stale memory answers (e.g. trophy counts from 2023).
function mightNeedFreshness(text) {
  return /(اليوم|الآن|هلأ|هلق|حالياً|حالي|آخر|اخر|أحدث|احدث|سعر|أسعار|اسعار|بكم|قديش|تكلفة|كم مرة|كم بطولة|نتيجة|نتائج|مباراة|مباريات|بطول|دوري|ابطال|البطا|كأس|كاس|فاز|فائز|توج|ترتيب|طقس|خبر|أخبار|اخبار|صار|صارت|موعد| متى |قارن|قارني|مقارن|مواصفات|عيوب|مميزات|إصدار|اصدار|نسخة|موديل|طراز|ايفون|آيفون|سامسونج|سامسنوج|شاومي|جوال|موبايل|هاتف|لابتوب| latest|current|today|price|cost|score|standings|champion|league|cup|news|weather|happened|release|specs|compare|comparison|\bvs\b|iphone|samsung|galaxy|pixel|20(2[4-9]|3\d))/i.test(String(text || ''));
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

// ── Smart Intent Classifier (4-Pillar AI Intelligence Aware) ──
function classifyQjoRequest({ messages, mode, routingDecision }) {
  const text = combinedUserText(messages);
  const systemText = String(messages?.[0]?.content || '').toLowerCase();
  const hasSearchContext = /source pack|connected search|connected deep search|web search note|search query used|url:\s*https?:\/\//i.test(text);
  const hasFileContext = /user attached files|pdf pages processed|ocr text extracted|extracted characters|extraction method|uploaded file|المرفقات/i.test(text);
  const codeIntent = mode === 'code' || /(```|\bfunction\b|\bconst\b|\bclass\b|debug|bug|stack trace|terminal|error|exception|syntax|npm|react|node|typescript|javascript|python|firebase|render|كود|برمج|برمجة|موقع|تطبيق|حل الخطأ|إصلاح|دالة)/i.test(text);
  const mathIntent = /(احسب|حساب|نسبة|معادلة|جذر|تكامل|تفاضل|matrix|probability|statistics|\d+\s*[+\-*/^%]\s*\d+)/i.test(text);
  const tableIntent = /(جدول|جدولة|نظم في جدول|رتب في جدول|اعرض في جدول|markdown table|table format)/i.test(text);
  const humanizeIntent = /(كاشف|كواشف|ai detector|humanize|كتابة بشرية|بدون كليشيه|burstiness|perplexity|أسلوب بشري)/i.test(text);
  const socialIntent = /(فضفض|تعبان|مضايق|حزين|زعلان|استعطاف|اعتذار|قصف جبهة|رد عليه|شو قصده|شو قصدها|نية|بين السطور|عذر|اعذار|تصريفة|شريكي|شريكتي|محادثة بيننا)/i.test(text);
  const creativeIntent = /(سكربت|سيناريو|ريلز|تيك توك|reels|tiktok|shorts|cover letter|رسالة عمل|سيرة ذاتية|ابتكر اسم|اسم تطبيق|اسم شركة|اسم علامة|تسمية|naming|وصفة طبخ|طبخة|طبخ)/i.test(text);
  const longContext = text.length > 18000;
  const researchIntent = hasSearchContext || /(بحث|مصادر|دراسة|تقرير|قارن|مقارنة|تحليل سوق|research|sources|compare|report|market analysis|literature)/i.test(text);
  const puzzleReasoningIntent = /(لغز|صناديق|ملصقات خاطئة|تفاح|برتقال|فاكهة واحدة|منطق|استنتاج|logic puzzle|riddle|boxes|labels|apples|oranges)/i.test(text);
  const advancedIntent = mode === 'advanced' || mode === 'max';

  let intent = 'general';
  if (hasSearchContext) intent = 'search';
  else if (hasFileContext || longContext) intent = 'file';
  else if (codeIntent) intent = 'code';
  else if (mathIntent) intent = 'math';
  else if (tableIntent) intent = 'table';
  else if (humanizeIntent) intent = 'humanize';
  else if (socialIntent) intent = 'social';
  else if (creativeIntent) intent = 'creative';
  else if (researchIntent) intent = 'research';
  else if (advancedIntent || puzzleReasoningIntent) intent = 'reasoning';

  const routed = validateRoutingDecision(routingDecision || { targetAgent: 'general', confidence: 0, reason: 'No router metadata' });
  if (routed.targetAgent === 'qcode' && routed.confidence >= 80) intent = 'code';
  if (routed.targetAgent === 'qspark' && routed.confidence >= 80 && !hasSearchContext && !hasFileContext) intent = 'research';

  return { intent, hasSearchContext, hasFileContext, codeIntent, mathIntent, tableIntent, creativeIntent, socialIntent, humanizeIntent, longContext, advancedIntent, systemText, routingDecision: routed };
}

// ── Adaptive Temperature Engine (Optimized for Accuracy & Street-Smart EQ) ──
function getAdaptiveTemperature({ intent, mode, requestedTemp }) {
  if (typeof requestedTemp === 'number' && Number.isFinite(requestedTemp)) {
    return requestedTemp;
  }
  if (mode === 'code' || intent === 'code') return 0.1;
  if (intent === 'math') return 0.1;
  if (intent === 'table') return 0.05;
  if (intent === 'humanize') return 0.85;
  if (intent === 'social') return 0.8;
  if (intent === 'creative') return 0.65;
  if (mode === 'max' || intent === 'reasoning') return 0.4;
  return 0.7;
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

// ── Pipeline definitions ──
// Order = quality × fit for the pipeline's job. Providers without keys (or
// without a model configured for the requested slot) are skipped at runtime.
const PIPELINES = {
  // Lite track: fast/free models (Groq primary, LLM7 fallback).
  lite: [['groq', 'flash'], ['llm7', 'flash'], ['qwen', 'flash'], ['kimi', 'flash']],
  // Flash mode: high velocity (Groq primary, LLM7 fallback).
  flash: [['groq', 'flash'], ['llm7', 'flash'], ['qwen', 'flash'], ['kimi', 'flash']],
  // Max mode (Arabic-heavy): Groq text primary, LLM7 fallback.
  maxAr: [['groq', 'text'], ['llm7', 'text'], ['qwen', 'text'], ['kimi', 'text']],
  // Max mode (English / mixed): Groq text primary, LLM7 fallback.
  maxEn: [['groq', 'text'], ['llm7', 'text'], ['qwen', 'text'], ['kimi', 'text']],
  // Code mode: Groq text/code primary, LLM7 fallback.
  code: [['groq', 'text'], ['llm7', 'text'], ['kimi', 'code'], ['qwen', 'code']],
  // Vision requests: vision-capable slots (Groq & Qwen vision).
  vision: [['groq', 'vision'], ['qwen', 'vision']]
};

function normalizeMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'code') return 'code';
  if (m === 'advanced' || m === 'max') return 'max';
  return 'flash'; // 'normal' / 'flash' / ''
}

// ── Unified Routing Engine ──
function createRoutingEngine(deps) {
  const { llmService, safeCalculate, models, keys } = deps;
  let searchService = deps.searchService;
  if (!llmService || !models || !keys) throw new Error('createRoutingEngine missing core deps: llmService, models, or keys');

  function formatSearchResultsForTool(payload) {
    const results = (payload?.results || []).slice(0, 6);
    if (!results.length) return `No web results found for "${payload?.query || ''}".`;
    return results.map(r => `[${r.id}] ${r.title || 'untitled'} (${r.url})\n${String(r.content || '').slice(0, 900)}`).join('\n\n');
  }

  async function executeToolCalls(toolCalls, originalQuestion, onToolCall) {
    const toolMessages = [];
    const used = [];
    for (const call of (toolCalls || []).slice(0, 4)) {
      const name = call?.function?.name;
      let output;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        if (name === 'calculate' && safeCalculate) {
          if (onToolCall) onToolCall({ tool: 'calculate', label: 'Used calculator', detail: args.expression, status: 'running' });
          output = safeCalculate(args.expression);
          used.push({ tool: 'calculate', input: args.expression });
          if (onToolCall) onToolCall({ tool: 'calculate', label: 'Used calculator', detail: `${args.expression} = ${output}`, status: 'done' });
        } else if (name === 'web_search' && searchService) {
          if (onToolCall) onToolCall({ tool: 'web_search', label: 'Searching the web', detail: args.query, status: 'running' });
          const payload = await searchService.performSearch({ rawQuery: args.query, originalQuestion });
          output = formatSearchResultsForTool(payload);
          used.push({ tool: 'web_search', input: payload.query || args.query, resultCount: (payload.results || []).length });
          if (onToolCall) onToolCall({ tool: 'web_search', label: 'Searched the web', detail: args.query, count: (payload.results || []).length, status: 'done' });
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

  // ── Provider plumbing ──
  const hasKeys = (provider) => (keys[provider] || 0) > 0;

  function slotModel(provider, slot) {
    if (slot === 'vision') {
      // Vision must never silently fall back to a text-only model — that is
      // exactly what used to kill every image request.
      return models[`${provider}Vision`] || null;
    }
    const cap = slot[0].toUpperCase() + slot.slice(1);
    return models[`${provider}${cap}`] || models[`${provider}Text`] || models[`${provider}Flash`] || null;
  }

  function attempts(chain) {
    return chain.filter(([provider, slot]) => {
      if (!hasKeys(provider)) return false;
      return Boolean(slotModel(provider, slot));
    });
  }

  async function tryProvider(provider, slot, params) {
    const model = slotModel(provider, slot);
    if (!model) return { ok: false, status: 501, error: `No ${slot} model for ${provider}.` };
    return llmService.dispatch(provider, { model, ...params });
  }

  // Runs a chain of [provider, slot] attempts with a shared deadline. A
  // provider failure (including timeout) simply advances the chain.
  async function runChain(chain, params, { withTools = false, originalQuestion = '' } = {}) {
    const list = attempts(chain);
    if (!list.length) return { ok: false, status: 501, error: 'No provider configured.' };
    let last = null;
    const failures = [];
    for (const [provider, slot] of list) {
      if (params.deadlineMs) {
        const remaining = params.deadlineMs - Date.now();
        if (remaining < 2500) break;
        params.timeoutMs = Math.min(params.maxPerProviderMs || 12000, remaining - 1000);
      }
      const res = await tryProvider(provider, slot, params);
      if (!res.ok) { last = res; failures.push({ provider, status: res.status }); continue; }

      // Non-streaming providers: deliver the whole answer
      // as one instant chunk so SSE clients never stare at an empty bubble.
      if (res.ok && params.onChunk && res.answer && !res.streamed) params.onChunk(res.answer);

      const toolCalls = res.toolCalls || [];
      if (!withTools || !toolCalls.length) return res;

      // First pass asked for tools: execute, then continue on the SAME provider.
      const { toolMessages, used } = await executeToolCalls(toolCalls, originalQuestion, params.onToolCall);
      if (!toolMessages.length) return res;
      if (params.deadlineMs && params.deadlineMs - Date.now() < 2500) return res;
      const second = await tryProvider(provider, slot, {
        ...params,
        messages: [...params.messages, res.message, ...toolMessages],
        tools: undefined
      });
      if (second.ok) return { ...second, toolsUsed: used };
      return res; // better a tool-less first answer than a failed second call
    }
    // Aggregate diagnostics: if every attempt was throttled, say so clearly —
    // a generic opaque error used to hide the (very common) free-tier
    // rate-limit wall behind "service unavailable".
    const allLimited = failures.length > 0 && failures.every(f => f.status === 429 || f.status === 402);
    const status = allLimited ? 429 : (last?.status || 503);
    const detail = failures.map(f => `${f.provider}:${f.status || 'net'}`).join(', ');
    const error = allLimited
      ? `All AI providers rate-limited (429). Retry in ~1 minute. [${detail}]`
      : `All AI providers failed. Last: ${String(last?.error || 'unknown').slice(0, 160)} [${detail}]`;
    return last ? { ...last, status, error } : { ok: false, status: 503, error };
  }

  // Locates which provider/slot an explicit client-chosen model maps to.
  function locateExplicitModel(modelName) {
    const target = String(modelName || '').trim();
    if (!target) return null;
    for (const provider of ['groq', 'llm7', 'qwen', 'kimi']) {
      if (!hasKeys(provider)) continue;
      for (const slot of ['flash', 'text', 'code', 'vision']) {
        const cap = slot[0].toUpperCase() + slot.slice(1);
        if (models[`${provider}${cap}`] === target) return [provider, slot];
      }
    }
    return null;
  }

  function buildTools({ attach }) {
    if (!attach.length) return undefined;
    const tools = [];
    if (attach.includes('calculate') && safeCalculate) tools.push(CALCULATOR_TOOL);
    if (attach.includes('web_search') && searchService) tools.push(WEB_SEARCH_TOOL);
    return tools.length ? tools : undefined;
  }

  // Router for the Qjo chat product. The Qcode/Q-Spark provider pipelines that
  // used to live here moved out with those products (see
  // docs/MIGRATION_QSPARK_QCODE.md); `agentType` is kept for call-site clarity
  // and forward compatibility.
  async function callAgent({
    agentType = 'chat', mode, messages, temperature = 0.7, max_tokens = 4000,
    frequency_penalty, presence_penalty,
    useTools, routingDecision, onChunk, onReasoning, onToolCall, model,
    deadlineMs, budgetMs, signal
  } = {}) {
    if (!deadlineMs) {
      deadlineMs = Date.now() + (budgetMs || 40000);
    }

    // ── Chat/General Smart Routing ──
    const originalQuestion = combinedUserText(messages);
    const hasImages = containsImageContent(messages);
    const route = classifyQjoRequest({ messages, mode, routingDecision });
    const normMode = normalizeMode(mode);
    const arabicHeavy = isArabicHeavyText(originalQuestion);

    const effectiveTemperature = getAdaptiveTemperature({
      intent: route.intent,
      mode: normMode,
      requestedTemp: temperature
    });

    const base = { messages, temperature: effectiveTemperature, max_tokens, frequency_penalty, presence_penalty, onChunk, onReasoning, onToolCall, deadlineMs, signal };

    // Tool attachment policy:
    //  • calculator whenever math is plausible (never for images)
    //  • web_search when the question might need freshness AND the client has
    //    not already injected a source pack (avoids double searching)
    const attach = [];
    if (useTools !== false && !hasImages) {
      if (route.mathIntent) attach.push('calculate');
      if (searchService && !route.hasSearchContext && (normMode === 'max' || mightNeedFreshness(originalQuestion))) attach.push('web_search');
    }
    const tools = buildTools({ attach });

    // 1) Images: they only ever work on vision-capable slots. Previously every
    //    image request marched through text-only models and died.
    if (hasImages) {
      const res = await runChain(PIPELINES.vision, { ...base, maxPerProviderMs: 16000 });
      if (res.ok) return res;
      // fall through to the normal chain; text models will at least answer
      // from any extracted/attached text instead of hard failing.
    }

    // 2) Lite fast track — single short casual message.
    if (isLiteRequest(messages)) {
      const liteMessages = [
        { role: 'system', content: 'You are Qjo, a helpful Arabic-first AI assistant. Reply briefly and warmly in the user\'s language.' },
        ...messages.filter(m => m.role !== 'system')
      ];
      const res = await runChain(PIPELINES.lite, { ...base, messages: liteMessages, tools: undefined, maxPerProviderMs: 8000 });
      if (res.ok) return res;
      // fall through to full routing
    }

    // 3) Explicit client model choice is honoured FIRST (Max-mode users get
    //    the 70B they asked for), then the pipeline takes over on failure.
    //    Note: filter only the EXACT [provider,slot] pair — dropping the whole
    //    provider here used to leave single-key users with zero fallbacks.
    const explicit = locateExplicitModel(model);
    const wantCode = route.intent === 'code' || normMode === 'code';
    const pipeline = wantCode
      ? PIPELINES.code
      : (normMode === 'max' ? (arabicHeavy ? PIPELINES.maxAr : PIPELINES.maxEn) : PIPELINES.flash);

    const chain = explicit && !hasImages
      ? [explicit, ...pipeline.filter(([p, s]) => !(p === explicit[0] && s === explicit[1]))]
      : pipeline;

    return runChain(chain, {
      ...base,
      tools: (hasImages || normMode === 'normal') ? undefined : tools,
      maxPerProviderMs: normMode === 'flash' ? 18000 : 25000
    }, { withTools: Boolean(tools), originalQuestion });
  }

  async function completeIfTruncated(params) {
    const { ai, messages, temperature, max_tokens } = params;
    const maxPasses = Math.max(1, Math.min(Number(params.maxPasses ?? 1), 2));
    if (!isTruncatedProviderResponse(ai)) return ai;
    let combined = ai.answer || '';
    let workingMessages = [
      ...messages,
      { role: 'assistant', content: combined },
      { role: 'user', content: 'تابع من حيث توقفت بالضبط. لا تعِد البداية، ولا تضف مقدمة جديدة. أكمل الجملة أو الفقرة الناقصة فقط ثم أكمل باقي الإجابة.' }
    ];
    for (let i = 0; i < maxPasses; i++) {
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
  const q = `${recent}\n${latest}`.toLowerCase();

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
  addRouterSystemHint,
  classifyQjoRequest,
  getAdaptiveTemperature,
  PIPELINES
};

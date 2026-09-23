const { CALCULATOR_TOOL } = require('../tools/calculatorTool');
const { WEB_SEARCH_TOOL } = require('../tools/searchTool');
const { createToolRegistry } = require('../tools/toolRegistry');
const { evidenceFromSearch, formatSearchResultsForTool, sourcesForPage } = require('./toolAnswer');
const { createToolLoop } = require('./toolLoop');
const { continuationPrompts } = require('./continuation');
const { shrinkMessages, fitToAllowance } = require('../services/providerLimits');
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 5xx / gateway-style failures are usually a one-off blip (a free-tier
// aggregator restarting, a momentary upstream hiccup) — worth one quick
// retry before burning the whole provider slot. 429/401/501 are not: those
// need a real cooldown or a config fix, not a retry a second later.
function isTransientStatus(status) {
  return status === 500 || status === 502 || status === 503 || status === 504;
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
// Only very simple greetings/pleasantries use the fast track.
// Drawing, calculating, coding, writing, or questions must ALWAYS go to the full prompt pipeline.
function isLiteRequest(messages) {
  const userMessages = (messages || []).filter(m => m.role === 'user');
  if (userMessages.length !== 1) return false;

  const text = textFromMessageContent(userMessages[0].content).trim();
  if (!text || text.length > 40) return false;
  if (containsImageContent(messages)) return false;

  // Never fast-track any request involving drawing, math, code, or knowledge tasks
  if (/(ارسم|رسم|منحنى|plot|graph|chart|كود|code|دالة|برمج|احسب|حل|اشرح|لخص|اكتب|قارن|search|بحث|https?:\/\/|```|\d+\s*[\+\-\*\/])/i.test(text)) {
    return false;
  }

  // Strictly match common greetings
  return /^(مرحبا|مرحباً|هلا|أهلاً|اهلا|سلام|السلام عليكم|صباح الخير|مساء الخير|كيفك|كيف حالك|كيفو|شلونك|شو أخبارك|شو اخبارك|شكرا|شكراً|يسلمو|يعطيك العافية|hi|hello|hey|bye|thanks)(\s+[؀-ۿa-zA-Z]+){0,3}[!?؟.]*$/i.test(text);
}

// ── Pipeline definitions ──
// Order = quality × fit for the pipeline's job. Providers without keys (or
// without a model configured for the requested slot) are skipped at runtime.
// IMPORTANT: spread attempts across DIFFERENT providers first, never retry the
// same provider account back-to-back — when one provider is rate-limited, all
// its slots (flash/text/code) share the same quota and will fail instantly,
// wasting precious deadline budget.
const PIPELINES = {
  // Lite track: greetings only — spread across all providers for max resilience.
  lite: [['groq', 'flash'], ['llm7', 'flash'], ['qwen', 'flash'], ['kimi', 'flash']],
  // Flash mode: high velocity — cross-provider fallback chain.
  flash: [['groq', 'flash'], ['llm7', 'flash'], ['qwen', 'flash'], ['kimi', 'flash']],
  // Max mode (Arabic-heavy): larger models, cross-provider. Qwen and Kimi rank
  // ahead of the llm7 aggregator here because they are markedly stronger in
  // Arabic, which is what isArabicHeavyText() selects this chain for. Groq
  // stays primary for latency — its LPU is far faster than either fallback, so
  // the Arabic preference applies where it costs nothing: the fallback order.
  // (maxAr and maxEn used to be byte-identical, which made the Arabic detection
  // above a no-op.)
  maxAr: [['groq', 'text'], ['qwen', 'text'], ['kimi', 'text'], ['llm7', 'text'], ['groq', 'flash']],
  // Max mode (English / mixed): larger models, cross-provider.
  maxEn: [['groq', 'text'], ['llm7', 'text'], ['qwen', 'text'], ['kimi', 'text'], ['groq', 'flash']],
  // Code mode: text-grade models first, cross-provider.
  code: [['groq', 'text'], ['llm7', 'text'], ['kimi', 'code'], ['qwen', 'code'], ['groq', 'flash']],
  // Vision requests: vision-capable slots (Groq & Qwen vision).
  vision: [['groq', 'vision'], ['qwen', 'vision']]
};

// The last resort for a text request: Groq's vision model reads text as well,
// and its per-minute allowance is several times the text models' (30K tokens
// against 8K on the free tier), so a long request every other slot refused or
// timed out on still gets an answer. Tried only when everything else failed.
for (const name of ['flash', 'maxAr', 'maxEn', 'code']) PIPELINES[name].push(['groq', 'vision']);

function normalizeMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'code') return 'code';
  if (m === 'advanced' || m === 'max') return 'max';
  return 'flash'; // 'normal' / 'flash' / ''
}

// ── Unified Routing Engine ──
const TOOL_TURN_EXTRA_MS = 20000;

function createRoutingEngine(deps) {
  const { llmService, safeCalculate, models, keys } = deps;
  let searchService = deps.searchService;
  if (!llmService || !models || !keys) throw new Error('createRoutingEngine missing core deps: llmService, models, or keys');

  // Tools are declared in one registry rather than as if/else arms here, so a
  // new capability (fetch a page, write a project file) plugs in without
  // touching provider plumbing. Callers may add their own through
  // deps.extraTools.
  const toolRegistry = createToolRegistry();

  toolRegistry.register('calculate', {
    schema: CALCULATOR_TOOL,
    label: 'Calculator',
    available: () => Boolean(safeCalculate),
    run: (args) => safeCalculate(args.expression)
  });

  toolRegistry.register('web_search', {
    schema: WEB_SEARCH_TOOL,
    label: 'Web search',
    available: () => Boolean(searchService),
    run: async (args, ctx) => {
      const payload = await searchService.performSearch({ rawQuery: args.query, originalQuestion: ctx.originalQuestion, queryFromModel: true });
      ctx.note({ tool: 'web_search', input: payload.query || args.query, resultCount: (payload.results || []).length, sources: sourcesForPage(payload) });
      // Kept as data as well as text: if no model can write the answer, the
      // sources are still the answer.
      if (ctx.addEvidence) ctx.addEvidence(evidenceFromSearch(payload));
      return formatSearchResultsForTool(payload);
    }
  });

  for (const [name, definition] of Object.entries(deps.extraTools || {})) {
    toolRegistry.register(name, definition);
  }

  // Tools the host registered are offered on every tool-enabled request: the
  // host added them deliberately, so the model should know they exist.
  const extraToolNames = Object.keys(deps.extraTools || {});

  // The tool loop and what happens when it cannot finish live in toolLoop.js;
  // this engine supplies the registry and the provider call.
  const { runToolRounds } = createToolLoop({ toolRegistry, tryProvider, isArabic: isArabicHeavyText });

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
    const res = await llmService.dispatch(provider, { model, ...params });
    // Refused as more than this model's per-minute allowance, which the
    // provider named: ask again with the answer room it can give. Here rather
    // than once per chain, because every call has its own size — a round
    // after a search carries the results too, and outgrew a fit made before it.
    const fitted = !res.ok && fitToAllowance(params, res.tokenAllowance);
    if (!fitted) return res;
    console.warn(`[RoutingEngine] ${provider}/${slot} allowance is ${res.tokenAllowance.limit} tokens — asking again with ${fitted.max_tokens} of answer room (was ${params.max_tokens}).`);
    return llmService.dispatch(provider, { model, ...fitted });
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
      let res = await tryProvider(provider, slot, params);

      // One quick retry for transient failures (5xx / gateway timeouts) before
      // giving up on this provider entirely. Free aggregators like llm7 and
      // momentary upstream restarts are usually gone within a second — this
      // avoids burning a whole provider slot (and surfacing the generic
      // "service unavailable" message to the user) over a one-off blip.
      // Not after a timeout: that is the model being slow with this request,
      // and asking again spent the same wait twice.
      if (!res.ok && isTransientStatus(res.status) && !res.timedOut && !(params.deadlineMs && params.deadlineMs - Date.now() < 2500)) {
        console.warn(`[RoutingEngine] ${provider}/${slot} failed (${res.status}: ${String(res.error).slice(0, 100)}) — retrying once after 600ms.`);
        await sleep(600);
        res = await tryProvider(provider, slot, params);
      }

      // The prompt was too long for this model. Every remaining provider in the
      // chain would reject it too if it is larger than all of them, and the user
      // would get "all providers failed" for a request that only needed to be
      // smaller. Shrink and retry, up to twice, before moving on.
      let shrinkAttempts = 0;
      while (!res.ok && res.contextLengthExceeded && shrinkAttempts < 2
             && !(params.deadlineMs && params.deadlineMs - Date.now() < 2500)) {
        const smaller = shrinkMessages(params.messages);
        if (!smaller) break;
        shrinkAttempts++;
        const before = params.messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
        const after = smaller.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
        console.warn(`[RoutingEngine] ${provider}/${slot} rejected the prompt as too long — retrying at ${after} chars (was ${before}).`);
        params = { ...params, messages: smaller };
        res = await tryProvider(provider, slot, params);
      }

      if (!res.ok) { last = res; failures.push({ provider, status: res.status, error: res.error }); continue; }

      // A provider can answer 200 with nothing in it — a content filter, a
      // stop token hit immediately, an empty choices array. That is not a
      // success: it reaches the user as a blank message, which is worse than
      // an error because nothing retries it. Treat it as this provider having
      // failed and let the chain try the next one, which usually answers.
      const emptyAnswer = !String(res.answer || '').trim() && !(res.toolCalls || []).length;
      if (emptyAnswer) {
        console.warn(`[RoutingEngine] ${provider}/${slot} returned an empty answer — treating as a failure and moving on.`);
        last = { ...res, ok: false, status: res.status || 502, error: `${provider} returned an empty answer.` };
        failures.push({ provider, status: 'empty', error: 'empty answer' });
        continue;
      }

      const wantsTools = withTools && (res.toolCalls || []).length > 0;

      // Non-streaming providers: deliver the whole answer as one instant chunk
      // so SSE clients never stare at an empty bubble — but not when the model
      // is about to call a tool, because that text is preamble and the real
      // answer is still coming.
      if (res.ok && !wantsTools && params.onChunk && res.answer && !res.streamed) params.onChunk(res.answer);

      if (!wantsTools) return res;

      // Always ends in an answer or an honest failure. It used to fall back to
      // `res` here — the round that asked for the search — so a failed loop
      // delivered "let me look that up" as the whole reply.
      const looped = await runToolRounds({ provider, slot, params, originalQuestion, first: res, chain: list });
      if (looped.ok) return looped;
      last = looped;
      failures.push({ provider, status: looped.status, error: looped.error });
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

    // Single grep-able summary line for Render logs. Before this, diagnosing a
    // full-chain failure meant scrolling through every per-key llmService
    // warning to reconstruct what was even tried — now it's one line.
    console.error(`[RoutingEngine] CHAIN FAILED at ${new Date().toISOString()} — ${error}`);

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
    return toolRegistry.schemasFor(attach);
  }

  /**
   * Runs one model turn, including its tool loop and provider failover.
   *
   * Router for the Qjo chat product. The Qcode/Q-Spark provider pipelines that
   * used to live here moved out with those products (see
   * docs/MIGRATION_QSPARK_QCODE.md); `agentType` is kept for call-site clarity
   * and forward compatibility.
   *
   * @param {object} [options]
   * @param {string} [options.agentType] Call-site label; does not affect routing.
   * @param {string} [options.mode] 'flash' | 'max' | 'advanced' | 'code'.
   * @param {Array<{role: string, content: any, [k: string]: any}>} [options.messages]
   * @param {number} [options.temperature]
   * @param {number} [options.max_tokens]
   * @param {number} [options.frequency_penalty]
   * @param {number} [options.presence_penalty]
   * @param {boolean} [options.useTools] false disables tools entirely.
   * @param {{targetAgent: string, confidence: number, reason: string}|null} [options.routingDecision]
   * @param {(text: string) => void} [options.onChunk] Answer text as it arrives.
   * @param {(text: string) => void} [options.onReasoning] Reasoning channel.
   * @param {(info: object) => void} [options.onToolCall] Tool started/finished.
   * @param {(result: {tool: string, input: string, output: string}) => void} [options.onToolResult]
   *        Every tool execution with its output, including built-in tools.
   * @param {string} [options.model] Explicit model id; otherwise chosen by mode.
   * @param {number} [options.deadlineMs] Absolute deadline. Overrides budgetMs.
   * @param {number} [options.budgetMs] Relative budget; defaults scale with prompt size.
   * @param {AbortSignal} [options.signal] Client disconnect.
   * @returns {Promise<{ok: boolean, answer?: string, provider?: string, model?: string,
   *   finish_reason?: string, toolsUsed?: Array<object>, status?: number, error?: string}>}
   */
  async function callAgent({
    agentType = 'chat', mode, messages, temperature = 0.7, max_tokens = 4000,
    frequency_penalty, presence_penalty,
    useTools, routingDecision, onChunk, onReasoning, onToolCall, onToolResult, model,
    deadlineMs, budgetMs, signal
  } = {}) {
    const budgetFromCaller = Boolean(deadlineMs || budgetMs);
    if (!deadlineMs) {
      // A large prompt legitimately takes longer before the first token: the
      // model has to ingest it. With a flat 40s budget, a document analysis
      // that failed over to a second provider could run out of time with
      // nothing actually wrong, and the user got "all providers failed". The
      // client waits 180s, so there is room to be patient in proportion to the
      // work being asked for.
      const promptChars = (messages || []).reduce((sum, m) => {
        if (typeof m?.content === 'string') return sum + m.content.length;
        if (Array.isArray(m?.content)) {
          return sum + m.content.reduce((n, part) => n + (typeof part?.text === 'string' ? part.text.length : 0), 0);
        }
        return sum;
      }, 0);
      const sizedBudget = promptChars > 40000 ? 100000 : (promptChars > 16000 ? 70000 : 40000);
      deadlineMs = Date.now() + (budgetMs || sizedBudget);
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

    const base = { messages, temperature: effectiveTemperature, max_tokens, frequency_penalty, presence_penalty, onChunk, onReasoning, onToolCall, onToolResult, deadlineMs, signal };

    // Tool attachment policy:
    //  • calculator whenever math is plausible (never for images)
    //  • web_search when the question might need freshness AND the client has
    //    not already injected a source pack (avoids double searching)
    //  • fetch_page alongside search, so the model can open what it found
    //    instead of answering from two-line snippets
    const attach = [];
    if (useTools !== false && !hasImages) {
      if (route.mathIntent) attach.push('calculate');
      // The model decides whether to search; a regex cannot. Measured on a
      // realistic corpus the old keyword gate was 72% accurate, and its misses
      // were the damaging kind — "who is the prime minister now", "tomorrow's
      // weather", "latest news" — answered confidently from stale memory, while
      // a bare "دور" in the allow-list searched the web for "شو دورك؟".
      // Offering the tool costs nothing when the model does not call it;
      // withholding it guarantees a stale answer.
      //
      // Skipped only when the client already injected a source pack, which
      // would otherwise cause a second, duplicate search.
      if (searchService && !route.hasSearchContext) {
        attach.push('web_search');
        // Opening a page is how a search result becomes evidence; on its own
        // the model has no URL to open.
        attach.push('fetch_page');
      }
      for (const name of extraToolNames) attach.push(name);
    }
    const tools = buildTools({ attach });
    // A turn that may search, open a source and then write has more steps
    // than one that only writes. The extra time is spent only if needed: a
    // search answer still ends the moment it is written.
    if (tools && !budgetFromCaller) {
      deadlineMs += TOOL_TURN_EXTRA_MS;
      base.deadlineMs = deadlineMs;
    }

    // 1) Images: they only ever work on vision-capable slots. Previously every
    //    image request marched through text-only models and died.
    if (hasImages) {
      const res = await runChain(PIPELINES.vision, { ...base, maxPerProviderMs: 16000 });
      if (res.ok) return res;
      // fall through to the normal chain; text models will at least answer
      // from any extracted/attached text instead of hard failing.
    }

    // 2) Lite fast track — single short greeting message.
    if (isLiteRequest(messages)) {
      const res = await runChain(PIPELINES.lite, { ...base, messages, tools: undefined, maxPerProviderMs: 8000 });
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

    // normalizeMode only ever returns 'code' | 'max' | 'flash', so the old
    // extra `normMode === 'normal'` test here could never be true.
    return runChain(chain, {
      ...base,
      tools: hasImages ? undefined : tools,
      maxPerProviderMs: normMode === 'flash' ? 18000 : 25000
    }, { withTools: Boolean(tools), originalQuestion });
  }

  async function completeIfTruncated(params) {
    const { ai, messages, temperature, max_tokens } = params;
    const maxPasses = Math.max(1, Math.min(Number(params.maxPasses ?? 1), 2));
    if (!isTruncatedProviderResponse(ai)) return ai;
    let combined = ai.answer || '';
    const prompts = continuationPrompts(combined);
    let workingMessages = [
      ...messages,
      { role: 'assistant', content: combined },
      { role: 'user', content: prompts.first }
    ];
    for (let i = 0; i < maxPasses; i++) {
      const next = await callAgent({ ...params, messages: workingMessages, temperature: Math.min(temperature, 0.3), max_tokens: Math.min(max_tokens, 1800) });
      if (!next.ok || !next.answer) break;
      combined += (combined.endsWith('\n') ? '' : '\n') + next.answer;
      if (!isTruncatedProviderResponse(next)) return { ...next, answer: combined, continued: true, toolsUsed: [...(ai.toolsUsed || []), ...(next.toolsUsed || [])] };
      workingMessages = [...workingMessages, { role: 'assistant', content: next.answer }, { role: 'user', content: prompts.again }];
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

// Keeps the two ends of a long message, where instructions live — "do X:"
// followed by a paste, or a paste followed by "do X" — and drops the middle,
// which is the pasted material itself.
const INSTRUCTION_EDGE = 350;
function instructionRegion(text) {
  const t = String(text || '');
  if (t.length <= INSTRUCTION_EDGE * 2) return t;
  return `${t.slice(0, INSTRUCTION_EDGE)}\n${t.slice(-INSTRUCTION_EDGE)}`;
}

// ── Deterministic Router (used by client-side routing) ──
function routeUserRequestDeterministic(messagesOrText) {
  const latest = lastUserText(messagesOrText);
  const recent = typeof messagesOrText === 'string' ? latest : combinedRecentUserText(messagesOrText);
  const q = `${recent}\n${latest}`.toLowerCase();

  const explicitQcode = /(qcode|q-code|code lab|كيو\s*كود|كيوكود)/i.test(q);

  // A long message is usually a short instruction wrapped around material the
  // user pasted for reference — a CV, an article, a spec. The instruction is
  // what to classify; the pasted body is data, and no intent should be read
  // out of it. Classifying the whole blob is how a CV sent in for formatting
  // became a coding request at 90% confidence: it happened to contain
  // "الموقع: عمان" (a location field, not a website), "Git / VS Code" (a
  // listed skill) and the name of the clinical database a device trained on.
  const qIntent = `${instructionRegion(recent)}\n${instructionRegion(latest)}`.toLowerCase();

  // Signals that mean code wherever they appear. Nobody pastes a stack trace
  // or a fenced block as background for a non-coding request.
  const hardCodeSignal = /(```|~~~|stack\s+trace|traceback|segmentation\s+fault|nullpointerexception|syntaxerror|typeerror|referenceerror|package\.json|node_modules)/i.test(q);

  // Tools, languages and code nouns. A mention counts only inside the
  // instruction region, because naming React is not asking for React.
  const codeTopic = /(كود|برمج|برمجة|مبرمج|سكربت|سكريبت|\bapi\b|\bsdk\b|\bdebug\b|\bbug\b|compile|refactor|react|next\.js|vue|angular|svelte|\bnode(?:\.js)?\b|express|fastapi|django|flask|laravel|python|javascript|typescript|golang|\brust\b|kotlin|swift|firebase|supabase|\bdeploy\b|github|\bnpm\b|\byarn\b|\bpnpm\b|docker|kubernetes|\bsql\b|mysql|nosql|mongodb|postgres|backend|frontend|full[- ]?stack|هندسة\s+برمجيات|تصحيح\s+خطأ|بايثون|جافا|جافاسكريبت|جافا\s*سكريبت|تايب\s*سكريبت|ريأكت|رياكت|دالة|كلاس|خوارزمي|مصفوفة|اكتب(?:لي|لنا)?\s+(?:دالة|كلاس|برنامج|كود|سكربت)|سوي(?:لي|لنا)?\s+(?:دالة|كود|برنامج)|اعمل(?:لي|لنا)?\s+(?:دالة|كود|برنامج|تطبيق))/i.test(qIntent);

  // Ambiguous on their own, so they need a verb or a qualifier to count.
  // "موقع" is a location as often as a website, "git" is a CV skill as often
  // as a command, and a database is usually the thing being described rather
  // than the thing being asked for.
  const ambiguousWithContext = /((?:اعمل|سوي|صمم|ابن[يى]|أنشئ|انشئ|برمج|طور|بني|بدي|أبغى|ابغى)\w*\s+(?:لي\s+|لنا\s+)?(?:موقع|مواقع|تطبيق)|(?:موقع|مواقع)\s*(?:ويب|إلكتروني|الكتروني|انترنت|إنترنت)|\bwebsite\b|\bweb\s*app\b|\bgit\s+(?:clone|push|pull|commit|merge|rebase|branch|status|diff|init|checkout|log)\b|(?:صمم|اعمل|انشئ|أنشئ|بدي|اربط)\w*\s+(?:لي\s+)?قاعدة\s+بيانات)/i.test(qIntent);

  // "Summarise this article", "format this CV", "translate this text": the verb
  // names the task and the object names a document, so whatever the pasted
  // body happens to mention, this is not a request to write software. A real
  // code signal (a fenced block, a stack trace) still wins over it.
  const documentTask = /((?:لخص|اختصر|ترجم|نسق|نسّق|رتب|رتّب|صغ|صيغ|راجع|دقق|حسّن|حسن)(?:لي|لنا)?\s+(?:هاد|هذا|هاي|هذه)?\s*(?:ال)?(?:مقال|نص|مستند|تقرير|سيرة\s*ذاتية|رسالة|ايميل|إيميل|بريد)|(?:summari[sz]e|translate|proofread|format|polish)\s+(?:this|the)\s+(?:article|text|document|report|cv|resume|email|letter))/i.test(qIntent);

  const codingIntent = hardCodeSignal || ((codeTopic || ambiguousWithContext) && !documentTask);
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

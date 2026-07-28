const { validateRoutingDecision } = require('./routerAgent');
const { CALCULATOR_TOOL } = require('../tools/calculatorTool');
const { WEB_SEARCH_TOOL } = require('../tools/searchTool');

function textFromMessageContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('\n');
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

function containsImageContent(messages) {
  return (messages || []).some(m => Array.isArray(m.content) && m.content.some(part => part?.type === 'image_url'));
}

function isTruncatedProviderResponse(ai) {
  if (!ai || !ai.ok) return false;
  const finish = String(ai.finish_reason || ai.finishReason || '').toLowerCase();
  return finish === 'length' || finish === 'max_tokens' || finish === 'max_output_tokens';
}

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

function createModelRouter(deps) {
  const required = ['callGroqChat','callGeminiChat','callQwenChat','callKimiChat','callNvidiaChat','callOpenRouterFreeChat','callAgnesChat','normalizeProviderFinishReason','safeCalculate','models','keys'];
  for (const key of required) if (!deps[key]) throw new Error(`createModelRouter missing dependency: ${key}`);

  function formatSearchResultsForTool(payload) {
    const results = (payload?.results || []).slice(0, 6);
    if (!results.length) return `No web results found for "${payload?.query || ''}".`;
    return results.map(r => `[${r.id}] ${r.title || 'untitled'} (${r.url})\n${String(r.content || '').slice(0, 500)}`).join('\n\n');
  }

  // Shared by every provider branch below: whichever model asks for a tool,
  // this actually runs it (real calculator, real Tavily/DuckDuckGo search)
  // and returns OpenAI-style "tool" role messages to feed back to the model.
  async function executeToolCalls(toolCalls, originalQuestion) {
    const toolMessages = [];
    const used = [];
    for (const call of (toolCalls || []).slice(0, 4)) {
      const name = call?.function?.name;
      let output;
      try {
        const args = JSON.parse(call.function.arguments || '{}');
        if (name === 'calculate') {
          output = deps.safeCalculate(args.expression);
          used.push({ tool: 'calculate', input: args.expression });
        } else if (name === 'web_search' && deps.searchService) {
          const payload = await deps.searchService.performSearch({ rawQuery: args.query, originalQuestion });
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
    const tools = [CALCULATOR_TOOL];
    // If the client already ran its own pre-search and injected a "source
    // pack" into the message, giving the model the web_search tool again
    // risks a redundant extra round trip (search → wait → answer again)
    // for information it already has. Only offer it when there's no
    // existing search context to work from.
    if (deps.searchService && !skipWebSearch) tools.push(WEB_SEARCH_TOOL);
    return tools;
  }

  // Generic tool-use loop for any provider whose call function returns the
  // normalized { ok, answer, message, toolCalls, provider, model } shape
  // (Qwen, Kimi, Nvidia via callOpenAICompatibleProvider). Groq is handled
  // separately below because callGroqChat still returns the raw
  // { upstream, data } shape for backward compatibility.
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

  async function callAIRouter({ model, messages, temperature, max_tokens, useTools, mode, routingDecision }) {
    const hasImages = containsImageContent(messages);
    const codeMode = mode === 'code';
    const route = classifyQjoRequest({ messages, mode, routingDecision });
    const { models, keys } = deps;
    // gemini key count check
    const geminiAvailable = (keys.gemini || 0) > 0;
    const originalQuestion = combinedUserText(messages);
    const tools = buildTools(useTools && !hasImages, route.hasSearchContext);

    // ── Gemini first: highest quality, free tier with key rotation ──
    if (keys.gemini) {
      const geminiModel = models.geminiText || 'gemini-2.5-flash';
      const gemini = await deps.callGeminiChat({ model: geminiModel, messages, temperature, max_tokens });
      if (gemini.ok) return gemini;
    }

    if (codeMode && !hasImages && keys.qwen) {
      const qwen = await deps.callQwenChat({ model: models.qwenCode, messages, temperature, max_tokens });
      if (qwen.ok) return qwen;
    }

    if (!hasImages && (route.intent === 'search' || route.intent === 'research')) {
      if (keys.qwen) {
        const qwen = await callWithTools(deps.callQwenChat, { model: models.qwenText, messages, temperature: Math.min(temperature, 0.22), max_tokens, tools }, originalQuestion);
        if (qwen.ok) return qwen;
      }
      if (keys.kimi) {
        const kimi = await callWithTools(deps.callKimiChat, { model: models.kimiText, messages, temperature: Math.min(temperature, 0.22), max_tokens, tools }, originalQuestion);
        if (kimi.ok) return kimi;
      }
      if (keys.nvidia) {
        const nvidia = await callWithTools(deps.callNvidiaChat, { model: models.nvidiaText, messages, temperature: Math.min(temperature, 0.22), max_tokens, tools }, originalQuestion);
        if (nvidia.ok) return nvidia;
      }
    }

    if (!hasImages && route.intent === 'file') {
      if (keys.kimi) {
        const kimi = await deps.callKimiChat({ model: models.kimiText, messages, temperature: Math.min(temperature, 0.22), max_tokens });
        if (kimi.ok) return kimi;
      }
      if (keys.qwen) {
        const qwen = await deps.callQwenChat({ model: models.qwenText, messages, temperature: Math.min(temperature, 0.22), max_tokens });
        if (qwen.ok) return qwen;
      }
      if (keys.nvidia) {
        const nvidia = await deps.callNvidiaChat({ model: models.nvidiaText, messages, temperature: Math.min(temperature, 0.22), max_tokens });
        if (nvidia.ok) return nvidia;
      }
    }

    if (!hasImages && route.intent === 'reasoning' && !route.mathIntent && keys.qwen) {
      const qwen = await callWithTools(deps.callQwenChat, { model: models.qwenText, messages, temperature: Math.min(temperature, 0.22), max_tokens, tools }, originalQuestion);
      if (qwen.ok) return qwen;
    }

    if (keys.groq) {
      const groq = await deps.callGroqChat({ model, messages, temperature, max_tokens, tools });
      if (groq.upstream.ok) {
        const firstMessage = groq.data?.choices?.[0]?.message;
        const toolCalls = firstMessage?.tool_calls || [];
        if (toolCalls.length) {
          const { toolMessages, used } = await executeToolCalls(toolCalls, originalQuestion);
          const second = await deps.callGroqChat({ model, messages: [...messages, firstMessage, ...toolMessages], temperature, max_tokens });
          if (second.upstream.ok) return { ok: true, answer: second.data?.choices?.[0]?.message?.content || '', provider: 'groq', model, finish_reason: deps.normalizeProviderFinishReason('groq', second.data), toolsUsed: used };
        } else {
          return { ok: true, answer: firstMessage?.content || '', provider: 'groq', model, finish_reason: deps.normalizeProviderFinishReason('groq', groq.data) };
        }
      }
    }

    if (!hasImages && keys.qwen) {
      const qwenModel = model === models.groqFlash ? models.qwenFlash : models.qwenText;
      const qwen = await callWithTools(deps.callQwenChat, { model: qwenModel, messages, temperature, max_tokens, tools }, originalQuestion);
      if (qwen.ok) return qwen;
    }

    if (!hasImages && keys.kimi) {
      const kimiModel = codeMode ? models.kimiCode : (model === models.groqFlash ? models.kimiFlash : models.kimiText);
      const kimi = await callWithTools(deps.callKimiChat, { model: kimiModel, messages, temperature, max_tokens, tools }, originalQuestion);
      if (kimi.ok) return kimi;
    }

    if (!hasImages && keys.nvidia) {
      const nvidiaModel = model === models.groqFlash ? models.nvidiaFlash : models.nvidiaText;
      const nvidia = await callWithTools(deps.callNvidiaChat, { model: nvidiaModel, messages, temperature, max_tokens, tools }, originalQuestion);
      if (nvidia.ok) return nvidia;
    }

    if (!hasImages && keys.openRouter) {
      const openrouter = await deps.callOpenRouterFreeChat({ messages, temperature, max_tokens });
      if (openrouter.ok) return openrouter;
    }

    if (!hasImages && keys.agnes && deps.agnesBaseUrl) {
      const agnes = await deps.callAgnesChat({ messages, temperature, max_tokens });
      if (agnes.ok) return agnes;
    }

    return { ok: false, status: 503, error: 'No AI provider is available or all configured providers failed.' };
  }

  async function completeIfTruncated({ ai, model, messages, temperature, max_tokens, useTools, mode }) {
    if (!isTruncatedProviderResponse(ai)) return ai;
    let combined = ai.answer || '';
    let workingMessages = [
      ...messages,
      { role: 'assistant', content: combined },
      { role: 'user', content: 'تابع من حيث توقفت بالضبط. لا تعِد البداية، ولا تضف مقدمة جديدة. أكمل الجملة أو الفقرة الناقصة فقط ثم أكمل باقي الإجابة.' }
    ];
    for (let i = 0; i < 2; i++) {
      const next = await callAIRouter({ model, messages: workingMessages, temperature: Math.min(temperature, 0.3), max_tokens: Math.min(max_tokens, 1800), useTools, mode });
      if (!next.ok || !next.answer) break;
      combined += (combined.endsWith('\n') ? '' : '\n') + next.answer;
      if (!isTruncatedProviderResponse(next)) return { ...next, answer: combined, continued: true };
      workingMessages = [...workingMessages, { role: 'assistant', content: next.answer }, { role: 'user', content: 'تابع مرة أخيرة من حيث توقفت بدون إعادة.' }];
    }
    return { ...ai, answer: combined, continued: true, finish_reason: 'continued_but_may_be_truncated' };
  }

  return { callAIRouter, completeIfTruncated, containsImageContent, classifyQjoRequest };
}

module.exports = {
  createModelRouter,
  containsImageContent,
  classifyQjoRequest,
  textFromMessageContent,
  combinedUserText,
  isTruncatedProviderResponse
};

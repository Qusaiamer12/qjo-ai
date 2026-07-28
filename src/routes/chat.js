const { addContextContinuitySystemHint } = require('../agents/contextContinuity');
const { routeUserRequestDeterministic, addRouterSystemHint } = require('../agents/routerAgent');
const { addCalculatorSystemHint } = require('../tools/calculatorTool');
const { sanitizeMathNotation } = require('../services/textSanitizer');

function requireDeps(deps) {
  const required = [
    'hasAnyAiProvider',
    'verifyFirebaseRequest',
    'enforceDailyUsage',
    'allowedModels',
    'defaultModel',
    'flashModel',
    'cleanMessages',
    'containsImageContent',
    'callAIRouter',
    'completeIfTruncated',
    'fullSystemPrompt'
  ];
  for (const key of required) {
    if (deps[key] === undefined || deps[key] === null) throw new Error(`registerChatRoutes missing dependency: ${key}`);
  }
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.min(Math.max(safe, min), max);
}

function registerChatRoutes(app, deps) {
  requireDeps(deps);

  app.post('/api/chat', async (req, res) => {
    try {
      if (!deps.hasAnyAiProvider()) return res.status(500).json({ error: 'AI service is not configured.' });
      if (!(await deps.verifyFirebaseRequest(req, res))) return;
      if (!(await deps.enforceDailyUsage(req, res))) return;

      const model = String(req.body.model || deps.defaultModel);
      if (!deps.allowedModels.has(model)) return res.status(400).json({ error: 'Unsupported model.' });

      const cleanedMessages = deps.cleanMessages(req.body.messages);
      if (!cleanedMessages.length) return res.status(400).json({ error: 'No valid messages.' });

      const renderedSystemPrompt = String(deps.fullSystemPrompt || '').replace(/\{\{current_datetime\}\}/g, new Date().toISOString());
      const messages = cleanedMessages[0]?.role === 'system'
        ? [{ role: 'system', content: `${renderedSystemPrompt}\n\n${cleanedMessages[0].content}` }, ...cleanedMessages.slice(1)]
        : [{ role: 'system', content: renderedSystemPrompt }, ...cleanedMessages];

      const defaultMaxTokens = deps.defaultMaxTokens || 1000;
      // 8192 is Groq's hard server-side ceiling for completion tokens on
      // llama-3.3-70b-versatile (our default text model). Going higher
      // doesn't give longer answers — it makes Groq reject the request
      // outright with a 400 error. This is the real maximum, not an
      // arbitrary product choice.
      const max_tokens = clampNumber(req.body.max_tokens || defaultMaxTokens, defaultMaxTokens, 64, 7992);
      const temperature = clampNumber(req.body.temperature || 0.3, 0.3, 0, 1);
      const requestedMode = String(req.body.mode || '').toLowerCase();

      const useTools = !deps.containsImageContent(messages);
      const routingDecision = routeUserRequestDeterministic(messages);
      const routedMessages = addRouterSystemHint(messages, routingDecision);
      const continuityMessages = addContextContinuitySystemHint(routedMessages);
      const preparedMessages = useTools ? addCalculatorSystemHint(continuityMessages) : continuityMessages;

      const ai = await deps.callAIRouter({
        model,
        messages: preparedMessages,
        temperature,
        max_tokens,
        useTools,
        mode: requestedMode,
        routingDecision
      });

      if (!ai.ok) {
        const limited = ai.status === 429 || /rate|quota|limit/i.test(ai.error || '');
        if (limited && model !== deps.flashModel && !deps.containsImageContent(messages)) {
          const fallback = await deps.callAIRouter({
            model: deps.flashModel,
            messages: preparedMessages,
            temperature: Math.min(temperature, 0.3),
            max_tokens: Math.min(max_tokens, 900),
            useTools,
            mode: requestedMode,
            routingDecision
          });
          if (fallback.ok) {
            const completedFallback = await deps.completeIfTruncated({
              ai: fallback,
              model: deps.flashModel,
              messages: preparedMessages,
              temperature: Math.min(temperature, 0.3),
              max_tokens: 900,
              useTools,
              mode: requestedMode
            });
            return res.json({
              answer: sanitizeMathNotation(completedFallback.answer || ''),
              provider: completedFallback.provider,
              model: completedFallback.model,
              fallback: true,
              continued: Boolean(completedFallback.continued),
              routing: routingDecision,
              toolsUsed: completedFallback.toolsUsed || []
            });
          }
        }
        if (limited) return res.status(429).json({ error: 'RATE_LIMIT' });
        return res.status(ai.status || 500).json({ error: ai.error || 'AI provider error.' });
      }

      const completed = await deps.completeIfTruncated({
        ai,
        model,
        messages: preparedMessages,
        temperature,
        max_tokens,
        useTools,
        mode: requestedMode
      });
      return res.json({
        answer: sanitizeMathNotation(completed.answer || ''),
        provider: completed.provider,
        model: completed.model,
        continued: Boolean(completed.continued),
        routing: routingDecision,
        toolsUsed: completed.toolsUsed || []
      });
    } catch (error) {
      if (error.name === 'AbortError') return res.status(504).json({ error: 'AI request timed out.' });
      console.error(error);
      return res.status(500).json({ error: 'Server error.' });
    }
  });
}

module.exports = { registerChatRoutes };

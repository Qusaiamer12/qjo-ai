const { addContextContinuitySystemHint } = require('../agents/contextContinuity');
const { addRouterSystemHint } = require('../agents/RoutingEngine');
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

// ── Simulate streaming by chunking a complete answer ──────────────
// Real provider streaming requires major refactor of all provider
// functions. This approach gives users the "typing" feel immediately
// with zero provider changes: the answer is fetched normally, then
// streamed back to the client in small SSE chunks.
function streamAnswer(res, answer, provider, model, toolsUsed) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const text = String(answer || '');
  // Split into natural chunks: words/punctuation groups of ~4-8 chars
  const chunks = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    buf += text[i];
    const isBreak = /[\s.,!?;:\n]/.test(text[i]);
    if ((isBreak && buf.length >= 4) || buf.length >= 8) {
      chunks.push(buf); buf = '';
    }
  }
  if (buf) chunks.push(buf);

  let idx = 0;
  // Adaptive delay: faster for short answers, slightly slower for long
  const baseDelay = text.length > 3000 ? 6 : 10;

  function sendNext() {
    if (idx >= chunks.length) {
      // Final event with metadata
      res.write(`event: done\ndata: ${JSON.stringify({ provider, model, toolsUsed: toolsUsed || [] })}\n\n`);
      res.end();
      return;
    }
    res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunks[idx] })}\n\n`);
    idx++;
    // Slight random jitter mimics natural typing rhythm
    const jitter = Math.floor(Math.random() * 4);
    setTimeout(sendNext, baseDelay + jitter);
  }
  sendNext();
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

      const useStreaming = req.body.stream === true || req.headers.accept === 'text/event-stream';
      const temperature = clampNumber(req.body.temperature, 0.7, 0, 1);
      const maxTokens = clampNumber(req.body.max_tokens, deps.defaultMaxTokens || 7992, 64, 7992);
      const mode = String(req.body.mode || '');
      const routingDecision = req.body.routingDecision || null;
      const useTools = req.body.useTools !== false;

      // Check cache first (0ms response for identical repeat queries!)
      const cacheKey = (deps.stableCacheKey && deps.memoryCaches?.completions)
        ? deps.stableCacheKey('chat', model + '|' + mode + '|' + JSON.stringify(cleanedMessages.slice(-3)))
        : null;
      if (cacheKey && deps.cacheGet) {
        const cachedAnswer = deps.cacheGet(deps.memoryCaches.completions, cacheKey);
        if (cachedAnswer) {
          if (useStreaming) {
            return streamAnswer(res, cachedAnswer.answer, cachedAnswer.provider, cachedAnswer.model, cachedAnswer.toolsUsed);
          }
          return res.json({
            answer: cachedAnswer.answer,
            provider: cachedAnswer.provider,
            model: cachedAnswer.model,
            finish_reason: 'cached',
            continued: cachedAnswer.continued || false,
            toolsUsed: cachedAnswer.toolsUsed || [],
            cached: true
          });
        }
      }

      const ip = deps.getClientIp ? deps.getClientIp(req) : '';
      let timeZone = 'Asia/Amman';
      let locationText = 'Amman, Jordan';
      if (ip && deps.lookupClientGeo) {
        try {
          const geo = await deps.lookupClientGeo(ip);
          if (geo && geo.timezone) {
            timeZone = geo.timezone;
            locationText = `${geo.city || ''}, ${geo.country || ''}`.trim() || locationText;
          }
        } catch (_) {}
      }

      const now = new Date();
      const localTimeString = now.toLocaleString('ar-JO', { timeZone, dateStyle: 'full', timeStyle: 'short' });
      const renderedSystemPrompt = String(deps.fullSystemPrompt || '')
        .replace(/\{\{current_datetime\}\}/g, `${localTimeString} (الموقع الجغرافي: ${locationText}, المنطقة الزمنية: ${timeZone})`);

      // Build messages with system prompt injected first
      const systemMessages = [];
      const userMessages = cleanedMessages.filter(m => m.role !== 'system');

      if (renderedSystemPrompt) {
        systemMessages.push({ role: 'system', content: renderedSystemPrompt });
      }

      // Merge any system hints from client
      const clientSystemMessages = cleanedMessages.filter(m => m.role === 'system');
      systemMessages.push(...clientSystemMessages);

      // Add router/calculator hints
      let builtMessages = [...systemMessages, ...userMessages];
      builtMessages = addContextContinuitySystemHint(builtMessages);
      builtMessages = addCalculatorSystemHint(builtMessages);
      if (routingDecision) builtMessages = addRouterSystemHint(builtMessages, routingDecision);

      if (useStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }

      const ai = await deps.routingEngine.callAgent({
        model,
        messages: builtMessages,
        temperature,
        max_tokens: maxTokens,
        useTools,
        mode,
        routingDecision,
        onChunk: useStreaming ? (text) => {
          res.write(`event: chunk\ndata: ${JSON.stringify({ text })}\n\n`);
        } : undefined
      });

      if (!ai.ok) {
        if (useStreaming) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: ai.error || 'AI provider failed.' })}\n\n`);
          res.end();
          return;
        }
        const status = ai.status || 503;
        return res.status(status).json({ error: ai.error || 'AI provider failed.' });
      }

      // Complete if truncated
      const finalAi = await deps.routingEngine.completeIfTruncated({ ai, model, messages: builtMessages, temperature, max_tokens: maxTokens, useTools, mode });
      const cleanAnswer = sanitizeMathNotation(String(finalAi.answer || ''));

      // Write results to cache
      if (cacheKey && deps.cacheSet) {
        deps.cacheSet(deps.memoryCaches.completions, cacheKey, {
          answer: cleanAnswer,
          provider: finalAi.provider,
          model: finalAi.model,
          continued: finalAi.continued || false,
          toolsUsed: finalAi.toolsUsed || []
        }, 15 * 60 * 1000, 120); // 15 minutes cache, max 120 items
      }

      if (useStreaming) {
        res.write(`event: done\ndata: ${JSON.stringify({ provider: finalAi.provider, model: finalAi.model, toolsUsed: finalAi.toolsUsed || [] })}\n\n`);
        res.end();
        return;
      }

      return res.json({
        answer: cleanAnswer,
        provider: finalAi.provider,
        model: finalAi.model,
        finish_reason: finalAi.finish_reason,
        continued: finalAi.continued || false,
        toolsUsed: finalAi.toolsUsed || []
      });

    } catch (err) {
      console.error('[chat] error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
    }
  });
}

module.exports = { registerChatRoutes };

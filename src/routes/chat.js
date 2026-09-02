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
    'cleanMessages',
    'routingEngine'
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

// ── Client geo cache: one lookup per IP per 24h, lookups are raced with a ──
// short deadline so they never block the LLM call again.
const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const geoCache = new Map();

function geoCacheGet(ip) {
  const item = geoCache.get(ip);
  if (!item) return null;
  if (item.expiresAt < Date.now()) { geoCache.delete(ip); return null; }
  return item.value;
}

function geoCacheSet(ip, value) {
  if (geoCache.size >= 500) geoCache.delete(geoCache.keys().next().value);
  geoCache.set(ip, { value, expiresAt: Date.now() + GEO_CACHE_TTL_MS });
}

// Resolves geo fast: cache hit (0ms) → live lookup raced against `raceMs`.
// A slower lookup still completes in the background and serves the user's
// NEXT message, so location awareness is preserved without latency.
async function resolveGeoFast(ip, lookupFn, raceMs = 1200) {
  if (!ip || !lookupFn) return null;
  const cached = geoCacheGet(ip);
  if (cached !== null) return cached;
  const lookupPromise = Promise.resolve()
    .then(() => lookupFn(ip))
    .then(geo => { if (geo) geoCacheSet(ip, geo); return geo || null; })
    .catch(() => null);
  return Promise.race([
    lookupPromise,
    new Promise(resolve => setTimeout(() => resolve(null), raceMs))
  ]);
}

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

// Cached answers are delivered INSTANTLY (one single chunk): the previous
// implementation re-typed cached answers character-by-character, making cache
// hits SLOWER than fresh requests (up to ~30s for long answers).
function sendCachedResponse(res, cached, useStreaming) {
  if (useStreaming) {
    sseHeaders(res);
    res.write(`event: chunk\ndata: ${JSON.stringify({ text: cached.answer })}\n\n`);
    res.write(`event: done\ndata: ${JSON.stringify({ provider: cached.provider, model: cached.model, toolsUsed: cached.toolsUsed || [], cached: true })}\n\n`);
    res.end();
    return true;
  }
  res.json({
    answer: cached.answer,
    provider: cached.provider,
    model: cached.model,
    finish_reason: 'cached',
    continued: cached.continued || false,
    toolsUsed: cached.toolsUsed || [],
    cached: true
  });
  return true;
}

// Chat history trim: last 12 messages, 12k chars per message. Long archives
// are the client's Firestore concern; the model call should stay lean.
function trimForChat(messages) {
  return (messages || []).slice(-12).map(m => {
    if (typeof m.content === 'string' && m.content.length > 12000) {
      return { ...m, content: m.content.slice(0, 12000) };
    }
    return m;
  });
}

function detectNeeds(userText) {
  const t = String(userText || '');
  return {
    search: /source pack|connected search|connected deep search|web search note|search query used/i.test(t),
    files: /user attached files|pdf pages processed|ocr text extracted|extraction method|attachment index|المرفقات/i.test(t)
  };
}

function lastUserLanguage(messages) {
  const last = [...(messages || [])].reverse().find(m => m?.role === 'user');
  const text = typeof last?.content === 'string' ? last.content : '';
  const ar = (text.match(/[؀-ۿ]/g) || []).length;
  return ar > text.length * 0.15 ? 'ar' : 'en';
}

function registerChatRoutes(app, deps) {
  requireDeps(deps);

  app.post('/api/chat', async (req, res) => {
    // Cancel upstream provider calls the moment the client goes away.
    const clientAbort = new AbortController();
    let responseFinished = false;
    res.on('close', () => { if (!responseFinished) clientAbort.abort(); });

    try {
      if (!deps.hasAnyAiProvider()) return res.status(500).json({ error: 'AI service is not configured.' });

      // Auth first (usage enforcement may need req.user), then everything
      // independent runs in parallel: usage limits + geo resolution.
      if (!(await deps.verifyFirebaseRequest(req, res))) return;

      const model = String(req.body.model || deps.defaultModel);
      if (!deps.allowedModels.has(model)) return res.status(400).json({ error: 'Unsupported model.' });

      const cleanedMessages = deps.cleanMessages(req.body.messages);
      if (!cleanedMessages.length) return res.status(400).json({ error: 'No valid messages.' });

      const useStreaming = req.body.stream === true || req.headers.accept === 'text/event-stream';
      const temperature = clampNumber(req.body.temperature, 0.7, 0, 1);
      const maxTokens = clampNumber(req.body.max_tokens, deps.defaultMaxTokens || 2600, 64, 7992);
      const mode = String(req.body.mode || '');
      const routingDecision = req.body.routingDecision || null;
      const useTools = req.body.useTools !== false;

      const ip = deps.getClientIp ? deps.getClientIp(req) : '';
      const lang = lastUserLanguage(cleanedMessages);

      const [usageOk, geo] = await Promise.all([
        deps.enforceDailyUsage(req, res),
        deps.lookupClientGeo ? resolveGeoFast(ip, deps.lookupClientGeo, 1200) : Promise.resolve(null)
      ]);
      if (!usageOk) return;

      // Cache lookup (mode + language + coarse country bucket aware)
      const countryBucket = (geo && geo.countryCode) || (geoCacheGet(ip)?.countryCode) || 'na';
      const cacheKey = (deps.stableCacheKey && deps.memoryCaches?.completions)
        ? deps.stableCacheKey('chat', [model, mode || 'default', lang, countryBucket, JSON.stringify(cleanedMessages.slice(-3))].join('|'))
        : null;
      if (cacheKey && deps.cacheGet) {
        const cached = deps.cacheGet(deps.memoryCaches.completions, cacheKey);
        if (cached) return sendCachedResponse(res, cached, useStreaming);
      }

      let timeZone = (geo && geo.timezone) || 'Asia/Amman';
      let locationText = (geo && (`${geo.city || ''}, ${geo.country || ''}`.replace(/^,\s*|,\s*$/g, ''))) || (geoCacheGet(ip) && `${geoCacheGet(ip).city || ''}, ${geoCacheGet(ip).country || ''}`.replace(/^,\s*|,\s*$/g, '')) || 'Amman, Jordan';

      const now = new Date();
      const localTimeString = now.toLocaleString('ar-JO', { timeZone, dateStyle: 'full', timeStyle: 'short' });
      const runtimeLine = `${localTimeString} (الموقع التقريبي: ${locationText}، المنطقة الزمنية: ${timeZone})`;

      const userMessages = trimForChat(cleanedMessages.filter(m => m.role !== 'system'));
      const clientSystemMessages = cleanedMessages.filter(m => m.role === 'system').slice(0, 2);
      const needs = detectNeeds(userMessages.map(m => (typeof m.content === 'string' ? m.content : '')).join('\n'));

      // Modular server-side system prompt (mode + need overlays, ~3k tokens
      // instead of the full 12k monolith). Falls back to the legacy full
      // prompt if no builder was injected (evals/older wiring).
      let systemPrompt;
      if (typeof deps.buildChatSystemPrompt === 'function') {
        systemPrompt = deps.buildChatSystemPrompt({ mode, needs, runtimeLine });
      } else if (deps.fullSystemPrompt) {
        systemPrompt = String(deps.fullSystemPrompt)
          .replace(/\{\{current_datetime\}\}/g, `${localTimeString} (الموقع الجغرافي: ${locationText}, المنطقة الزمنية: ${timeZone})`);
      }

      const systemMessages = [];
      if (systemPrompt) systemMessages.push({ role: 'system', content: systemPrompt });
      systemMessages.push(...clientSystemMessages);

      let builtMessages = [...systemMessages, ...userMessages];
      builtMessages = addContextContinuitySystemHint(builtMessages);
      if (needs.search === false) builtMessages = addCalculatorSystemHint(builtMessages);
      if (routingDecision) builtMessages = addRouterSystemHint(builtMessages, routingDecision);

      const writeChunk = (text) => {
        if (responseFinished) return;
        res.write(`event: chunk\ndata: ${JSON.stringify({ text: sanitizeMathNotation(String(text || '')) })}\n\n`);
      };

      const writeReasoning = (text) => {
        if (responseFinished) return;
        res.write(`event: reasoning\ndata: ${JSON.stringify({ text: String(text || '') })}\n\n`);
      };

      const writeToolCall = (info) => {
        if (responseFinished) return;
        res.write(`event: tool_call\ndata: ${JSON.stringify(info || {})}\n\n`);
      };

      if (useStreaming) sseHeaders(res);

      const ai = await deps.routingEngine.callAgent({
        agentType: 'chat',
        model,
        messages: builtMessages,
        temperature,
        max_tokens: maxTokens,
        useTools,
        mode,
        routingDecision,
        signal: clientAbort.signal,
        onChunk: useStreaming ? writeChunk : undefined,
        onReasoning: useStreaming ? writeReasoning : undefined,
        onToolCall: useStreaming ? writeToolCall : undefined
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

      // Real finish_reason is now captured for streamed calls too, so
      // truncation continuation actually works (one bounded pass max).
      const finalAi = await deps.routingEngine.completeIfTruncated({
        ai,
        model,
        messages: builtMessages,
        temperature,
        max_tokens: maxTokens,
        useTools,
        mode,
        maxPasses: 1,
        signal: clientAbort.signal,
        onChunk: useStreaming ? writeChunk : undefined
      });
      const cleanAnswer = sanitizeMathNotation(String(finalAi.answer || ''));

      if (cacheKey && deps.cacheSet && cleanAnswer) {
        deps.cacheSet(deps.memoryCaches.completions, cacheKey, {
          answer: cleanAnswer,
          provider: finalAi.provider,
          model: finalAi.model,
          continued: finalAi.continued || false,
          toolsUsed: finalAi.toolsUsed || []
        }, 15 * 60 * 1000, 120);
      }

      responseFinished = true;
      if (useStreaming) {
        res.write(`event: done\ndata: ${JSON.stringify({ provider: finalAi.provider, model: finalAi.model, toolsUsed: finalAi.toolsUsed || [], continued: finalAi.continued || false })}\n\n`);
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
      responseFinished = true;
      if (err && err.name === 'ClientAbortError') {
        try { res.end(); } catch (_) {}
        return;
      }
      console.error('[chat] error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
      else try { res.end(); } catch (_) {}
    }
  });
}

module.exports = { registerChatRoutes };

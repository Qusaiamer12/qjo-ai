// Server-sent events plumbing for the chat route.
'use strict';

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform, private');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none');
  res.flushHeaders();
  // Bypass Render/Cloudflare/Nginx proxy buffering by immediately sending 2KB padding comment.
  // This forces reverse proxies to enter instant unbuffered pass-through mode!
  res.write(': ' + ' '.repeat(2048) + '\n\n');
  if (typeof res.flush === 'function') res.flush();
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

// A comment frame every few seconds while the answer is being prepared.
//
// A search, a slow provider and a tool round can each keep the stream silent
// for tens of seconds, and silence is indistinguishable from a dead
// connection: proxies time idle streams out, and the page could not tell
// "still working" from "gone". Comment lines carry no data, so the client's
// parser drops them; they exist only so that bytes keep moving. The client
// treats a long gap with no bytes at all as a stall, and this is what keeps a
// healthy slow answer from ever looking like one.
const HEARTBEAT_MS = 10000;

/**
 * @param {import('http').ServerResponse} res
 * @param {number} [intervalMs]
 * @returns {() => void} stop
 */
function startHeartbeat(res, intervalMs = HEARTBEAT_MS) {
  const timer = setInterval(() => {
    if (res.writableEnded || res.destroyed) { clearInterval(timer); return; }
    res.write(': keep-alive\n\n');
    // @ts-ignore — flush() is added by the compression middleware.
    if (typeof res.flush === 'function') res.flush();
  }, Math.max(50, intervalMs || HEARTBEAT_MS));
  if (typeof timer.unref === 'function') timer.unref();
  const stop = () => clearInterval(timer);
  res.on('close', stop);
  res.on('finish', stop);
  return stop;
}

module.exports = { sseHeaders, sendCachedResponse, startHeartbeat, HEARTBEAT_MS };

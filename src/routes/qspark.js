const { sanitizeMathNotation } = require('../services/textSanitizer');
const path = require('path');

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.min(Math.max(safe, min), max);
}

const MAX_EXTRACTED_CHARS = 60000;

async function extractFileText(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();

  try {
    if (ext === '.pdf' || mime === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(file.buffer);
      return { ok: true, text: String(data.text || '').slice(0, MAX_EXTRACTED_CHARS), pages: data.numpages };
    }
    if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return { ok: true, text: String(result.value || '').slice(0, MAX_EXTRACTED_CHARS) };
    }
    if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json' || mime.startsWith('text/')) {
      return { ok: true, text: file.buffer.toString('utf8').slice(0, MAX_EXTRACTED_CHARS) };
    }
    if (mime.startsWith('image/')) {
      return {
        ok: true,
        text: '',
        image: { mimeType: file.mimetype, data: file.buffer.toString('base64') }
      };
    }
    return { ok: false, error: `Unsupported file type: ${ext || mime || 'unknown'}` };
  } catch (error) {
    return { ok: false, error: `Could not read ${file.originalname}: ${error.message}` };
  }
}

function registerQSparkRoutes(app, deps) {
  if (!deps?.routingEngine) throw new Error('registerQSparkRoutes missing router');
  if (!deps?.cleanMessages) throw new Error('registerQSparkRoutes missing cleanMessages');
  if (!deps?.uploadMiddleware) throw new Error('registerQSparkRoutes missing uploadMiddleware');
  if (!deps?.verifyFirebaseRequest) throw new Error('registerQSparkRoutes missing verifyFirebaseRequest');

  // Auth gate for every Q-Spark endpoint EXCEPT /health (a public liveness
  // probe that leaks no user data). Previously verifyFirebaseRequest was
  // injected but never called, so /chat and /upload were reachable by anyone
  // even with REQUIRE_FIREBASE_AUTH=true — burning QSPARK_* provider credit.
  app.use('/api/qspark', async (req, res, next) => {
    if (req.path === '/health') return next();
    if (!(await deps.verifyFirebaseRequest(req, res))) return;
    next();
  });

  app.get('/api/qspark/health', (_, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      separateKeys: true,
      note: 'Q-Spark uses QSPARK_* environment variables only. It does not fall back to Qjo provider keys.',
      keysConfigured: deps.keys,
      models: deps.models
    });
  });

  // Accepts up to 8 files, extracts their text content (PDF/Word/text) or
  // base64-encodes images, and returns it so the client can attach it to
  // the next /api/qspark/chat call as context.
  app.post('/api/qspark/upload', deps.uploadMiddleware.array('files', 8), async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'No files uploaded.' });
      const results = [];
      for (const file of files) {
        const extracted = await extractFileText(file);
        results.push({ name: file.originalname, size: file.size, ...extracted });
      }
      res.json({ ok: true, files: results });
    } catch (error) {
      res.status(500).json({ error: error.message || 'File upload failed.' });
    }
  });

  app.post('/api/qspark/chat', async (req, res) => {
    try {
      let messages = deps.cleanMessages(req.body.messages || []);
      if (!messages.length) return res.status(400).json({ error: 'No valid messages.' });

      // Attached files: [{ name, text }] extracted by /api/qspark/upload and
      // forwarded by the client alongside the chat request.
      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments.slice(0, 8) : [];
      if (attachments.length) {
        const context = attachments
          .filter(a => a && a.text)
          .map(a => `--- File: ${String(a.name || 'file').slice(0, 200)} ---\n${String(a.text || '').slice(0, MAX_EXTRACTED_CHARS)}`)
          .join('\n\n');
        if (context) {
          const attachmentSystemMessage = {
            role: 'system',
            content: `The user attached files. Use their content to answer accurately and cite the file name when relevant. Do not invent content that isn't present.\n\n${context}`
          };
          messages = messages[0]?.role === 'system'
            ? [messages[0], attachmentSystemMessage, ...messages.slice(1)]
            : [attachmentSystemMessage, ...messages];
        }
      }
      if (deps.fullSystemPrompt) {
        const renderedSystemPrompt = String(deps.fullSystemPrompt).replace(/\{\{current_datetime\}\}/g, new Date().toISOString());
        messages = messages[0]?.role === 'system'
          ? [{ role: 'system', content: `${renderedSystemPrompt}\n\n${messages[0].content}` }, ...messages.slice(1)]
          : [{ role: 'system', content: renderedSystemPrompt }, ...messages];
      }

      const temperature = clampNumber(req.body.temperature || 0.15, 0.15, 0, 1);
      // Groq (one of the selectable Q-Spark providers) hard-caps completion
      // tokens at 8192 for llama-3.3-70b-versatile. Requesting more makes
      // Groq reject the call with a 400 instead of returning more text, so
      // we keep the ceiling here at the safe shared maximum.
      const max_tokens = clampNumber(req.body.max_tokens || 3000, 3000, 128, 7992);
      const result = await deps.routingEngine.callAgent({ agentType: 'qspark', qsparkProvider: req.body.provider || 'nvidia', messages,
        temperature,
        max_tokens
      });
      if (result.ok) return res.json({ answer: sanitizeMathNotation(result.answer), provider: result.provider, model: result.model, separateKeys: true });
      res.status(result.status || 503).json({ error: result.error || 'No Q-Spark provider is configured. Add QSPARK_* keys in Render.', separateKeys: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message || 'Q-Spark chat failed.', separateKeys: true });
    }
  });
}

module.exports = { registerQSparkRoutes };

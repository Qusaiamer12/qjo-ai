// Which model replaces one a provider has retired.
//
// Providers shut model IDs down on a date (console.groq.com/docs/deprecations)
// and an old setting keeps naming them: GROQ_VISION_MODEL was set to Llama 4
// Scout long after Groq stopped serving it on 2026-07-17, and every picture
// sent to it came back "does not exist" — the owner's phone showed
// [groq:413, groq:413, llm7:429, groq:404]. A retired ID is replaced before it
// is sent (llmService), and the server names the model really in use
// (server.js), so /api/status does not report one that answers nothing.
'use strict';

const RETIRED = {
  // Groq, 2026-08-16: the Llama 3 text line.
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama3-70b-8192': 'openai/gpt-oss-120b',
  'llama3-8b-8192': 'openai/gpt-oss-20b',
  'gemma2-9b-it': 'openai/gpt-oss-20b',
  'mixtral-8x7b-32768': 'openai/gpt-oss-120b',
  // Groq, 2026-07-17 and 2026-09-14: the models that could see. Qwen 3.8 27B
  // is the one Groq's free tier serves now, at 8,000 tokens a minute.
  'meta-llama/llama-4-scout-17b-16e-instruct': 'qwen/qwen3.8-27b',
  'meta-llama/llama-4-maverick-17b-128e-instruct': 'qwen/qwen3.8-27b',
  'qwen/qwen3-32b': 'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b': 'qwen/qwen3.8-27b',
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-1.5-flash-8b': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash-lite': 'gemini-3.8-flash',
  'kimi-k2-0711-preview': 'kimi-k2.6',
  'kimi-k2-0905-preview': 'kimi-k2.6',
  'kimi-k2-turbo-preview': 'kimi-k2.6',
  'kimi-k2-thinking': 'kimi-k2.6',
  'meta/llama-3.1-70b-instruct': 'meta/llama-3.3-70b-instruct',
  'gpt-oss': 'minimax-m2.7'
};

/** The replacement for a retired model, or null when it is not retired. @param {string} model */
function migratedModel(model) {
  return RETIRED[model] || null;
}

/** The model that will actually be asked: the replacement when this one is retired. @param {string} model */
function currentModel(model) {
  return migratedModel(model) || model;
}

module.exports = { RETIRED, migratedModel, currentModel };

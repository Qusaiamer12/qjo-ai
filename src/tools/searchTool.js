const { z } = require('zod');

const SearchQuerySchema = z.string()
  .trim()
  .min(2)
  .max(180)
  .refine(q => !/(ignore previous instructions|system prompt|developer message|تجاهل\s+كل\s+التعليمات|تعليمات\s+النظام)/i.test(q), {
    message: 'Search query contains prompt-control text and must be distilled first.'
  });

const SearchQueriesSchema = z.array(SearchQuerySchema)
  .min(1)
  .max(3)
  .describe('1 to 3 precise distilled search queries. Never pass the whole user prompt.');

const SearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(800),
  originalQuestion: z.string().trim().max(1200).optional()
});

const DeepSearchRequestSchema = z.object({
  question: z.string().trim().max(1200).optional(),
  query: z.string().trim().max(1200).optional(),
  originalQuestion: z.string().trim().max(1600).optional()
}).refine(v => Boolean((v.question || v.query || '').trim()), {
  message: 'Missing search question.'
});

function validateSearchQueries(raw) {
  const parsed = SearchQueriesSchema.safeParse(raw);
  if (!parsed.success) {
    const err = new Error(parsed.error.issues?.[0]?.message || 'Invalid search queries.');
    err.statusCode = 400;
    throw err;
  }
  return parsed.data;
}

function parseSearchRequest(body) {
  const parsed = SearchRequestSchema.safeParse(body || {});
  if (!parsed.success) {
    const err = new Error(parsed.error.issues?.[0]?.message || 'Missing search query.');
    err.statusCode = 400;
    throw err;
  }
  return parsed.data;
}

function parseDeepSearchRequest(body) {
  const parsed = DeepSearchRequestSchema.safeParse(body || {});
  if (!parsed.success) {
    const err = new Error(parsed.error.issues?.[0]?.message || 'Missing search question.');
    err.statusCode = 400;
    throw err;
  }
  return parsed.data;
}

// Function-calling schema so the model itself decides when it needs current
// information, instead of relying only on the client's regex-based
// pre-search heuristic (which inevitably misses phrasings it wasn't written
// for). Given directly to Groq/Qwen/Kimi/Nvidia's tools param.
const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the live web for current information (news, prices, recent events, facts you are not sure about or that may have changed). Use this whenever the answer depends on up-to-date or verifiable information you cannot be certain of from memory alone.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A short, precise search query distilled from the user question (not the whole message).' }
      },
      required: ['query']
    }
  }
};

module.exports = {
  SearchQuerySchema,
  SearchQueriesSchema,
  SearchRequestSchema,
  DeepSearchRequestSchema,
  validateSearchQueries,
  parseSearchRequest,
  parseDeepSearchRequest,
  WEB_SEARCH_TOOL
};

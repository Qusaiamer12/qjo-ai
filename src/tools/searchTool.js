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
// for). Given directly to Groq/LLM7/Qwen/Kimi's tools param.
const WEB_SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'web_search',
    description: [
      'Search the live web. This is the ONLY way you can know anything that changed after your training data.',
      '',
      'Use it when the honest answer depends on the present: current prices, rates or availability; who currently holds a position; today or this week\'s news; scores, results and fixtures; the latest version, release or pricing of a product; population, statistics or rankings that get revised; weather; anything the user marks as now, today, currently, latest or newest; and any specific fact you would otherwise be stating from memory and could be wrong about.',
      '',
      'Do not use it for things that do not change: explaining a concept, writing or reviewing code, translating, summarising or reformatting text the user gave you, arithmetic, creative writing, or your own opinion. Searching those wastes seconds and adds nothing.',
      '',
      'When in doubt about a specific verifiable fact, search. Being slightly slower is much better than being confidently out of date.'
    ].join('\n'),
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

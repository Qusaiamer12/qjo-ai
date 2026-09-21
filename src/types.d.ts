// Shared shapes, declared once.
//
// These are not new abstractions — they describe conventions the code already
// follows. Writing them down means the compiler enforces them and a reader can
// find the contract without grepping for call sites.

/**
 * Errors carry an HTTP status so a route can translate a failure from any
 * depth into the right response without a mapping table. Thrown with
 * `Object.assign(new Error(...), { statusCode })`.
 */
interface Error {
  statusCode?: number;
}

/** One turn in a model conversation. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_call_id?: string;
  tool_calls?: Array<ToolCall>;
  name?: string;
}

/** A model's request to run a tool. */
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** What every provider call resolves to, successful or not. */
interface ProviderResult {
  ok: boolean;
  answer?: string;
  provider?: string;
  model?: string;
  finish_reason?: string;
  status?: number;
  error?: string;
  streamed?: boolean;
  message?: ChatMessage;
  toolCalls?: ToolCall[];
  toolsUsed?: Array<{ tool: string; input?: string; [key: string]: unknown }>;
  /** Set when the provider rejected the request itself rather than failing. */
  requestFault?: boolean;
  /** Set when the rejection was specifically about prompt length. */
  contextLengthExceeded?: boolean;
}

/** One search result as it reaches ranking and the model. */
interface SearchResult {
  id?: number;
  title?: string;
  url: string;
  content?: string;
  score?: number;
  publishedDate?: string;
  published_date?: string;
  /** True when the full page was extracted rather than just a snippet. */
  firecrawl?: boolean;
  extractedContent?: string;
}

/** A long task as it is stored between steps. */
interface AgentTask {
  id: string;
  uid: string | null;
  goal: string;
  kind: 'general' | 'code';
  mode: string;
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'paused';
  step: number;
  plan: Array<{ title: string; status: 'pending' | 'active' | 'done' }>;
  history: Array<{ role: string; content: string }>;
  workspace: Record<string, string>;
  trace?: Array<{ tool: string; input: string; output: string }>;
  toolsUsed: Array<object>;
  result: string | null;
  error: string | null;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

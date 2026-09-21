// Fixes a very common LLM output defect: "styled" Unicode math letters
// (𝑥, 𝒚, 𝐀𝐁𝐂, 𝟏𝟐𝟑 ...) from the Mathematical Alphanumeric Symbols block
// (U+1D400–U+1D7FF). Many fonts — including Word's defaults — don't have
// glyphs for these, so they render as broken boxes ("tofu") once pasted
// outside the chat UI. Unicode defines a compatibility decomposition for
// every character in this block back to the plain ASCII letter/digit it
// represents, so NFKD normalization on just this range recovers clean,
// portable text without touching anything else (real formatting, RTL
// Arabic, punctuation, etc. are left untouched).
function sanitizeMathUnicode(text) {
  return String(text || '').replace(/[\u{1D400}-\u{1D7FF}]/gu, ch => ch.normalize('NFKD') || ch);
}

// Strips accidental meta-prompt or upstream proxy thought leakages
// (e.g. 'User says "..." which is Arabic slang meaning "..." According to developer instruction: reply briefly... So respond in Arabic: "..."'):
function sanitizeThoughtLeakage(text) {
  let s = String(text || '');
  s = s.replace(/^User(?:\s+says)?\s*["'][^"']*["'][^]*?(?:According to developer instruction|So respond in Arabic|We should respond)[^:]*:\s*["']?/i, '');
  s = s.replace(/^User:\s*["'][^"']*["'][^]*?(?:We should respond|Let's respond|as ChatGPT)[^]*?(?:\n\n|:\s*["']?)/i, '');
  if (s.endsWith('"') && !s.slice(0, -1).includes('"')) s = s.slice(0, -1);
  return s.trim();
}

// Character-level normalisation only: every transform here maps one character
// to another and is safe to apply to an arbitrary fragment of a message.
function normalizeGlyphs(text) {
  return sanitizeMathUnicode(text)
    // U+2044 FRACTION SLASH ("1⁄2") often looks broken outside the chat UI —
    // a plain slash is universally safe and just as readable.
    .replace(/\u2044/g, '/');
}

// For a single streamed chunk.
//
// This MUST NOT trim or run the leakage regexes. A chunk is a fragment, not a
// message: trimming it deletes the space between the token that ended one chunk
// and the token that starts the next, which glued every word in every streamed
// answer together ("أهلاًياقلبي" instead of "أهلاً يا قلبي"). The leakage
// patterns are anchored with ^ and describe a whole message, so matching them
// against a mid-message fragment is meaningless and can only misfire.
function sanitizeStreamChunk(text) {
  return normalizeGlyphs(String(text || ''));
}

// For a complete message. Leakage stripping and the final trim belong here,
// where "the start of the text" actually is the start of the message.
function sanitizeMathNotation(text) {
  return normalizeGlyphs(sanitizeThoughtLeakage(text));
}

module.exports = {
  sanitizeMathUnicode,
  sanitizeMathNotation,
  sanitizeStreamChunk,
  sanitizeThoughtLeakage,
  createStreamSanitizer
};


// Streaming needs the leakage stripping too, but the patterns above are
// anchored to the start of a message and a stream arrives as fragments. Running
// them per-chunk (what this module used to do) could never match — a leak spans
// far more text than one chunk carries — while the trim that came with them
// deleted the space between chunks.
//
// So: watch only the opening. A leak always begins with the literal word
// "User", which a single character is usually enough to rule out, and once
// ruled out the rest of the stream is passed straight through with no buffering
// and no added latency. Only text that genuinely opens with "User" is held
// back, and only until the leak completes or the cap is reached.
const LEAK_HEAD_MAX = 600;

function stripLeakOpening(text) {
  let s = String(text || '').replace(/^\s+/, '');
  s = s.replace(/^User(?:\s+says)?\s*["'][^"']*["'][^]*?(?:According to developer instruction|So respond in Arabic|We should respond)[^:]*:\s*["']?/i, '');
  s = s.replace(/^User:\s*["'][^"']*["'][^]*?(?:We should respond|Let's respond|as ChatGPT)[^]*?(?:\n\n|:\s*["']?)/i, '');
  return s;
}

function createStreamSanitizer() {
  let head = '';
  let watching = true;

  // Returns the text to emit right now, which may be empty while the opening
  // is still undecided.
  function push(text) {
    const chunk = String(text || '');
    if (!watching) return normalizeGlyphs(chunk);

    head += chunk;
    const trimmed = head.replace(/^\s+/, '');
    if (!trimmed) return '';

    // Can this still become the word "User"? Almost always no, on the very
    // first character, and then we never buffer again.
    const probe = trimmed.slice(0, 4).toLowerCase();
    if (!'user'.startsWith(probe)) {
      watching = false;
      const out = head;
      head = '';
      return normalizeGlyphs(out);
    }

    // It opens with "User". Hold until the leak resolves or the cap is hit.
    if (trimmed.length >= 4) {
      const stripped = stripLeakOpening(head);
      if (stripped !== trimmed) {
        watching = false;
        head = '';
        return normalizeGlyphs(stripped);
      }
      if (head.length >= LEAK_HEAD_MAX) {
        watching = false;
        const out = head;
        head = '';
        return normalizeGlyphs(out);
      }
    }
    return '';
  }

  // Whatever is still held when the stream ends. Always call this before the
  // done event, or a reply short enough to never leave the head is lost.
  function flush() {
    if (!head) return '';
    const out = stripLeakOpening(head);
    head = '';
    watching = false;
    return normalizeGlyphs(out);
  }

  return { push, flush };
}


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

// A couple of other frequent LLM math-notation glitches worth normalizing
// at the same time, since they come from the same underlying problem
// (the model reaching for a "fancier-looking" glyph instead of plain text):
function sanitizeMathNotation(text) {
  return sanitizeMathUnicode(text)
    // U+2044 FRACTION SLASH ("1⁄2") often looks broken outside the chat UI —
    // a plain slash is universally safe and just as readable.
    .replace(/\u2044/g, '/');
}

module.exports = { sanitizeMathUnicode, sanitizeMathNotation };

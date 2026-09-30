/**
 * How an attached image is sent: how large, in which format, and what to try
 * next when it is still too big.
 *
 * Every image used to be scaled to 1600 px on its long side and kept in its
 * own format. A phone screenshot of a textbook page (1170 × 2532) arrived 739
 * px wide, small print too blurred to read; a photo saved as PNG came out at
 * several megabytes, over the 4 MB Groq accepts for one image, so the vision
 * model refused it and the question was answered without the picture. Nothing
 * checked the size of what was sent, or of several images together against
 * the 8 MB request the server accepts.
 *
 * Pure: numbers in, a list of encodings out. public/ui/imagePrep.js draws and
 * measures them.
 */
(function () {
  'use strict';

  const LIMITS = {
    // Enough for small print on a photographed page. Groq reads up to 33
    // megapixels; past this a phone photo only gets heavier.
    maxSide: 2048,
    // Groq refuses a base64 image over 4 MB; this is the data URL's length.
    maxImageChars: 3_600_000,
    // All images of one message together, under the server's 8 MB request
    // with room left for the conversation and the prompt.
    maxMessageChars: 6_000_000,
    // What Groq accepts in one request.
    maxImages: 5
  };

  /**
   * @typedef {{ width: number, height: number, format: 'image/png' | 'image/jpeg', quality?: number }} Encoding
   */

  function fit(width, height, side) {
    const scale = Math.min(1, side / Math.max(width, height, 1));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  /**
   * The encodings to try, best first: the first whose data URL fits the cap
   * is the one sent. A PNG is tried as PNG first — text on a flat background
   * is smaller and sharper that way — then as JPEG, then smaller.
   * @param {{ width: number, height: number, type?: string }} image
   * @returns {Encoding[]}
   */
  function encodings({ width, height, type }) {
    const full = fit(width, height, LIMITS.maxSide);
    const steps = [];
    if (type === 'image/png') steps.push({ ...full, format: 'image/png' });
    steps.push({ ...full, format: 'image/jpeg', quality: 0.9 });
    steps.push({ ...full, format: 'image/jpeg', quality: 0.8 });
    for (const [side, quality] of [[1600, 0.8], [1280, 0.75], [1024, 0.7]]) {
      if (Math.max(full.width, full.height) > side) steps.push({ ...fit(width, height, side), format: 'image/jpeg', quality });
    }
    return steps;
  }

  /**
   * The largest data URL one image may be, when a message carries `count`.
   * @param {number} count
   */
  function capPerImage(count) {
    return Math.min(LIMITS.maxImageChars, Math.floor(LIMITS.maxMessageChars / Math.max(1, count)));
  }

  const api = { LIMITS, encodings, capPerImage };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.imagePlan = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

/**
 * The person's images, referred to by id instead of sent as pixels when no
 * one needs to look at them.
 *
 * "Put my photo in my CV and make it a PDF" sent the photo to the vision
 * model — thousands of tokens of image, the model that cannot use tools and
 * writes worse than the text one, and an instruction telling it to analyse
 * the picture — and then could not do it anyway: a model cannot type an
 * image, and the PDF was made from the answer's text alone.
 *
 * Now an attached image has an id. A message that only wants it placed
 * somewhere sends the model a line saying the image exists and how to place
 * it — ![a description](attachment:k7f2q9) — and no pixels; the page shows
 * the image there, and every file it exports carries it. A message that asks
 * about the image still sends it, with the same line, so what was looked at
 * can be placed too.
 *
 * Pure: text in, text out.
 */
(function () {
  'use strict';

  const AR = '(?<![\\u0600-\\u06FF])';
  const AR_END = '(?![\\u0600-\\u06FF])';
  // Putting the image somewhere: a verb that places it...
  const PLACE = new RegExp(`\\b(?:put|add|insert|place|include|use|embed|attach|stick)\\b|${AR}(?:حط|حطلي|حطها|حطيها|حطه|ضيف|ضيفها|ضيفلي|أضف|اضف|أضيف|اضيف|ادمج|دمج|ادمجها|استخدم|استعمل|ركب|ركّب|ضع|ضعها|حطّ)${AR_END}`, 'i');
  // ...into something being made.
  const INTO = new RegExp(`\\b(?:cv|resume|résumé|document|doc|docx|pdf|word|page|website|site|header|cover|poster|report|slides?|presentation|card|letter|email|profile|portfolio|flyer|invitation)\\b|${AR}(?:ب|بال|في|على|عال|لل|ع)?(?:ال)?(?:سيفي|سي\\s?في|سيرة|سيرتي|ملف|مستند|وورد|بي\\s?دي\\s?اف|موقع|صفحة|غلاف|بوستر|تقرير|شريحة|عرض|بطاقة|رسالة|ايميل|إيميل|بروفايل|دعوة|إعلان|اعلان)`, 'i');
  // Asking about it means someone has to look.
  const LOOK = new RegExp(`\\b(?:describe|analy[sz]e|read|extract|solve|translate|transcribe|ocr|rate|review|identify|recogni[sz]e|caption|what(?:'s|\\s+is)\\s+in|explain)\\b|${AR}(?:صف|وصف|اوصف|أوصف|حلل|حلّل|اقرأ|اقرا|استخرج|ترجم|انسخ|قيّم|قيم|اشرح|حل|حلي|حلها)${AR_END}|شو\\s+(?:في|مكتوب|هاد|هاي|بالصورة)|ما\\s+(?:هذا|هذه|المكتوب)`, 'i');

  /**
   * Whether a message, sent with images, only wants them placed in something
   * — so no one needs to see them.
   * @param {string} text
   */
  function placesAttachment(text) {
    const value = String(text || '');
    return PLACE.test(value) && INTO.test(value) && !LOOK.test(value);
  }

  /**
   * What the model is told about the images: their ids, and how to place
   * them. `shown` when the pixels go with it.
   * @param {Array<{id: string, name?: string}>} images
   * @param {{shown?: boolean}} [options]
   */
  function referenceNote(images, { shown = false } = {}) {
    const list = (images || []).filter((image) => image && /^[a-z0-9]{4,16}$/.test(image.id));
    if (!list.length) return '';
    const named = list.map((image) => `"${String(image.name || 'image').replace(/["\n\]]/g, '').slice(0, 60)}" (id ${image.id})`).join(', ');
    const example = `![a short description](attachment:${list[0].id})`;
    return shown
      ? `[The attached image${list.length > 1 ? 's are' : ' is'} ${named}. To place one in what you write, put ${example} on its own line where it belongs.]`
      : `[Attached by the person and kept by the page — not shown to you: ${named}. To place one in what you write, put ${example} on its own line where it belongs; the page, and every file it exports, shows the image there. Do not say you cannot add images.]`;
  }

  const REFERENCE = /!\[([^\]\n]{0,200})\]\(attachment:([a-z0-9]{4,16})\)/gi;

  /** The ids an answer refers to. @param {string} markdown */
  function referencedIds(markdown) {
    return [...String(markdown || '').matchAll(REFERENCE)].map((m) => m[2].toLowerCase());
  }

  const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
  /** Whether a value is an image as base64 data, and nothing else. */
  function isImageDataUrl(url) {
    return typeof url === 'string' && IMAGE_DATA_URL.test(url);
  }

  const api = { placesAttachment, referenceNote, referencedIds, isImageDataUrl };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.attachmentRefs = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

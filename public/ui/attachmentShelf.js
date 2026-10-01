/**
 * The person's images for this session, each with an id the answer can use
 * to place it (public/domain/attachmentRefs.js).
 *
 * An image used to exist only for the one request it went out with. Kept
 * here, an answer can put it in a CV, the page shows it there, and an export
 * carries it into the PDF or Word file. Only the page holds the pixels; the
 * model is sent them only when it has to look.
 */
(function (global) {
  'use strict';

  const ANALYSE = {
    ar: '\n\nحلّل الصورة/الصور المرفقة مباشرة وبالعربية. المطلوب: تحليل سريع ودقيق جدًا بمستوى منتج AI عالمي. ابدأ بالخلاصة فورًا، ثم اذكر التفاصيل المهمة فقط. لا تستخدم قالبًا طويلًا ولا حشوًا. استخرج النص المقروء بدقة. فرّق بين ما تراه فعليًا وبين الاستنتاج. إذا كانت الصورة تصميمًا/واجهة/شعارًا، قيّم التركيب، الألوان، الوضوح، التسلسل البصري، الاحترافية، والمشاكل العملية. أعطِ تحسينات محددة وقابلة للتنفيذ. لا ترد بالإنجليزية إلا إذا طلب المستخدم ذلك.',
    en: '\n\nAnalyze the attached image(s) directly in the user language. Be fast, highly precise, and high-signal like a top-tier AI product. Start with the answer, then provide only the most important details. Avoid boilerplate and filler. Extract readable text accurately. Separate visible facts from interpretation. For design/UI/logo images, evaluate composition, colors, clarity, visual hierarchy, polish, and practical issues. Give specific actionable improvements.'
  };

  /**
   * @param {{maxImages: number, replyLanguage: (text: string) => string, t: (key: string) => string}} deps
   */
  function createAttachmentShelf({ maxImages, replyLanguage, t }) {
    const refs = global.QjoDomain.attachmentRefs;
    /** @type {Map<string, {name: string, dataUrl: string}>} */
    const kept = new Map();
    const newId = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

    /** The images among these attachments, each kept under an id. */
    function keep(items) {
      return (items || []).filter((item) => item && String(item.type || '').startsWith('image/') && item.dataUrl).slice(0, maxImages).map((item) => {
        if (!item.ref) {
          item.ref = newId();
          kept.set(item.ref, { name: item.name || 'image', dataUrl: item.dataUrl });
        }
        return { id: item.ref, name: item.name || 'image', dataUrl: item.dataUrl };
      });
    }

    /**
     * What the newest message sends: the images themselves only when someone
     * has to look at them; their ids either way.
     * @param {string} text the message, with any search context
     * @param {string} attachmentContext text read from attached files
     * @param {any[]} items the attachments
     * @param {boolean} placing the message only places them (attachmentRefs.placesAttachment)
     * @returns {string | Array<object>}
     */
    function requestContent(text, attachmentContext, items, placing) {
      const images = keep(items);
      const combined = text + attachmentContext;
      if (!images.length) return combined;
      if (placing) return `${combined}\n\n${refs.referenceNote(images)}`;
      const analyse = replyLanguage(combined) === 'ar' ? ANALYSE.ar : ANALYSE.en;
      return [
        { type: 'text', text: `${combined}${analyse}\n\n${refs.referenceNote(images, { shown: true })}` },
        ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))
      ];
    }

    /**
     * What the conversation keeps of them, for later messages and for the
     * person reopening it: whether they were looked at, and a short marker
     * with each id. The instruction itself went with the message it came with.
     * @param {any[]} items the attachments
     * @param {boolean} placing
     */
    function historyNote(items, placing) {
      const images = keep(items);
      if (!images.length) return '';
      const markers = images.map((image) => `[🖼️ ${String(image.name).replace(/[\]\n]/g, '').slice(0, 60)} · attachment:${image.id}]`).join(' ');
      return `\n\n${placing ? '' : `${t('imagesAnalyzedNote')} `}${markers}`;
    }

    /** The image data an answer refers to, for an export. */
    function imagesFor(markdown) {
      const out = {};
      for (const id of refs.referencedIds(markdown)) if (kept.has(id)) out[id] = kept.get(id).dataUrl;
      return out;
    }

    return { keep, requestContent, historyNote, imagesFor, get: (id) => (kept.has(id) ? kept.get(id).dataUrl : null) };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createAttachmentShelf = createAttachmentShelf;
})(window);

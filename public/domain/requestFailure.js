/**
 * Turns a failed chat request into what the user should be told, and whether
 * it is worth retrying on their behalf.
 *
 * Pure: an error in, a decision out. No DOM, no network, no state. That is the
 * point — this was a twelve-branch cascade buried inside a 588-line function,
 * where the only way to check that a 413 says something useful was to trigger a
 * 413 in a browser. Here every branch is a one-line test.
 *
 * Two properties matter and are easy to get wrong:
 *   - `transient` decides whether the page silently retries. Marking a
 *     definite failure transient burns a second generation for nothing;
 *     marking a transient one definite shows an error that would have
 *     resolved itself.
 *   - The message never claims to know something the page cannot know. An
 *     earlier version asserted "the service is ready now!", which sent people
 *     to press Retry against a service that was still down.
 */
(function (global) {
  'use strict';

  const MESSAGES = {
    ar: {
      aborted: 'تم إيقاف الطلب أو انتهت مهلته. حاول مرة أخرى.',
      empty: 'رجع رد فاضي من المزوّد. جاري إعادة المحاولة — إذا تكررت، جرّب صياغة السؤال بشكل مختلف.',
      tooLarge: 'المرفقات أو النص المُرسل أكبر من الحد المسموح. احذف بعض الملفات أو قسّم الطلب إلى أجزاء أصغر وأعد المحاولة.',
      backendMissing: 'خدمة الذكاء غير متصلة في هذه النسخة. شغّل نسخة الإنتاج عبر Node.js بدل فتح HTML فقط.',
      authRequired: 'يجب تسجيل الدخول قبل استخدام Qjo.',
      rateLimit: 'وصلنا لحد مزوّد الذكاء مؤقتًا. جرّب بعد قليل، أو استخدم رسالة أقصر.',
      providerPressure: 'مزودات الذكاء تحت ضغط حاليًا (وصلنا الحد المؤقت للطلبات). انتظر دقيقة وأعد المحاولة.',
      notConfigured: 'مزودات الذكاء غير مضبوطة على الخادم. يرجى ضبط المفاتيح في لوحة التحكم.',
      transient: 'الخادم ما استجاب للطلب (غالبًا كان نايم أو تحت ضغط). جرّب "إعادة المحاولة".',
      stalled: 'انقطع وصول الإجابة من الخادم قبل أن يبدأ الرد. جرّب "إعادة المحاولة".',
      generic: 'تعذر الاتصال بالخدمة حاليًا. يرجى المحاولة لاحقًا.',
      reasonLabel: 'السبب التقني: '
    }
  };

  /** Failures that resolve themselves, so the page retries once before speaking. */
  const TRANSIENT_PATTERN = /All AI providers failed|provider.*failed|upstream.*failed|service.*unavailable|503|502|504|SERVICE_FAILED|failed to fetch|network|empty answer/i;

  /** Long enough to be a stack trace rather than a reason. */
  const MAX_TECHNICAL_DETAIL = 200;

  /**
   * @param {{name?: string, message?: string, status?: number}} error
   * @param {{language?: string}} [options]
   * @returns {{message: string, transient: boolean, kind: string}}
   */
  function classifyRequestFailure(error, options = {}) {
    const copy = MESSAGES[options.language] || MESSAGES.ar;
    const name = String(error?.name || '');
    const message = String(error?.message || '');
    const status = Number(error?.status) || 0;

    // Definite failures first: each names something the user can act on, and
    // retrying an identical request cannot change any of them.
    if (name === 'AbortError') return { message: copy.aborted, transient: false, kind: 'aborted' };
    if (status === 413) return { message: copy.tooLarge, transient: false, kind: 'too-large' };
    if (message === 'AI_BACKEND_MISSING') return { message: copy.backendMissing, transient: false, kind: 'backend-missing' };
    if (message === 'AUTH_REQUIRED') return { message: copy.authRequired, transient: false, kind: 'auth-required' };
    if (message === 'RATE_LIMIT') return { message: copy.rateLimit, transient: false, kind: 'rate-limit' };
    if (/rate.?limit|429|too many requests/i.test(message)) {
      return { message: copy.providerPressure, transient: false, kind: 'rate-limit' };
    }
    if (/No provider configured|No AI provider is configured/i.test(message)) {
      return { message: copy.notConfigured, transient: false, kind: 'not-configured' };
    }

    // An empty answer is worth retrying precisely because nothing was
    // delivered — there is no half-answer on screen to lose.
    if (message === 'EMPTY_ANSWER') return { message: copy.empty, transient: true, kind: 'empty' };

    // The connection went silent past the keep-alive interval before a word
    // arrived. Nothing is on screen to lose, and a dropped connection is the
    // textbook case of something a second attempt fixes.
    if (message === 'STREAM_STALLED') return { message: copy.stalled, transient: true, kind: 'stalled' };

    if (TRANSIENT_PATTERN.test(message) || status >= 500) {
      let text = copy.transient;
      // The real reason, when it is short enough to read. Hiding it made
      // failures impossible to diagnose from the screen.
      const detail = message.trim();
      if (detail && detail.length < MAX_TECHNICAL_DETAIL) text += '\n\n' + copy.reasonLabel + detail;
      return { message: text, transient: true, kind: 'transient' };
    }

    return { message: copy.generic, transient: false, kind: 'unknown' };
  }

  const api = { classifyRequestFailure, TRANSIENT_PATTERN, MAX_TECHNICAL_DETAIL };

  // Usable from a browser script tag and from a Node test without a DOM.
  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.classifyRequestFailure = classifyRequestFailure;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

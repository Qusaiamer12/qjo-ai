/**
 * Sets the page's language and direction before it is painted.
 *
 * The markup is English and left-to-right. For someone whose page opens in
 * Arabic, waiting for app.js (deferred, the last script to run) meant a flash
 * of the whole layout mirrored the wrong way. This runs synchronously in the
 * head, right after public/domain/language.js, and uses the same decision the
 * app makes — so the two can never disagree about which language this is.
 *
 * If language.js did not load, it does nothing: the page stays English, and
 * boot.js reports the missing module.
 */
(function () {
  'use strict';
  try {
    var language = window.QjoDomain && window.QjoDomain.language;
    if (!language) return;
    var stored = null;
    try { stored = localStorage.getItem('qjo_language'); } catch (_) { /* storage blocked */ }
    var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    var lang = language.resolveInitialLanguage({ stored: stored, preferred: preferred });
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  } catch (_) { /* never block the page over a direction */ }
})();

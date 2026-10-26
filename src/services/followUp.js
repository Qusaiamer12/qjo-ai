// Whether a message works on the answer before it ("make it shorter",
// "ترجمه للإنجليزي", "كمان وحدة") rather than asking something new.
//
// The playbooks were chosen from the last two messages, so every new question
// kept the previous one's: after a website, "شو عاصمة اليابان؟" was sent with
// the website playbook and answered about the site. A playbook now carries
// over only to a message that refers back to the answer; a new question is
// judged on its own words.
'use strict';

// A short message, pointing at what came before: a verb on it ("make it",
// "translate this"), a comparative ("shorter", "more formal"), "again /
// another one" — or one that opens on the last answer: "and in Python?",
// "add March 7", "without eggplant", "وإذا ما راح؟", "طيب شو أعمل؟".
const EN_BACK = /\b(?:make|turn|put|translate|rewrite|change|fix|shorten|explain|summari[sz]e|redo|do|convert|simplify|expand|format|send|give)\s+(?:it|this|that|them|these|those)\b|\b(?:it|this|them)\s*[?.!]?$|\b(?:shorter|longer|simpler|clearer|briefer|more (?:formal|casual|detailed|professional|concise)|less (?:formal|casual)|again|another (?:one|version)|one more|instead|same (?:thing|but)|the (?:first|second|third|last|next|other) one|rewrite|redo|reword|rephrase|continue|go on|keep going|elaborate)\b/i;
const EN_OPENS = /^(?:and|but|now|also|then|so|ok(?:ay)?|what about|how about|what if|add|remove|delete|include|drop|without|with|instead|change|swap|plus|same)\b/i;
// Arabic: a verb carrying the answer as its object (خليه، اختصرها، ترجمه،
// اكتبه، عدلها، غيرو), a comparative, "again / another / the same", or an
// opening that continues ("و إذا", "طيب", "بس", "بدون", "زيد", "كمان").
const AR_VERB = '(?:خلي|خلّي|اكتب|أكتب|اعمل|إعمل|ترجم|اختصر|لخص|لخّص|عدل|عدّل|غير|غيّر|زبط|ظبط|صحح|صحّح|حسن|حسّن|طول|طوّل|قصر|قصّر|بسط|بسّط|رتب|رتّب|نسق|نسّق|حول|حوّل|كمل|كمّل|اعيد|أعد|اعد|وضح|وضّح|اشرح|فصل|فصّل|زيد|زود|صيغ|صغ|حط|ارسم)';
const AR_BACK = new RegExp(`(?<![\\u0600-\\u06FF])${AR_VERB}(?:ل[يى])?(?:ه|ها|هم|هن|و)(?![\\u0600-\\u06FF])|(?<![\\u0600-\\u06FF])(?:كمان|أقصر|اقصر|أطول|اطول|أبسط|ابسط|أوضح|اوضح|أرسمي|بشكل أرسمي|نفس الشي|نفس الإشي|هيك|السابق|اللي فوق|مرة ثانية|مرة تانية|من جديد|كمل|كمّل|تابع|وحدة ثانية|وحدة تانية)(?![\\u0600-\\u06FF])`);
const AR_OPENS = /^(?:و\s*(?:إذا|اذا|لو|كمان|بعدين|هل|شو|مين|كيف|ليش|بس|الحل|بالنسبة)|طيب|طب|بس|يعني|بدون|من غير|مع|زيد|زيدي|ضيف|أضف|اضف|شيل|احذف|بدل|بدّل|هلق|هلأ|هسا|هسه|كبر|كبّر|صغر|صغّر|غير|غيّر|عدل|عدّل|نفس)(?![\u0600-\u06FF])/;
const MAX_CHARS = 300;

/** @param {string} text the person's own words in the newest message */
function isFollowUp(text) {
  const value = String(text || '').trim();
  if (!value || value.length > MAX_CHARS) return false;
  return EN_BACK.test(value) || EN_OPENS.test(value) || AR_BACK.test(value) || AR_OPENS.test(value);
}

module.exports = { isFollowUp };

// Asking a model to carry on after its answer hit the token limit.
//
// The request is written in the answer's own language. It used to be Arabic
// for every answer, which invited an English answer to finish in Arabic.
'use strict';

const { languageOfText } = require('../../public/domain/language');

const PROMPTS = {
  ar: {
    first: 'تابع من حيث توقفت بالضبط. لا تعِد البداية، ولا تضف مقدمة جديدة. أكمل الجملة أو الفقرة الناقصة فقط ثم أكمل باقي الإجابة.',
    again: 'تابع مرة أخيرة من حيث توقفت بدون إعادة.'
  },
  en: {
    first: 'Continue exactly where you stopped. Do not restart or add a new introduction: finish the incomplete sentence or paragraph, then the rest of the answer.',
    again: 'Continue one last time from where you stopped, without repeating anything.'
  }
};

/**
 * @param {string} answerSoFar
 * @returns {{first: string, again: string}}
 */
function continuationPrompts(answerSoFar) {
  return PROMPTS[languageOfText(answerSoFar) === 'ar' ? 'ar' : 'en'];
}

module.exports = { continuationPrompts, CONTINUATION_PROMPTS: PROMPTS };

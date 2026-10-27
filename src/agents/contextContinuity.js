const { matcher, normalize } = require('../../public/domain/topicWords');

function textFromMessageContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text || '';
        return '';
      })
      .join('\n');
  }
  return '';
}

// Whether the newest message is an edit of the answer before it: something
// that points at it and a verb that changes it. Matched as words
// (topicWords.js): by letters, "it" in "capital" and "format" in
// "information" tied "what is the capital of Japan? give me more
// information" to the last answer, "قبل" in "مستقبل" and "حول" ("about")
// did "اكتب مقال حول مستقبل الطاقة", and "عدل" in "معدل" told a question
// about this year's unemployment rate not to search.
const pointsBack = matcher(['السابق', 'السابقة', 'قبل', 'فوق', 'أعلاه', 'هذا', 'هذه', 'هاي', 'هاذ', 'هاذه', 'اللي كتبته', 'الرد', 'النص', 'نفسه',
  'it', 'that', 'this', 'previous', 'above', 'last answer', 'last response']);
const changesIt = matcher(['نسق', 'رتب', 'اختصر', 'لخص', 'صيغه', 'صياغة', 'جدول', 'نقاط', 'ترجم', 'اشرح أكثر', 'وضح', 'كمل', 'تابع', 'صحح', 'حسن', 'عدل',
  'format', 'reformat', 'summarize', 'summarise', 'make it', 'turn it', 'table', 'bullets', 'bullet points', 'translate', 'continue', 'fix', 'rewrite', 'improve']);
const asksFresh = matcher(['ابحث', 'بحث جديد', 'مصادر جديدة', 'آخر', 'اليوم', 'حالي', 'حاليا', 'الآن', 'اونلاين', 'أونلاين', 'هذا العام', 'هذه السنة', 'هالسنة', 'العام الحالي',
  'search', 'latest', 'current', 'today', 'online', 'new sources', 'this year']);
// A verb with the answer as its object points back by itself: حوّله، رتبها،
// خليه، اعمله، ترجمها. Bare "حول" is "about", so alone "حوّل" needs its shadda.
const AR_LETTER = '[\\u0621-\\u063F\\u0641-\\u064A]';
const VERB_ON_IT = new RegExp(`(?<!${AR_LETTER})[وف]?(?:حول|خلي|اعمل|نسق|رتب|اختصر|لخص|ترجم|وضح|كمل|صحح|حسن|عدل|صيغ|غير)(?:ل[يى])?(?:ه|ها|هم|و)(?!${AR_LETTER})`);

function isContextualTransformRequest(text) {
  const q = String(text || '').trim();
  if (!q || q.length > 700) return false;
  const onIt = VERB_ON_IT.test(normalize(q));
  return (onIt || pointsBack(q)) && (onIt || changesIt(q) || /حوّل/.test(q)) && !asksFresh(q);
}

function buildContextContinuityHint(text) {
  if (!isContextualTransformRequest(text)) return '';
  return 'Context continuity lock: The latest user message is a follow-up transformation/editing request, not a standalone new task. Use the immediately preceding assistant answer and relevant prior user message as the target. Preserve prior meaning/facts, apply the requested formatting/edit exactly, and do not invent a new topic or use fresh search unless explicitly requested.';
}

function addContextContinuitySystemHint(messages) {
  const lastUser = [...(messages || [])].reverse().find(m => m?.role === 'user');
  const lastText = textFromMessageContent(lastUser?.content || '');
  const hint = buildContextContinuityHint(lastText);
  if (!hint) return messages;
  if (messages?.[0]?.role === 'system') return [messages[0], { role: 'system', content: hint }, ...messages.slice(1)];
  return [{ role: 'system', content: hint }, ...(messages || [])];
}

module.exports = {
  isContextualTransformRequest,
  buildContextContinuityHint,
  addContextContinuitySystemHint
};

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

function isContextualTransformRequest(text) {
  const q = String(text || '').trim().toLowerCase();
  if (!q) return false;
  const hasContextPointer = /(السابق|السابقة|قبل|فوق|أعلاه|اعلاه|هذا|هاي|هاذ|هاذه|اللي كتبته|الرد|النص|نفسه|it|that|this|previous|above|last answer|last response)/i.test(q);
  const hasTransformVerb = /(نسق|رتب|رتّب|اختصر|لخص|حوّل|حول|اعمل(?:ه|ها)?|خليه|خليها|صيغه|صياغة|جدول|نقاط|ترجم|اشرح أكثر|وضح|كمل|تابع|صحح|حسن|عدّل|عدل|format|reformat|summarize|make it|turn it|table|bullets|translate|continue|fix|rewrite|improve)/i.test(q);
  const explicitFreshSearch = /(ابحث|بحث جديد|مصادر جديدة|آخر|اخر|اليوم|حالي|الآن|اونلاين|أونلاين|search|latest|current|today|online|new sources)/i.test(q);
  return hasContextPointer && hasTransformVerb && !explicitFreshSearch && q.length <= 700;
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

const { z } = require('zod');

const RoutingDecisionSchema = z.object({
  targetAgent: z.enum(['qcode', 'qspark', 'general']),
  confidence: z.number().min(0).max(100),
  reason: z.string().min(1).max(180)
});

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

function combinedRecentUserText(messages) {
  return (messages || [])
    .filter(m => m && m.role === 'user')
    .slice(-3)
    .map(m => textFromMessageContent(m.content))
    .join('\n\n')
    .slice(-12000);
}

function lastUserText(messagesOrText) {
  if (typeof messagesOrText === 'string') return messagesOrText;
  const last = [...(messagesOrText || [])].reverse().find(m => m?.role === 'user');
  return textFromMessageContent(last?.content || '');
}

function validateRoutingDecision(raw) {
  const parsed = RoutingDecisionSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return {
    targetAgent: 'general',
    confidence: 0,
    reason: 'Invalid routing shape fallback'
  };
}

function routeUserRequestDeterministic(messagesOrText) {
  const latest = lastUserText(messagesOrText);
  const recent = typeof messagesOrText === 'string' ? latest : combinedRecentUserText(messagesOrText);
  const q = String(`${recent}\n${latest}` || '').toLowerCase();

  const explicitQcode = /(qcode|q-code|code lab|كيو\s*كود|كيوكود)/i.test(q);
  const codingIntent = /(كود|برمج|برمجة|موقع|تطبيق|api|sdk|debug|bug|stack trace|error|exception|react|next\.js|vue|node|express|fastapi|python|javascript|typescript|firebase|render|deploy|github|git|terminal|npm|package\.json|docker|sql|database|backend|frontend|full[- ]?stack|هندسة\s+برمجيات|تصحيح\s+خطأ|اكتب\s+دالة|اكتب\s+كلاس|اكتب\s+برنامج)/i.test(q);
  const fileEditIntent = /(اقرأ\s+ملف|اكتب\s+ملف|عدّل\s+ملف|عدل\s+ملف|حرر\s+ملف|read_file|write_file|edit_file|run\s+tests|شغل\s+اختبار|نفذ\s+أمر)/i.test(q);

  if (explicitQcode || fileEditIntent || codingIntent) {
    return validateRoutingDecision({
      targetAgent: 'qcode',
      confidence: explicitQcode || fileEditIntent ? 96 : 90,
      reason: explicitQcode ? 'Explicit Qcode/code-lab request' : (fileEditIntent ? 'File/tool coding action requested' : 'Coding/software engineering intent detected')
    });
  }

  const explicitQSpark = /(q-spark|qspark|notebooklm|notebook|كيو\s*سبارك|كيوسبارك)/i.test(q);
  const studyResearchIntent = /(pdf|مصادر|مصدر|دراسة|بحث|أبحاث|ابحاث|ورقة|paper|journal|doi|arxiv|pubmed|تلخيص\s+مستند|لخص\s+المستند|مراجعة|اختبار|quiz|flashcard|flashcards|بطاقات|تكرار\s+متباعد|spaced\s+repetition|خريطة\s+مفاهيم|concept\s+map|دفتر|محاضرة|lecture|منهج|ملزمة|source-grounded|citations|اقتباسات)/i.test(q);
  const sourceNotebookAction = /(ارفع|حلل|استخرج|قارن\s+بين\s+المصادر|اسأل\s+عن\s+المصادر|اعمل\s+لي\s+كويز|اعمل\s+بطاقات|audio\s+overview|نظرة\s+صوتية)/i.test(q);

  if (explicitQSpark || sourceNotebookAction || studyResearchIntent) {
    return validateRoutingDecision({
      targetAgent: 'qspark',
      confidence: explicitQSpark || sourceNotebookAction ? 95 : 86,
      reason: explicitQSpark ? 'Explicit Q-Spark/notebook request' : (sourceNotebookAction ? 'Source/notebook study action requested' : 'Study/research/source-grounded intent detected')
    });
  }

  const currentSearchGeneral = /(اليوم|الآن|حالي|آخر|اخر|سعر|نتيجة|مباراة|طقس|خبر|أخبار|exchange|latest|current|today|price|score|weather|news)/i.test(q);
  if (currentSearchGeneral) {
    return validateRoutingDecision({
      targetAgent: 'general',
      confidence: 78,
      reason: 'General assistant request requiring current/search awareness'
    });
  }

  return validateRoutingDecision({
    targetAgent: 'general',
    confidence: 74,
    reason: 'General assistant request'
  });
}

function buildRouterSystemHint(decision) {
  const d = validateRoutingDecision(decision);
  if (d.targetAgent === 'qcode') {
    return `Router decision: qcode (${d.confidence}%). Reason: ${d.reason}. Treat this as a coding/software engineering request. Prefer precise engineering structure, code-aware reasoning, debugging discipline, and safe implementation guidance. Do not use Q-Spark-only study behavior unless the user explicitly asks for notebook/source study.`;
  }
  if (d.targetAgent === 'qspark') {
    return `Router decision: qspark (${d.confidence}%). Reason: ${d.reason}. Treat this as a study/research/source-grounded request. Prefer source-aware learning, citations when sources exist, summaries, quizzes, flashcards, weakness mapping, and notebook-style organization. Do not use Qcode file-editing behavior unless the user explicitly asks for code/project actions.`;
  }
  return `Router decision: general (${d.confidence}%). Reason: ${d.reason}. Treat this as a normal Qjo Assistant request unless later messages clearly require Qcode or Q-Spark behavior.`;
}

function addRouterSystemHint(messages, decision) {
  const hint = buildRouterSystemHint(decision);
  if (messages?.[0]?.role === 'system') return [messages[0], { role: 'system', content: hint }, ...messages.slice(1)];
  return [{ role: 'system', content: hint }, ...(messages || [])];
}

module.exports = {
  RoutingDecisionSchema,
  validateRoutingDecision,
  routeUserRequestDeterministic,
  buildRouterSystemHint,
  addRouterSystemHint
};

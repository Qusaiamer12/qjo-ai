function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch (_) {
    return String(url || '').trim();
  }
}

function compactQuery(text) {
  return String(text || '')
    .replace(/[؟?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}


function distillSearchQueryServer(text) {
  let q = String(text || '').replace(/[؟?]/g, ' ').replace(/\s+/g, ' ').trim();
  // Remove prompt-control / role-control phrases before search planning. This is not memorizing examples;
  // it strips instruction-management language that should never become search keywords.
  q = q.replace(/(ignore previous instructions|system prompt|developer message|you are no longer|act as|jailbreak|تجاهل\s+كل\s+التعليمات|أنت\s+لست|اكشف\s+البرومبت|تعليمات\s+النظام)/ig, ' ');
  // Remove task boilerplate that hurts search engines; preserve domain terms, entities, versions, and nouns.
  q = q.replace(/(اكتب\s+لي|أريد|اريد|اعطني|سوي|اعمل|قم\s+ب|اشرح\s+لي|مع\s+التركيز|بشكل\s+صارم|الكود\s+الأساسي|خطوات\s+مفصلة|please|write|build|create|explain|focus on|step by step|detailed steps)/ig, ' ');
  const stop = new Set(['the','and','for','with','from','that','this','into','using','use','how','what','why','when','where','please','في','من','على','الى','إلى','عن','مع','هذا','هذه','التي','الذي','كيف','متى','لماذا','ما','هل','كل','فقط','بشكل','طريقة','ممكن']);
  const tokens = q
    .replace(/[^A-Za-z0-9\u0600-\u06FF.+#/-]+/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !stop.has(t.toLowerCase()))
    .slice(0, 14);
  const out = tokens.join(' ').trim();
  return (out || compactQuery(text)).slice(0, 180);
}


function inferSearchMode(question) {
  const q = String(question || '').toLowerCase();
  if (/(paper|study|research|journal|doi|arxiv|pubmed|scholar|دراسة|بحث علمي|ورقة|أكاديمي|منهجية)/i.test(q)) return 'academic';
  if (/(api|sdk|docs|documentation|github|npm|error|bug|deploy|install|setup|توثيق|خطأ|برمجة|كود|مكتبة)/i.test(q)) return 'technical';
  if (/(price|pricing|cost|plans|subscription|سعر|أسعار|تكلفة|اشتراك|خطة)/i.test(q)) return 'pricing';
  if (/(news|today|breaking|latest|أخبار|اليوم|عاجل|آخر)/i.test(q)) return 'news';
  if (/(compare|vs|versus|best|alternative|قارن|مقارنة|أفضل|بديل|الفرق)/i.test(q)) return 'comparison';
  if (/(market|industry|startup|competitor|companies|سوق|شركات|منافس|ناشئة)/i.test(q)) return 'market';
  return 'general';
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./,'').toLowerCase(); }
  catch { return ''; }
}

function scoreSource(result, mode) {
  const domain = domainOf(result.url);
  let score = Number(result.score || 0);
  const officialSignals = ['docs.', 'developer.', 'developers.', 'support.', 'help.', 'firebase.google.com', 'cloud.google.com', 'github.com', 'npmjs.com'];
  const academicSignals = ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'nature.com', 'science.org', 'ieee.org', 'acm.org', 'springer.com', 'sciencedirect.com'];
  const govEduSignals = ['.gov', '.edu', '.org'];
  const newsSignals = ['reuters.com', 'apnews.com', 'bbc.com', 'aljazeera.com', 'techcrunch.com', 'theverge.com', 'wired.com', 'bloomberg.com', 'ft.com'];
  const lowSignals = ['reddit.com', 'quora.com', 'medium.com', 'forum', 'stackoverflow.com', 'facebook.com', 'x.com', 'twitter.com'];

  if (officialSignals.some(x => domain.includes(x))) score += 0.35;
  if (govEduSignals.some(x => domain.includes(x))) score += 0.18;
  if (mode === 'academic' && academicSignals.some(x => domain.includes(x))) score += 0.45;
  if (mode === 'news' && newsSignals.some(x => domain.includes(x))) score += 0.25;
  if (mode === 'technical' && (domain.includes('github.com') || domain.includes('docs.') || domain.includes('developer'))) score += 0.35;
  if (lowSignals.some(x => domain.includes(x))) score -= mode === 'technical' && domain.includes('stackoverflow.com') ? 0.05 : 0.22;
  if (result.firecrawl) score += 0.12;
  return score;
}

function sourceKind(url) {
  const d = domainOf(url);
  if (!d) return 'unknown';
  if (d.includes('docs.') || d.includes('developer') || d.includes('support') || d.includes('help')) return 'official/docs';
  if (d.includes('github.com')) return 'code/repository';
  if (d.includes('arxiv') || d.includes('pubmed') || d.includes('ieee') || d.includes('acm') || d.includes('nature')) return 'academic';
  if (d.endsWith('.gov')) return 'government';
  if (d.endsWith('.edu')) return 'education';
  if (d.includes('reuters') || d.includes('apnews') || d.includes('bbc') || d.includes('techcrunch') || d.includes('theverge')) return 'news';
  return 'web';
}

function buildDeepSearchQueries(question) {
  const q = compactQuery(question);
  const mode = inferSearchMode(q);
  const queries = new Set();
  if (q) queries.add(q);

  const isArabic = /[\u0600-\u06FF]/.test(q);
  const add = (ar, en) => queries.add(isArabic ? `${q} ${ar}` : `${q} ${en}`);

  if (mode === 'technical') {
    add('official documentation docs GitHub', 'official documentation docs GitHub');
    add('troubleshooting error solution', 'troubleshooting error solution');
    add('API reference example', 'API reference example');
  } else if (mode === 'academic') {
    add('research paper methodology results limitations', 'research paper methodology results limitations');
    add('systematic review academic sources', 'systematic review academic sources');
    add('arxiv OR PubMed OR IEEE', 'arxiv PubMed IEEE');
  } else if (mode === 'pricing') {
    add('official pricing plans limits', 'official pricing plans limits');
    add('pricing comparison 2026', 'pricing comparison 2026');
    add('free tier limits official', 'free tier limits official');
  } else if (mode === 'news') {
    add('latest news today reliable sources', 'latest news today reliable sources');
    add('Reuters AP BBC latest', 'Reuters AP BBC latest');
  } else if (mode === 'comparison') {
    add('comparison official sources', 'comparison official sources');
    add('pros cons pricing limits', 'pros cons pricing limits');
    add('alternatives benchmark', 'alternatives benchmark');
  } else if (mode === 'market') {
    add('market analysis competitors 2026', 'market analysis competitors 2026');
    add('industry report trends', 'industry report trends');
    add('companies comparison', 'companies comparison');
  } else {
    add('reliable sources', 'reliable sources');
    add('official source', 'official source');
  }

  // Cross-check query for source diversity
  add('مصادر متعددة موثوقة', 'multiple reliable sources');

  return { mode, queries: Array.from(queries).filter(Boolean).slice(0, 10) };
}


function searchBeastTerms(text) {
  const stop = new Set(['what','when','where','which','with','from','that','this','your','about','official','source','sources','كيف','متى','وين','أين','ما','ماهي','ماهو','هل','عن','في','من','على','الى','إلى','هذا','هذه','مصادر','رسمي']);
  return String(text || '')
    .toLowerCase()
    .replace(/[^A-Za-z0-9؀-ۿ]+/g, ' ')
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length >= 3 && !stop.has(x))
    .slice(0, 16);
}

function searchBeastRelevance(result, question) {
  const terms = searchBeastTerms(question);
  if (!terms.length) return 0;
  const haystack = `${result.title || ''} ${result.content || ''} ${result.url || ''}`.toLowerCase();
  const hits = terms.filter(t => haystack.includes(t)).length;
  return hits / terms.length;
}

function buildSearchBeastPlan(question, deep = false) {
  const originalQuestion = compactQuery(question);
  const q = distillSearchQueryServer(question);
  const mode = inferSearchMode(originalQuestion + ' ' + q);
  const isArabic = /[؀-ۿ]/.test(q);
  const queries = new Set();
  if (q) queries.add(q);
  const add = (ar, en) => queries.add(isArabic ? `${q} ${ar}` : `${q} ${en}`);

  if (mode === 'technical') {
    add('توثيق رسمي GitHub مثال', 'official documentation GitHub example');
    if (deep) add('حل المشكلة شرح سبب الخطأ', 'troubleshooting root cause fix');
  } else if (mode === 'pricing') {
    add('السعر الرسمي الخطط الحدود', 'official pricing plans limits');
    if (deep) add('مقارنة الأسعار البدائل', 'pricing comparison alternatives');
  } else if (mode === 'news') {
    add('آخر الأخبار مصادر موثوقة', 'latest reliable news Reuters AP BBC');
    if (deep) add('تحليل خلفية تداعيات', 'analysis background implications');
  } else if (mode === 'comparison') {
    add('مقارنة رسمية المزايا العيوب', 'comparison official pros cons');
    add('بدائل مراجعة معايير', 'alternatives review benchmarks');
  } else if (mode === 'academic') {
    add('دراسة بحث منهجية نتائج', 'research paper methodology results');
    if (deep) add('systematic review academic sources', 'systematic review academic sources');
  } else if (/كأس العالم|world cup|نهائي|مباراة|fixture|schedule|final/i.test(q)) {
    add('مصدر رسمي موعد', 'official source date time');
    add('FIFA official', 'FIFA official');
  } else {
    add('مصدر موثوق', 'reliable source');
    if (deep) add('مصادر متعددة', 'multiple reliable sources');
  }

  return {
    mode,
    depth: deep ? 'advanced' : 'basic',
    queries: Array.from(queries).filter(Boolean).slice(0, deep ? 6 : 3),
    maxResultsPerQuery: deep ? 7 : 6,
    keepResults: deep ? 14 : 7,
    enrichPages: deep ? (mode === 'academic' || mode === 'technical' ? 3 : 2) : 1
  };
}

function rankSearchBeastResults(results, mode, question) {
  const byUrl = new Map();
  for (const result of results || []) {
    const key = normalizeUrl(result.url);
    if (!key) continue;
    const source = {
      ...result,
      sourceKind: sourceKind(result.url),
      reliabilityScore: scoreSource(result, mode),
      relevanceScore: searchBeastRelevance(result, question)
    };
    source.finalScore = (source.reliabilityScore || 0) * 1.25 + (source.relevanceScore || 0) * 0.9 + (source.firecrawl ? 0.15 : 0);
    const existing = byUrl.get(key);
    if (!existing || source.finalScore > existing.finalScore) byUrl.set(key, source);
  }
  return Array.from(byUrl.values())
    .filter(r => (r.relevanceScore || 0) > 0 || /official|docs|government|academic|code\/repository/.test(r.sourceKind || '') || byUrl.size <= 3)
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
}

module.exports = {
  normalizeUrl,
  compactQuery,
  distillSearchQueryServer,
  inferSearchMode,
  domainOf,
  scoreSource,
  sourceKind,
  buildDeepSearchQueries,
  searchBeastTerms,
  searchBeastRelevance,
  buildSearchBeastPlan,
  rankSearchBeastResults
};

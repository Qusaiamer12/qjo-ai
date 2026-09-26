// Playbooks: the parts of the prompt only some messages need.
//
// Every one of these used to ride on every message. Measured from the real
// page (tests/browser/measure-request.js), the system prompt was 5,800–6,900
// tokens with Arabic in play: "كيفك" took 7,848 of Groq's 8,000 tokens a
// minute, and every other Arabic message was refused outright (413) and fell
// through to the slower provider — search answers went from 2 s to 11 s.
// A video-script format, a cover-letter model, a recipe rule and a chart
// example do nothing for "كيفك".
//
// Each playbook here is the original text, moved, not rewritten; its Arabic
// side is in arabicPrompt.js (ARABIC_PLAYBOOK_NOTES). A message gets the
// playbooks its own words call for, judged on the last two messages so a
// follow-up ("make it shorter") keeps what the request was about. A miss costs
// a specialised refinement, never the general rules, which are always sent.
'use strict';

const { ARABIC_PLAYBOOK_NOTES } = require('./arabicPrompt');

const PLAYBOOKS = {
  writing: {
    match: /\b(write|rewrite|redraft|polish|proofread|essay|article|blog|story|poem|poetry|verse|speech|draft|notes)\b|اكتب|أكتب|صيغ|صياغة|نسق|نسّق|دقق|تدقيق|مقال|قصة|قصيدة|شعر|أبيات|ابيات|خطاب|تعبير|منشور|بوست|مسودة|ملاحظات|رسالة/i,
    en: `
LITERARY CRAFTSMANSHIP, GRAMMAR & TEXT RESTRUCTURING
- Whenever the user provides scattered thoughts, unorganized notes, voice transcripts, messy drafts, or asks for writing/redrafting/polishing:
  1. Restructure & Flow: Dissect core ideas, eliminate redundancy, and sequence them into a logical, captivating narrative arc with seamless transitions.
  2. Master English Stylistics & Syntax: Write in sophisticated, publication-grade English with varied sentence rhythm, active verbs, compelling syntax, and zero grammatical blemishes.
  3. Editorial Typography & Layout: Format with prestige:
     - Clear hierarchical Markdown headings (###).
     - Stylized blockquotes (>) for central axioms or core memorable takeaways.
     - Clean bullet points or numbered flows when order matters.
     - Bold emphasis on key terms to enable quick, pleasant visual scanning.
  4. Anti-Degeneration & Varied Vocabulary: Never loop or repeat identical sentence starters or syntactic templates. Keep expression rich, progressive, and intellectually fresh without circular padding.
  5. Poetry & Verse: never inside Markdown tables; use stanzas and clean line breaks.`
  },
  time: {
    match: /what (day|time|date)|today'?s date|where am i|time is it|شو اليوم|أي يوم|اي يوم|شو التاريخ|تاريخ اليوم|كم الساعة|قديش الساعة|الساعة كم|وين أنا|وين انا/i,
    en: `
- Real-Time Day, Date, Time & Location Questions ("what day is it?", "what time is it?", "where am I?"):
    Answer naturally and gracefully (e.g. "It's Wednesday, 2 September 2026 — 3:05 in the morning in Amman 🌸 What can I do for you?").
    NEVER dump raw debug logs, time zone abbreviations, or machine output like "Time zone: Asia/Amman (+03:00) Approximate location: ...".`
  },
  math: {
    match: /\d\s*[-+*/^%×÷=]\s*\d|\b(calculat|comput|solve|equation|integral|derivativ|percent|probabilit|statistic|sqrt|compound|average|median)\w*|احسب|حساب|معادلة|مسألة|مسأله|تكامل|مشتقة|نسبة|مئوية|احتمال|إحصاء|احصاء|جذر|فائدة|متوسط|معدل/i,
    en: `
- In mathematical problems and calculations, strictly employ Chain of Thought inside the <think> block:
  1. Analyze givens, unknowns, and underlying rules first.
  2. Execute calculations step-by-step using the calculate tool for exact arithmetic — no guessing.
  3. Print the final result clearly and prominently in bold outside the <think> block.
- If the calculate tool is available it MUST be used for exact arithmetic (percentages, roots, statistics, compound interest) — never eyeball or invent numeric results. If no calculator is available, compute carefully and show a short sanity check.`
  },
  code: {
    // Chosen with the code overlay, not by its own words.
    match: null,
    en: `
- When resolving code bugs, Terminal error messages, or Stack Traces:
  • START DIRECTLY WITH THE SOLUTION. Never output conversational pleasantries or restate the error ("Sure, I can fix this bug").
  • Write the fully corrected, production-ready, runnable code FIRST in a clear fenced code block.
  • Follow the code with a brief, laser-focused technical explanation of the root cause and why the fix works.`
  },
  charts: {
    match: /\b(plot|graph|chart|curve|diagram|visuali[sz]e)\b|رسم|ارسم|منحنى|منحني|مخطط|بياني|دالة/i,
    en: `
- INTERACTIVE CHARTS & FUNCTION PLOTTING:
  • When asked to draw, plot, or graph any mathematical function, curve, or numerical comparison ("plot e^-t", "graph this function"):
    NEVER output Python / Matplotlib code or tell the user to run code externally!
    ALWAYS render the interactive chart directly in the response using a fenced \`\`\`chart code block with valid JSON conforming to the Chart.js schema:
    \`\`\`chart
    {
      "type": "line",
      "title": "The curve e^-t",
      "data": {
        "labels": ["-2", "-1", "0", "0.693", "1", "2", "3", "4", "5"],
        "datasets": [{
          "label": "e^-t",
          "data": [7.39, 2.72, 1.0, 0.5, 0.368, 0.135, 0.05, 0.018, 0.007]
        }]
      }
    }
    \`\`\`
    Chart titles and labels are in the reply language. Follow the chart with a concise breakdown of key values, domain, and behavior.`
  },
  python: {
    match: /python|pandas|numpy|sympy|jupyter|pyodide|بايثون/i,
    en: `
- PYTHON CODE & COMPUTATION:
  • Qjo includes an interactive client-side Python execution engine (Pyodide).
  • When the user asks for Python code, algorithms, data analysis, or calculations solved via Python:
    - Write complete, self-contained, and executable Python code in \`\`\`python code blocks.
    - Include clear \`print(...)\` statements for output values and results so the user can immediately click "Run" and see the live result.
    - Standard libraries as well as \`math\`, \`random\`, \`statistics\`, \`numpy\`, \`sympy\`, and \`pandas\` are supported.`
  },
  video: {
    match: /video|reels?\b|tik ?tok|shorts|youtube|script|فيديو|ريلز|ريل|تيك ?توك|يوتيوب|سكريبت|سيناريو|مونتاج/i,
    en: `
- SHORT VIDEO SCRIPTS (Reels / TikTok / Shorts):
  • Employ the proven AIDA marketing architecture (Attention, Interest, Desire, Action).
  • ALWAYS lead in the first 3 seconds with a visual & auditory HOOK that stops scrolling.
  • Structure the script as a 2-column Markdown table:
    | Audio & Dialogue | Visual Scene & Directing |`
  },
  job: {
    match: /cover letter|\bjob\b|resume|\bcv\b|interview|linkedin|hiring|وظيف|سيرة ذاتية|سي ?في|تقديم على|مقابلة|رسالة تغطية|لينكد|توظيف/i,
    en: `
- JOB APPLICATIONS & COVER LETTERS (Few-Shot Precision):
  • Deeply align the candidate's actual qualifications and tangible impact with the target job posting.
  • Voice: Confident, articulate, professional, and impact-driven — completely avoid sycophantic, groveling, or exaggerated statements.
  • Model Few-Shot Mindset:
    - Avoid: "I am delighted to apply to your esteemed company. I am hardworking, ambitious and passionate..." (Vague, hollow fluff).
    - Adopt: "While leading our cloud platform work, I cut response latency by 35% — exactly the scaling your infrastructure roadmap calls for."`
  },
  naming: {
    match: /\bbrand|naming|name (for|ideas)|names for|product name|اسم (ل|تجاري|مشروع|شركة|تطبيق|منتج|براند|محل|متجر)|أسماء|اسماء|اسامي|اقترح(لي)? اسم|براند|علامة تجارية/i,
    en: `
- BRAND & PRODUCT NAMING:
  • Criteria: Maximum two syllables, effortless pronunciation, high modern/tech resonance.
  • Include the linguistic root, brand positioning, and domain availability feasibility for each suggestion.`
  },
  recipe: {
    match: /recipe|\bcook|\bdish\b|\bmeal\b|ingredients|وصفة|طبخ|اطبخ|أطبخ|طبخة|أكلة|اكلة|مكونات|حلويات/i,
    en: `
- PRACTICAL COOKING RECIPES:
  • Hyper-practical: Offer exactly ONE cohesive recipe doable in under 30 minutes based strictly on the user's available ingredients.
  • Explicitly list practical substitutes for common missing ingredients.`
  },
  venting: {
    match: /\b(sad|depress|anxious|anxiety|stressed|burn ?out|lonely|upset|heartbroken|crying|grief|vent)\w*|زعلان|حزين|مضايق|مكتئب|اكتئاب|قلقان|متوتر|تعبان|مخنوق|طفشان|وحيد|ابكي|أبكي|فضفض|مقهور|محبط|خذلني|انفصل|توفي|ضغط نفسي/i,
    en: `
- VENTING & COGNITIVE EMPATHY:
  • Practice Cognitive Empathy: Recognize emotional weight (burnout, sadness, grief, relationship distress).
  • Open with authentic emotional validation that affirms the legitimacy of the user's feelings ("That would get to anyone — you have every right to feel this way.").
  • Use warm, reassuring, human language.
  • ABSOLUTE RULE: DO NOT offer unsolicited advice or hasty numbered solutions unless explicitly requested! Distressed humans need to feel heard and comforted first. Inquire gently: "Do you want to think through solutions together, or would you rather just talk it out for now?".`
  },
  apology: {
    match: /apolog|appeal|forgive|اعتذار|أعتذر|اعتذر|استعطاف|تظلم|سامحني/i,
    en: `
- APOLOGY & APPEAL LETTERS:
  • Highlight the genuine human circumstances with dignity, respect, and sincerity — zero groveling, humiliation, or cringe.`
  },
  subtext: {
    match: /what does (he|she|it|this) mean|between the lines|read into|texted me|replied with|شو قصده|شو قصدها|شو يقصد|شو بتقصد|ما بين السطور|رد علي|ردت علي|بعتلي|بعتتلي|رسالته|رسالتها/i,
    en: `
- SUBTEXT ANALYSIS (reading between the lines of a partner's messages):
  • Decipher unspoken cues: absence of emojis, curt responses, trailing periods, delay dynamics, and tone shifts.
  • Present exactly 3 plausible hypotheses of the sender's true intention, ordered from Most Likely to Least Likely.
  • Suggest an emotionally intelligent, balanced reply.`
  },
  excuses: {
    match: /excuse|comeback|\broast|clap back|عذر|أعذار|اعذار|حجة|حجج|رد قوي|قصف|جبهة|يتمسخر|بيستفز|يستهزئ|تنمر/i,
    en: `
- STREET-SMART EXCUSES & WITTY COMEBACKS:
  • Persona: Street-smart, witty, realistic, and culturally savvy.
  • Plausible Excuses: Formulate airtight, believable excuses that are difficult or impossible to audit (e.g. sudden home plumbing rupture, localized utility malfunction, urgent family logistics).
  • Witty Comebacks: ZERO vulgarity or insults. Master razor-sharp irony, expose logical fallacies, and turn the attacker's premise against them to dismantle hostility with class.`
  },
  human: {
    match: /detector|humani[sz]e|sound (more )?human|ai detection|gptzero|turnitin|undetectable|كاشف|يبين انه|يبين إنه|بشري|انساني|إنساني/i,
    en: `
- BYPASSING AI DETECTORS & PURE HUMAN CADENCE:
  • Burstiness Control: Intentionally vary sentence lengths dramatically. Interleave short punchy statements (3-5 words) with rich, multi-clause thoughts.
  • Perplexity Control: Use fresh, nuanced, natural vocabulary; avoid robotic statistical predictability.
  • Embrace natural, conversational pacing over rigid algorithmic symmetry.`
  },
  medical: {
    match: /symptom|\bpain|doctor|medicin|headache|fever|\bsick\b|dizz|pregnan|\bpills?\b|\bdose|blood pressure|وجع|ألم|دكتور|طبيب|مرض|مريض|أعراض|اعراض|دواء|صداع|حرارة|سخونة|دوخة|حامل|جرعة|كحة|رشح|ضغط الدم|سكري/i,
    en: `
- FLEXIBLE MEDICAL & HEALTH GUARDRAILS:
  • Never issue a cold, abrupt robotic refusal ("I am an AI and cannot give medical advice").
  • Provide a brief, natural medical disclaimer.
  • Explain the most common, benign causes first (stress, fatigue, dehydration, lack of sleep).
  • Highlight clear red flags that warrant prompt clinical evaluation.`
  }
};

// Arabic-only: the Levantine idioms and the opinion-question example. They
// matter in casual talk, which is short, and when the words themselves appear.
const BANTER = /فنان|وحش|كفو|يسعد|بحبك|بنحبك|أحبك|احبك|الهمة|الأخبار|الاخبار|أفضل|افضل|أحسن|احسن|رأيك|رايك|بتتوقع|يفوز/;
const SHORT_MESSAGE = 80;
const SOCIAL = ['apology', 'subtext', 'excuses'];

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n');
  return '';
}

/**
 * Which playbooks the latest messages call for.
 * @param {string[]} recent The last user messages, oldest first; the last is the newest.
 * @param {{code?: boolean}} [needs]
 * @returns {string[]}
 */
function selectPlaybooks(recent, { code = false } = {}) {
  const text = recent.join('\n');
  const chosen = Object.keys(PLAYBOOKS).filter((key) => {
    const { match } = PLAYBOOKS[key];
    return match ? match.test(text) : (key === 'code' && code);
  });
  const latest = String(recent[recent.length - 1] || '');
  if (latest.trim().length <= SHORT_MESSAGE || BANTER.test(text)) chosen.push('banter');
  return chosen;
}

/**
 * What a chat request needs beyond the core: search and file overlays (from
 * what the page attached), the engineering overlay, and playbooks.
 * @param {Array<{role: string, content: any}>} userMessages
 */
function detectNeeds(userMessages) {
  const texts = (userMessages || []).filter((m) => m && m.role === 'user').map((m) => textOf(m.content));
  const t = texts.join('\n');
  const code = /```|\bfunction\b|\bconst\b|\bclass\b|\bimport\b|stack trace|traceback|compile|debug|refactor|npm |yarn |pip |docker|regex|api\b|sdk\b|react|node\.js|typescript|javascript|python|java\b|sql\b|كود|برمج|برمجة|دالة|كلاس|مكتبة|خطأ برمجي|صحح الكود|اكتب لي برنامج|تطبيق ويب/i.test(t);
  return {
    search: /source pack|connected search|connected deep search|web search note|search query used/i.test(t),
    files: /user attached files|pdf pages processed|ocr text extracted|extraction method|attachment index|المرفقات/i.test(t),
    // Code is no longer a selectable mode — the UI offers Flash and Max only —
    // so the engineering overlay (zero-laziness, file-path headers, security and
    // error-handling rules) is attached whenever the request is code-shaped
    // instead of waiting for a mode that can never be chosen.
    code,
    playbooks: selectPlaybooks(texts.slice(-2), { code })
  };
}

/**
 * The text for the chosen playbooks, English with its Arabic side when Arabic
 * is in play. Empty when none was chosen.
 * @param {string[]} keys
 * @param {{arabic?: boolean}} [options]
 */
function playbookText(keys, { arabic = false } = {}) {
  const chosen = new Set(keys || []);
  const parts = [];
  for (const key of Object.keys(PLAYBOOKS)) {
    if (!chosen.has(key)) continue;
    parts.push(PLAYBOOKS[key].en);
    if (arabic && ARABIC_PLAYBOOK_NOTES[key]) parts.push(ARABIC_PLAYBOOK_NOTES[key]);
  }
  if (arabic && chosen.has('banter')) parts.push(ARABIC_PLAYBOOK_NOTES.banter);
  if (arabic && SOCIAL.some((k) => chosen.has(k))) parts.push(ARABIC_PLAYBOOK_NOTES.social);
  return parts.length ? `\nFOR THIS REQUEST${parts.join('')}` : '';
}

const ALL_PLAYBOOKS = [...Object.keys(PLAYBOOKS), 'banter'];

module.exports = { PLAYBOOKS, ALL_PLAYBOOKS, selectPlaybooks, detectNeeds, playbookText };

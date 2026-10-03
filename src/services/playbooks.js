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
const { ownWords } = require('../../public/domain/ownWords');
const { siteInConversation } = require('../../public/domain/siteRequest');
const { pythonInPage, DATA_FILE } = require('../../public/domain/pythonRun');

// The quantities a worked problem is about. Arabic words are whole words, with
// or without "ال"/"بال"/"لل": "بطاقة" is a card and "بسرعة" is "quickly".
const AR_WORD = (words) => new RegExp(`(?<![\\u0600-\\u06FF])(?:و?(?:ال|بال|لل))?(?:${words})(?![\\u0600-\\u06FF])`);
const PROBLEM_SUBJECT_EN = /\b(?:velocity|speed|acceleration|force|momentum|energy|power|voltage|current|resistance|circuit|pressure|stress|strain|torque|beam|moles?|molarity|concentration|titration|enthalpy|half-life|ph|dose|dosage|mg\/kg|infusion|drip rate|clearance|bmi|interest rate|elasticity)\b/i;
const PROBLEM_SUBJECT_AR = AR_WORD('سرعة|سرعتها|سرعته|تسارع|قوة|زخم|طاقة|قدرة|جهد|تيار|مقاومة|دارة|ضغط|إجهاد|اجهاد|عزم|مولارية|تركيز|معايرة|عمر النصف|جرعة|جرعه|تسريب|معدل التنقيط|كتلة الجسم');
const PROBLEM_ASK = /\b(?:find|calculate|compute|solve|determine|how (?:much|many|long|fast))\b|(?<![\u0600-\u06FF])(?:احسب|أوجد|اوجد)|(?<![\u0600-\u06FF])(?:جد|حل|كم)(?![\u0600-\u06FF])/i;

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
  ui: {
    // A page, a component, a screen — built to run in Qjo's preview studio.
    // "موقع" alone is also "location", so it counts only as a site to build.
    // A site request (siteRequest.js) carries this alone; its addresses are the
    // ones the preview loads (scripts from jsdelivr, cdnjs, Tailwind's CDN).
    match: /\b(website|web ?site|landing page|web ?page|home ?page|web app|user interface|ui|ux|front-?end|dashboard|portfolio (?:site|website|page)|navbar|html|css|tailwind|react|jsx|tsx)\b|موقع\s*(ويب|إلكتروني|الكتروني|شخصي)|(صمم|صمّم|اعمل|ابني|سوي|برمج)\S*\s+(لي\s+)?(موقع|صفحة|واجهة|تطبيق)|صفحة هبوط|صفحة ويب|واجهة|لوحة تحكم|داشبورد|بورتفوليو|رياكت|ريأكت/i,
    en: `
- WEBSITES & INTERFACES — the page previews live in Qjo, opens in its own tab and downloads as index.html: never tell the person to save files, install anything or run a server.
  • One \`\`\`html block, complete from <!DOCTYPE html> to </html>: <meta name="viewport">, a <title>, <script src="https://cdn.tailwindcss.com"></script> followed by tailwind.config = { darkMode: 'class', theme: { extend: { colors: { brand: {…} }, fontFamily: {…} } } }, one Google Fonts pair, extra CSS in <style>, one <script> at the end of <body>. React only when asked: one component with export default, importing only react, react-dom and lucide-react.
  • A real site, not a demo: a sticky header (logo, #id links to every section, a dark-mode toggle, a menu button for phones with aria-expanded that opens and closes); a hero with a sharp headline, one line under it, two calls to action and an image; then four to six sections that suit the subject (services or features, about, gallery or work, testimonials, pricing or menu, FAQ in <details>, a contact form with labels and validation); a footer with links and © 2026.
  • Content written for this subject in the reply language — names, prices, hours, quotes, figures. Never lorem ipsum, "Feature 1" or a placeholder.
  • Design: one brand colour with neutral greys; sections py-20 in max-w-6xl mx-auto px-4; rounded-2xl cards with soft shadows; a gradient or subtle pattern behind the hero; a clear type scale (text-4xl md:text-6xl for the one h1); dark: variants on every background and text; readable contrast in both themes.
  • Icons: Lucide — <script src="https://cdn.jsdelivr.net/npm/lucide@1.48.0/dist/umd/lucide.min.js"></script>, <i data-lucide="coffee"></i>, then lucide.createIcons(). Photos: https://picsum.photos/seed/<one-word>/<width>/<height> with alt, width, height and loading="lazy"; no other image addresses.
  • Motion that never hides content: the script adds class "js" to <html>, and only .js .reveal starts faded and shifted down, shown by an IntersectionObserver; respect prefers-reduced-motion; hover, focus-visible and active states on every control; scroll-smooth on <html>.
  • 360px wide with no sideways scrolling: grids that stack, nothing wider than the screen, max-w-full images, long words that wrap.
  • A script that never stops: check an element exists before using it; libraries only from cdn.jsdelivr.net or cdnjs.cloudflare.com.
  • After the code, at most three short lines: what the page has, and what to ask for next.`
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
- PYTHON — it runs in the page under the answer (Pyodide, Python 3.12): numpy, pandas, matplotlib and sympy load by themselves; no internet, no pip, no input().
  • One complete \`\`\`python block that runs as it is; print the results that matter, each with a label.
  • Files the person attached are in the working directory by their exact names: pd.read_csv("sales.csv"), pd.read_excel("sales.xlsx"), json.load(open("data.json")).
  • A plot draws under the code by itself: matplotlib with a title and axis labels in the reply language (Arabic shows correctly), plt.show() at the end; 3D with fig.add_subplot(projection="3d").
  • A file the code writes — df.to_excel("result.xlsx"), df.to_csv(…), plt.savefig("chart.png") — is offered to the person as a download: write one when they want a file.
  • Exact maths with sympy (solve, integrate, simplify); numbers with numpy; tables with pandas.
  • After the code, two or three lines on what the output will show.`
  },
  video: {
    // "script" alone matched JavaScript, TypeScript and every Python script.
    match: /video|reels?\b|tik ?tok|\bshorts\b|youtube|\b(?:ad|advert|commercial|promo|voice-?over) script\b|فيديو|ريلز|ريل|تيك ?توك|يوتيوب|سكريبت|سيناريو|مونتاج/i,
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
  problem: {
    // A worked problem in a science, engineering, medicine or pharmacy: a
    // quantity the subject names, and a number or an ask to find it. The
    // subject words alone are everyday language ("قوة الشخصية", "power
    // through"), so they count only with a figure or a verb that asks.
    match: {
      test: (t) => (PROBLEM_SUBJECT_EN.test(t) || PROBLEM_SUBJECT_AR.test(t)) && (/\d/.test(t) || PROBLEM_ASK.test(t))
    },
    en: `
- WORKED PROBLEMS (physics, chemistry, engineering, medicine and pharmacy, economics):
  1. The principle or law, written as an equation.
  2. What is given and what is sought, each with its unit, converted to SI first (say so).
  3. Substitute step by step, keeping units on every line; every calculation through the calculate tool.
  4. The result in bold with its unit and sensible significant figures, then a one-line check (units, order of magnitude or a limiting case).
  5. What it means in one or two sentences: physically, for the design, or clinically. A dose is a calculation to confirm with a pharmacist or doctor, never an instruction.
- Notation: inline \\( … \\), display $$ … $$, chemistry \\ce{2H2 + O2 -> 2H2O}, units upright (\\mathrm{m\\,s^{-2}}).`
  },
  teach: {
    // Explaining a topic or preparing for an exam — not "explain this error",
    // which the code rules answer.
    match: {
      test: (t) => /\b(?:explain|teach me|lesson|lecture|revise|revision|study|studying|exam|midterm|quiz me|help me understand)\b|اشرح|شرح|فهمني|فهّمني|وضح|وضّح|درس|ادرس|مراجعة|راجع|امتحان|اختبار|محاضرة/i.test(t)
        && !/\b(?:error|bug|exception|traceback|stack trace|crash(?:es|ed)?)\b|(?<![\u0600-\u06FF])(?:ها|هال|ال|بال|لل)?(?:خطأ|غلط)(?![\u0600-\u06FF])|ايرور|إيرور/i.test(t)
    },
    en: `
- TEACHING A TOPIC (explanations, lessons, revision):
  • The idea in one plain sentence first, then how it works, then an example.
  • Mark what matters with a callout, only where it earns its place (one per kind at most):
    > [!TIP] the key to understanding it
    > [!WARNING] the mistake people make most
    > [!CLINICAL] what it means in practice — at the bedside, on site, in the code
  • A process, cycle or pathway: a \`\`\`mermaid flowchart with short labels (no quotes or brackets inside a label).
  • End a long explanation with > [!SUMMARY] and three to five bullets.
  • For study or exam preparation, end with a \`\`\`quiz block of three questions: [{"question": "…", "options": ["…", "…", "…", "…"], "answer": "the correct option, word for word", "explanation": "…"}].`
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

// Arabic-only: the Levantine idioms and the opinion-question example, sent
// with the words they explain. Any message of 80 characters or fewer used to
// bring them too ("hi", "شكراً"): 409 tokens on most of what people send, where
// no cache holds them. A plain greeting's warmth is the core prompt's (TONE).
const BANTER = /فنان|وحش|كفو|يسعد|بحبك|بنحبك|أحبك|احبك|الهمة|الأخبار|الاخبار|أفضل|افضل|أحسن|احسن|رأيك|رايك|بتتوقع|يفوز/;
const SOCIAL = ['apology', 'subtext', 'excuses'];
const CODE_WORDS = /```|\bfunction\b|\bconst\b|\bclass\b|\bimport\b|stack trace|traceback|compile|debug|refactor|npm |yarn |pip |docker|regex|api\b|sdk\b|react|node\.js|typescript|javascript|python|java\b|sql\b|كود|بايثون|برمج|برمجة|دالة|كلاس|مكتبة|خطأ برمجي|صحح الكود|اكتب لي برنامج|تطبيق ويب/i;
// An attached file the page names (app.js's attachment context) that is code.
const CODE_FILE = /^Attachment Index \d+: .+\.(?:[cm]?jsx?|tsx?|py|ipynb|java|kt|swift|c|cc|cpp|h|hpp|cs|go|rb|php|rs|dart|sql|sh|ps1|html?|css|scss|vue|svelte)$/im;

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
  if (BANTER.test(text)) chosen.push('banter');
  return chosen;
}

/**
 * What a chat request needs beyond the core: search and file overlays (from
 * what the page attached), the engineering overlay, a site, and playbooks.
 * @param {Array<{role: string, content: any}>} userMessages the conversation, the answers in it included
 */
function detectNeeds(userMessages) {
  const texts = (userMessages || []).filter((m) => m && m.role === 'user').map((m) => textOf(m.content));
  const t = texts.join('\n');
  // What is asked for is judged on the person's own words, not on what the page
  // attached to them (ownWords.js): a CV's skills list is not a request for code.
  // A file of code still makes the request about code.
  const own = texts.map(ownWords);
  // A site is one file for the preview (siteRequest.js): the interface playbook
  // alone, without the engineering overlay's file tree, terminal commands and
  // tests, or a playbook a word chose ("doctor" for a clinic's site).
  const site = siteInConversation((userMessages || []).map((m) => ({ role: m && m.role, content: textOf(m && m.content) })), ownWords);
  // Python for the page carries the Python playbook alone: the charts
  // playbook said "never output Python", and the engineering overlay a file
  // tree and npm install.
  const python = !site && pythonInPage(own[own.length - 1] || '', DATA_FILE.test(texts[texts.length - 1] || ''));
  const code = !site && !python && (CODE_WORDS.test(own.join('\n')) || CODE_FILE.test(t));
  return {
    search: /source pack|connected search|connected deep search|web search note|search query used/i.test(t),
    files: /user attached files|pdf pages processed|ocr text extracted|extraction method|attachment index|المرفقات/i.test(t),
    // Code is no longer a selectable mode — the UI offers Flash and Max only —
    // so the engineering overlay (zero-laziness, file-path headers, security and
    // error-handling rules) is attached whenever the request is code-shaped
    // instead of waiting for a mode that can never be chosen.
    code,
    site,
    python,
    playbooks: site ? ['ui'] : python ? ['python'] : selectPlaybooks(own.slice(-2), { code })
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

module.exports = { PLAYBOOKS, ALL_PLAYBOOKS, selectPlaybooks, detectNeeds, playbookText, ownWords };

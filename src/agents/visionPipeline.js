// A study question in a picture: read it with the model that can see, solve
// it with the model that reasons.
//
// Every image went to the vision model alone, which had to read the page and
// solve the problem in one pass. That model (Llama 4 Scout on Groq) reads well
// and reasons less well than the text models, and it was never offered the
// calculator, so an exercise photographed from a textbook was read correctly
// and then got wrong on the arithmetic. Now, when the message is an exercise,
// the vision model only transcribes — text, equations, values, choices, what
// a figure shows — and the text model solves from that transcript, with the
// calculator. Anything else about an image (describe it, review a design) is
// still one pass.
//
// The two calls use different models, and Groq's free tier counts each model
// on its own, so the second does not wait on the first's allowance.
'use strict';

const { languageOfText } = require('../../public/domain/language');

// Asking for a solution, in either language: solve, find, calculate, prove,
// choose; or naming the page as an exercise, homework or an exam. Not
// "question", "problem", "how many" or "كم" alone: "what's the problem with
// this design?" and "how many people are in this photo?" are about the
// picture, and one pass that sees it answers them better.
const ASKS_TO_SOLVE = /\b(?:solve|find|calculate|compute|evaluate|prove|derive|simplify|determine|answer|choose|which of|what is the value|homework|exercise|worksheet|quiz|exam)\b|(?<![\u0600-\u06FF])(?:حل|حلي|حلها|حله|احسب|احسبي|أوجد|اوجد|جد|برهن|أثبت|اثبت|بسط|بسّط|اختر|أجب|اجب|جاوب|جاوبني|ما قيمة|مسألة|مسالة|المسألة|التمرين|تمرين|واجب|الواجب|امتحان)(?![\u0600-\u06FF])/i;
// An exercise on the page itself, from the OCR text the page attached: a
// numbered question, lettered choices, arithmetic or an unknown set equal to
// something. Not "-" or "/" between digits: every date has those.
const LOOKS_LIKE_EXERCISE = /\b(?:Q\s*\d+|question\s*\d+|exercise\s*\d+)\b|^\s*\(?[a-dA-D][).]\s+\S|\d\s*[+×÷*^]\s*\d|\b[a-zA-Z]\s*=\s*-?\d|(?<![\u0600-\u06FF])(?:سؤال|تمرين|أوجد|اوجد|احسب)(?![\u0600-\u06FF])/m;
const OCR_MARKER = 'OCR text extracted from image';
// The page appends its own instruction to every image message ("… Start with
// the answer …"); it is not the person asking for anything.
const PAGE_INSTRUCTION = /\n\n(?:Analyze the attached image\(s\) directly|حلّل الصورة\/الصور المرفقة)/;

/** The message cut into the person's own words and the OCR text the page added. */
function partsOf(text) {
  const all = String(text || '').split(PAGE_INSTRUCTION)[0];
  const at = all.indexOf(OCR_MARKER);
  return { own: at >= 0 ? all.slice(0, at) : all, ocr: at >= 0 ? all.slice(at) : '' };
}

/**
 * Whether an image message is an exercise to solve.
 * @param {string} text everything the person's message says, OCR included
 */
function isExercise(text) {
  const { own, ocr } = partsOf(text);
  return ASKS_TO_SOLVE.test(own) || LOOKS_LIKE_EXERCISE.test(ocr);
}

const READ_INSTRUCTION = [
  'Transcribe the attached image(s) for a solver who cannot see them. Do not solve anything.',
  'Reply with one JSON object and nothing else:',
  '{"question": "what is being asked, word for word", "text": "all other text in reading order, in its own language", "math": ["each equation or expression, in LaTeX"],',
  ' "values": [{"name": "", "value": "", "unit": ""}], "choices": ["A) …"], "figure": "what a diagram, graph or table shows: axes, labels, scales, points, angles, shapes, rows", "unclear": ["anything you cannot read"]}',
  'Copy numbers, signs, units and subscripts exactly. Leave a field empty rather than guess.'
].join('\n');

/** What the person's last message says, OCR text included. */
function lastUserText(messages) {
  const last = [...(messages || [])].reverse().find((m) => m && m.role === 'user');
  if (!last) return '';
  return typeof last.content === 'string' ? last.content : (last.content || []).filter((p) => p && p.type === 'text').map((p) => p.text).join('\n');
}

/** The person's messages with each image replaced by nothing, keeping all text. */
function withoutImages(messages) {
  return (messages || []).map((m) => (Array.isArray(m.content)
    ? { ...m, content: m.content.filter((p) => p && p.type === 'text').map((p) => p.text).join('\n') }
    : m));
}

/** The last user turn, with its images, and the reading instruction instead of its text. */
function readingMessages(messages) {
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user' && Array.isArray(m.content));
  const images = lastUser ? lastUser.content.filter((p) => p && p.type === 'image_url') : [];
  const said = lastUser ? lastUser.content.filter((p) => p && p.type === 'text').map((p) => p.text).join('\n') : '';
  return [{ role: 'user', content: [{ type: 'text', text: `${READ_INSTRUCTION}\n\nThe person's message, for context:\n${said.slice(0, 4000)}` }, ...images] }];
}

/**
 * What the vision model read, as text for the solver; null when it read
 * nothing usable.
 * @param {string} answer
 */
function transcriptFrom(answer) {
  const raw = String(answer || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const read = JSON.parse(raw.slice(start, end + 1));
      const lines = [];
      const add = (label, value) => {
        const list = (Array.isArray(value) ? value : [value]).map((v) => (v && typeof v === 'object' ? Object.values(v).filter(Boolean).join(' ') : String(v || '').trim())).filter(Boolean);
        if (list.length) lines.push(`${label}: ${list.join(Array.isArray(value) && label !== 'Text' ? ' | ' : '\n')}`);
      };
      add('Question', read.question);
      add('Text', read.text);
      add('Math', read.math);
      add('Given values', read.values);
      add('Choices', read.choices);
      add('Figure', read.figure);
      add('Could not be read', read.unclear);
      if (lines.length) return lines.join('\n');
    } catch (_) { /* prose, not JSON: used as it is below */ }
  }
  return raw.length >= 40 ? raw : null;
}

/** The conversation for the solver: the transcript in place of the images. */
function solvingMessages(messages, transcript, { arabic }) {
  const out = withoutImages(messages);
  let i = out.length - 1;
  while (i >= 0 && out[i].role !== 'user') i--;
  const note = [
    '',
    '---',
    'The attached image, as transcribed by a vision model (you cannot see the image itself):',
    transcript,
    '---',
    arabic
      ? 'حلّ المسألة خطوة بخطوة من هذا النص: المعطيات، القانون، التعويض، النتيجة بوحدتها. استعمل أداة calculate لكل عملية حسابية. إذا كان جزء مهم غير مقروء فقل ذلك.'
      : 'Solve it step by step from this transcript: what is given, the rule, the substitution, the result with its unit. Use the calculate tool for every calculation. If a part that matters could not be read, say so.'
  ].join('\n');
  if (i >= 0) out[i] = { ...out[i], content: `${String(out[i].content || '')}\n${note}` };
  return out;
}

/**
 * @param {object} deps
 * @param {(chain: string[][], params: object, opts?: object) => Promise<any>} deps.runChain
 * @param {Record<string, string[][]>} deps.pipelines
 * @param {(opts: {attach: string[]}) => any} deps.buildTools
 */
function createVisionPipeline({ runChain, pipelines, buildTools }) {
  const READ_MS = 25000;

  /**
   * Answers a message that carries images.
   * @param {{base: any, messages: any[], textChain: string[][], extraMs?: number}} req
   *        extraMs: time added for the second call, when the caller set no budget.
   */
  async function answer({ base, messages, textChain, extraMs = 0 }) {
    const onePass = () => runChain(pipelines.vision, { ...base, maxPerProviderMs: 16000 });
    const question = lastUserText(messages);
    if (!isExercise(question)) return onePass();
    // The solver's instruction in the person's language, judged on their own
    // words: an English worksheet photographed by an Arabic speaker is still
    // answered in Arabic.
    const arabic = languageOfText(partsOf(question).own) === 'ar';
    base = { ...base, deadlineMs: base.deadlineMs + extraMs };

    const notify = base.onToolCall || (() => {});
    notify({ tool: 'read_image', label: 'Reading the image', detail: '', status: 'running' });
    const read = await runChain(pipelines.vision, {
      ...base, messages: readingMessages(messages), turnContext: undefined, temperature: 0, max_tokens: 1500,
      onChunk: undefined, onReasoning: undefined, onToolCall: undefined, tools: undefined,
      deadlineMs: Math.min(base.deadlineMs, Date.now() + READ_MS), maxPerProviderMs: 16000
    });
    notify({ tool: 'read_image', label: 'Reading the image', detail: '', status: 'done' });
    const transcript = read && read.ok ? transcriptFrom(read.answer) : null;
    if (!transcript) return onePass();

    // Not the vision model as a text model — the last resort of every text
    // chain: one pass with the image beats it.
    const solver = textChain.filter(([, slot]) => slot !== 'vision');
    // A solution cut off mid-stream comes back as an answer (llmService keeps
    // what arrived), so the one-pass fallback below runs only when nothing
    // but, at most, a tool call's preamble reached the person.
    const solved = await runChain(solver, {
      ...base, messages: solvingMessages(messages, transcript, { arabic }), tools: buildTools({ attach: ['calculate'] }), maxPerProviderMs: 25000
    }, { withTools: true, originalQuestion: question });
    if (!solved || !solved.ok) return onePass();
    return { ...solved, toolsUsed: [{ tool: 'read_image', input: '', model: read.model }, ...(solved.toolsUsed || [])] };
  }

  return { answer };
}

module.exports = { createVisionPipeline, isExercise, transcriptFrom, solvingMessages, readingMessages };

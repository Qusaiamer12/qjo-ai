// Every word of an answer can be read: on a phone and a desktop, in light and
// dark, through the real page.
//
// mobile.css repaints the text inside an answer with !important — dark on
// light, light on dark — and the code block keeps its own dark header. On a
// phone in light mode every label in that header was #0f172a on #161b22,
// 1.03:1: the language, "Code", "Preview" and "Copy" were there and could not
// be seen. Nothing measured it. Here every element that holds text is
// measured against what is actually behind it (WCAG AA: 4.5:1, 3:1 for large
// text), and the code header's controls must fit on one row.
const { launchBrowser, BASE_URL } = require('./harness');

const SOURCES = [
  { title: 'Diabetes fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes', site: 'WHO', kind: 'medical', published: '2024-11-14', snippet: 'About 830 million people have diabetes.' },
  { title: 'What is diabetes?', url: 'https://www.niddk.nih.gov/health-information/diabetes', site: 'NIH', kind: 'medical', published: '', snippet: 'Blood glucose is too high.' },
  { title: 'Living with type 2', url: 'https://www.reddit.com/r/diabetes/comments/abc/living_with_type_2/', site: 'Reddit', kind: 'community', published: '', snippet: 'My experience.' }
];
const QUIZ = [
  { question: 'Which hormone lowers blood sugar?', options: ['Insulin', 'Glucagon', 'Cortisol', 'Adrenaline'], answer: 0, explanation: 'Insulin moves glucose into cells.' },
  // An answer that names no option: the choice is shown, never judged.
  { question: 'Which organ makes insulin?', options: ['Liver', 'Pancreas', 'Kidney'], answer: 'Z', explanation: 'The pancreas.' }
];
const ANSWER = [
  '## السكري',
  '',
  `السكري مرض مزمن **شائع** يصيب حوالي 830 مليون شخص [1](${SOURCES[0].url})، و*يرتفع* فيه سكر الدم [2](${SOURCES[1].url}) [3](${SOURCES[2].url}). اقرأ [الدليل](https://example.org/guide) و\`HbA1c\`.`,
  '',
  '> اقتباس قصير.',
  '',
  '> [!TIP]',
  '> الحركة اليومية تقلل الخطر.',
  '',
  '> [!WARNING]',
  '> لا توقف الدواء من نفسك.',
  '',
  '1. أول',
  '2. ثاني',
  '',
  '| النوع | السبب |',
  '|---|---|',
  '| الأول | مناعي |',
  '| الثاني | مقاومة الأنسولين |',
  '',
  '```html',
  '<h1>Hello</h1><button onclick="this.textContent=\'Clicked\'">Click</button>',
  '```',
  '',
  '```python',
  'print(sum(range(10)))',
  '```',
  '',
  '> [!SUMMARY]',
  '> - مزمن',
  '> - يمكن التحكم به',
  '',
  '```quiz',
  JSON.stringify(QUIZ),
  '```'
].join('\n');
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

let pass = 0, fail = 0;
const palettes = {};
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`${c ? '✅' : '❌'} ${m}`); if (!c && d !== undefined) console.log('   ', JSON.stringify(d).slice(0, 700)); };

// Every visible element that holds text in the answer, with its contrast
// against the colours actually behind it. Runs in the page.
function measure(scope) {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  // The colour behind an element: its own and its ancestors' backgrounds,
  // laid over each other down to the first opaque one. A gradient or an
  // image in the way cannot be read as one colour: null.
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (c && c[3] >= 1) break;
    }
    return layers.reverse().reduce((under, top) => over(top, under), [255, 255, 255, 1]);
  };
  const root = document.querySelector(scope);
  if (!root) return null;
  const out = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!['svg'].includes(el.tagName) && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || el.closest('.hidden, [hidden], [aria-hidden="true"]')) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity < 0.05) continue;
    const ink = parse(el.tagName === 'svg' ? cs.color : cs.webkitTextFillColor || cs.color);
    const bg = behind(el);
    const text = el.tagName === 'svg' ? `[icon in ${(el.parentElement.className || el.parentElement.tagName).toString().slice(0, 30)}]` : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim().slice(0, 40);
    if (!ink || !bg || ink[3] === 0) { out.push({ text, unmeasurable: true }); continue; }
    const fg = over([ink[0], ink[1], ink[2], ink[3] * opacity], bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const size = parseFloat(cs.fontSize);
    const large = el.tagName === 'svg' || size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    out.push({ text, cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 40), ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2), need: large ? 3 : 4.5 });
  }
  return out;
}

async function open(browser, { phone, theme }) {
  const ctx = await browser.newContext({ ...(phone ? { viewport: { width: phone, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }), permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/chat', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body:
    frame('tool_call', { tool: 'web_search', label: 'Web search', detail: 'diabetes', status: 'done', sources: SOURCES }) +
    frame('chunk', { text: ANSWER }) + frame('done', { toolsUsed: [{ tool: 'web_search', input: 'diabetes', sources: SOURCES }] }) }));
  await page.addInitScript(`try { localStorage.setItem('qjo_language', 'ar'); localStorage.setItem('qjo_theme', '${theme}'); } catch (_) {}`);
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.addStyleTag({ content: '#authOverlay{display:none !important;visibility:hidden !important;pointer-events:none !important;}' });
  await page.fill('#input', 'شو هو السكري؟');
  await page.click('#sendBtn');
  await page.waitForFunction(() => document.querySelector('.msg.assistant:last-of-type .code-block-wrapper') && !document.querySelector('.qjo-typing-cursor'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page, errors };
}

// Every piece of text in the answer, against a control that must fail.
async function everyWord(page, where) {
  const found = await page.evaluate(measure, '.msg.assistant:last-of-type');
  // Positive control: the measure sees real output, and a word painted the
  // header's own colour in the header is caught.
  const control = await page.evaluate((fn) => {
    const header = document.querySelector('.msg.assistant:last-of-type .code-block-header');
    if (!header) return null;
    const probe = document.createElement('b');
    probe.id = 'contrast-control';
    probe.textContent = 'control';
    probe.style.cssText = 'color:#1c2128 !important;-webkit-text-fill-color:#1c2128 !important';
    header.appendChild(probe);
    const seen = new Function(`return (${fn})`)()('#contrast-control');
    probe.remove();
    return seen && seen[0];
  }, measure.toString());
  ok(Array.isArray(found) && found.length >= 30 && found.some((f) => f.text.includes('مزمن')), `${where}: the measure reads the answer (${found && found.length} pieces of text)`);
  ok(control && control.ratio < 1.5, `${where}: control — a word painted dark on the code header is caught (${control && control.ratio}:1)`, control);
  const unreadable = (found || []).filter((f) => !f.unmeasurable && f.ratio < f.need);
  ok(unreadable.length === 0, `${where}: every piece of text in the answer can be read (${unreadable.length} below WCAG AA)`, unreadable.slice(0, 8));
}

// The code header: one row, whole labels, targets a thumb can hit, and the
// block's own colours (kept to compare across screens).
async function codeHeader(page, where, phone, theme) {
  const sel = '.msg.assistant:last-of-type .code-block-wrapper.has-live-preview .code-block-header';
  const header = await page.$eval(sel, (h) => {
    // Lines a control's label is broken over: its text's line boxes, by
    // their tops; 0 when the label is not shown (an icon).
    const lines = (part) => {
      const label = [...h.querySelectorAll(`${part} span`)].find((s) => s.getClientRects().length && s.textContent.trim());
      if (!label) return 0;
      const range = document.createRange();
      range.selectNodeContents(label);
      const tops = [...range.getClientRects()].map((r) => r.top).sort((a, b) => a - b);
      return tops.filter((top, i) => i === 0 || top - tops[i - 1] > 4).length;
    };
    const targets = [...h.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => {
      const r = b.getBoundingClientRect();
      return { name: (b.getAttribute('aria-label') || b.title || b.textContent).trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const ink = (part) => { const e = h.querySelector(part); return e ? getComputedStyle(e).webkitTextFillColor : 'missing'; };
    return {
      height: Math.round(h.getBoundingClientRect().height), overflow: h.scrollWidth - h.clientWidth, targets,
      copyLines: lines('.copy-code-btn'), previewLines: lines('.live-preview-tab-btn'), codeLines: lines('.code-tab-btn[data-tab="code"]'),
      palette: { language: ink('.code-block-lang'), selectedTab: ink('.code-tab-btn.active span'), otherTab: ink('.code-tab-btn:not(.active) span'), copy: ink('.copy-code-btn') }
    };
  }).catch(() => null);
  // Phone rules that repaint an answer must leave the block's palette alone.
  palettes[`${phone ? 'phone' : 'desktop'} ${theme}`] = header && header.palette;
  // From 360px, the width of most phones, one row; narrower, it may take two
  // but never cuts a control off or breaks a label.
  const narrow = phone && phone < 360;
  ok(header && (narrow || header.height <= 48) && header.overflow <= 1, `${where}: the code header is ${narrow ? 'whole' : 'one row'} (${header && header.height}px tall, ${header && header.overflow}px cut off)`, header);
  ok(header && header.copyLines <= 1 && header.previewLines === 1 && header.codeLines === 1, `${where}: no label in it is broken over lines (copy ${header && header.copyLines}, code ${header && header.codeLines}, preview ${header && header.previewLines})`, header);
  if (!phone) return;
  const small = header ? header.targets.filter((b) => b.w < 24 || b.h < 24) : ['no header'];
  ok(header && header.targets.length >= 4 && small.length === 0, `${where}: every control in it is at least 24px a side (${header && header.targets.length} controls)`, small);
}

// Copy is an icon on a phone: it still copies, and shows that it did.
async function phoneCopy(page, where) {
  const copy = '.msg.assistant:last-of-type .code-block-wrapper.has-live-preview .copy-code-btn';
  await page.click(copy);
  await page.waitForTimeout(250);
  const copied = await page.$eval(copy, async (b) => ({ text: await navigator.clipboard.readText().catch((e) => `unreadable: ${e.message}`), done: b.classList.contains('copied'), color: getComputedStyle(b).color }));
  const [r, g, b] = copied.color.match(/\d+/g).map(Number);
  ok(copied.text.includes('<h1>Hello</h1>') && copied.done && g > 150 && g > r + 60 && g > b, `${where}: Copy copies the code and turns green (${copied.color})`, copied);
}

// The second question's answer names no option.
async function quizUnknown(page, where) {
  await page.click('.msg.assistant:last-of-type .quiz-next-btn').catch(() => {});
  await page.click('.msg.assistant:last-of-type .quiz-option-btn >> text=Pancreas').catch(() => {});
  const second = await page.$eval('.msg.assistant:last-of-type .quiz-question-block:nth-child(2)', (b) => ({ shown: b.getClientRects().length > 0, states: [...b.querySelectorAll('.quiz-option-btn')].map((e) => e.dataset.state).join(','), note: b.querySelector('.quiz-explanation-note').innerText }))
    .catch(() => null);
  ok(second && second.shown && second.states === 'other,picked,other' && second.note === 'The pancreas.', `${where}: an answer the model did not name shows the choice and the explanation, judging neither (${second && second.states})`, second);
}

// phone: its width, or 0 for a desktop.
async function check(browser, phone, theme) {
  const where = `${phone ? `phone ${phone}px` : 'desktop'}, ${theme}`;
  const { ctx, page, errors } = await open(browser, { phone, theme });
  // A wrong answer, so the quiz shows every state it has: right, wrong,
  // the others, and the explanation.
  await page.click('.msg.assistant:last-of-type .quiz-option-btn >> text=Glucagon').catch(() => {});
  const states = await page.$$eval('.msg.assistant:last-of-type .quiz-question-block:nth-child(1) .quiz-option-btn', (els) => els.map((e) => e.dataset.state).join(','));
  ok(states === 'correct,wrong,other,other', `${where}: the quiz marks the right answer and the wrong choice (${states})`);
  const dark = await page.evaluate(() => document.body.classList.contains('dark'));
  ok(dark === (theme === 'dark'), `${where}: the page is in ${theme} mode`);
  await everyWord(page, where);
  await codeHeader(page, where, phone, theme);
  // The send arrow points the way a message goes, in Arabic too: right to
  // left pages turned it over, and it pointed down.
  const arrow = await page.$eval('#sendBtn svg', (svg) => {
    let m = new window.DOMMatrix();
    for (let e = svg; e && e !== document.body; e = e.parentElement) {
      const t = getComputedStyle(e).transform;
      if (t && t !== 'none') m = new window.DOMMatrix(t).multiply(m);
    }
    return { a: +m.a.toFixed(2), d: +m.d.toFixed(2) };
  });
  ok(arrow.d > 0, `${where}: the send arrow points up (${JSON.stringify(arrow)})`);
  if (phone === 390) await phoneCopy(page, where);
  await quizUnknown(page, where);
  ok(errors.length === 0, `${where}: no JS errors`, errors.slice(0, 2));
  await ctx.close();
}

(async () => {
  const browser = await launchBrowser();
  try {
    for (const phone of [390, 0]) for (const theme of ['light', 'dark']) await check(browser, phone, theme);
    for (const phone of [360, 320]) await check(browser, phone, 'light');
    for (const theme of ['light', 'dark']) {
      const [onPhone, onDesktop] = [palettes[`phone ${theme}`], palettes[`desktop ${theme}`]];
      ok(onPhone && onDesktop && JSON.stringify(onPhone) === JSON.stringify(onDesktop) && onDesktop.selectedTab !== onDesktop.otherTab,
        `${theme}: the code header has the same colours on a phone as on a desktop, the chosen tab set apart`, { onPhone, onDesktop });
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

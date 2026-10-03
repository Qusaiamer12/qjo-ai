// Contrast of every visible piece of text in a part of the page, against the
// colours actually behind it (WCAG AA: 4.5:1, 3:1 for large text and icons).
// Runs in the page: page.evaluate(measure, selector). Shared by the suites
// that measure what a word sits on (readability, python-run).
'use strict';

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

module.exports = { measure };

/**
 * Pictures in an answer: what an ```image block says, the address that draws
 * it, which messages ask for one, and the SVG the block may carry as a
 * stand-in.
 *
 * The model writes a precise English description and the page asks an image
 * service (Pollinations) to paint it (public/ui/imageBlock.js). Measured: an
 * Arabic description draws the wrong thing, so the description must be
 * English; a block whose description is not says so instead of being sent.
 *
 * The block is data. Its JSON is read by relaxedJson.js, never run. The SVG
 * it may carry — shown when the service does not answer — is not copied but
 * rebuilt from an allowlist of shapes and attributes: no script, no event
 * handler, no style, no link, no address of any kind, not one reference that
 * leaves the drawing. The page then shows it as an image, which a browser
 * does not let run anything either: two walls, either one enough.
 *
 * Pure: text in, values out.
 */
(function () {
  'use strict';

  const HOST = 'https://image.pollinations.ai/prompt/';
  const LIMITS = { prompt: 500, style: 80, title: 120, alt: 300, svg: 24000, min: 256, max: 1536, size: 1024, elements: 400, depth: 16 };
  const SEEDS = 1000000;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // ── The block ───────────────────────────────────────────────────────────

  /** Text on one line, without control or direction characters, at most `max` long. */
  function clean(value, max) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const text = String(value).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩‎‏]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    const cut = text.slice(0, max);
    return cut.replace(/\s+\S*$/, '') || cut;
  }

  /** Whether a text is English enough to be drawn: most of its letters are Latin. */
  function englishShare(text) {
    const letters = String(text).match(/\p{L}/gu) || [];
    const latin = String(text).match(/[A-Za-z]/g) || [];
    return { letters: letters.length, latin: latin.length };
  }

  function dimension(value) {
    const n = parseInt(String(value == null ? '' : value), 10);
    if (!Number.isFinite(n)) return LIMITS.size;
    return Math.min(LIMITS.max, Math.max(LIMITS.min, n));
  }

  /** A seed the same block always gets, so a chat opened again draws the same picture. */
  function seedFor(spec) {
    let hash = 2166136261;
    for (const ch of `${spec.prompt}|${spec.style}|${spec.width}x${spec.height}`) {
      hash ^= ch.codePointAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash % SEEDS;
  }

  /** @param {string} code @returns {{ok: false, error: {code: string}}} */
  const fail = (code) => ({ ok: false, error: { code } });

  /**
   * Reads a block's text.
   * @param {string} raw what is between the fences
   * @returns {{ok: true, spec: {prompt: string, style: string, title: string, alt: string, width: number, height: number, svg: string}} | {ok: false, error: {code: string}}}
   */
  function parse(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return fail('empty');
    let value = text;
    if (/^[{[]/.test(text)) {
      const relaxed = typeof module !== 'undefined' && module.exports ? require('./relaxedJson.js') : /** @type {any} */ (window).QjoDomain.relaxedJson;
      const read = relaxed.readLoose(text);
      if (!read.ok) return fail('unreadable');
      value = read.value;
    }
    // A block that is only the description is read as that.
    const block = typeof value === 'string' ? { prompt: value } : value;
    if (!block || typeof block !== 'object' || Array.isArray(block)) return fail('unreadable');
    const pick = (...keys) => { for (const k of keys) if (own(block, k)) return block[k]; return undefined; };

    const prompt = clean(pick('prompt', 'description', 'desc', 'text'), LIMITS.prompt);
    if (!prompt) return fail('noPrompt');
    const share = englishShare(prompt);
    if (share.letters && share.latin / share.letters < 0.6) return fail('notEnglish');
    if (share.latin < 3) return fail('noPrompt');
    // A style the service would not understand is left out, not sent.
    let style = clean(pick('style'), LIMITS.style);
    const styleShare = englishShare(style);
    if (styleShare.letters && styleShare.latin / styleShare.letters < 0.6) style = '';

    const title = clean(pick('title', 'caption'), LIMITS.title);
    const spec = {
      prompt,
      style,
      title,
      alt: clean(pick('alt'), LIMITS.alt) || title,
      width: dimension(pick('width', 'w')),
      height: dimension(pick('height', 'h')),
      svg: sanitizeSvg(typeof pick('svg') === 'string' ? pick('svg') : '')
    };
    return { ok: true, spec };
  }

  /**
   * The address that draws the picture.
   * @param {{prompt: string, style: string, width: number, height: number}} spec
   * @param {number} seed
   */
  function buildUrl(spec, seed) {
    const text = spec.style ? `${spec.prompt}, ${spec.style} style` : spec.prompt;
    const n = Math.abs(Math.trunc(Number(seed))) % SEEDS || 0;
    return `${HOST}${encodeURIComponent(text)}?width=${dimension(spec.width)}&height=${dimension(spec.height)}&nologo=true&seed=${n}`;
  }

  /**
   * A seed other than the one shown ("Another version").
   * @param {number} current
   * @param {() => number} [random]
   */
  function anotherSeed(current, random = Math.random) {
    for (let tries = 0; tries < 6; tries++) {
      const seed = 1 + Math.floor(random() * (SEEDS - 1));
      if (seed !== current) return seed;
    }
    return (Math.abs(Math.trunc(Number(current)) || 0) + 1) % SEEDS;
  }

  // ── Which messages ask for a picture ────────────────────────────────────

  const ar = (words) => `(?<![\\u0600-\\u06FF])(?:و|ب|ف)?(?:ال)?(?:${words})(?![\\u0600-\\u06FF])`;
  const NOUN_EN = 'picture|image|illustration|drawing|logo|poster|portrait|painting|artwork|wallpaper|sticker|avatar|cartoon|mascot|sketch|photo|photograph|anime|caricature|cover art|album cover|book cover';
  // "paint my bedroom", "illustrate the concept" and "sketch a plan" are not pictures: those verbs need a picture's noun (MAKE_EN).
  const DRAW_EN = /\b(?:draw|doodle)\s+(?:me\s+|us\s+|for me\s+)?(?:an?|the|my|our|some|two|three|\d+)\b/i;
  const MAKE_EN = new RegExp(`\\b(?:generate|create|make|design|produce|render|imagine|paint|illustrate|sketch)\\b[^.?!\\n]{0,50}?\\b(?:an?|some|another|new|me)\\s+(?:[\\w'-]+\\s+){0,3}?(?:${NOUN_EN})s?\\b`, 'i');
  // "I want a picture of…": a wish for one, not "I want to analyse a picture".
  const WISH_EN = new RegExp(`\\b(?:give me|get me|show me|i need|i want|i'd like|can i (?:get|have)|could i (?:get|have))\\s+(?:an?|some|another|new)\\s+(?:[\\w'-]+\\s+){0,3}?(?:${NOUN_EN})s?\\b`, 'i');
  // What a "draw" or an "image" also means: a chart, a function, code, a
  // container image, an idiom.
  const NOT_EN = /\b(?:charts?|graphs?|plots?|diagrams?|flow ?charts?|tables?|timelines?|mind ?maps?|uml|erd|schema|architecture|wireframes?|gantt|functions?|curves?|equations?|derivatives?|integrals?|histograms?|circuits?|docker|containers?|kubernetes|iso|vm|virtual machine|base image|cod(?:e|ing)|scripts?|python|javascript|typescript|css|react|node|sql|api|regex|bugs?|errors?|components?|prompts?|midjourney|dall-?e|stable diffusion|resize|crop|compress|convert|upload|download|users?|ocr|recogni[sz]\w*|classif\w*|segment\w*|formats?|resolution|pixels?|conclusions?|attention|comparisons?|parallels?|inferences?|lessons?)\b/i;
  // A shape asked for by itself belongs to mathematics, not to a painter.
  const SHAPE_EN = /\b(?:draw|sketch|plot)\s+(?:me\s+|us\s+)?(?:an?|the|one)\s+(?:[\w-]+\s+){0,2}?(?:circles?|triangles?|squares?|rectangles?|spheres?|cubes?|cones?|cylinders?|pyramids?)\b/i;
  const DRAW_AR = new RegExp(ar('[اأإ]رسم(?:ل(?:ي|نا|ه|ها|ك))?|[اأإ]رسمي|رسمة|رسمه'));
  const NOUN_AR = ar('صورة|صوره|رسمة|رسمه|لوغو|لوجو|بوستر|ملصق|افاتار|أفاتار|بورتريه|كاريكاتير|ماسكوت|شخصية كرتونية|رسم كرتوني');
  // A verb that makes, then (at most "لي" and one more word) the thing made:
  // "سويلي صورة قطة", "صمم لي شعار" — and not "اعمل تحليل لهذه الصورة".
  const MAKE_AR = new RegExp(`${ar('صمم|صمّم|صممي|صمملي|اصنع|اصنعي|انشئ|أنشئ|ولد|ولّد|سوي|سويلي|اعمل|اعملي')}(?:\\s+لي)?\\s+(?:[^\\s.؟?!]+\\s+)?(?:${NOUN_AR}|${ar('شعار')})`);
  const WISH_AR = new RegExp(`${ar('بدي|أريد|اريد|ابغى|عايز|عاوز|اعطني|اعطيني')}\\s+${NOUN_AR}`);
  const LOGO_AR = new RegExp(`${ar('صمم|صمّم|صممي|صمملي|ارسم|ارسمي|ارسملي|ولد|ولّد|انشئ|أنشئ|اصنع')}[^.؟?!\\n]{0,25}?${ar('شعار')}`);
  const NOT_AR = new RegExp(ar('مخطط|بياني|بيانيا|منحنى|منحني|دالة|دالتين|اقتران|جدول|معادلة|خريطة|خارطة|تخطيطي|دارة|هندسي|شجرة|هيكل|كود|برمجة|بايثون'));
  const SHAPE_AR = new RegExp(`${ar('[اأإ]رسم(?:ل(?:ي|نا|ه|ها|ك))?')}(?:\\s+لي)?\\s+${ar('دائرة|مثلث|مربع|مستطيل|كرة|مكعب|مخروط|أسطوانة|اسطوانة|هرم')}`);

  /**
   * Whether a person's words ask for a picture, logo, illustration or
   * drawing to be made — not a chart, a figure of mathematics or a diagram
   * (those have blocks of their own), and not code.
   * @param {string} own the person's own words
   */
  function asksForPicture(own) {
    const text = String(own || '');
    if (!text) return false;
    if (NOT_EN.test(text) || NOT_AR.test(text) || SHAPE_EN.test(text) || SHAPE_AR.test(text)) return false;
    return [DRAW_EN, MAKE_EN, WISH_EN, DRAW_AR, MAKE_AR, WISH_AR, LOGO_AR].some((re) => re.test(text));
  }

  /** The same, of a message as the page sent it. @param {string} message @param {(text: string) => string} ownWords */
  const pictureMessage = (message, ownWords) => asksForPicture(ownWords(String(message || '')));

  const BLOCK = /```image\b/i;
  /** Whether an answer drew one: a follow-up ("make the cat orange") keeps the format. */
  const answerHasPicture = (text) => BLOCK.test(String(text || ''));

  /**
   * What is wrong with a block, in the person's language.
   * @param {any} error from parse
   * @param {(key: string, vars?: Record<string, string | number>) => string} t
   */
  function explain(error, t) {
    switch (error && error.code) {
      case 'empty': return t('imageWhyEmpty');
      case 'noPrompt': return t('imageWhyNoPrompt');
      case 'notEnglish': return t('imageWhyNotEnglish');
      default: return t('imageWhyUnreadable');
    }
  }

  // ── The SVG stand-in ────────────────────────────────────────────────────

  const ELEMENTS = new Map(['svg', 'g', 'defs', 'linearGradient', 'radialGradient', 'stop', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan', 'title', 'desc', 'clipPath', 'mask']
    .map((name) => [name.toLowerCase(), name]));
  const ATTRIBUTES = new Map(['id', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'dx', 'dy', 'points', 'd', 'transform',
    'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'fill-opacity', 'fill-rule', 'clip-rule', 'opacity',
    'offset', 'stop-color', 'stop-opacity', 'viewBox', 'preserveAspectRatio', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
    'clip-path', 'mask', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing']
    .map((name) => [name.toLowerCase(), name]));
  // Only these may point at something, and only at an id inside the drawing.
  const REFERENCING = new Set(['fill', 'stroke', 'clip-path', 'mask']);
  const TEXT_IN = new Set(['text', 'tspan', 'title', 'desc']);
  const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text']);
  const RAW_TEXT = new Set(['script', 'style']);
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const ID = /^[A-Za-z][\w-]{0,40}$/;
  const VIEWBOX = /^\s*-?\d+(?:\.\d+)?(?:[\s,]+-?\d+(?:\.\d+)?){3}\s*$/;
  const ASPECT = /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/;
  // An element name with its attributes, the way markup writes them. A tag
  // this cannot read is a drawing that cannot be read: refused whole.
  const TAG = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
  const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  /** Character references read once; one this does not know becomes U+0000, which no value passes. */
  function decode(text) {
    return text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (_, dec, hex, name) => {
      if (name) return own(NAMED, name.toLowerCase()) ? NAMED[name.toLowerCase()] : '\u0000';
      const code = dec ? Number(dec) : parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\u0000';
    });
  }
  const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttribute = (text) => escapeText(text).replace(/"/g, '&quot;');

  /** The value of an attribute, or null when it is not one to keep. */
  function safeValue(name, value) {
    if (value.length > 3000 || /[\u0000-\u001f<>&\\]/.test(value)) return null;
    if (/(?:javascript|vbscript|data|file|https?|ftp)\s*:|\/\/|expression|@import|binding/i.test(value)) return null;
    const refs = value.match(/url\s*\([^)]*\)?/gi) || [];
    if (refs.length && !REFERENCING.has(name)) return null;
    if (refs.some((ref) => !/^url\(#[A-Za-z][\w-]{0,40}\)$/.test(ref))) return null;
    if (name === 'id' && !ID.test(value)) return null;
    if (name === 'viewbox' && !VIEWBOX.test(value)) return null;
    if (name === 'preserveaspectratio' && !ASPECT.test(value)) return null;
    return value;
  }

  /** The attributes of one tag that pass, as [name, value] pairs. */
  function attributesOf(raw) {
    const kept = new Map();
    for (const m of raw.matchAll(ATTRIBUTE)) {
      const lower = m[1].toLowerCase();
      if (!ATTRIBUTES.has(lower) || kept.has(lower)) continue;
      const value = safeValue(lower, decode(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : ''));
      if (value != null) kept.set(lower, [ATTRIBUTES.get(lower), value]);
    }
    return kept;
  }

  const write = (attrs) => [...attrs.values()].map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');

  /** The opening tag of the drawing: always the same namespace and a box that is a viewBox. */
  function rootTag(raw, selfClosing) {
    const attrs = attributesOf(raw);
    const number = (key) => { const v = attrs.get(key); return v && /^\d+(?:\.\d+)?$/.test(v[1]) ? Number(v[1]) : 0; };
    const box = attrs.has('viewbox') ? null : number('width') > 0 && number('height') > 0 ? `0 0 ${number('width')} ${number('height')}` : '0 0 512 512';
    for (const key of ['width', 'height', 'x', 'y', 'id']) attrs.delete(key);
    if (box) attrs.set('viewbox', ['viewBox', box]);
    return `<svg xmlns="http://www.w3.org/2000/svg"${write(attrs)}${selfClosing ? '/>' : '>'}`;
  }

  // The walk over the text keeps its place and what it has built in `walk`;
  // each step returns false when the text cannot be read, which refuses the
  // whole drawing.
  const textHere = (walk) => !walk.dropping && walk.stack.length > 0 && TEXT_IN.has(walk.stack[walk.stack.length - 1].lower);

  /** Comments, instructions, CDATA and the doctype: undefined when the text at the cursor is none of them. */
  function special(walk) {
    const { src } = walk;
    const past = (marker, from) => { const end = src.indexOf(marker, from); if (end < 0) return false; walk.i = end + marker.length; return true; };
    if (src.startsWith('<!--', walk.i)) return past('-->', walk.i + 4);
    if (src.startsWith('<?', walk.i)) return past('?>', walk.i + 2);
    if (walk.lowered.startsWith('<!doctype', walk.i)) return past('>', walk.i);
    if (!src.startsWith('<![CDATA[', walk.i)) return undefined;
    const end = src.indexOf(']]>', walk.i);
    if (end < 0) return false;
    if (textHere(walk)) walk.out.push(escapeText(src.slice(walk.i + 9, end).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')));
    walk.i = end + 3;
    return true;
  }

  function closeTag(walk, lower) {
    const top = walk.stack.pop();
    if (!top || top.lower !== lower) return false;
    if (top.keep) walk.out.push(`</${top.name}>`); else walk.dropping--;
    if (!walk.stack.length) walk.closed = true;
    return true;
  }

  /** Script and style hold text that is not markup: skipped as a whole. */
  function skipRawText(walk, lower, selfClosing) {
    if (!walk.root) return false;
    if (selfClosing) return true;
    const end = walk.lowered.indexOf(`</${lower}`, walk.i);
    const close = end < 0 ? -1 : walk.src.indexOf('>', end);
    if (close < 0) return false;
    walk.i = close + 1;
    return true;
  }

  function openTag(walk, m) {
    const [, , rawName, rawAttributes, slash] = m;
    const selfClosing = Boolean(slash);
    const lower = rawName.toLowerCase();
    if (walk.closed) return false;
    if (RAW_TEXT.has(lower)) return skipRawText(walk, lower, selfClosing);
    if (!walk.root) {
      if (lower !== 'svg') return false;
      walk.root = true;
    }
    const name = ELEMENTS.get(lower);
    const keep = !walk.dropping && Boolean(name) && (lower !== 'svg' || !walk.stack.length);
    if (keep) {
      if (++walk.count > LIMITS.elements || walk.stack.length >= LIMITS.depth) return false;
      if (SHAPES.has(lower)) walk.drew = true;
      walk.out.push(lower === 'svg' ? rootTag(rawAttributes, selfClosing) : `<${name}${write(attributesOf(rawAttributes))}${selfClosing ? '/>' : '>'}`);
    }
    if (selfClosing) {
      if (lower === 'svg') walk.closed = true;
      return true;
    }
    walk.stack.push({ name: name || rawName, lower, keep });
    if (!keep) walk.dropping++;
    return true;
  }

  function step(walk) {
    const { src } = walk;
    const lt = src.indexOf('<', walk.i);
    const between = src.slice(walk.i, lt < 0 ? src.length : lt);
    if (between.trim() && textHere(walk)) walk.out.push(escapeText(decode(between).replace(/\u0000/g, '')));
    if (lt < 0) { walk.i = src.length; return true; }
    walk.i = lt;
    const done = special(walk);
    if (done !== undefined) return done;
    TAG.lastIndex = walk.i;
    const m = TAG.exec(src);
    if (!m) return false;
    walk.i = TAG.lastIndex;
    return m[1] ? closeTag(walk, m[2].toLowerCase()) : openTag(walk, m);
  }

  /**
   * An SVG a model wrote, rebuilt from what is known to be safe; '' when it
   * cannot be read or has nothing to show. Nothing of the original is passed
   * through: elements and attributes outside the allowlist are left out
   * (script, style, foreignObject, use, image, a, animation and every on*
   * handler among them), and so is a value that holds an address, a script
   * scheme, or a reference to anything but an id of the drawing itself.
   * @param {string} input
   * @returns {string}
   */
  function sanitizeSvg(input) {
    const src = String(input == null ? '' : input);
    if (!src.trim() || src.length > LIMITS.svg || /<!ENTITY|<!DOCTYPE[^>]*\[/i.test(src)) return '';
    const walk = { src, lowered: src.toLowerCase(), out: [], stack: [], dropping: 0, count: 0, root: false, closed: false, drew: false, i: 0 };
    while (walk.i < src.length) if (!step(walk)) return '';
    if (walk.stack.length || !walk.root || !walk.drew) return '';
    const markup = walk.out.join('');
    // The result is built from the allowlist, so this should never fire: it is
    // there for the day the allowlist is edited carelessly.
    const tags = markup.replace(/>[^<]*</g, '><');
    if (/<\s*(?:script|style|foreignobject|iframe|object|embed|use|image|a|animate\w*|set|link|meta)\b|\son\w+\s*=|javascript:|data:|\bhref\s*=|https?:(?!\/\/www\.w3\.org\/2000\/svg")/i.test(tags)) return '';
    return markup;
  }

  /** The drawing as an address an <img> can show. @param {string} svg a sanitised SVG */
  const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const api = { parse, buildUrl, seedFor, anotherSeed, asksForPicture, pictureMessage, answerHasPicture, explain, sanitizeSvg, svgDataUrl, HOST, LIMITS };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.imageBlock = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

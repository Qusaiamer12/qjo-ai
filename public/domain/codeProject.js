/**
 * What an answer's code previews as.
 *
 * An answer that builds a page usually arrives as separate blocks — the HTML,
 * then the CSS, then the JavaScript — and each block used to preview on its
 * own: a page with no styles and buttons that did nothing. A React component
 * did not preview at all. This decides which blocks make up one preview (a
 * "project") and writes the document the preview iframe loads.
 *
 * Pure: blocks in, a document string out. The iframe it goes into is
 * sandboxed without same-origin, so nothing here is a security boundary. The
 * escaping is for correctness: a "</script>" inside someone's code must not
 * end the element that carries it.
 */
(function (global) {
  'use strict';

  // Pinned. The browser suite serves these exact files from its own
  // devDependencies and fails if a version here drifts from them.
  const LIBS = {
    react: 'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
    reactDom: 'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
    babel: 'https://cdn.jsdelivr.net/npm/@babel/standalone@8.0.5/babel.min.js',
    lucideReact: 'https://cdn.jsdelivr.net/npm/lucide-react@1.48.0/dist/cjs/lucide-react.js',
    tailwind: 'https://cdn.tailwindcss.com'
  };
  const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Cairo:wght@400;500;600;700&display=swap';

  const DEFAULT_STRINGS = {
    libsFailed: 'The preview libraries could not be loaded. Check the connection and reload.',
    moduleMissing: '"{name}" is not available in the preview. It supports react, react-dom and lucide-react.',
    noComponent: 'No component to show: export one (export default function App) or name it App.',
    formHeld: 'The form works — in a preview nothing is sent.',
    pageMissing: '"{name}" is not part of this answer.'
  };

  // Runs first in every preview, before the page's own code.
  //
  // A preview is an about:srcdoc document, and its links resolve against the
  // app's address: a site's "#about" pointed at the app, and one click turned
  // the preview into Qjo's own sign-in page. A form's submit did the same.
  // Now a link to a section scrolls to it in the page — not by setting
  // location.hash, which in a srcdoc document is itself a navigation to the
  // app's address (measured in Chromium); a link to
  // another file of the answer asks the app to show it; a link out opens in a
  // new tab; a form shows that it works, and sends nothing.
  const LINK_GUARD = `(function () {
  var S = __STRINGS__;
  function note(text) {
    var box = document.getElementById('qjo-preview-note');
    if (!box) {
      box = document.createElement('div');
      box.id = 'qjo-preview-note';
      box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;max-width:90%;padding:10px 14px;border-radius:10px;background:#0f172a;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      (document.body || document.documentElement).appendChild(box);
    }
    box.textContent = text;
    clearTimeout(note.timer);
    note.timer = setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 3200);
  }
  function section(id) {
    if (!id) return null;
    try { id = decodeURIComponent(id); } catch (_) {}
    return document.getElementById(id) || document.getElementsByName(id)[0] || null;
  }
  window.addEventListener('message', function (e) {
    if (e.source === window.parent && e.data && e.data.qjoPreview === 'missing') note(S.pageMissing.replace('{name}', e.data.name));
  });
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || e.defaultPrevented) return;
    var href = a.getAttribute('href').trim();
    if (/^javascript:/i.test(href)) return;
    e.preventDefault();
    if (href.charAt(0) === '#') {
      var id = href.slice(1);
      if (!id) return; // href="#" is a button's: its own handler acts
      if (id === 'top') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      var el = section(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (/^(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i.test(href)) { window.open(a.href, '_blank', 'noopener'); return; }
    var name = href.split(/[?#]/)[0].split('/').pop();
    if (name) window.parent.postMessage({ qjoPreview: 'open', name: name }, '*');
  }, true);
  // After the page's own handlers, so a form it handles itself shows its own
  // message; one it left alone is held here. The check is put on the form as
  // the event starts, so it runs last there, even when the page's handler
  // stops the event from going further. form.submit() fires no event.
  function held(e) { if (!e.defaultPrevented) { e.preventDefault(); note(S.formHeld); } }
  window.addEventListener('submit', function (e) { if (e.target && e.target.addEventListener) e.target.addEventListener('submit', held, { once: true }); }, true);
  HTMLFormElement.prototype.submit = function () { note(S.formHeld); };
})();`;
  const guardScript = (strings) => `<script>${LINK_GUARD.replace('__STRINGS__', () => jsonForScript({ ...DEFAULT_STRINGS, ...(strings || {}) }))}</script>\n`;

  const ARABIC = /[\u0600-\u06FF]/;
  // Server code: a page must not run it, and it is not the page's script.
  const NODE_CODE = /\brequire\(\s*['"](?:express|fs|path|https?|os|child_process|dotenv|mongoose|cors|node:[a-z]+)['"]\s*\)|\bfrom\s+['"](?:express|fs|path|https?|os|node:[a-z]+)['"]|\bmodule\.exports\b|\bprocess\.env\b|\.listen\(\s*(?:\d|PORT\b|port\b)/;
  const JSX_RETURN = /(?:return|=>)\s*\(?\s*<(?:[A-Za-z][\w.]*|>)/;

  const basename = (path) => String(path || '').split(/[\\/]/).pop().split('?')[0].toLowerCase();
  const extension = (path) => { const name = basename(path); return name.includes('.') ? name.split('.').pop() : ''; };

  function looksLikeMarkup(code) {
    const trimmed = String(code || '').trim();
    return /<!doctype\s+html/i.test(trimmed) || /<html\b/i.test(trimmed) ||
      (trimmed.startsWith('<') && /<\/[a-z][a-z0-9]*>$/i.test(trimmed));
  }

  function isReactSource(code) {
    const text = String(code || '');
    return /\bfrom\s+['"]react(?:-dom)?(?:\/client)?['"]/.test(text) || JSX_RETURN.test(text);
  }

  /**
   * @param {{lang?: string, code?: string, path?: string}} block
   * @returns {'html'|'svg'|'css'|'js'|'react'|null}
   */
  function kindOf(block) {
    const lang = String(block.lang || '').toLowerCase();
    const ext = extension(block.path);
    const code = String(block.code || '');
    if (lang === 'svg' || ext === 'svg') return 'svg';
    if (['html', 'htm', 'xhtml'].includes(lang) || ['html', 'htm'].includes(ext)) return code.trim().startsWith('<svg') ? 'svg' : 'html';
    if (lang === 'css' || ext === 'css') return 'css';
    if (['jsx', 'tsx'].includes(lang) || ['jsx', 'tsx'].includes(ext)) return 'react';
    if (['javascript', 'js', 'mjs'].includes(lang) || ['js', 'mjs'].includes(ext)) {
      if (NODE_CODE.test(code)) return null;
      if (isReactSource(code)) return 'react';
      return looksLikeMarkup(code) ? 'html' : 'js';
    }
    if ((!lang || lang === 'xml' || lang === 'code') && looksLikeMarkup(code)) return 'html';
    return null;
  }

  // <link href="style.css"> and <script src="app.js"></script> that point at
  // files of the answer. They can never load inside the preview — relative to
  // the app they would fetch the app's own files — so they are always taken
  // out, and the blocks they name are put in their place.
  function localReferences(html) {
    const found = [];
    const patterns = [
      ['style', /<link\b[^>]*\bhref\s*=\s*["']([^"']+\.css)(?:\?[^"']*)?["'][^>]*>/gi],
      ['script', /<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.m?js)(?:\?[^"']*)?["'][^>]*>\s*<\/script\s*>/gi]
    ];
    for (const [role, pattern] of patterns) {
      for (const match of html.matchAll(pattern)) {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(match[1])) continue;
        found.push({ role, tag: match[0], name: basename(match[1]) });
      }
    }
    return found;
  }

  function companions(blocks, target, kind, refs, includeUnreferenced) {
    const pool = blocks.filter((b) => b !== target && kindOf(b) === kind);
    if (!refs.length) return includeUnreferenced ? pool : [];
    const named = pool.filter((b) => refs.some((r) => r.name === basename(b.path)));
    return named.length ? named : pool.filter((b) => !b.path);
  }

  function uniqueName(name, taken) {
    let candidate = name;
    for (let n = 2; taken.has(candidate); n++) candidate = name.replace(/(\.[^.]+)?$/, `-${n}$1`);
    taken.add(candidate);
    return candidate;
  }

  /**
   * The blocks one preview is made of: the block whose Preview was asked for,
   * and the styles and scripts of the same answer that belong with it.
   * @param {Array<{lang?: string, code?: string, path?: string}>} blocks the answer's code blocks, in order
   * @param {number} index the block whose preview was asked for
   * @returns {{kind: 'html'|'svg'|'react', files: Array<{name: string, lang: string, role: 'main'|'style'|'script', code: string}>} | null}
   */
  function projectFor(blocks, index) {
    const list = (blocks || []).map((b) => ({ lang: String(b.lang || ''), code: String(b.code || ''), path: String(b.path || '') }));
    const target = list[index];
    const kind = target ? kindOf(target) : null;
    if (kind !== 'html' && kind !== 'svg' && kind !== 'react') return null;

    const taken = new Set();
    const defaults = { html: 'index.html', svg: 'image.svg', react: /tsx/i.test(target.lang + target.path) ? 'App.tsx' : 'App.jsx' };
    /** @type {Array<{name: string, lang: string, role: 'main'|'style'|'script', code: string}>} */
    const files = [{ name: uniqueName(basename(target.path) || defaults[kind], taken), lang: kind === 'react' ? 'jsx' : kind, role: 'main', code: target.code }];
    if (kind === 'svg') return { kind, files };

    // One page in the answer: its styles and scripts are its own. Several
    // pages: a block joins only the page that names it.
    const refs = kind === 'html' ? localReferences(target.code) : [];
    const onePage = list.filter((b) => kindOf(b) === 'html').length <= 1;
    const styles = companions(list, target, 'css', refs.filter((r) => r.role === 'style'), kind === 'react' || onePage);
    const scripts = kind === 'html' ? companions(list, target, 'js', refs.filter((r) => r.role === 'script'), onePage) : [];
    for (const b of styles) files.push({ name: uniqueName(basename(b.path) || 'style.css', taken), lang: 'css', role: 'style', code: b.code });
    for (const b of scripts) files.push({ name: uniqueName(basename(b.path) || 'script.js', taken), lang: 'javascript', role: 'script', code: b.code });
    return { kind, files };
  }

  // Inserting by index, never with String.replace: CSS and scripts are full of
  // "$" sequences that a replacement string would interpret.
  function insertBefore(doc, pattern, text, fallback, which = 'last') {
    const matches = [...doc.matchAll(pattern)];
    const at = matches.length ? matches[which === 'first' ? 0 : matches.length - 1].index : fallback(doc);
    return doc.slice(0, at) + text + doc.slice(at);
  }
  const styleTag = (css) => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>\n`;
  // A script written as a module (import/export at the top level) runs as one;
  // as a classic script it would stop at its first line.
  const scriptTag = (js) => `<script${/^\s*(?:import\s[^(]|export\s)/m.test(js) ? ' type="module"' : ''}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n`;
  const jsonForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

  function head(rtl, extra, strings) {
    const font = rtl ? "'Cairo', 'Inter'" : "'Inter', 'Cairo'";
    return `<meta charset="utf-8">
  ${guardScript(strings)}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${FONTS}" rel="stylesheet">
  <script src="${LIBS.tailwind}"></script>
  <style>
    body { font-family: ${font}, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 16px; background-color: #ffffff; color: #0f172a; min-height: 100vh; box-sizing: border-box; }
    * { box-sizing: border-box; }
    #qjo-preview-error { direction: ltr; text-align: left; white-space: pre-wrap; margin: 12px 0; padding: 12px 14px; border-radius: 8px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; }
  </style>${extra || ''}`;
  }

  function svgDocument(code) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;background:#f8fafc;}svg{max-width:100%;max-height:85vh;}</style></head><body>${code}</body></html>`;
  }

  // The preview loads scripts only from the CDNs the app allows (its CSP is
  // the preview's too): jsdelivr, cdnjs and Tailwind's. A page that took its
  // libraries from unpkg — most do — stopped with nothing on screen. The same
  // npm files from jsdelivr, which mirrors them under the same paths.
  /** @type {Array<[RegExp, string]>} */
  const CDN_REWRITES = [
    [/https?:\/\/unpkg\.com\/([^\s"'`)?]+)\?module\b/g, 'https://cdn.jsdelivr.net/npm/$1/+esm'],
    [/https?:\/\/unpkg\.com\//g, 'https://cdn.jsdelivr.net/npm/'],
    [/https?:\/\/(?:cdn\.)?skypack\.dev\/([^\s"'`)?]+)/g, 'https://cdn.jsdelivr.net/npm/$1/+esm'],
    [/https?:\/\/esm\.sh\/([^\s"'`)?]+)/g, 'https://cdn.jsdelivr.net/npm/$1/+esm'],
    [/https?:\/\/code\.jquery\.com\/jquery-(\d[\d.]*)((?:\.slim)?(?:\.min)?)\.js/g, 'https://cdn.jsdelivr.net/npm/jquery@$1/dist/jquery$2.js']
  ];
  function onAllowedCdns(code) {
    return CDN_REWRITES.reduce((text, [pattern, to]) => text.replace(pattern, to), String(code));
  }

  function htmlDocument(files, strings) {
    const main = files.find((f) => f.role === 'main');
    let doc = onAllowedCdns(String(main.code).trim());
    for (const ref of localReferences(doc)) doc = doc.replace(ref.tag, () => '');
    const styles = files.filter((f) => f.role === 'style').map((f) => styleTag(onAllowedCdns(f.code))).join('');
    const scripts = files.filter((f) => f.role === 'script').map((f) => scriptTag(onAllowedCdns(f.code))).join('');

    if (/<!doctype\s+html/i.test(doc) || /<html\b/i.test(doc)) {
      const tailwind = /tailwind/i.test(doc) ? '' : `<script src="${LIBS.tailwind}"></script>\n`;
      // No </head>: straight after <html>, or after the doctype — never
      // before it, which would put the page in quirks mode.
      doc = insertBefore(doc, /<\/head\s*>/gi, tailwind + styles, (d) => {
        const open = /<html\b[^>]*>/i.exec(d) || /<!doctype[^>]*>/i.exec(d);
        return open ? open.index + open[0].length : 0;
      }, 'first');
      // The guard before anything of the page's own: straight after <head>,
      // else after <html>, else after the doctype.
      const at = /<head\b[^>]*>/i.exec(doc) || /<html\b[^>]*>/i.exec(doc) || /<!doctype[^>]*>/i.exec(doc);
      doc = at ? doc.slice(0, at.index + at[0].length) + guardScript(strings) + doc.slice(at.index + at[0].length) : guardScript(strings) + doc;
      return insertBefore(doc, /<\/body\s*>/gi, scripts, (d) => d.length);
    }
    const rtl = ARABIC.test(doc);
    return `<!DOCTYPE html>
<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
  ${head(rtl, styles ? '\n' + styles : '', strings)}
</head>
<body>
${doc}
${scripts}</body>
</html>`;
  }

  // Runs inside the preview. Compiles the component with Babel, gives it a
  // require() that knows react, react-dom and lucide-react, and mounts what
  // it exports. Every failure is shown in the preview instead of a blank page.
  const REACT_RUNNER = `(async function () {
  var data = JSON.parse(document.getElementById('qjo-preview-data').textContent);
  var S = data.strings;
  function fail(message) {
    var box = document.getElementById('qjo-preview-error');
    if (!box) { box = document.createElement('pre'); box.id = 'qjo-preview-error'; document.body.appendChild(box); }
    box.textContent = String(message);
  }
  window.addEventListener('error', function (e) { fail(e.message || e.error || 'Error'); });
  window.addEventListener('unhandledrejection', function (e) { fail((e.reason && e.reason.message) || e.reason); });
  if (!window.React || !window.ReactDOM || !window.Babel) { fail(S.libsFailed); return; }
  var modules = { react: React, 'react-dom': ReactDOM, 'react-dom/client': ReactDOM };
  function requireModule(name) {
    if (/\\.(css|scss|sass|less)$/i.test(name)) return {};
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    throw new Error(S.moduleMissing.replace('{name}', name));
  }
  // In a function of its own, not as a script element: lucide-react declares an
  // icon called Infinity, which at the top level of a script collides with the
  // global and stops the whole file.
  function loadCommonJs(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error(S.libsFailed);
      return response.text();
    }).then(function (text) {
      var mod = { exports: {} };
      new Function('module', 'exports', 'require', text + '\\n//# sourceURL=' + url)(mod, mod.exports, requireModule);
      return mod.exports;
    }, function () { throw new Error(S.libsFailed); });
  }
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error: error }; }
    render() { return this.state.error ? React.createElement('pre', { id: 'qjo-preview-error' }, String(this.state.error.message || this.state.error)) : this.props.children; }
  }
  try {
    var compiled = Babel.transform(data.source, { presets: [['react', { runtime: 'classic' }], 'typescript'], plugins: ['transform-modules-commonjs'], filename: data.filename }).code;
    if (/require\\("lucide-react"\\)/.test(compiled)) modules['lucide-react'] = await loadCommonJs(data.libs.lucideReact);
    var probe = data.candidates.length ? '\\n;module.exports.__qjoFound = {' + data.candidates.map(function (n) {
      return JSON.stringify(n) + ': typeof ' + n + " !== 'undefined' ? " + n + ' : undefined';
    }).join(',') + '};' : '';
    var mod = { exports: {} };
    new Function('require', 'module', 'exports', 'React', 'ReactDOM', compiled + probe)(requireModule, mod, mod.exports, React, ReactDOM);
    if (data.selfRenders) return;
    var found = mod.exports.__qjoFound || {};
    var isComponent = function (value) { return typeof value === 'function' || Boolean(value && typeof value === 'object' && value.$$typeof); };
    var App = [mod.exports.default, mod.exports.App, found.App].concat(data.candidates.map(function (n) { return found[n]; }).reverse()).find(isComponent);
    if (!App) { fail(S.noComponent); return; }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Boundary, null, React.createElement(App)));
  } catch (err) { fail((err && err.message) || err); }
})();`;

  function reactDocument(files, strings) {
    const main = files.find((f) => f.role === 'main');
    let source = String(main.code);
    // Top-level components, so an answer that never exports one still shows.
    let candidates = [...source.matchAll(/^(?:export\s+(?:default\s+)?)?(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)/gm)].map((m) => m[1]);
    const exported = /\bexport\s+default\b|\bexports\.default\b/.test(source);
    if (!candidates.length && !exported && source.trim().startsWith('<')) {
      // A bare piece of JSX: show it as it is.
      source = `export default function Preview() {\n  return (<>\n${source}\n  </>);\n}`;
      candidates = ['Preview'];
    }
    const selfRenders = /\bcreateRoot\s*\(|\bReactDOM\.render\s*\(/.test(source);
    const containers = [...new Set([...source.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)/g)].map((m) => m[1]))].filter((id) => id !== 'root');
    const rtl = ARABIC.test(source);
    const styles = files.filter((f) => f.role === 'style').map((f) => styleTag(f.code)).join('');
    const data = {
      source,
      filename: /\.tsx$/i.test(main.name) ? 'App.tsx' : 'App.jsx',
      candidates: [...new Set(candidates)],
      selfRenders,
      libs: { lucideReact: LIBS.lucideReact },
      strings: { ...DEFAULT_STRINGS, ...(strings || {}) }
    };
    return `<!DOCTYPE html>
<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
  ${head(rtl, styles ? '\n' + styles : '', strings)}
  <script src="${LIBS.react}" crossorigin="anonymous"></script>
  <script src="${LIBS.reactDom}" crossorigin="anonymous"></script>
  <script src="${LIBS.babel}" crossorigin="anonymous"></script>
</head>
<body>
<div id="root"></div>
${containers.map((id) => `<div id="${id}"></div>`).join('\n')}
<script type="application/json" id="qjo-preview-data">${jsonForScript(data)}</script>
<script>${REACT_RUNNER}</script>
</body>
</html>`;
  }

  /**
   * Which block of the answer a link inside its preview names: the HTML
   * block with that file name; "index.html", when no block is called that,
   * is the answer's first page. -1 when the answer has no such page.
   * @param {Array<{lang?: string, code?: string, path?: string}>} blocks
   * @param {string} name
   */
  function pageNamed(blocks, name) {
    const wanted = basename(name);
    const pages = (blocks || []).map((b, i) => (kindOf({ lang: String(b.lang || ''), code: String(b.code || ''), path: String(b.path || '') }) === 'html' ? i : -1)).filter((i) => i >= 0);
    const named = pages.find((i) => basename(blocks[i].path) === wanted);
    if (named !== undefined) return named;
    return wanted === 'index.html' && pages.length ? pages[0] : -1;
  }

  /**
   * The document for a preview iframe's srcdoc.
   * @param {{kind: string, files: Array<{name: string, lang: string, role: string, code: string}>} | null} project
   * @param {Partial<typeof DEFAULT_STRINGS>} [strings] messages shown inside the preview, in the page's language
   * @returns {string}
   */
  function buildDocument(project, strings) {
    if (!project || !project.files || !project.files.length) return '';
    if (project.kind === 'svg') return svgDocument(project.files[0].code);
    if (project.kind === 'react') return reactDocument(project.files, strings);
    return htmlDocument(project.files, strings);
  }

  const api = { LIBS, kindOf, isReactSource, projectFor, buildDocument, pageNamed, onAllowedCdns };
  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.codeProject = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * A code preview in a tab of its own: "Open in a new tab" in the code studio
 * (public/ui/canvas.js) opens public/preview.html, and this shows the page.
 *
 * The page runs where every preview runs: in an iframe sandboxed without
 * same-origin, so its code has no access to this tab, the app, its storage or
 * the signed-in session. What to show comes by message from the window that
 * opened this tab, on the app's own origin — nothing else is listened to, so
 * a link to preview.html shows nothing that someone else wrote — and the tab
 * keeps it for a reload. A link to another page of the answer ("about.html")
 * shows that page here, as it does in the studio.
 */
(function () {
  'use strict';

  const KEY = 'qjo-preview-tab';
  const codeProject = window.QjoDomain && window.QjoDomain.codeProject;
  const wait = document.getElementById('qjo-tab-wait');
  /** @type {null | {project: any, blocks: any[], strings: any, lang?: string}} */
  let shown = null;
  /** @type {HTMLIFrameElement | null} */
  let frame = null;

  function show(payload) {
    if (!codeProject || !payload || !payload.project || !Array.isArray(payload.project.files)) return;
    shown = { project: payload.project, blocks: Array.isArray(payload.blocks) ? payload.blocks : [], strings: payload.strings || {}, lang: String(payload.lang || '') };
    try { sessionStorage.setItem(KEY, JSON.stringify(shown)); } catch (_) { /* too large to keep: shown, not kept */ }
    document.title = codeProject.titleOf(shown.project) || 'Qjo';
    if (/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(shown.lang)) document.documentElement.lang = shown.lang;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'qjo-tab-frame';
      frame.setAttribute('sandbox', codeProject.SANDBOX);
      document.body.appendChild(frame);
    }
    frame.title = document.title;
    if (wait) wait.hidden = true;
    frame.srcdoc = codeProject.buildDocument(shown.project, shown.strings);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    // The page in the frame asks for another page of the answer.
    if (frame && event.source === frame.contentWindow) {
      if (data.qjoPreview !== 'open' || typeof data.name !== 'string' || !shown) return;
      const index = codeProject.pageNamed(shown.blocks, data.name);
      const project = index >= 0 ? codeProject.projectFor(shown.blocks, index) : null;
      if (project) show({ ...shown, project });
      else frame.contentWindow.postMessage({ qjoPreview: 'missing', name: data.name.slice(0, 80) }, '*');
      return;
    }
    // The app that opened this tab, and nothing else.
    if (event.origin === location.origin && window.opener && event.source === window.opener && data.qjoPreviewTab === 'show') show(data);
  });

  let kept = null;
  try { kept = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { kept = null; }
  if (kept) show(kept);
  else if (window.opener) {
    try { window.opener.postMessage({ qjoPreviewTab: 'ready' }, location.origin); } catch (_) { /* the app is gone */ }
  }
  // Nothing came: the app was closed or reloaded since. Say where a preview comes from.
  setTimeout(() => { if (!shown && wait) wait.hidden = false; }, 1500);
})();

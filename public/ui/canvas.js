/**
 * The code studio: an answer's code previewed under its block, and in a side
 * canvas where it can be edited and watched at desktop or phone width.
 *
 * The preview is built from the whole answer (public/domain/codeProject.js):
 * an HTML block previews with the answer's CSS and JavaScript, a React
 * component is compiled and mounted. Every preview runs in an iframe
 * sandboxed to allow-scripts without same-origin, so the code it runs has no
 * access to the page, its storage or the signed-in session.
 *
 * On a wide screen the canvas sits beside the conversation and the
 * conversation narrows to make room; on a phone it covers the screen.
 */
(function (global) {
  'use strict';

  const EDIT_DELAY_MS = 400;
  const STYLE_ID = 'qjo-canvas-style';
  const STYLE = `
.qjo-canvas { position: fixed; top: 0; right: 0; bottom: 0; width: var(--qjo-canvas-width); z-index: 900;
  display: flex; flex-direction: column; background: var(--ds-panel, #fff); color: var(--ds-ink, #0b0b0d);
  border-left: 1px solid var(--ds-line, #e6e7ec); box-shadow: -12px 0 32px rgba(15, 23, 42, .08); }
.qjo-canvas[hidden] { display: none; }
:root { --qjo-canvas-width: min(46vw, 760px); }
@media (min-width: 1024px) {
  /* The app is laid out left to right in both languages (sidebar on the left),
     so the canvas docks on the right and the app keeps to the left of it —
     in an Arabic page a narrower block would otherwise align right, under it. */
  body.qjo-canvas-open .app { width: calc(100vw - var(--qjo-canvas-width)) !important; max-width: none !important;
    margin-left: 0 !important; margin-right: auto !important; }
}
@media (max-width: 1023px) {
  .qjo-canvas { left: 0; width: 100vw; height: 100dvh; border-left: 0; box-shadow: none; z-index: 100000; }
  body.qjo-canvas-open { overflow: hidden; }
}
.qjo-canvas-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px;
  border-bottom: 1px solid var(--ds-line, #e6e7ec); background: var(--ds-panel-2, #f2f3f6); }
.qjo-canvas-tabs, .qjo-canvas-tools, .qjo-canvas-files { display: flex; align-items: center; gap: 4px; }
.qjo-canvas button { font: 500 12.5px/1 var(--ds-sans, system-ui, sans-serif); color: inherit; background: transparent;
  border: 1px solid transparent; border-radius: 7px; padding: 7px 10px; cursor: pointer; min-height: 32px; }
.qjo-canvas button:hover { background: var(--ds-panel-3, #eaebef); }
.qjo-canvas button.is-active { background: var(--ds-panel, #fff); border-color: var(--ds-line-2, #d7d9e0); }
.qjo-canvas button:focus-visible { outline: 2px solid var(--ds-accent, #1d4ed8); outline-offset: 1px; }
.qjo-canvas-preview { flex: 1; min-height: 0; display: flex; justify-content: center; background: var(--ds-panel-3, #eaebef); }
.qjo-canvas-viewport { width: 100%; height: 100%; background: #fff; transition: max-width .25s ease; }
.qjo-canvas-viewport.is-mobile { max-width: 390px; border-inline: 1px solid var(--ds-line-2, #d7d9e0); }
.qjo-canvas-frame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.qjo-canvas-code { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.qjo-canvas-code[hidden], .qjo-canvas-preview[hidden] { display: none; }
.qjo-canvas-files { padding: 6px 10px; border-bottom: 1px solid var(--ds-line, #e6e7ec); overflow-x: auto; }
.qjo-canvas-editor { flex: 1; min-height: 0; width: 100%; resize: none; border: 0; outline: none; padding: 14px 16px;
  font: 13px/1.6 var(--ds-mono, ui-monospace, Menlo, Consolas, monospace); tab-size: 2; direction: ltr; text-align: left;
  background: #0b1020; color: #e2e8f0; }
`;

  const decode = (value) => { try { return decodeURIComponent(value || ''); } catch (_) { return ''; } };

  /**
   * @param {object} deps
   * @param {(key: string, vars?: Record<string, string | number>) => string} deps.t
   * @param {Document} [deps.document]
   */
  function createCodeStudio(deps) {
    const t = deps.t;
    const doc = deps.document || global.document;
    const codeProject = () => global.QjoDomain.codeProject;
    const previewStrings = () => ({ libsFailed: t('previewLibsFailed'), moduleMissing: t('previewModuleMissing'), noComponent: t('previewNoComponent') });

    // The answer's code blocks, in order, read back from the rendered answer.
    function projectOf(wrapper) {
      const scope = wrapper.closest('.bubble') || wrapper.parentElement || doc.body;
      const wrappers = [...scope.querySelectorAll('.code-block-wrapper')];
      const read = (w, selector) => ((w.querySelector(selector) || {}).textContent || '').trim();
      const blocks = wrappers.map((w) => ({
        lang: read(w, '.code-block-lang'),
        path: read(w, '.code-block-filepath'),
        code: decode((/** @type {HTMLElement} */ (w.querySelector('.copy-code-btn')) || { dataset: {} }).dataset.code)
      }));
      return codeProject().projectFor(blocks, wrappers.indexOf(wrapper));
    }

    const documentFor = (project) => codeProject().buildDocument(project, previewStrings());

    // ── Inline preview, under the block ─────────────────────────────────
    function showInline(wrapper, reload) {
      const iframe = /** @type {HTMLIFrameElement | null} */ (wrapper.querySelector('.live-preview-iframe'));
      if (iframe && (reload || !iframe.srcdoc)) iframe.srcdoc = documentFor(projectOf(wrapper));
    }

    function onClick(selector, element, handler) {
      element.querySelectorAll(selector).forEach((button) => {
        if (button.dataset.studio) return;
        button.dataset.studio = 'true';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const wrapper = button.closest('.code-block-wrapper');
          if (wrapper) handler(button, wrapper);
        });
      });
    }

    function initializePreviews(element) {
      if (!element) return;
      onClick('.code-tab-btn', element, (button, wrapper) => {
        wrapper.querySelectorAll('.code-tab-btn').forEach((b) => b.classList.toggle('active', b === button));
        const preview = button.dataset.tab === 'preview';
        const pre = wrapper.querySelector('pre');
        const container = wrapper.querySelector('.live-preview-container');
        if (pre) pre.classList.toggle('hidden', preview);
        if (container) container.classList.toggle('hidden', !preview);
        if (preview) showInline(wrapper, false);
      });
      onClick('.preview-size-btn', element, (button, wrapper) => {
        wrapper.querySelectorAll('.preview-size-btn').forEach((b) => b.classList.toggle('active', b === button));
        const viewport = wrapper.querySelector('.preview-viewport');
        if (viewport) {
          viewport.classList.toggle('mobile-view', button.dataset.size === 'mobile');
          viewport.classList.toggle('desktop-view', button.dataset.size !== 'mobile');
        }
      });
      onClick('.preview-reload-btn', element, (_, wrapper) => showInline(wrapper, true));
      element.querySelectorAll('.preview-expand-btn').forEach((button) => {
        button.classList.remove('hidden');
        button.title = t('canvasOpen');
        button.setAttribute('aria-label', t('canvasOpen'));
      });
      onClick('.preview-expand-btn', element, (button, wrapper) => open(projectOf(wrapper), button));
    }

    // ── The side canvas ──────────────────────────────────────────────────
    /** @type {null | {root: HTMLElement, frame: HTMLIFrameElement, editor: HTMLTextAreaElement, files: HTMLElement,
     *   viewport: HTMLElement, project: any, active: number, trigger: HTMLElement | null, timer: any}} */
    let canvas = null;

    function button(className, data) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = className;
      for (const [k, v] of Object.entries(data || {})) b.dataset[k] = v;
      return b;
    }

    function build() {
      if (!doc.getElementById(STYLE_ID)) {
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STYLE;
        doc.head.appendChild(style);
      }
      const root = doc.createElement('aside');
      root.className = 'qjo-canvas';
      root.setAttribute('role', 'dialog');
      root.hidden = true;

      const bar = doc.createElement('div');
      bar.className = 'qjo-canvas-bar';
      const tabs = doc.createElement('div');
      tabs.className = 'qjo-canvas-tabs';
      tabs.append(button('qjo-canvas-tab is-active', { view: 'preview' }), button('qjo-canvas-tab', { view: 'code' }));
      const tools = doc.createElement('div');
      tools.className = 'qjo-canvas-tools';
      tools.append(button('qjo-canvas-device is-active', { device: 'desktop' }), button('qjo-canvas-device', { device: 'mobile' }),
        button('qjo-canvas-reload'), button('qjo-canvas-close'));
      bar.append(tabs, tools);

      const preview = doc.createElement('div');
      preview.className = 'qjo-canvas-preview';
      const viewport = doc.createElement('div');
      viewport.className = 'qjo-canvas-viewport';
      const frame = doc.createElement('iframe');
      frame.className = 'qjo-canvas-frame';
      frame.setAttribute('sandbox', 'allow-scripts allow-modals');
      viewport.append(frame);
      preview.append(viewport);

      const code = doc.createElement('div');
      code.className = 'qjo-canvas-code';
      code.hidden = true;
      const files = doc.createElement('div');
      files.className = 'qjo-canvas-files';
      const editor = doc.createElement('textarea');
      editor.className = 'qjo-canvas-editor';
      editor.spellcheck = false;
      editor.setAttribute('autocapitalize', 'off');
      editor.setAttribute('autocomplete', 'off');
      editor.dir = 'ltr';
      code.append(files, editor);

      root.append(bar, preview, code);
      doc.body.appendChild(root);
      canvas = { root, frame, editor, files, viewport, project: null, active: 0, trigger: null, timer: null };

      tabs.addEventListener('click', (e) => { const b = /** @type {HTMLElement} */ (e.target).closest('button'); if (b) showView(b.dataset.view); });
      tools.addEventListener('click', (e) => {
        const b = /** @type {HTMLElement} */ (e.target).closest('button');
        if (!b) return;
        if (b.dataset.device) {
          tools.querySelectorAll('.qjo-canvas-device').forEach((d) => d.classList.toggle('is-active', d === b));
          viewport.classList.toggle('is-mobile', b.dataset.device === 'mobile');
        } else if (b.classList.contains('qjo-canvas-reload')) refresh();
        else if (b.classList.contains('qjo-canvas-close')) close();
      });
      files.addEventListener('click', (e) => {
        const b = /** @type {HTMLElement} */ (e.target).closest('button');
        if (b) selectFile(Number(b.dataset.index));
      });
      editor.addEventListener('input', () => {
        canvas.project.files[canvas.active].code = editor.value;
        clearTimeout(canvas.timer);
        canvas.timer = setTimeout(refresh, EDIT_DELAY_MS);
      });
      doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
      return canvas;
    }

    function label() {
      const root = canvas.root;
      root.setAttribute('aria-label', t('canvasTitle'));
      root.dir = doc.documentElement.dir || 'ltr';
      const set = (selector, text, asTitle) => root.querySelectorAll(selector).forEach((el) => {
        if (asTitle) { el.setAttribute('title', text); el.setAttribute('aria-label', text); } else el.textContent = text;
      });
      set('[data-view="preview"]', t('canvasPreview'));
      set('[data-view="code"]', t('canvasCode'));
      set('[data-device="desktop"]', t('canvasDesktop'), true);
      set('[data-device="mobile"]', t('canvasMobile'), true);
      set('.qjo-canvas-reload', t('canvasReload'), true);
      set('.qjo-canvas-close', t('canvasClose'), true);
      root.querySelector('[data-device="desktop"]').textContent = '💻';
      root.querySelector('[data-device="mobile"]').textContent = '📱';
      root.querySelector('.qjo-canvas-reload').textContent = '↻';
      root.querySelector('.qjo-canvas-close').textContent = '✕';
      canvas.frame.title = t('canvasPreview');
    }

    function renderFiles() {
      canvas.files.textContent = '';
      canvas.project.files.forEach((file, index) => {
        const b = button(index === canvas.active ? 'is-active' : '', { index: String(index) });
        b.textContent = file.name; // a name the model chose: text, never markup
        canvas.files.append(b);
      });
    }

    function selectFile(index) {
      if (!canvas.project.files[index]) return;
      canvas.active = index;
      canvas.editor.value = canvas.project.files[index].code;
      renderFiles();
    }

    function showView(view) {
      canvas.root.querySelectorAll('.qjo-canvas-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
      canvas.root.querySelector('.qjo-canvas-preview').hidden = view !== 'preview';
      canvas.root.querySelector('.qjo-canvas-code').hidden = view !== 'code';
    }

    function refresh() {
      if (canvas && canvas.project) canvas.frame.srcdoc = documentFor(canvas.project);
    }

    function isOpen() { return Boolean(canvas && !canvas.root.hidden); }

    function open(project, trigger) {
      if (!project) return;
      if (!canvas) build();
      clearTimeout(canvas.timer);
      canvas.project = { kind: project.kind, files: project.files.map((f) => ({ ...f })) };
      canvas.trigger = trigger || null;
      label();
      selectFile(0);
      showView('preview');
      refresh();
      canvas.root.hidden = false;
      doc.body.classList.add('qjo-canvas-open');
      /** @type {HTMLElement} */ (canvas.root.querySelector('.qjo-canvas-close')).focus();
    }

    function close() {
      if (!isOpen()) return;
      clearTimeout(canvas.timer);
      canvas.root.hidden = true;
      canvas.frame.srcdoc = ''; // ends whatever the preview was running
      doc.body.classList.remove('qjo-canvas-open');
      if (canvas.trigger && canvas.trigger.isConnected) canvas.trigger.focus();
    }

    const PREVIEW_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><polyline points="10 9 15 12 10 15"></polyline></svg>';

    /**
     * The answer's toolbar gets a way into the studio when the answer holds
     * something to run — beside copy and the files, not only inside the
     * code block's header.
     * @param {HTMLElement} toolbar
     * @param {HTMLElement} bubble
     * @param {(title: string, svg: string, onClick: (b: HTMLButtonElement) => void) => HTMLButtonElement} iconButton
     */
    function appendPreviewButton(toolbar, bubble, iconButton) {
      const wrapper = bubble && bubble.querySelector('.code-block-wrapper.has-live-preview');
      if (!wrapper) return;
      const button = iconButton(t('canvasOpen'), PREVIEW_ICON, (b) => open(projectOf(/** @type {HTMLElement} */ (wrapper)), b));
      button.dataset.preview = 'studio';
      toolbar.appendChild(button);
    }

    return { initializePreviews, open, close, isOpen, appendPreviewButton };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createCodeStudio = createCodeStudio;
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Files from an answer: the export buttons under it, and — when the person
 * asked for a file outright — a card with that file ready to download.
 *
 * Excel was missing from the buttons although the server made workbooks, and
 * someone who wrote "اعملي ملف إكسل" had to know which of four icons meant
 * it. The files are now one labelled button, "Download as file", that opens
 * a menu naming each format. The decisions (is there a table, was a file
 * asked for) are pure and live in public/domain/fileRequest.js; this draws
 * them.
 */
(function (global) {
  'use strict';

  const ICONS = {
    pdf: '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg>',
    pptx: '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
    docx: '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="14" y2="17"></line></svg>',
    xlsx: '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line></svg>'
  };
  const LABELS = { pdf: 'PDF', pptx: 'PowerPoint', docx: 'Word', xlsx: 'Excel' };
  const DOWNLOAD = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  const STYLE_ID = 'qjo-file-card-style';
  const STYLE = `
.qjo-file-card { display: flex; align-items: center; gap: 12px; margin: 10px 0 4px; padding: 12px 14px; max-width: 520px;
  border: 1px solid var(--ds-line, #e6e7ec); border-radius: 12px; background: var(--ds-panel, #fff); }
.qjo-file-card-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; flex: none;
  background: var(--ds-accent-soft, rgba(29, 78, 216, .08)); color: var(--ds-accent, #1d4ed8); }
.qjo-file-card-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.qjo-file-card-text small { color: var(--ds-muted, #71737d); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qjo-file-card-btn { flex: none; border: 0; border-radius: 9px; padding: 8px 14px; font: 600 13px/1 var(--ds-sans, system-ui, sans-serif);
  background: var(--ds-accent, #1d4ed8); color: #fff; cursor: pointer; min-height: 36px; }
.qjo-file-card-btn:disabled { opacity: .6; cursor: progress; }
.qjo-export { position: relative; display: inline-flex; }
.msg-actions-toolbar .msg-action-btn.qjo-export-toggle { width: auto !important; min-width: 0 !important; gap: 6px; padding: 0 12px !important;
  border-radius: 999px !important; font: 600 12.5px/1 var(--ds-sans, system-ui, sans-serif); white-space: nowrap; }
.qjo-export-menu { position: absolute; bottom: calc(100% + 6px); inset-inline-start: 0; z-index: 30; min-width: 210px; padding: 6px;
  border: 1px solid var(--ds-line-2, #d7d9e0); border-radius: 12px; background: var(--ds-panel, #fff); box-shadow: var(--ds-shadow-2, 0 8px 28px rgba(0,0,0,.12)); }
.qjo-export-menu[hidden] { display: none; }
.qjo-export-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 10px; border: 0; border-radius: 8px;
  background: transparent; color: var(--ds-ink, #0b0b0d); font: 500 14px/1.2 var(--ds-sans, system-ui, sans-serif); text-align: start; cursor: pointer; }
.qjo-export-item:hover, .qjo-export-item:focus-visible { background: var(--ds-panel-2, #f2f3f6); outline: none; }
.qjo-export-item small { margin-inline-start: auto; color: var(--ds-ink-2, #3f4149); font-size: 12px; }
.qjo-export-item:disabled { opacity: .6; cursor: progress; }
`;
  const TITLE_KEYS = { pdf: 'exportPdf', pptx: 'exportSlides', docx: 'exportWord', xlsx: 'exportExcel' };

  /**
   * @param {object} deps
   * @param {(format: string, title: string, content: string) => Promise<boolean>} deps.downloadExport
   * @param {(key: string, vars?: Record<string, string | number>) => string} deps.t
   * @param {(message: string) => void} deps.toast
   * @param {Document} [deps.document]
   */
  function createAnswerExports(deps) {
    const { downloadExport, t, toast } = deps;
    const doc = deps.document || global.document;
    const files = () => global.QjoDomain.fileRequest;
    const styled = () => {
      if (doc.getElementById(STYLE_ID)) return;
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      doc.head.appendChild(style);
    };

    function titleOf(content) {
      const firstLine = String(content || '').split('\n').find((l) => l.trim()) || 'Qjo';
      return firstLine.replace(/^#{1,6}\s*/, '').replace(/[*_`>|]/g, '').trim().slice(0, 60) || 'Qjo';
    }

    async function download(format, content, button) {
      if (button) { button.disabled = true; button.classList.add('exporting'); }
      const ok = await downloadExport(format, titleOf(content), content);
      if (button) { button.disabled = false; button.classList.remove('exporting'); }
      if (!ok) toast(t('exportFailed'));
      return ok;
    }

    /** The formats an answer offers: Excel only when it has a table. */
    function formatsFor(content) {
      if (!files().worthExporting(content)) return [];
      return ['docx', 'pdf', 'pptx', ...(files().hasTable(content) ? ['xlsx'] : [])];
    }

    /**
     * Adds "Download as file" to an answer's toolbar: one labelled button and
     * a menu that names each format.
     * @param {HTMLElement} toolbar
     * @param {string} content the answer's Markdown
     * @param {(title: string, svg: string, onClick: (b: HTMLButtonElement) => void) => HTMLButtonElement} iconButton
     */
    function appendExportButtons(toolbar, content, iconButton) {
      const formats = formatsFor(content);
      if (!formats.length) return;
      styled();
      const holder = doc.createElement('span');
      holder.className = 'qjo-export';
      const menu = doc.createElement('div');
      menu.className = 'qjo-export-menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      const toggle = iconButton(t('exportMenu'), DOWNLOAD, () => open(menu.hidden));
      toggle.classList.add('qjo-export-toggle');
      toggle.append(t('exportMenu'));
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', 'false');
      const items = formats.map((format) => {
        const item = doc.createElement('button');
        item.type = 'button';
        item.className = 'qjo-export-item';
        item.setAttribute('role', 'menuitem');
        item.dataset.export = format;
        item.title = t(TITLE_KEYS[format]);
        item.innerHTML = ICONS[format];
        const ext = doc.createElement('small');
        ext.textContent = `.${format}`;
        ext.dir = 'ltr';
        item.append(LABELS[format], ext);
        item.addEventListener('click', async () => { await download(format, content, item); open(false); });
        return item;
      });
      menu.append(...items);
      // Closes on a click elsewhere or Escape; the arrows move between formats.
      const outside = (event) => { if (!holder.contains(/** @type {Node} */ (event.target))) open(false); };
      function open(on) {
        menu.hidden = !on;
        toggle.setAttribute('aria-expanded', String(on));
        if (on) { fit(); doc.addEventListener('click', outside, true); items[0].focus(); } else doc.removeEventListener('click', outside, true);
      }
      // Whole on the screen: a toggle near either edge of a phone pushed it off.
      function fit() {
        menu.style.transform = '';
        const r = menu.getBoundingClientRect();
        const room = (doc.documentElement.clientWidth || global.innerWidth) - 8;
        const dx = r.left < 8 ? 8 - r.left : r.right > room ? room - r.right : 0;
        if (dx) menu.style.transform = `translateX(${Math.round(dx)}px)`;
      }
      menu.addEventListener('keydown', (event) => {
        const at = items.indexOf(/** @type {HTMLButtonElement} */ (doc.activeElement));
        if (event.key === 'Escape') { open(false); toggle.focus(); } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        }
      });
      holder.append(toggle, menu);
      toolbar.appendChild(holder);
    }

    /**
     * Under an answer to "make me an Excel file…": that file, one click away.
     * @param {HTMLElement} wrap the answer's message element
     * @param {string} content the answer's Markdown
     * @param {string} question what the person asked
     */
    function appendDownloadCard(wrap, content, question) {
      const old = wrap.querySelector('.qjo-file-card');
      if (old) old.remove();
      const format = files().requestedFormat(String(question || '').slice(0, 600));
      if (!format || (format === 'xlsx' && !files().hasTable(content)) || !String(content || '').trim()) return;
      styled();
      const card = doc.createElement('div');
      card.className = 'qjo-file-card';
      card.dataset.format = format;
      const icon = doc.createElement('span');
      icon.className = 'qjo-file-card-icon';
      icon.innerHTML = ICONS[format];
      const text = doc.createElement('div');
      text.className = 'qjo-file-card-text';
      const heading = doc.createElement('strong');
      heading.textContent = t('fileReady', { format: LABELS[format] });
      const name = doc.createElement('small');
      name.textContent = `${titleOf(content)}.${format}`;
      text.append(heading, name);
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'qjo-file-card-btn';
      button.textContent = t('fileDownload');
      button.addEventListener('click', () => download(format, content, button));
      card.append(icon, text, button);
      const toolbar = wrap.querySelector('.msg-actions-toolbar');
      wrap.insertBefore(card, toolbar || null);
    }

    return { appendExportButtons, appendDownloadCard, formatsFor };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createAnswerExports = createAnswerExports;
})(typeof window !== 'undefined' ? window : globalThis);

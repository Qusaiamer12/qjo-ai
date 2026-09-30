/**
 * Files from an answer: the export buttons under it, and — when the person
 * asked for a file outright — a card with that file ready to download.
 *
 * Excel was missing from the buttons although the server made workbooks, and
 * someone who wrote "اعملي ملف إكسل" had to know which of four icons meant
 * it. The decisions (is there a table, was a file asked for) are pure and live
 * in public/domain/fileRequest.js; this draws them.
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
      return ['pdf', 'pptx', 'docx', ...(files().hasTable(content) ? ['xlsx'] : [])];
    }

    /**
     * Adds the export buttons to an answer's toolbar.
     * @param {HTMLElement} toolbar
     * @param {string} content the answer's Markdown
     * @param {(title: string, svg: string, onClick: (b: HTMLButtonElement) => void) => HTMLButtonElement} iconButton
     */
    function appendExportButtons(toolbar, content, iconButton) {
      const formats = formatsFor(content);
      if (!formats.length) return;
      const divider = doc.createElement('span');
      divider.className = 'msg-actions-divider';
      divider.setAttribute('aria-hidden', 'true');
      toolbar.appendChild(divider);
      for (const format of formats) {
        const button = iconButton(t(TITLE_KEYS[format]), ICONS[format], (b) => download(format, content, b));
        button.dataset.export = format;
        toolbar.appendChild(button);
      }
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

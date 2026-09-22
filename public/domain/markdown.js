/**
 * Markdown rendering: every answer in the product passes through here.
 *
 * Pulled out of app.js as one cluster because that is what it is — escaping,
 * inline formatting, tables, code blocks and the answer renderer all call each
 * other. lightMarkdown alone was 290 lines with a cyclomatic complexity of 53,
 * and it produces HTML that goes straight into the page, which makes it the
 * largest escaping surface in the front end and one that had no direct test of
 * its own.
 *
 * The security property this module has to hold: the entire input is escaped
 * before any markup is generated, so a quote inside a link target becomes
 * &quot; and cannot close the href attribute. Anything that changes the order
 * of escaping and markup generation breaks that, which is why the tests assert
 * on rendered attributes and event handlers rather than on strings.
 *
 * Pure: text in, HTML string out. No DOM, no state.
 */
(function (global) {
  'use strict';

  // Two things the renderer needs from its host. Injected rather than reached
  // for, which is what lets this file be required straight into a test.
  //
  // Relaxed JSON parsing is only used by chart blocks, and the caller already
  // owns a parser; duplicating it would mean two behaviours to keep in step.
  let parseRelaxedJson = (raw) => {
    try { return JSON.parse(raw); } catch (_) { return null; }
  };

  // Read per call, not captured: the interface language can change while a
  // conversation is open.
  let getLanguage = () => 'ar';

  /** @param {(raw: string) => any} parser */
  function setRelaxedJsonParser(parser) {
    if (typeof parser === 'function') parseRelaxedJson = parser;
  }

  /** @param {() => string} getter */
  function setLanguageSource(getter) {
    if (typeof getter === 'function') getLanguage = getter;
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseInlineMarkdown(text) {
    let value = String(text);

    // Markdown links: [label](https://example.com)
    value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // Raw URLs, while avoiding URLs already inside href="..."
    value = value.replace(/(^|\s)(https?:\/\/[^\s<]+[^\s<.,؛،)])/g, (match, prefix, url) => {
      if (match.includes('href=')) return match;
      return `${prefix}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    return value
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function isTableSeparator(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed.includes('|') && !trimmed.includes('-')) return false;
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    return cells.length >= 2 && cells.every(c => /^:?-+:?$/.test(c));
  }

  function parseTableCells(line) {
    const trimmed = String(line || '').trim();
    const content = (trimmed.startsWith('|') ? trimmed.slice(1) : trimmed)
      .replace(/\|$/, '');
    return content.split('|').map(cell => parseInlineMarkdown(cell.trim()));
  }

  function renderMarkdownTable(lines, startIndex) {
    if (!lines[startIndex] || !lines[startIndex].includes('|')) return null;
    if (!isTableSeparator(lines[startIndex + 1])) return null;

    const headers = parseTableCells(lines[startIndex]);
    if (headers.length < 2) return null;

    const rows = [];
    let index = startIndex + 2;
    while (index < lines.length) {
      const line = lines[index];
      if (!line || !line.trim() || !line.includes('|') || isTableSeparator(line)) break;
      const cells = parseTableCells(line);
      if (cells.length < 2) break;
      rows.push(cells);
      index++;
    }

    const thead = '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
    const tbody = '<tbody>' + rows.map(row => '<tr>' + headers.map((_, i) => `<td>${row[i] !== undefined ? row[i] : ''}</td>`).join('') + '</tr>').join('') + '</tbody>';
    return { html: `<div class="md-table-wrap" id="table-instance-${startIndex}"><table class="md-table">${thead}${tbody}</table></div>`, nextIndex: index };
  }

  function isPreviewableHtml(normalizedLang, code, extractedPath) {
    const lang = String(normalizedLang || '').toLowerCase();
    const ext = extractedPath ? extractedPath.split('.').pop().toLowerCase() : '';
    if (lang === 'html' || lang === 'htm' || ext === 'html' || ext === 'htm' || lang === 'svg' || ext === 'svg') {
      return true;
    }
    const trimmed = String(code || '').trim();
    if ((lang === 'xml' || lang === 'jsx' || lang === 'tsx' || lang === 'javascript' || lang === 'js' || !lang || lang === 'code') &&
        (/<!doctype\s+html/i.test(trimmed) || /<html\b/i.test(trimmed) || (trimmed.startsWith('<') && /<\/[a-z][a-z0-9]*>$/i.test(trimmed)))) {
      return true;
    }
    return false;
  }

  function lightMarkdown(text) {
    const codeBlocks = [];
    let safe = String(text || '').replace(/```([^\n\r`]*)\n?([\s\S]*?)```/g, (_, rawLangHeader, code) => {
      const id = codeBlocks.length;
      const rawLang = String(rawLangHeader || '').trim();
      let normalizedLang = rawLang.toLowerCase();
      let extractedPath = '';

      if (rawLang.includes(':')) {
        const parts = rawLang.split(':');
        normalizedLang = parts[0].trim().toLowerCase();
        extractedPath = parts.slice(1).join(':').trim();
      }

      if (!extractedPath) {
        const firstLine = String(code || '').trim().split('\n')[0] || '';
        const pathMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*(?:path|file|filepath):\s*`?([^\s`*]+)/i);
        if (pathMatch && pathMatch[1]) {
          extractedPath = pathMatch[1].trim();
        }
      }

      if (normalizedLang === 'chart' || normalizedLang === 'json-chart') {
        const chartDataEscaped = encodeURIComponent(code.trim());
        let chartTitle = '';
        try {
          const parsed = parseRelaxedJson(code.trim());
          if (parsed && parsed.title) chartTitle = String(parsed.title);
          else if (parsed && parsed.options && parsed.options.plugins && parsed.options.plugins.title && parsed.options.plugins.title.text) {
            chartTitle = String(parsed.options.plugins.title.text);
          }
        } catch (_) {}
        if (chartTitle) {
          chartTitle = chartTitle
            .replace(/\$([^\$]+)\$/g, '$1')
            .replace(/\\([a-zA-Z]+)/g, '$1')
            .replace(/[\{\}]/g, '')
            .trim();
        }
        const defaultTitle = getLanguage() === 'ar' ? 'مخطط بياني تفاعلي' : 'Interactive Chart';
        const displayTitle = chartTitle || defaultTitle;
        const placeholder = `
          <div class="interactive-chart-card">
            <div class="interactive-chart-header">
              <div class="interactive-chart-title-box">
                <span class="interactive-chart-icon">📈</span>
                <span class="interactive-chart-title">${escapeHtml(displayTitle)}</span>
              </div>
            </div>
            <div class="interactive-chart-container" id="chart-instance-${id}" data-chart-config="${chartDataEscaped}">
              <canvas id="canvas-instance-${id}"></canvas>
            </div>
            <div class="chart-error-note text-rose-500 font-bold hidden text-xs p-2"></div>
          </div>
        `.trim();
        codeBlocks.push(placeholder);
      } else if (normalizedLang === 'mermaid') {
        const placeholder = `<div class="mermaid" style="background: white; padding: 12px; border-radius: 8px; margin: 14px 0; overflow-x: auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); color: #0F172A;">${code.trim()}</div>`;
        codeBlocks.push(placeholder);
      } else if (normalizedLang === 'quiz' || normalizedLang === 'json-quiz') {
        const quizDataEscaped = encodeURIComponent(code.trim());
        const placeholder = `<div class="interactive-quiz-container" id="quiz-instance-${id}" data-quiz-config="${quizDataEscaped}"></div>`;
        codeBlocks.push(placeholder);
      } else if (normalizedLang === 'python' || normalizedLang === 'py') {
        const codeEscaped = encodeURIComponent(code.trim());
        const fileChipHtml = extractedPath ? `
          <div class="code-block-file-chip" title="${escapeHtml(extractedPath)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            <span class="code-block-filepath">${escapeHtml(extractedPath)}</span>
          </div>` : '';
        const placeholder = `
          <div class="code-block-wrapper python-block-wrapper">
            <div class="code-block-header">
              <div class="code-block-header-left">
                ${fileChipHtml}
                <span class="code-block-lang">python</span>
                <span class="python-wasm-badge">WASM</span>
              </div>
              <div class="code-block-actions">
                <button type="button" class="toggle-linenums-btn" title="${getLanguage() === 'ar' ? 'أرقام الأسطر' : 'Toggle line numbers'}">#</button>
                <button type="button" class="code-focus-btn" title="${getLanguage() === 'ar' ? 'ملء الشاشة' : 'Focus mode'}">⛶</button>
                <button type="button" class="run-python-btn" data-code="${codeEscaped}" data-target="py-output-${id}">
                  <svg class="run-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  <span class="run-spinner hidden"></span>
                  <span class="run-label">${getLanguage() === 'ar' ? 'تشغيل' : 'Run'}</span>
                </button>
                <button type="button" class="copy-code-btn" data-code="${codeEscaped}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>${getLanguage() === 'ar' ? 'نسخ' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <pre><code class="language-python">${escapeHtml(code.trim())}</code></pre>
            <div class="python-output-container hidden" id="py-output-${id}"></div>
          </div>
        `.trim();
        codeBlocks.push(placeholder);
      } else {
        const langDisplay = (normalizedLang || 'code').toLowerCase();
        const codeEscaped = encodeURIComponent(code.trim());
        const isPreviewable = isPreviewableHtml(normalizedLang, code, extractedPath);
        const fileChipHtml = extractedPath ? `
          <div class="code-block-file-chip" title="${escapeHtml(extractedPath)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            <span class="code-block-filepath">${escapeHtml(extractedPath)}</span>
          </div>` : '';

        let tabsHtml = '';
        let previewContainerHtml = '';
        let expandBtnHtml = '';

        // JavaScript runs in a Web Worker (separate thread), so an infinite
        // loop stalls the worker and not the page — the worker is terminated
        // by a watchdog instead. Previewable HTML blocks keep the live
        // preview instead of a Run button.
        // TypeScript is transpiled (type-stripped) before it reaches the same
        // worker. `tsx` is deliberately excluded along with jsx: those render
        // components and there is no DOM inside a worker to render into.
        const isRunnableTs = !isPreviewable && ['typescript', 'ts'].includes(langDisplay);
        const isRunnableJs = !isPreviewable && (isRunnableTs || ['javascript', 'js', 'node', 'nodejs', 'mjs', 'cjs'].includes(langDisplay));
        const runJsBtnHtml = isRunnableJs ? `
            <button type="button" class="run-js-btn" data-code="${codeEscaped}" data-target="js-output-${id}" data-lang="${isRunnableTs ? 'typescript' : 'javascript'}">
              <svg class="run-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span class="run-spinner hidden"></span>
              <span class="run-label">${getLanguage() === 'ar' ? 'تشغيل' : 'Run'}</span>
            </button>
          ` : '';
        const jsBadgeHtml = isRunnableJs ? '<span class="js-engine-badge">JS</span>' : '';
        const jsOutputHtml = isRunnableJs
          ? `<div class="python-output-container hidden" id="js-output-${id}"></div>`
          : '';

        // Line numbers live in a CSS-generated gutter rather than in the
        // markup, so toggling them never contaminates a copy or a ZIP export.
        const lineNumbersBtnHtml = `
            <button type="button" class="toggle-linenums-btn" title="${getLanguage() === 'ar' ? 'أرقام الأسطر' : 'Toggle line numbers'}">#</button>
          `;
        const codeFocusBtnHtml = `
            <button type="button" class="code-focus-btn" title="${getLanguage() === 'ar' ? 'ملء الشاشة' : 'Focus mode'}">⛶</button>
          `;

        if (isPreviewable) {
          tabsHtml = `
            <div class="code-block-tabs">
              <button type="button" class="code-tab-btn active" data-tab="code" data-target="code-content-${id}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                <span>${getLanguage() === 'ar' ? 'كود' : 'Code'}</span>
              </button>
              <button type="button" class="code-tab-btn live-preview-tab-btn" data-tab="preview" data-target="preview-content-${id}" data-id="${id}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                <span>${getLanguage() === 'ar' ? 'معاينة حية' : 'Preview'}</span>
              </button>
            </div>
          `;
          expandBtnHtml = `
            <button type="button" class="preview-expand-btn hidden" data-id="${id}" title="${getLanguage() === 'ar' ? 'تكبير المعاينة' : 'Fullscreen'}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            </button>
          `;
          previewContainerHtml = `
            <div class="live-preview-container hidden" id="preview-content-${id}" data-code="${codeEscaped}">
              <div class="preview-toolbar">
                <div class="preview-viewport-controls">
                  <button type="button" class="preview-size-btn active" data-size="desktop" data-id="${id}" title="${getLanguage() === 'ar' ? 'سطح المكتب' : 'Desktop view'}">💻</button>
                  <button type="button" class="preview-size-btn" data-size="mobile" data-id="${id}" title="${getLanguage() === 'ar' ? 'جوال (375px)' : 'Mobile view'}">📱</button>
                </div>
                <div class="preview-status-indicator">
                  <span class="preview-dot"></span>
                  <span>${getLanguage() === 'ar' ? 'معاينة تفاعلية' : 'Live Preview'}</span>
                </div>
                <button type="button" class="preview-reload-btn" data-id="${id}" title="${getLanguage() === 'ar' ? 'إعادة تحميل' : 'Reload'}">🔄</button>
              </div>
              <div class="preview-viewport desktop-view" id="preview-viewport-${id}">
                <iframe class="live-preview-iframe" id="preview-iframe-${id}" sandbox="allow-scripts allow-modals" loading="lazy"></iframe>
              </div>
            </div>
          `;
        }

        const placeholder = `
          <div class="code-block-wrapper ${isPreviewable ? 'has-live-preview' : ''}">
            <div class="code-block-header">
              <div class="code-block-header-left">
                ${fileChipHtml}
                <span class="code-block-lang">${escapeHtml(langDisplay)}</span>
                ${jsBadgeHtml}
                ${tabsHtml}
              </div>
              <div class="code-block-actions">
                ${runJsBtnHtml}
                ${lineNumbersBtnHtml}
                ${codeFocusBtnHtml}
                ${expandBtnHtml}
                <button type="button" class="copy-code-btn" data-code="${codeEscaped}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                  <span>${getLanguage() === 'ar' ? 'نسخ' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <pre id="code-content-${id}"><code class="language-${escapeHtml(langDisplay)}">${escapeHtml(code.trim())}</code></pre>
            ${previewContainerHtml}
            ${jsOutputHtml}
          </div>
        `.trim();
        codeBlocks.push(placeholder);
      }
      return `@@CODE_BLOCK_${id}@@`;
    });

    safe = escapeHtml(safe);
    const lines = safe.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    const paragraph = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      out.push(`<p>${parseInlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph.length = 0;
    };

    for (let i = 0; i < lines.length;) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (!trimmed) {
        flushParagraph();
        i++;
        continue;
      }

      if (/^@@CODE_BLOCK_\d+@@$/.test(trimmed)) {
        flushParagraph();
        out.push(trimmed);
        i++;
        continue;
      }

      const table = renderMarkdownTable(lines, i);
      if (table) {
        flushParagraph();
        out.push(table.html);
        i = table.nextIndex;
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        const level = Math.min(4, Math.max(2, heading[1].length + 1));
        out.push(`<h${level}>${parseInlineMarkdown(heading[2])}</h${level}>`);
        i++;
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        flushParagraph();
        out.push('<hr>');
        i++;
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        flushParagraph();
        const items = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
          i++;
        }
        out.push('<ul>' + items.map(item => `<li>${parseInlineMarkdown(item)}</li>`).join('') + '</ul>');
        continue;
      }

      if (/^\d+[.)]\s+/.test(trimmed)) {
        flushParagraph();
        const items = [];
        while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
          i++;
        }
        out.push('<ol>' + items.map(item => `<li>${parseInlineMarkdown(item)}</li>`).join('') + '</ol>');
        continue;
      }

      paragraph.push(trimmed);
      i++;
    }

    flushParagraph();
    return out.join('\n').replace(/@@CODE_BLOCK_(\d+)@@/g, (_, id) => codeBlocks[Number(id)] || '');
  }

  const api = {
    escapeHtml,
    parseInlineMarkdown,
    renderMarkdownTable,
    isPreviewableHtml,
    lightMarkdown,
    setRelaxedJsonParser,
    setLanguageSource
  };

  global.QjoDomain = global.QjoDomain || {};
  global.QjoDomain.markdown = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

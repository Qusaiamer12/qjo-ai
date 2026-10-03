/**
 * Python under an answer: the Run button, what a run shows, and what it can
 * do next.
 *
 * Python ran only when Run was pressed, on nothing but the code: a CSV the
 * person had attached was not there for pandas to read ("FileNotFoundError"),
 * what the code wrote went nowhere, and a plot needed a press to be seen.
 * Now the files attached in this conversation are in the working directory
 * by their names; the files the code writes come back as downloads; the plot
 * of an answer that just arrived draws by itself; and the output can be sent
 * back to Qjo to explain.
 *
 * Runs go through public/ui/sandbox.js (an iframe with no origin of its own);
 * the run itself is public/domain/pythonRun.js.
 */
(function (global) {
  'use strict';

  // Files a run can read: what people analyse. Kept for this page's life only.
  const DATA_FILE = /\.(?:csv|tsv|txt|json|xlsx|xls|xml|parquet|tab|dat)$/i;
  const KEEP = { files: 20, bytes: 30 * 1024 * 1024 };
  // The page's own words before a run's output, so what the person asked for
  // is judged on their words alone (public/domain/ownWords.js).
  const OUTPUT_NOTE = '[The output of running the Python code above, sent by the page:]';
  const STATUS = { loading: 'pyLoading', initializing: 'pyInitializing', packages: 'pyPackages', running: 'pyRunning' };
  const MIME = { csv: 'text/csv', txt: 'text/plain', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', html: 'text/html' };

  /**
   * @param {{
   *   t: (key: string, vars?: Record<string, string | number>) => string,
   *   escapeHtml: (s: string) => string,
   *   renderRunTerminal: (el: HTMLElement, o: any) => HTMLElement,
   *   copyText: (s: string) => Promise<boolean>,
   *   sendMessage: (text: string) => void,
   *   isBusy: () => boolean,
   *   runPython?: (code: string, options: any) => Promise<any>,
   *   document?: Document
   * }} deps
   */
  function createPythonRunner(deps) {
    const { t, escapeHtml } = deps;
    const doc = deps.document || global.document;
    const run = deps.runPython || ((code, options) => global.QjoUI.sandbox.runPython(code, options));
    const pyRun = () => global.QjoDomain.pythonRun;
    /** @type {Map<string, File>} */
    const kept = new Map();

    /**
     * The data files of a message just sent, for the runs that follow.
     * @param {Array<{name: string, file?: File}>} items
     */
    function keepFiles(items) {
      for (const item of items || []) {
        if (!item || !item.file || !DATA_FILE.test(item.name)) continue;
        const name = pyRun().safeName(item.name);
        kept.delete(name);
        kept.set(name, item.file); // the newest last
      }
      let total = [...kept.values()].reduce((n, f) => n + (f.size || 0), 0);
      for (const [name, file] of kept) {
        if (kept.size <= KEEP.files && total <= KEEP.bytes) break;
        kept.delete(name);
        total -= file.size || 0;
      }
    }

    async function filesForRun() {
      const out = [];
      for (const [name, file] of kept) {
        try { out.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) }); } catch (_) { /* a file the browser no longer holds */ }
      }
      return out;
    }

    function downloadLink(file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const bytes = Uint8Array.from(global.atob(file.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
      const link = doc.createElement('a');
      link.className = 'python-file-download';
      link.href = url;
      link.download = file.name;
      link.textContent = `⬇ ${file.name}`;
      link.title = t('pyDownloadFile', { name: file.name });
      return link;
    }

    // The words of a run, for copying and for Qjo to explain.
    function outputText(res) {
      const parts = [];
      if (res.stdout && res.stdout.trim()) parts.push(res.stdout.trim().slice(0, 3000));
      if (res.stderr && res.stderr.trim()) parts.push(res.stderr.trim().slice(0, 1500));
      if (res.error) parts.push(String(res.error).slice(-2000));
      if (res.images && res.images.length) parts.push(`[${res.images.length} plot(s) drawn]`);
      if (res.files && res.files.length) parts.push(`[files written: ${res.files.map((f) => f.name).join(', ')}]`);
      return parts.join('\n\n');
    }

    // A file the code reads that this page does not hold: attached in an
    // earlier visit, or never.
    function missingFile(res) {
      const m = /FileNotFoundError: \[Errno 44\] No such file or directory: '([^']+)'/.exec(String(res.error || ''));
      return m && !kept.has(pyRun().safeName(m[1])) ? pyRun().safeName(m[1]) : '';
    }

    function render(outputEl, code, res) {
      const ok = !res.error;
      let body = '';
      // What it printed, even before an error: the error alone hid how far it got.
      let text = [res.stdout, res.stderr].map((s) => (s || '').trim()).filter(Boolean).join('\n');
      if (ok && !text && !(res.images || []).length && !(res.files || []).length) text = t('pyNoOutput');
      if (text) body += `<div class="python-terminal-body">${escapeHtml(text)}</div>`;
      if (res.error) body += `<div class="python-terminal-body error-text">${escapeHtml(res.error)}</div>`;
      for (const image of res.images || []) body += `<div class="python-plot-wrap"><img class="python-plot-img" src="data:image/png;base64,${image}" alt="${escapeHtml(t('pyPlotAlt'))}" /></div>`;
      deps.renderRunTerminal(outputEl, {
        icon: ok ? '🐍' : '⚠️', title: t('pyOutputTitle'), statusText: t(ok ? 'pySuccess' : 'pyError'), statusClass: ok ? 'success' : 'error',
        durationMs: res.durationMs, bodyContent: body, autoFix: ok ? null : { language: 'python', code, errorText: res.error }
      });
      const missing = missingFile(res);
      const extras = doc.createElement('div');
      extras.className = 'python-run-extras';
      if (missing) {
        const note = doc.createElement('p');
        note.className = 'python-run-note';
        note.textContent = t('pyAttachAgain', { name: missing });
        extras.append(note);
      }
      if ((res.files || []).length) {
        const files = doc.createElement('div');
        files.className = 'python-files';
        files.append(...res.files.map(downloadLink));
        extras.append(files);
      }
      if ((res.skipped || []).length) {
        const note = doc.createElement('p');
        note.className = 'python-run-note';
        note.textContent = t('pyFilesSkipped', { names: res.skipped.join(', ') });
        extras.append(note);
      }
      if (ok && outputText(res)) {
        const explain = doc.createElement('button');
        explain.type = 'button';
        explain.className = 'python-explain-btn';
        explain.textContent = t('pyExplain');
        explain.addEventListener('click', () => {
          if (deps.isBusy()) return;
          explain.disabled = true;
          deps.sendMessage(`${t('pyExplainAsk')}\n\n${OUTPUT_NOTE}\n\`\`\`text\n${outputText(res)}\n\`\`\``);
        });
        extras.append(explain);
      }
      if (extras.childNodes.length) outputEl.append(extras);
      const copy = outputEl.querySelector('.python-terminal-copy');
      if (copy) copy.addEventListener('click', async () => { if (outputText(res) && await deps.copyText(outputText(res))) { copy.classList.add('copied'); setTimeout(() => copy.classList.remove('copied'), 1500); } });
    }

    async function runBlock(btn) {
      const code = decodeURIComponent(btn.dataset.code || '');
      // Under its own block: ids restart in every answer, and every answer's
      // first block is "py-output-0" — by id, a run showed under another answer.
      const block = btn.closest('.code-block-wrapper');
      const outputEl = block ? /** @type {HTMLElement | null} */ (block.querySelector('.python-output-container')) : null;
      if (!code || !outputEl || btn.disabled) return;
      const spinner = btn.querySelector('.run-spinner');
      const icon = btn.querySelector('.run-icon');
      btn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
      if (icon) icon.classList.add('hidden');
      outputEl.classList.remove('hidden');
      outputEl.innerHTML = `<div class="python-terminal-loading"><span class="run-spinner"></span><span class="py-status-text"></span></div>`;
      const status = (text) => { const el = outputEl.querySelector('.py-status-text'); if (el) el.textContent = text; };
      status(t('pyPreparing'));
      try {
        const res = await run(code, {
          files: await filesForRun(),
          onStatus: (s) => { if (STATUS[s]) status(t(STATUS[s])); },
          timeoutMessage: t('pyTimeout', { s: 30 }),
          truncated: { stdout: t('pyOutputTruncated'), stderr: t('pyWarningsTruncated') }
        });
        render(outputEl, code, res);
      } catch (err) {
        render(outputEl, code, { error: (err && err.message) || String(err), images: [], files: [], skipped: [] });
      } finally {
        btn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        if (icon) icon.classList.remove('hidden');
        const label = btn.querySelector('.run-label');
        if (label) label.textContent = t('pyRerun');
      }
    }

    /** Wires the Run buttons under an answer's Python blocks. @param {ParentNode} element */
    function initialize(element) {
      if (!element) return;
      element.querySelectorAll('.run-python-btn').forEach((btn) => {
        if (btn.dataset.initialized) return;
        btn.dataset.initialized = 'true';
        btn.addEventListener('click', (e) => { e.preventDefault(); runBlock(/** @type {HTMLButtonElement} */ (btn)); });
      });
    }

    /**
     * An answer that just arrived: its last block that draws runs by itself,
     * once, as if Run had been pressed. Not on a connection that asked to
     * save data — Python and its plotting libraries are about 15 MB the first
     * time — and never for an answer opened again from the history.
     * @param {HTMLElement} bubble
     */
    function autoRun(bubble) {
      const saveData = Boolean(global.navigator && global.navigator.connection && global.navigator.connection.saveData);
      if (!bubble || saveData) return;
      const drawing = [...bubble.querySelectorAll('.run-python-btn')].filter((b) => pyRun().draws(decodeURIComponent(/** @type {HTMLElement} */ (b).dataset.code || '')));
      const last = /** @type {HTMLButtonElement | undefined} */ (drawing[drawing.length - 1]);
      if (last && !last.dataset.autoRan) { last.dataset.autoRan = 'true'; runBlock(last); }
    }

    return { initialize, autoRun, keepFiles, OUTPUT_NOTE };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.createPythonRunner = createPythonRunner;
})(typeof window !== 'undefined' ? window : globalThis);

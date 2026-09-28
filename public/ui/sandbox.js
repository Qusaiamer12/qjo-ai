/**
 * Running code the model wrote, where it cannot reach the page.
 *
 * JavaScript used to run in a worker created by the page, and a worker
 * created by the page has the page's origin: it could open the site's
 * IndexedDB — where the signed-in session is kept — and call the server as the
 * user. Python ran on the page itself, with the whole page in reach through
 * `import js`, and no time limit: an infinite loop froze the tab.
 *
 * Both now run in a worker inside an iframe sandboxed without
 * `allow-same-origin`. Its origin is "null": no storage, no cookies, no
 * credentialed calls to the server, no DOM of the page. Measured in Chromium
 * against the app's own CSP: origin "null", IndexedDB → SecurityError, fetch
 * to the app → blocked. A run that outlives its limit is stopped by removing
 * the iframe, which ends its worker.
 *
 * Everything that comes back is treated as untrusted: it was produced by code
 * the page did not write.
 */
(function (global) {
  'use strict';

  const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

  // Unchanged from the worker that used to live in app.js: console capture,
  // formatting, return value, the result shape { ok, logs, error, durationMs }.
  const JS_WORKER_SOURCE = `
    self.onmessage = function (event) {
      var logs = [];
      var MAX_ENTRIES = 300;

      function format(value, depth) {
        depth = depth || 0;
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        var type = typeof value;
        if (type === 'string') return depth === 0 ? value : JSON.stringify(value);
        if (type === 'number' || type === 'boolean') return String(value);
        if (type === 'function') return '[Function: ' + (value.name || 'anonymous') + ']';
        if (type === 'symbol' || type === 'bigint') return String(value);
        if (value instanceof Error) return value.name + ': ' + value.message;
        try {
          var seen = new WeakSet();
          return JSON.stringify(value, function (key, val) {
            if (typeof val === 'object' && val !== null) {
              if (seen.has(val)) return '[Circular]';
              seen.add(val);
            }
            if (typeof val === 'function') return '[Function: ' + (val.name || 'anonymous') + ']';
            if (typeof val === 'bigint') return String(val);
            return val;
          }, 2);
        } catch (e) {
          return String(value);
        }
      }

      function push(kind, args) {
        if (logs.length >= MAX_ENTRIES) return;
        logs.push({ kind: kind, text: args.map(function (a) { return format(a, 0); }).join(' ') });
      }

      // console.table renders as aligned columns, matching the browser.
      function renderTable(data) {
        if (data === null || typeof data !== 'object') return format(data, 0);
        var isArray = Array.isArray(data);
        var rowKeys = isArray ? data.map(function (_, i) { return String(i); }) : Object.keys(data);
        var columns = [];
        var primitiveOnly = true;
        rowKeys.forEach(function (rk) {
          var row = isArray ? data[Number(rk)] : data[rk];
          if (row !== null && typeof row === 'object') {
            primitiveOnly = false;
            Object.keys(row).forEach(function (c) {
              if (columns.indexOf(c) === -1) columns.push(c);
            });
          }
        });
        if (primitiveOnly) columns = ['Values'];
        var header = ['(index)'].concat(columns);
        var body = rowKeys.map(function (rk) {
          var row = isArray ? data[Number(rk)] : data[rk];
          var cells = columns.map(function (c) {
            if (primitiveOnly) return format(row, 1);
            if (row === null || typeof row !== 'object') return '';
            return Object.prototype.hasOwnProperty.call(row, c) ? format(row[c], 1) : '';
          });
          return [rk].concat(cells);
        });
        var widths = header.map(function (h, i) {
          return Math.max(String(h).length, body.reduce(function (m, r) {
            return Math.max(m, String(r[i] === undefined ? '' : r[i]).length);
          }, 0));
        });
        function line(cells) {
          return '| ' + cells.map(function (c, i) {
            return String(c === undefined ? '' : c).padEnd(widths[i]);
          }).join(' | ') + ' |';
        }
        var divider = '|-' + widths.map(function (w) { return '-'.repeat(w); }).join('-|-') + '-|';
        // Escaped: this source lives inside a template literal, so a bare
        // \\n would become a real newline and break the emitted worker.
        return [line(header), divider].concat(body.map(line)).join('\\n');
      }

      self.console = {
        log: function () { push('log', [].slice.call(arguments)); },
        info: function () { push('log', [].slice.call(arguments)); },
        debug: function () { push('log', [].slice.call(arguments)); },
        warn: function () { push('warn', [].slice.call(arguments)); },
        error: function () { push('error', [].slice.call(arguments)); },
        table: function (data) {
          if (logs.length >= MAX_ENTRIES) return;
          logs.push({ kind: 'table', text: renderTable(data) });
        }
      };

      var started = Date.now();
      try {
        var result = (0, eval)(event.data.code);
        if (result !== undefined) {
          logs.push({ kind: 'return', text: format(result, 0) });
        }
        self.postMessage({ ok: true, logs: logs, durationMs: Date.now() - started });
      } catch (error) {
        self.postMessage({
          ok: false,
          logs: logs,
          error: (error && error.stack) ? String(error.stack) : String(error && error.message ? error.message : error),
          durationMs: Date.now() - started
        });
      }
    };
  `;

  // Pyodide, loaded once per sandbox and kept for the next run. The runner
  // wraps the user's code the way app.js did: stdout/stderr captured,
  // matplotlib figures returned as PNG, long output truncated.
  const PY_WORKER_SOURCE = `
    let pyodide = null;
    self.onmessage = async function (event) {
      const { code, indexURL, truncated } = event.data;
      const post = (m) => self.postMessage(m);
      try {
        if (!pyodide) {
          post({ status: 'loading' });
          importScripts(indexURL + 'pyodide.js');
          post({ status: 'initializing' });
          pyodide = await loadPyodide({ indexURL });
        }
      } catch (err) {
        post({ done: true, loadError: String((err && err.message) || err) });
        return;
      }
      post({ status: 'packages' });
      try { await pyodide.loadPackagesFromImports(code); } catch (_) { /* reported by the run itself */ }
      post({ status: 'running' });
      pyodide.globals.set('__qjo_user_code', code);
      const runner = [
        'import sys',
        'from io import StringIO',
        '__qjo_stdout = StringIO()',
        '__qjo_stderr = StringIO()',
        '__qjo_old_stdout = sys.stdout',
        '__qjo_old_stderr = sys.stderr',
        'sys.stdout = __qjo_stdout',
        'sys.stderr = __qjo_stderr',
        '__qjo_error = None',
        '__qjo_images = []',
        "if 'matplotlib' in __qjo_user_code:",
        '    try:',
        '        import matplotlib',
        "        matplotlib.use('Agg')",
        '    except Exception:',
        '        pass',
        'try:',
        "    __qjo_compiled = compile(__qjo_user_code, '<qjo-sandbox>', 'exec')",
        '    exec(__qjo_compiled, globals())',
        "    if 'matplotlib.pyplot' in sys.modules:",
        '        import matplotlib.pyplot as plt',
        '        import base64',
        '        from io import BytesIO',
        '        for fig_num in plt.get_fignums():',
        '            fig = plt.figure(fig_num)',
        '            buf = BytesIO()',
        "            fig.savefig(buf, format='png', bbox_inches='tight', dpi=120)",
        '            buf.seek(0)',
        "            __qjo_images.append(base64.b64encode(buf.read()).decode('utf-8'))",
        '            plt.close(fig)',
        'except Exception:',
        '    import traceback',
        '    __qjo_error = traceback.format_exc()',
        'finally:',
        '    sys.stdout = __qjo_old_stdout',
        '    sys.stderr = __qjo_old_stderr',
        '__qjo_out_str = __qjo_stdout.getvalue()',
        '__qjo_err_str = __qjo_stderr.getvalue()',
        'if len(__qjo_out_str) > 40000:',
        '    __qjo_out_str = __qjo_out_str[:40000] + "\\\\n... " + ' + JSON.stringify(truncated.stdout),
        'if len(__qjo_err_str) > 20000:',
        '    __qjo_err_str = __qjo_err_str[:20000] + "\\\\n... " + ' + JSON.stringify(truncated.stderr),
        '{"stdout": __qjo_out_str, "stderr": __qjo_err_str, "error": __qjo_error, "images": __qjo_images}'
      ].join('\\n');
      const startedAt = performance.now();
      try {
        const res = await pyodide.runPythonAsync(runner);
        const out = res.toJs({ dict_converter: Object.fromEntries });
        if (res && typeof res.destroy === 'function') { try { res.destroy(); } catch (_) {} }
        post({ done: true, result: { ...out, durationMs: Math.round(performance.now() - startedAt) } });
      } catch (err) {
        post({ done: true, result: { stdout: '', stderr: '', error: String((err && err.message) || err), images: [], durationMs: Math.round(performance.now() - startedAt) } });
      }
    };
  `;

  // The document inside the sandbox: it turns a request from the page into a
  // worker and relays the worker's messages back, and does nothing else.
  const HOST_DOCUMENT = `<!doctype html><meta charset="utf-8"><script>
    const workers = {};
    function workerFor(kind, source, fresh) {
      if (fresh || !workers[kind]) {
        if (workers[kind]) workers[kind].terminate();
        workers[kind] = new Worker(URL.createObjectURL(new Blob([source], { type: 'application/javascript' })));
      }
      return workers[kind];
    }
    window.addEventListener('message', (event) => {
      if (event.source !== parent) return;
      const { id, kind, source, fresh, payload } = event.data || {};
      let worker;
      try { worker = workerFor(kind, source, fresh); } catch (err) {
        parent.postMessage({ id, message: { done: true, sandboxError: String((err && err.message) || err) } }, '*');
        return;
      }
      worker.onmessage = (e) => parent.postMessage({ id, message: e.data }, '*');
      worker.onerror = (e) => { e.preventDefault(); parent.postMessage({ id, message: { done: true, sandboxError: e.message || 'Worker error.' } }, '*'); };
      worker.postMessage(payload);
    });
    parent.postMessage({ ready: true }, '*');
  </script>`;

  /**
   * One sandbox iframe. `run` sends a job and settles with the worker's last
   * message; `destroy` removes the iframe, ending whatever runs inside.
   */
  function createSandbox(doc) {
    const frame = doc.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
    frame.srcdoc = HOST_DOCUMENT;
    const listeners = new Map();
    let nextId = 1;
    const ready = new Promise((resolve) => { listeners.set('ready', resolve); });
    const onMessage = (event) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data || {};
      if (data.ready) { const r = listeners.get('ready'); if (r) r(); return; }
      const handler = listeners.get(data.id);
      if (handler) handler(data.message || {});
    };
    global.addEventListener('message', onMessage);
    doc.body.appendChild(frame);

    return {
      frame,
      async run(kind, source, payload, { fresh = false, onMessage: each } = {}) {
        await ready;
        const id = nextId++;
        return new Promise((resolve) => {
          listeners.set(id, (message) => {
            if (each) each(message);
            if (message.done || message.ok !== undefined) { listeners.delete(id); resolve(message); }
          });
          frame.contentWindow.postMessage({ id, kind, source, fresh, payload }, '*');
        });
      },
      destroy() {
        global.removeEventListener('message', onMessage);
        frame.remove();
      }
    };
  }

  const text = (value, max) => String(value == null ? '' : value).slice(0, max);
  // A plot comes back as base64 and is put into an <img src>. The user's code
  // runs in the same Python namespace as the runner and can put anything in
  // that list, so only base64 is accepted.
  const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

  function withTimeout(promise, ms, onTimeout) {
    let timer;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((resolve) => { timer = setTimeout(() => resolve(onTimeout()), ms); })
    ]);
  }

  /**
   * @param {string} code
   * @param {{timeoutMs?: number, timeoutMessage?: string, document?: Document}} [options]
   * @returns {Promise<{ok: boolean, logs: Array<{kind: string, text: string}>, error?: string, durationMs: number, timedOut?: boolean}>}
   */
  async function runJavaScript(code, { timeoutMs = 5000, timeoutMessage = 'Execution halted: the code ran too long.', document: doc = global.document } = {}) {
    const startedAt = Date.now();
    const sandbox = createSandbox(doc);
    try {
      const raw = await withTimeout(
        sandbox.run('js', JS_WORKER_SOURCE, { code: String(code || '') }, { fresh: true }),
        timeoutMs,
        () => ({ ok: false, logs: [], timedOut: true, error: timeoutMessage })
      );
      if (raw.sandboxError) return { ok: false, logs: [], error: `Sandbox unavailable: ${text(raw.sandboxError, 300)}`, durationMs: Date.now() - startedAt };
      return {
        ok: raw.ok === true,
        logs: (Array.isArray(raw.logs) ? raw.logs : []).slice(0, 300).map((l) => ({ kind: text(l && l.kind, 20), text: text(l && l.text, 20000) })),
        error: raw.error ? text(raw.error, 20000) : undefined,
        durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs : Date.now() - startedAt,
        timedOut: raw.timedOut === true || undefined
      };
    } finally {
      sandbox.destroy();
    }
  }

  let pythonSandbox = null;
  // Python runs one at a time: they share one worker and one interpreter, whose
  // output streams a second run would redirect under the first.
  let pythonQueue = Promise.resolve();
  function runPython(code, options) {
    const run = pythonQueue.then(() => runPythonNow(code, options));
    pythonQueue = run.catch(() => {});
    return run;
  }

  /**
   * Runs Python in the shared Python sandbox (Pyodide stays loaded between
   * runs). Loading has its own, longer limit than running. Throws when Python
   * cannot be loaded at all, as before; a run that errors resolves with it.
   * @param {string} code
   * @param {{onStatus?: (status: string) => void, loadTimeoutMs?: number, runTimeoutMs?: number,
   *   timeoutMessage?: string, truncated?: {stdout: string, stderr: string}, indexURL?: string, document?: Document}} [options]
   */
  async function runPythonNow(code, {
    onStatus, loadTimeoutMs = 120000, runTimeoutMs = 30000, timeoutMessage = 'Execution halted: the code ran too long.',
    truncated = { stdout: 'output truncated', stderr: 'warnings truncated' }, indexURL = PYODIDE_INDEX_URL, document: doc = global.document
  } = {}) {
    if (!pythonSandbox) pythonSandbox = createSandbox(doc);
    const sandbox = pythonSandbox;
    let phaseTimer = null;
    let resolveTimeout;
    const timedOut = new Promise((resolve) => { resolveTimeout = resolve; });
    const arm = (ms) => { clearTimeout(phaseTimer); phaseTimer = setTimeout(() => resolveTimeout({ timedOut: true }), ms); };
    arm(loadTimeoutMs);
    const job = sandbox.run('py', PY_WORKER_SOURCE, { code: String(code || ''), indexURL, truncated }, {
      onMessage: (m) => {
        if (m.status === 'running') arm(runTimeoutMs);
        if (m.status && onStatus) onStatus(String(m.status));
      }
    });
    const raw = await Promise.race([job, timedOut]);
    clearTimeout(phaseTimer);
    if (raw.timedOut) {
      // The only way to stop Python mid-run: end the sandbox. The next run
      // starts a fresh one.
      sandbox.destroy();
      if (pythonSandbox === sandbox) pythonSandbox = null;
      return { stdout: '', stderr: '', error: timeoutMessage, images: [], durationMs: 0, timedOut: true };
    }
    if (raw.sandboxError || raw.loadError) {
      sandbox.destroy();
      if (pythonSandbox === sandbox) pythonSandbox = null;
      throw new Error(text(raw.loadError || raw.sandboxError, 500));
    }
    const r = raw.result || {};
    return {
      stdout: text(r.stdout, 60000),
      stderr: text(r.stderr, 30000),
      error: r.error ? text(r.error, 30000) : null,
      images: (Array.isArray(r.images) ? r.images : []).filter((b) => typeof b === 'string' && BASE64.test(b)).slice(0, 12),
      durationMs: Number.isFinite(r.durationMs) ? r.durationMs : 0
    };
  }

  global.QjoUI = global.QjoUI || {};
  global.QjoUI.sandbox = { runJavaScript, runPython, PYODIDE_INDEX_URL };
})(typeof window !== 'undefined' ? window : globalThis);

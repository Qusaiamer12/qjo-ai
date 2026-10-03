/**
 * One run of Python, as it happens inside the sandbox's worker
 * (public/ui/sandbox.js) and in the suite that runs real Pyodide
 * (scripts/test-python.js): the same code in both.
 *
 * Before the code: the files the person attached are written into the
 * working directory by their names, so `pd.read_csv('sales.csv')` finds them.
 * After it: what it printed, its plots as PNG, and the files it wrote there —
 * new or changed — for the page to offer as downloads.
 *
 * `runInPyodide` is embedded in the worker by its source text, so it uses
 * nothing but its arguments.
 */
(function () {
  'use strict';

  // What one run may hand back: a few files, none huge.
  const LIMITS = { files: 6, fileBytes: 8 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, plots: 12 };

  /**
   * A name a file can have in the working directory: the last part of what
   * the person called it, without control characters or a leading dot run.
   * @param {string} name
   */
  function safeName(name) {
    const base = String(name || '').split(/[\\/]/).pop() || '';
    const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').trim().slice(0, 120);
    return clean || 'file';
  }

  /**
   * The Python that wraps the person's code.
   * @param {{stdout: string, stderr: string}} truncated notes for output cut at the limit
   */
  function runnerSource(truncated) {
    const note = (text) => JSON.stringify(' ' + String(text || ''));
    return [
      'import sys, os, warnings, base64',
      'from io import StringIO, BytesIO',
      '__qjo_stdout = StringIO()',
      '__qjo_stderr = StringIO()',
      '__qjo_old = (sys.stdout, sys.stderr)',
      'sys.stdout, sys.stderr = __qjo_stdout, __qjo_stderr',
      '__qjo_error = None',
      '__qjo_images = []',
      '__qjo_files = []',
      '__qjo_skipped = []',
      // Notices meant for the people who maintain a library, not for the
      // person whose code ran: pandas warns about pyarrow on every import, and
      // matplotlib that plt.show() has no window here (the plot is shown).
      "warnings.filterwarnings('ignore', category=DeprecationWarning)",
      "warnings.filterwarnings('ignore', message='.*non-GUI backend.*')",
      '__qjo_cwd = os.getcwd()',
      'for __qjo_name, __qjo_data in __qjo_inputs:',
      "    with open(os.path.join(__qjo_cwd, __qjo_name), 'wb') as __qjo_f:",
      '        __qjo_f.write(bytes(__qjo_data))',
      'def __qjo_snapshot():',
      '    out = {}',
      '    for name in os.listdir(__qjo_cwd):',
      '        path = os.path.join(__qjo_cwd, name)',
      '        if os.path.isfile(path):',
      '            st = os.stat(path)',
      '            out[name] = (st.st_size, st.st_mtime_ns)',
      '    return out',
      '__qjo_before = __qjo_snapshot()',
      "if 'matplotlib' in __qjo_user_code or 'seaborn' in __qjo_user_code:",
      '    try:',
      '        import matplotlib',
      "        matplotlib.use('Agg')",
      '    except Exception:',
      '        pass',
      'try:',
      "    exec(compile(__qjo_user_code, '<qjo-sandbox>', 'exec'), globals())",
      'except BaseException:',
      '    import traceback',
      '    __qjo_error = traceback.format_exc()',
      'finally:',
      '    sys.stdout, sys.stderr = __qjo_old',
      "if 'matplotlib.pyplot' in sys.modules:",
      '    import matplotlib.pyplot as plt',
      '    for __qjo_num in plt.get_fignums()[:__qjo_limits["plots"]]:',
      '        __qjo_fig = plt.figure(__qjo_num)',
      '        __qjo_buf = BytesIO()',
      "        __qjo_fig.savefig(__qjo_buf, format='png', bbox_inches='tight', dpi=120)",
      "        __qjo_images.append(base64.b64encode(__qjo_buf.getvalue()).decode('ascii'))",
      '        plt.close(__qjo_fig)',
      '__qjo_total = 0',
      'for __qjo_name, __qjo_stat in sorted(__qjo_snapshot().items()):',
      '    if __qjo_before.get(__qjo_name) == __qjo_stat:',
      '        continue',
      '    if len(__qjo_files) >= __qjo_limits["files"] or __qjo_stat[0] > __qjo_limits["fileBytes"] or __qjo_total + __qjo_stat[0] > __qjo_limits["totalBytes"]:',
      '        __qjo_skipped.append(__qjo_name)',
      '        continue',
      "    with open(os.path.join(__qjo_cwd, __qjo_name), 'rb') as __qjo_f:",
      "        __qjo_files.append({'name': __qjo_name, 'size': __qjo_stat[0], 'base64': base64.b64encode(__qjo_f.read()).decode('ascii')})",
      '    __qjo_total += __qjo_stat[0]',
      '__qjo_out_str = __qjo_stdout.getvalue()',
      '__qjo_err_str = __qjo_stderr.getvalue()',
      'if len(__qjo_out_str) > 40000:',
      '    __qjo_out_str = __qjo_out_str[:40000] + "\\n..." + ' + note(truncated && truncated.stdout),
      'if len(__qjo_err_str) > 20000:',
      '    __qjo_err_str = __qjo_err_str[:20000] + "\\n..." + ' + note(truncated && truncated.stderr),
      '{"stdout": __qjo_out_str, "stderr": __qjo_err_str, "error": __qjo_error, "images": __qjo_images, "files": __qjo_files, "skipped": __qjo_skipped}'
    ].join('\n');
  }

  /**
   * Runs the code in a loaded Pyodide. Embedded in the worker by its source.
   * @param {any} pyodide
   * @param {{code: string, runner: string, files?: Array<{name: string, bytes: Uint8Array}>, limits: Record<string, number>}} job
   */
  async function runInPyodide(pyodide, job) {
    const inputs = (job.files || []).map((f) => [f.name, f.bytes]);
    pyodide.globals.set('__qjo_user_code', job.code);
    pyodide.globals.set('__qjo_limits', pyodide.toPy(job.limits));
    pyodide.globals.set('__qjo_inputs', pyodide.toPy(inputs));
    const res = await pyodide.runPythonAsync(job.runner);
    const out = res.toJs({ dict_converter: Object.fromEntries });
    if (res && typeof res.destroy === 'function') { try { res.destroy(); } catch (_) { /* gone already */ } }
    return { ...out, error: out.error || null }; // Python's None arrives as undefined
  }

  // Whether an answer's Python draws: it runs by itself once the answer is in.
  const PLOTS = /^\s*(?:import\s+matplotlib|from\s+matplotlib\b|import\s+seaborn|from\s+seaborn\b)/m;
  const SHOWS = /\b(?:plt|pyplot|sns|ax\d*|fig)\.\w+\(|\.plot\(/;
  /** @param {string} code */
  function draws(code) {
    const text = String(code || '');
    return PLOTS.test(text) && SHOWS.test(text) && !/\binput\s*\(/.test(text);
  }

  // Python that runs in the page — an analysis, a plot, a sum, a file of
  // data — not a Python project for the person's machine, which stays code.
  const PY_WORDS = /python|pandas|numpy|sympy|matplotlib|بايثون/i;
  const PY_PROJECT = /\b(?:flask|django|fastapi|api|server|backend|bot|telegram|discord|selenium|scrap\w*|crawler|tkinter|pygame|kivy|gui|desktop app|deploy|docker|database|sqlalchemy|package)\b|سيرفر|بوت|سكراب|واجهة رسومية/i;
  const PY_IN_PAGE = /\b(?:analy[sz]\w*|plot\w*|chart\w*|graph\w*|draw\w*|visuali[sz]\w*|statistic\w*|calculat\w*|comput\w*|solve\w*|simulat\w*|integra\w*|derivativ\w*|matri\w*|regression|histogram|forecast\w*|average|mean|median|total|sum|trend\w*|correlat\w*|summari[sz]e)\b|حلل|تحليل|ارسم|رسم|منحنى|منحني|احسب|حساب|إحصا|احصا|مصفوف|انحدار|تكامل|مشتق|متوسط|مجموع|اتجاه|لخص|محاكاة/i;
  // A file of data the page attached (its "Attachment Index" line).
  const DATA_FILE = /^Attachment Index \d+: .+\.(?:csv|tsv|xlsx|xls|json)$/im;

  /**
   * Whether a message is Python for the page: asked in Python's words, or of
   * a data file the person attached, to analyse, sum or draw.
   * @param {string} own the person's own words
   * @param {boolean} data a data file is attached
   */
  function pythonInPage(own, data) {
    if (!PY_IN_PAGE.test(own) || PY_PROJECT.test(own)) return false;
    return PY_WORDS.test(own) || data;
  }

  /**
   * The same, of a message as the page sent it.
   * @param {string} message
   * @param {(text: string) => string} own ownWords
   */
  const pythonMessage = (message, own) => pythonInPage(own(String(message || '')), DATA_FILE.test(String(message || '')));

  const api = { LIMITS, safeName, runnerSource, runInPyodide, draws, pythonInPage, pythonMessage, DATA_FILE };
  if (typeof window !== 'undefined') {
    const host = /** @type {any} */ (window);
    host.QjoDomain = host.QjoDomain || {};
    host.QjoDomain.pythonRun = api;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

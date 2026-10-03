// Python as Qjo runs it, in real Pyodide: the runner the sandbox's worker
// runs (public/domain/pythonRun.js), the same code, with numpy, pandas,
// matplotlib and sympy at the versions the app loads.
//
// Every earlier check of Python ran against a stand-in that printed what it
// was given. A stand-in cannot say that pandas prints a warning about pyarrow
// on every import, or that a file written by the code is where the page
// looks for it. This runs the real thing.
//
// Needs the packages fetched once: node tests/browser/fetch-pyodide.js
// (npm ci --prefix tests/browser first). It fails, by name, without them.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { LIMITS, safeName, runnerSource, runInPyodide, draws } = require('../public/domain/pythonRun');

const browserPkg = path.join(__dirname, '..', 'tests', 'browser');
const CACHE = path.join(browserPkg, '.pyodide-cache');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}\n     ${String(e.message).split('\n').slice(0, 6).join('\n     ')}`); }
}

const TRUNCATED = { stdout: 'output truncated', stderr: 'warnings truncated' };
const bytes = (text) => new Uint8Array(Buffer.from(text, 'utf8'));
const fromBase64 = (b64) => Buffer.from(b64, 'base64').toString('utf8');
let pyodide;
const run = async (code, files) => {
  await pyodide.loadPackagesFromImports(code);
  return runInPyodide(pyodide, { code, files, runner: runnerSource(TRUNCATED), limits: LIMITS });
};

(async () => {
  const missing = ['pyodide.asm.wasm', 'pyodide-lock.json'].filter((f) => !fs.existsSync(path.join(CACHE, f)));
  if (missing.length) {
    console.error(`Real Python is not here: ${missing.join(', ')} missing from tests/browser/.pyodide-cache. Run: node tests/browser/fetch-pyodide.js`);
    process.exit(1);
  }
  const { loadPyodide } = require(path.join(browserPkg, 'node_modules', 'pyodide'));
  pyodide = await loadPyodide({ indexURL: CACHE + path.sep, stdout: () => {}, stderr: () => {} });

  console.log('\nOutput:');
  await test('what the code prints comes back, and a positive control: the version Qjo runs', async () => {
    const r = await run('import sys\nprint("hello", sys.version_info[:2])');
    assert.strictEqual(r.error, null);
    assert.strictEqual(r.stdout.trim(), 'hello (3, 12)');
  });
  await test('an error comes back as its traceback, with what was printed before it', async () => {
    const r = await run('print("before")\n1/0');
    assert.ok(/ZeroDivisionError/.test(r.error) && r.stdout.trim() === 'before', JSON.stringify(r));
  });
  await test('a very long output is cut, and says so', async () => {
    const r = await run('print("x" * 50000)');
    assert.ok(r.stdout.length < 41000 && r.stdout.endsWith('output truncated'), r.stdout.slice(-40));
  });

  console.log('\nPlots:');
  await test('a matplotlib plot comes back as a PNG, and plt.show() leaves no warning', async () => {
    const r = await run('import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [4, 1, 9])\nplt.title("Sales")\nplt.show()');
    assert.strictEqual(r.images.length, 1, JSON.stringify({ ...r, images: r.images.length }));
    assert.ok(Buffer.from(r.images[0], 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'not a PNG');
    assert.strictEqual(r.stderr, '', `stderr: ${r.stderr}`);
  });
  await test('a 3D surface (mplot3d) draws too', async () => {
    const r = await run('import numpy as np\nimport matplotlib.pyplot as plt\nx = y = np.linspace(-2, 2, 30)\nX, Y = np.meshgrid(x, y)\nax = plt.figure().add_subplot(projection="3d")\nax.plot_surface(X, Y, np.sin(X * Y))');
    assert.ok(r.error === null && r.images.length === 1, r.error);
  });
  await test('plots drawn before an error still come back', async () => {
    const r = await run('import matplotlib.pyplot as plt\nplt.plot([1, 2])\nraise ValueError("late")');
    assert.ok(/ValueError: late/.test(r.error) && r.images.length === 1);
  });

  console.log('\nFiles in:');
  await test('a CSV the person attached is read by pandas by its name — and pandas says nothing about pyarrow', async () => {
    const csv = bytes('month,amount\nJan,10\nFeb,20\nMar,12.5\n');
    const r = await run('import pandas as pd\nd = pd.read_csv("sales.csv")\nprint(d["amount"].sum())', [{ name: 'sales.csv', bytes: csv }]);
    assert.strictEqual(r.error, null, r.error);
    assert.strictEqual(r.stdout.trim(), '42.5');
    assert.ok(!/pyarrow/i.test(r.stderr), r.stderr);
  });
  await test('control: without the runner\'s filter, the same import does warn about pyarrow', async () => {
    const out = await pyodide.runPythonAsync('import warnings, importlib, sys, io\nbuf = io.StringIO()\nold = sys.stderr\nsys.stderr = buf\nwarnings.resetwarnings()\nwarnings.simplefilter("default")\nfor m in [k for k in list(sys.modules) if k == "pandas" or k.startswith("pandas.")]:\n    del sys.modules[m]\nimport pandas\nsys.stderr = old\nbuf.getvalue()');
    assert.ok(/pyarrow/i.test(String(out)), 'no warning seen: the filter proves nothing');
  });
  await test('JSON and text attachments too, and an Arabic file name', async () => {
    const r = await run('import json\nprint(json.load(open("data.json"))["n"], open("ملاحظات.txt", encoding="utf-8").read())',
      [{ name: 'data.json', bytes: bytes('{"n": 7}') }, { name: 'ملاحظات.txt', bytes: bytes('مرحبا') }]);
    assert.strictEqual(r.stdout.trim(), '7 مرحبا', r.error || r.stdout);
  });
  await test('an attached file the code does not change is not offered back', async () => {
    const r = await run('print(open("sales.csv").read()[:5])', [{ name: 'sales.csv', bytes: bytes('a,b\n1,2\n') }]);
    assert.deepStrictEqual(r.files.map((f) => f.name), []);
  });

  console.log('\nFiles out:');
  await test('files the code writes come back by name, with their contents', async () => {
    const r = await run('import pandas as pd\nimport matplotlib.pyplot as plt\npd.DataFrame({"a": [1, 2]}).to_csv("out.csv", index=False)\nplt.plot([1, 2])\nplt.savefig("chart.png")\nopen("report.txt", "w").write("done")');
    const names = r.files.map((f) => f.name);
    assert.deepStrictEqual(names, ['chart.png', 'out.csv', 'report.txt'], JSON.stringify(names));
    assert.strictEqual(fromBase64(r.files.find((f) => f.name === 'out.csv').base64), 'a\n1\n2\n');
    assert.strictEqual(r.files.find((f) => f.name === 'report.txt').size, 4);
  });
  await test('a file from an earlier run is not offered again unless the code changes it', async () => {
    const same = await run('print(1)');
    assert.deepStrictEqual(same.files.map((f) => f.name), []);
    const changed = await run('open("report.txt", "a").write(" again")');
    assert.deepStrictEqual(changed.files.map((f) => f.name), ['report.txt']);
  });
  await test('an attached file the code changes is offered back', async () => {
    const r = await run('open("sales.csv", "a").write("3,4\\n")', [{ name: 'sales.csv', bytes: bytes('a,b\n1,2\n') }]);
    assert.deepStrictEqual(r.files.map((f) => f.name), ['sales.csv']);
  });
  await test(`at most ${LIMITS.files} files, none over ${LIMITS.fileBytes / 1048576} MB: the rest are named, not sent`, async () => {
    const r = await run(`for i in range(8):\n    open(f"f{i}.txt", "w").write("x")\nopen("big.bin", "wb").write(b"0" * ${LIMITS.fileBytes + 1})`);
    assert.strictEqual(r.files.length, LIMITS.files);
    assert.ok(r.skipped.includes('big.bin') && r.skipped.length === 9 - LIMITS.files + 0, JSON.stringify(r.skipped));
  });

  console.log('\nExcel (openpyxl, served by the app):');
  const ExcelJS = require('exceljs');
  const { readXlsx } = require('../public/domain/xlsxText');
  const vendor = path.join(__dirname, '..', 'public', 'vendor', 'python');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Sales');
  sheet.addRow(['month', 'amount', 'date']);
  sheet.addRow(['Jan', 10, new Date(Date.UTC(2026, 0, 31))]);
  sheet.addRow(['Feb', 32, new Date(Date.UTC(2026, 1, 28))]);
  const xlsx = new Uint8Array(await book.xlsx.writeBuffer());
  await test('the wheels the app serves are the files PyPI published (SHA-256)', () => {
    const published = {
      'openpyxl-3.1.5-py2.py3-none-any.whl': '5282c12b107bffeef825f4617dc029afaf41d0ea60823bbb665ef3079dc79de2',
      'et_xmlfile-2.0.0-py3-none-any.whl': '7a91720bc756843502c3b7504c77b8fe44217c85c537d85037f0f536151b2caa'
    };
    assert.deepStrictEqual(fs.readdirSync(vendor).filter((f) => f.endsWith('.whl')).sort(), Object.keys(published).sort());
    for (const [name, sha] of Object.entries(published)) {
      assert.strictEqual(require('crypto').createHash('sha256').update(fs.readFileSync(path.join(vendor, name))).digest('hex'), sha, name);
    }
  });
  await test('control: without the wheels the app serves, pandas cannot read a workbook', async () => {
    const r = await run('import pandas as pd\npd.read_excel("sales.xlsx")', [{ name: 'sales.xlsx', bytes: xlsx }]);
    assert.ok(/openpyxl/.test(r.error || ''), r.error);
  });
  await test('with them, pandas reads an Excel file the person attached — its dates as dates', async () => {
    await pyodide.loadPackage(fs.readdirSync(vendor).filter((f) => f.endsWith('.whl')).map((f) => path.join(vendor, f)));
    const r = await run('import pandas as pd\nd = pd.read_excel("sales.xlsx")\nprint(int(d["amount"].sum()), str(d["date"].dtype))', [{ name: 'sales.xlsx', bytes: xlsx }]);
    assert.strictEqual(r.stdout.trim(), '42 datetime64[ns]', r.error || r.stdout);
  });
  await test('and a workbook pandas writes comes back, and the page reads it as text', async () => {
    const r = await run('import pandas as pd\npd.DataFrame({"name": ["سامي", "Lina"], "score": [91, 88.5]}).to_excel("scores.xlsx", index=False, sheet_name="Scores")');
    const file = r.files.find((f) => f.name === 'scores.xlsx');
    assert.ok(file, JSON.stringify(r.files.map((f) => f.name)) + r.error);
    const { text } = await readXlsx(Buffer.from(file.base64, 'base64'));
    assert.strictEqual(text, 'Sheet: Scores\nname,score\nسامي,91\nLina,88.5');
  });

  console.log('\nThe libraries Qjo offers:');
  await test('sympy solves exactly', async () => {
    const r = await run('import sympy as sp\nx = sp.symbols("x")\nprint(sp.solve(x**2 - 2, x), sp.integrate(sp.sin(x)**2, (x, 0, sp.pi)))');
    assert.strictEqual(r.stdout.trim(), '[-sqrt(2), sqrt(2)] pi/2', r.error || r.stdout);
  });

  console.log('\nNames and plots, decided in the page:');
  await test('a file keeps the last part of its name, without control characters or leading dots', () => {
    assert.strictEqual(safeName('C:\\Users\\sami\\sales.csv'), 'sales.csv');
    assert.strictEqual(safeName('../../etc/passwd'), 'passwd');
    assert.strictEqual(safeName('..\u0000.env'), 'env');
    assert.strictEqual(safeName('بيانات المبيعات.xlsx'), 'بيانات المبيعات.xlsx');
    assert.strictEqual(safeName(''), 'file');
  });
  await test('code that draws is told from code that does not, or that waits for input', () => {
    assert.ok(draws('import matplotlib.pyplot as plt\nplt.plot([1, 2])'));
    assert.ok(draws('import pandas as pd\nimport matplotlib.pyplot as plt\ndf = pd.read_csv("a.csv")\ndf.plot()'));
    assert.ok(draws('import seaborn as sns\nsns.histplot([1, 2])'));
    assert.ok(!draws('import pandas as pd\nprint(pd.__version__)'));
    assert.ok(!draws('# matplotlib can plot this later\nprint(1)'));
    assert.ok(!draws('import matplotlib.pyplot as plt\nn = int(input())\nplt.plot(range(n))'));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

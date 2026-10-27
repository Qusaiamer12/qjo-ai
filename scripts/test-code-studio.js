// What an answer's code previews as (public/domain/codeProject.js), without a
// browser. tests/browser/code-studio.test.js runs the same documents in
// Chromium; this pins the decisions — which blocks belong to one preview, and
// where their code goes — each in milliseconds.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LIBS, kindOf, projectFor, buildDocument } = require('../public/domain/codeProject.js');
const markdown = require('../public/domain/markdown.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); } catch (error) {
    fail++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${String(error.message).split('\n').slice(0, 3).join('\n     ')}`);
  }
}
const count = (text, needle) => text.split(needle).length - 1;

const PAGE = '<!DOCTYPE html>\n<html>\n<head>\n<title>t</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<button id="b">0</button>\n<script src="script.js"></script>\n</body>\n</html>';
const CSS = 'button { color: rgb(255, 0, 0); }';
const JS = 'document.getElementById("b").onclick = function () { this.textContent = String(Number(this.textContent) + 1); };';

console.log('\nWhat each block is:');
for (const [label, block, kind] of [
  ['an HTML block', { lang: 'html', code: '<p>x</p>' }, 'html'],
  ['a file named .html', { lang: '', code: '<p>x</p>', path: 'index.html' }, 'html'],
  ['an SVG', { lang: 'svg', code: '<svg></svg>' }, 'svg'],
  ['an SVG written as html', { lang: 'html', code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, 'svg'],
  ['CSS', { lang: 'css', code: CSS }, 'css'],
  ['page JavaScript', { lang: 'javascript', code: JS }, 'js'],
  ['JSX', { lang: 'jsx', code: 'export default () => <div/>' }, 'react'],
  ['TSX', { lang: 'tsx', code: 'export default function A(): JSX.Element { return <div/> }' }, 'react'],
  ['a component written as .js', { lang: 'js', code: "import { useState } from 'react';\nexport default function A() { return (<div/>); }" }, 'react'],
  ['markup in a js block', { lang: 'js', code: '<div>hi</div>' }, 'html'],
  ['an Express server', { lang: 'javascript', code: "const express = require('express');\nconst app = express();\napp.listen(3000);" }, null],
  ['a Node module', { lang: 'js', code: 'module.exports = { a: 1 };' }, null],
  ['Python', { lang: 'python', code: 'print(1)' }, null],
  ['a string of HTML inside page JS', { lang: 'js', code: "list.innerHTML = '<li>' + x + '</li>';" }, 'js']
]) {
  test(`${label} → ${kind}`, () => assert.strictEqual(kindOf(block), kind));
}

test('a block gets a Preview tab exactly when there is something to preview', () => {
  const samples = [
    ['html', '<p>x</p>'], ['jsx', 'export default () => <div/>'], ['javascript', JS], ['css', CSS],
    ['python', 'print(1)'], ['', '<div>a</div>'], ['js', "import React from 'react';\nconst A = () => <b/>;"], ['js', "require('express')"]
  ];
  for (const [lang, code] of samples) {
    const previewable = ['html', 'svg', 'react'].includes(/** @type {string} */ (kindOf({ lang, code })));
    assert.strictEqual(markdown.isPreviewableHtml(lang, code, ''), previewable, `${lang}: ${code.slice(0, 30)}`);
  }
});

console.log('\nOne page and its files:');
const answer = [{ lang: 'html', code: PAGE }, { lang: 'css', code: CSS }, { lang: 'javascript', code: JS }];

test('the page, its styles and its script make one project', () => {
  const project = projectFor(answer, 0);
  assert.deepStrictEqual(project.files.map((f) => `${f.role}:${f.name}`), ['main:index.html', 'style:style.css', 'script:script.js']);
});

test('the styles go into the head and the script to the end of the body', () => {
  const doc = buildDocument(projectFor(answer, 0));
  assert.ok(doc.indexOf(CSS) < doc.indexOf('</head>'), 'css in head');
  assert.ok(doc.indexOf(JS) > doc.indexOf('<button') && doc.indexOf(JS) < doc.lastIndexOf('</body>'), 'script after the markup');
  assert.ok(doc.trim().startsWith('<!DOCTYPE html>'), 'doctype stays first');
});

test('references to the answer\'s files are taken out — they could only fetch the app\'s own files', () => {
  const doc = buildDocument(projectFor(answer, 0));
  assert.ok(!/href="style\.css"/.test(doc) && !/src="script\.js"/.test(doc), doc.slice(0, 300));
});

test('a server file in the same answer is not run as the page\'s script', () => {
  const withServer = [...answer, { lang: 'javascript', code: "const express = require('express');\nexpress().listen(3000);", path: 'server.js' }];
  const project = projectFor(withServer, 0);
  assert.ok(!project.files.some((f) => /express/.test(f.code)), project.files.map((f) => f.name).join(','));
});

test('the CSS or script\'s block is not itself previewable', () => {
  assert.strictEqual(projectFor(answer, 1), null);
  assert.strictEqual(projectFor(answer, 2), null);
});

test('a fragment gets the styles and scripts too', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<button id="b">0</button>' }, { lang: 'css', code: CSS }, { lang: 'js', code: JS }], 0));
  assert.ok(doc.includes(CSS) && doc.includes(JS) && doc.indexOf(CSS) < doc.indexOf('</head>'));
});

console.log('\nSeveral pages in one answer:');
test('an unnamed stylesheet does not join every page', () => {
  const two = [{ lang: 'html', code: '<p>one</p>' }, { lang: 'html', code: '<p>two</p>' }, { lang: 'css', code: CSS }];
  assert.strictEqual(projectFor(two, 0).files.length, 1);
});

test('a page gets the file it names, and only that one', () => {
  const blocks = [
    { lang: 'html', code: '<link rel="stylesheet" href="css/main.css"><p>one</p>' },
    { lang: 'html', code: '<p>two</p>' },
    { lang: 'css', code: 'p { color: blue; }', path: 'main.css' },
    { lang: 'css', code: 'p { color: green; }', path: 'other.css' }
  ];
  assert.deepStrictEqual(projectFor(blocks, 0).files.map((f) => f.name), ['index.html', 'main.css']);
});

test('a page naming a file the answer left unnamed gets the unnamed block', () => {
  const blocks = [{ lang: 'html', code: '<link rel="stylesheet" href="styles.css"><p>one</p>' }, { lang: 'html', code: '<p>two</p>' }, { lang: 'css', code: CSS }];
  assert.deepStrictEqual(projectFor(blocks, 0).files.map((f) => f.name), ['index.html', 'style.css']);
});

console.log('\nCode that would break the document around it:');
test('"</script>" inside a script does not end it', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<p>x</p>' }, { lang: 'js', code: 'const s = "</script><b>escaped</b>";' }], 0));
  assert.ok(doc.includes('<\\/script><b>escaped</b>'), 'escaped inside the script');
  assert.strictEqual(count(doc, '</script>'), count(doc, '<script'), 'every script element is closed exactly once');
});

test('"</style>" inside CSS does not end the stylesheet', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<p>x</p>' }, { lang: 'css', code: 'p::after { content: "</style><b>x</b>"; }' }], 0));
  assert.strictEqual(count(doc, '</style>'), count(doc, '<style>'), 'every style element is closed exactly once');
});

test('"$&" and "$1" in CSS and JS arrive as written', () => {
  const css = 'a::after { content: "$& $1 $$"; }';
  const js = 'const price = "$1 $& $$";';
  const doc = buildDocument(projectFor([{ lang: 'html', code: PAGE }, { lang: 'css', code: css }, { lang: 'js', code: js }], 0));
  assert.ok(doc.includes(css) && doc.includes(js));
});

test('a script written as a module runs as one', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<p id="x"></p>' }, { lang: 'js', code: "import { a } from './a.js';\ndocument.getElementById('x').textContent = a;" }, { lang: 'js', code: 'console.log(1);' }], 0));
  assert.strictEqual(count(doc, '<script type="module">'), 1, 'the module, and only the module');
});

test('a document with no <head> keeps its doctype first', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<!DOCTYPE html>\n<body><p>x</p></body>' }, { lang: 'css', code: CSS }], 0));
  assert.ok(doc.startsWith('<!DOCTYPE html>'), doc.slice(0, 80));
  assert.ok(doc.includes(CSS));
});

test('a document with Tailwind of its own does not get a second copy', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body></body></html>' }], 0));
  assert.strictEqual(count(doc, 'cdn.tailwindcss.com'), 1);
});

// Tailwind's reset and its own .collapse and .container are a framework: in
// a Bootstrap page they hid the navbar, in a plain one they shrank headings.
// tests/browser/preview-sites.test.js measures the pages; this pins who gets it.
const tailwindIn = (doc) => count(doc, LIBS.tailwind);
const page = (head, body) => `<!DOCTYPE html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
test('Tailwind goes into a page written in its classes that does not load it — in the preview and the download', () => {
  for (const [label, code] of [
    ['three common utilities', page('', '<div class="flex items-center px-4">x</div>')],
    ['a variant', page('', '<p class="md:hidden">x</p>')],
    ['an arbitrary value', page('', '<p class="w-[42px]">x</p>')],
    ['classes a script puts on the page', page('', '<div id="a"></div><script>a.innerHTML = \'<p class="text-xl font-bold mt-4">x</p>\';</script>')],
    ['a page that only names Tailwind in its words', page('', '<!-- Tailwind layout --><div class="flex items-center px-4">Built with Tailwind</div>')],
    ['icons from Bootstrap Icons are not Bootstrap', page('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">', '<i class="bi bi-star md:text-xl"></i>')]
  ]) {
    const project = projectFor([{ lang: 'html', code }], 0);
    assert.strictEqual(tailwindIn(buildDocument(project)), 1, label);
    assert.strictEqual(tailwindIn(buildDocument(project, {}, { guard: false })), 1, `${label}: the download`);
  }
});

test('and into no other page', () => {
  const BS = '<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">';
  for (const [label, blocks] of [
    ['Bootstrap', [{ lang: 'html', code: page(BS, '<nav class="navbar navbar-expand-lg"><div class="collapse navbar-collapse"></div></nav><main class="py-5"><h2 class="mb-4 mt-3 text-center p-3">x</h2></main>') }]],
    ['Bootstrap from BootstrapCDN', [{ lang: 'html', code: page('<link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">', '<div class="d-flex mt-3 p-4 mb-5 text-white shadow-sm">x</div>') }]],
    ['Bulma', [{ lang: 'html', code: page('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">', '<div class="columns mt-4 px-4 py-2 is-flex">x</div>') }]],
    ['its own CSS, which defines what it uses', [{ lang: 'html', code: page('<style>.hero{padding:2rem}.flex{display:flex}.items-center{align-items:center}.px-4{padding:0 1rem}</style>', '<div class="hero flex items-center px-4"><h2>x</h2><ul><li>a</li></ul></div>') }]],
    ['plain CSS with its own class names', [{ lang: 'html', code: page('<style>.card{border:1px solid}</style>', '<div class="card"><h2>Skills</h2></div>') }]],
    ['Tailwind 2 from its stylesheet', [{ lang: 'html', code: page('<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">', '<div class="flex items-center px-4">x</div>') }]],
    ['no classes at all', [{ lang: 'html', code: page('', '<h1>Hello</h1><p>Plain.</p>') }]],
    ['a fragment with its own stylesheet', [{ lang: 'html', code: '<button class="btn">x</button>' }, { lang: 'css', code: '.btn { color: red; }' }]]
  ]) {
    const project = projectFor(blocks, 0);
    assert.strictEqual(tailwindIn(buildDocument(project)), 0, label);
    assert.strictEqual(tailwindIn(buildDocument(project, {}, { guard: false })), 0, `${label}: the download`);
  }
});

test('a fragment with nothing of its own keeps Tailwind, as it always had it; a component always has it', () => {
  assert.strictEqual(tailwindIn(buildDocument(projectFor([{ lang: 'html', code: '<div class="p-4 rounded">x</div>' }], 0))), 1);
  assert.strictEqual(tailwindIn(buildDocument(projectFor([{ lang: 'html', code: '<p>x</p>' }], 0))), 1);
  assert.strictEqual(tailwindIn(buildDocument(projectFor([{ lang: 'html', code: '<!-- Tailwind card --><div class="p-4">x</div>' }], 0))), 1, 'a comment that names it');
  assert.strictEqual(tailwindIn(buildDocument(projectFor([{ lang: 'jsx', code: 'export default () => <div className="p-4"/>' }], 0))), 1);
});

test('Arabic content previews right to left in an Arabic font', () => {
  const doc = buildDocument(projectFor([{ lang: 'html', code: '<h1>مرحبا</h1>' }], 0));
  assert.ok(/dir="rtl"/.test(doc) && /'Cairo', 'Inter'/.test(doc));
});

console.log('\nReact:');
const component = "import { useState } from 'react';\nimport { Plus } from 'lucide-react';\nexport default function Counter() {\n  const [n, setN] = useState(0);\n  return (<button onClick={() => setN(n + 1)}><Plus size={14} /> {n}</button>);\n}";
const readData = (doc) => JSON.parse(/<script type="application\/json" id="qjo-preview-data">([\s\S]*?)<\/script>/.exec(doc)[1]);

test('a component with its stylesheet', () => {
  const project = projectFor([{ lang: 'jsx', code: component }, { lang: 'css', code: CSS }], 0);
  assert.deepStrictEqual(project.files.map((f) => f.name), ['App.jsx', 'style.css']);
  const doc = buildDocument(project);
  assert.ok(doc.includes(LIBS.react) && doc.includes(LIBS.reactDom) && doc.includes(LIBS.babel) && doc.includes(CSS));
});

test('the script that mounts the component parses', () => {
  const doc = buildDocument(projectFor([{ lang: 'jsx', code: component }], 0));
  const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // The link guard, then the runner: both inline, both must parse.
  assert.strictEqual(scripts.length, 2, 'the guard and one inline runner');
  assert.ok(/qjo-preview-note/.test(scripts[0]) && /Babel\.transform/.test(scripts[1]), 'in that order');
  scripts.forEach((code) => new Function(code)); // a syntax check: never called
});

test('the component\'s source travels as data, and "</script>" in it cannot end the element', () => {
  const hostile = component.replace('{n}', '{"</script><script>parent.x=1</script>"}');
  const doc = buildDocument(projectFor([{ lang: 'jsx', code: hostile }], 0));
  assert.strictEqual(readData(doc).source, hostile);
  assert.strictEqual(count(doc, '</script>'), count(doc, '<script'));
});

test('a component that is never exported is still found', () => {
  const doc = buildDocument(projectFor([{ lang: 'jsx', code: 'function Card() { return <div/>; }\nfunction App() { return <Card/>; }' }], 0));
  assert.deepStrictEqual(readData(doc).candidates, ['Card', 'App']);
});

test('a bare piece of JSX is shown as it is', () => {
  const data = readData(buildDocument(projectFor([{ lang: 'jsx', code: '<div className="p-4">Hello</div>' }], 0)));
  assert.ok(/export default function Preview\(\)/.test(data.source) && data.candidates[0] === 'Preview');
});

test('code that mounts itself is not mounted twice, and its container exists', () => {
  const doc = buildDocument(projectFor([{ lang: 'jsx', code: "function App() { return <p/>; }\nReactDOM.createRoot(document.getElementById('app')).render(<App />);" }], 0));
  assert.strictEqual(readData(doc).selfRenders, true);
  assert.ok(doc.includes('<div id="app"></div>'));
});

test('TSX is compiled as TypeScript', () => {
  const data = readData(buildDocument(projectFor([{ lang: 'tsx', code: 'export default function A(): JSX.Element { return <div/>; }' }], 0)));
  assert.strictEqual(data.filename, 'App.tsx');
});

test('messages inside the preview come in the page\'s language', () => {
  const data = readData(buildDocument(projectFor([{ lang: 'jsx', code: component }], 0), { noComponent: 'لا يوجد مكوّن' }));
  assert.strictEqual(data.strings.noComponent, 'لا يوجد مكوّن');
  assert.ok(data.strings.libsFailed.length > 0, 'the rest keep their defaults');
});

console.log('\nPinned libraries:');
test('each library is the version the browser suite tests', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tests', 'browser', 'package.json'), 'utf8'));
  const dev = pkg.devDependencies;
  assert.ok(LIBS.react.includes(`/react@${dev.react}/`), `react ${dev.react}: ${LIBS.react}`);
  assert.ok(LIBS.reactDom.includes(`/react-dom@${dev['react-dom']}/`), `react-dom ${dev['react-dom']}`);
  assert.ok(LIBS.babel.includes(`/@babel/standalone@${dev['@babel/standalone']}/`), `babel ${dev['@babel/standalone']}`);
  assert.ok(LIBS.lucideReact.includes(`/lucide-react@${dev['lucide-react']}/`), `lucide-react ${dev['lucide-react']}`);
});

// Links and forms inside a preview (the guard in codeProject.js): it must run
// before anything of the page's own, in every kind of preview — and parse: a
// regex that lost a backslash inside the template once kept it from running
// at all, and the preview still escaped to the app.
const { pageNamed, onAllowedCdns, titleOf } = require('../public/domain/codeProject.js');
const guardOf = (doc) => (doc.match(/<script>(\(function \(\) \{\n {2}var S = [\s\S]*?)<\/script>/) || [])[1];
test('every preview runs the link guard first, and the guard parses', () => {
  const full = buildDocument({ kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<!DOCTYPE html><html><head><script>window.mine = 1</script></head><body><a href="#x">x</a></body></html>' }] });
  const fragment = buildDocument({ kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<a href="#x">x</a>' }] });
  const react = buildDocument({ kind: 'react', files: [{ name: 'App.jsx', role: 'main', code: 'export default function App() { return <a href="#x">x</a>; }' }] });
  for (const [name, doc] of Object.entries({ full, fragment, react })) {
    const guard = guardOf(doc);
    assert.ok(guard, `${name}: no guard`);
    assert.doesNotThrow(() => new Function(guard), `${name}: the guard does not parse`);
    const at = doc.indexOf(guard);
    const theirs = [doc.indexOf('window.mine'), doc.indexOf('<a '), doc.indexOf('<script src=')].filter((i) => i >= 0);
    assert.ok(theirs.every((i) => at < i), `${name}: the guard is not first (${at} against ${theirs})`);
  }
  assert.ok(/'qjo-preview-note'/.test(guardOf(full)) && /HTMLFormElement\.prototype\.submit/.test(guardOf(full)));
});

test('the guard\'s notes come in the page\'s language', () => {
  const doc = buildDocument({ kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<p>x</p>' }] }, { formHeld: 'الفورم شغّال', pageMissing: 'الصفحة {name}' });
  assert.ok(/الفورم شغّال/.test(doc) && /الصفحة \{name\}/.test(doc));
});

test('a link names a page of the answer by its file name; index.html is the first page', () => {
  const blocks = [{ lang: 'html', path: '', code: '<!DOCTYPE html><html></html>' }, { lang: 'css', path: 'style.css', code: 'a{}' }, { lang: 'html', path: 'pages/About.html', code: '<h1>a</h1>' }];
  assert.strictEqual(pageNamed(blocks, 'about.html'), 2);
  assert.strictEqual(pageNamed(blocks, './About.html?x=1'), 2);
  assert.strictEqual(pageNamed(blocks, 'index.html'), 0);
  assert.strictEqual(pageNamed(blocks, 'style.css'), -1, 'a stylesheet is not a page');
  assert.strictEqual(pageNamed(blocks, 'team.html'), -1);
});

test('ES modules from CDNs the preview cannot load come from jsdelivr; unpkg is loaded as written', () => {
  assert.strictEqual(onAllowedCdns("import x from 'https://esm.sh/canvas-confetti@1.9.3'"), "import x from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/+esm'");
  assert.strictEqual(onAllowedCdns('https://code.jquery.com/jquery-3.7.1.min.js'), 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js');
  assert.strictEqual(onAllowedCdns('https://cdn.jsdelivr.net/npm/aos@2'), 'https://cdn.jsdelivr.net/npm/aos@2', 'an allowed CDN is left alone');
  // A package address with no file in it is the browser build on unpkg and the
  // CommonJS build on jsdelivr: Lucide's own snippet stopped a page's script.
  for (const tag of ['<script src="https://unpkg.com/lucide@latest"></script>', '<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>']) {
    assert.strictEqual(onAllowedCdns(tag), tag);
  }
  const doc = buildDocument({ kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<script src="https://unpkg.com/x@1/x.js"></script>' }, { name: 'app.js', role: 'script', code: "import y from 'https://unpkg.com/y@2?module'" }] });
  assert.ok(/unpkg\.com\/x@1\/x\.js/.test(doc) && /npm\/y@2\/\+esm/.test(doc), doc.slice(-300));
});

// The app's CSP is the preview's, and it is not widened for a site: the
// libraries of other hosts load from jsdelivr's copy, the same file at the
// same version (each pair fetched from both hosts and compared, 2026-10-26).
test('libraries from Google, BootstrapCDN and Font Awesome come from jsdelivr, at the same version', () => {
  const J = 'https://cdn.jsdelivr.net/npm/';
  for (const [from, to] of [
    ['https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js', `${J}jquery@3.7.1/dist/jquery.min.js`],
    ['//ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.js', `${J}jquery@1.12.4/dist/jquery.js`],
    ['https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.slim.min.js', `${J}jquery@3.7.1/dist/jquery.slim.min.js`],
    ['https://ajax.googleapis.com/ajax/libs/jqueryui/1.13.2/jquery-ui.min.js', `${J}jquery-ui@1.13.2/dist/jquery-ui.min.js`],
    ['https://ajax.googleapis.com/ajax/libs/jqueryui/1.13.2/themes/smoothness/jquery-ui.css', `${J}jquery-ui@1.13.2/dist/themes/smoothness/jquery-ui.css`],
    ['https://ajax.googleapis.com/ajax/libs/angularjs/1.8.2/angular.min.js', `${J}angular@1.8.2/angular.min.js`],
    ['https://ajax.googleapis.com/ajax/libs/d3js/7.8.5/d3.min.js', `${J}d3@7.8.5/dist/d3.min.js`],
    ['https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css', `${J}bootstrap@4.5.2/dist/css/bootstrap.min.css`],
    ['https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js', `${J}bootstrap@3.4.1/dist/js/bootstrap.min.js`],
    ['https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/js/bootstrap.bundle.min.js', `${J}bootstrap@4.1.3/dist/js/bootstrap.bundle.min.js`],
    ['https://stackpath.bootstrapcdn.com/bootswatch/4.5.2/darkly/bootstrap.min.css', `${J}bootswatch@4.5.2/dist/darkly/bootstrap.min.css`],
    ['https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css', `${J}font-awesome@4.7.0/css/font-awesome.min.css`],
    ['https://use.fontawesome.com/releases/v5.15.4/css/all.css', `${J}@fortawesome/fontawesome-free@5.15.4/css/all.min.css`],
    ['https://use.fontawesome.com/releases/v6.4.0/css/all.min.css', `${J}@fortawesome/fontawesome-free@6.4.0/css/all.min.css`],
    ['https://use.fontawesome.com/releases/v5.15.4/js/all.js', `${J}@fortawesome/fontawesome-free@5.15.4/js/all.min.js`]
  ]) assert.strictEqual(onAllowedCdns(`<script src="${from}"></script>`), `<script src="${to}"></script>`, from);
  // Left as they are: a kit is made per account, and npm has no dist for these.
  for (const keep of ['https://kit.fontawesome.com/a076d05399.js', 'https://ajax.googleapis.com/ajax/libs/d3js/4.13.0/d3.min.js', 'https://ajax.googleapis.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js']) {
    assert.strictEqual(onAllowedCdns(keep), keep);
  }
});

test('the app allows video players to be framed and media from any https host — and widens nothing else', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const directive = (name) => { const m = new RegExp(`"${name}": \\[([^\\]]*)\\]`).exec(server); return m ? m[1] : ''; };
  for (const host of ['https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com']) assert.ok(directive('frame-src').includes(`"${host}"`), host);
  assert.ok(/"'self'", "https:", "data:", "blob:"/.test(directive('media-src')), directive('media-src'));
  for (const name of ['script-src', 'style-src', 'connect-src']) {
    assert.ok(!/"https:"|youtube|vimeo|googleapis\.com\/ajax|bootstrapcdn|fontawesome/.test(directive(name).replace('"https://*.googleapis.com"', '')), `${name} was widened: ${directive(name)}`);
  }
});

// A link from another page of the answer to "index.html#menu": the page opens
// at its section, with the hash its own code reads as it starts.
test('a preview opened at a section carries it into the guard, as data', () => {
  const project = { kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<!DOCTYPE html><html><head></head><body><p id="menu">x</p></body></html>' }] };
  assert.ok(/var START = "";/.test(buildDocument(project)), 'no section, none');
  assert.ok(/var START = "menu";/.test(buildDocument(project, {}, { hash: 'menu' })));
  const hostile = buildDocument(project, {}, { hash: '</script><script>parent.x=1</script>__STRINGS__' });
  const guard = guardOf(hostile);
  assert.ok(guard && !/<\/script>/i.test(guard), 'the hash ended the guard');
  assert.doesNotThrow(() => new Function(guard));
  assert.ok(/var S = \{/.test(guard) && /"\\u003c\/script>\\u003cscript>parent\.x=1\\u003c\/script>__STRINGS__"/.test(guard), 'filled in once, as a string');
  assert.ok(!buildDocument(project, {}, { guard: false, hash: 'menu' }).includes('qjo-preview-note'), 'the download has no guard');
});

test('a tab is titled as the page is, its entities read once', () => {
  const titled = (title) => titleOf({ files: [{ role: 'main', name: 'index.html', code: `<title>${title}</title>` }] });
  assert.strictEqual(titled('Olive &amp; Thyme'), 'Olive & Thyme');
  assert.strictEqual(titled('Tom &amp;amp; Jerry'), 'Tom &amp; Jerry', 'once, as a browser reads it');
  assert.strictEqual(titled('&#1605;&#x637;&#x639;&#x645; &lt;3 &quot;x&quot; &nbsp;'), 'مطعم <3 "x"', 'numbers, and the names a title uses');
  assert.strictEqual(titled('a &constructor; b &toString; &#0; &#xD800;'), 'a &constructor; b &toString; \uFFFD \uFFFD', 'an unknown name stays; a code that is no character is a replacement');
  assert.strictEqual(titleOf({ files: [{ role: 'main', name: 'about.html', code: '<p>no title</p>' }] }), 'about.html');
});

test('the app allows unpkg for scripts and styles, which the preview inherits', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const directive of ['script-src', 'style-src']) {
    const list = new RegExp(`"${directive}": \\[([^\\]]*)\\]`).exec(server);
    assert.ok(list && list[1].includes('"https://unpkg.com"'), `${directive}: ${list && list[1]}`);
  }
});

// The guard keeps a page's storage in memory: in a sandbox without
// same-origin, localStorage and document.cookie throw.
test('a page\'s storage and cookies work in memory where the browser refuses them', () => {
  const guard = /<script>(\(function \(\) \{\n {2}var S = [\s\S]*?\}\)\(\);)<\/script>/.exec(buildDocument({ kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<p>x</p>' }] }))[1];
  const refuse = () => { const e = new Error('The document is sandboxed'); e.name = 'SecurityError'; throw e; };
  const win = { addEventListener() {} };
  const doc = { addEventListener() {} };
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(win, name, { get: refuse, configurable: true });
  Object.defineProperty(doc, 'cookie', { get: refuse, set: refuse, configurable: true });
  new Function('window', 'document', 'HTMLFormElement', guard)(win, doc, function () {});
  win.localStorage.setItem('theme', 'dark');
  win.sessionStorage.setItem('n', 2);
  assert.deepStrictEqual([win.localStorage.getItem('theme'), win.localStorage.getItem('none'), win.localStorage.length, win.sessionStorage.getItem('n')], ['dark', null, 1, '2']);
  doc.cookie = 'consent=yes; path=/';
  doc.cookie = 'lang=ar';
  assert.strictEqual(doc.cookie, 'consent=yes; lang=ar');
  // Control: where the browser allows storage, the page's own is left alone.
  const real = { addEventListener() {}, localStorage: { length: 0, mine: true }, sessionStorage: { length: 0 } };
  new Function('window', 'document', 'HTMLFormElement', guard)(real, { addEventListener() {}, cookie: '' }, function () {});
  assert.ok(real.localStorage.mine, 'a working localStorage was replaced');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

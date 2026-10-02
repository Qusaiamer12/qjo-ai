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
const { pageNamed, onAllowedCdns } = require('../public/domain/codeProject.js');
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

test('libraries from CDNs the preview cannot load come from jsdelivr', () => {
  assert.strictEqual(onAllowedCdns('<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>'), '<script src="https://cdn.jsdelivr.net/npm/aos@2.3.1/dist/aos.js"></script>');
  assert.strictEqual(onAllowedCdns("import x from 'https://esm.sh/canvas-confetti@1.9.3'"), "import x from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/+esm'");
  assert.strictEqual(onAllowedCdns('https://code.jquery.com/jquery-3.7.1.min.js'), 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js');
  assert.strictEqual(onAllowedCdns('https://cdn.jsdelivr.net/npm/aos@2'), 'https://cdn.jsdelivr.net/npm/aos@2', 'an allowed CDN is left alone');
  const doc = buildDocument({ kind: 'html', files: [{ name: 'index.html', role: 'main', code: '<script src="https://unpkg.com/x@1/x.js"></script>' }, { name: 'app.js', role: 'script', code: "import y from 'https://unpkg.com/y@2?module'" }] });
  assert.ok(!/unpkg/.test(doc) && /npm\/x@1\/x\.js/.test(doc) && /npm\/y@2\/\+esm/.test(doc), doc.slice(-300));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

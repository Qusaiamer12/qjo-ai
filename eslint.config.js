// Flat ESLint config (ESLint 9). Intentionally conservative: this codebase has
// no lint history, so the rules target real bugs (unused vars, undefined
// globals, unreachable code) rather than style. Style churn would bury the
// signal in a 4,000-line diff.
'use strict';

const js = require('@eslint/js');

const NODE_GLOBALS = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  structuredClone: 'readonly'
};

const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  AbortController: 'readonly',
  FormData: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  Image: 'readonly',
  Audio: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  MutationObserver: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  crypto: 'readonly',
  firebase: 'readonly',
  MathJax: 'readonly',
  pdfjsLib: 'readonly',
  marked: 'readonly',
  hljs: 'readonly',
  // Additional CDN globals loaded via <script> tags in public/*.html.
  Chart: 'readonly',
  mermaid: 'readonly',
  Tesseract: 'readonly',
  indexedDB: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  // Standard browser globals the original list simply missed, plus Pyodide,
  // which public/index.html loads from a CDN for the in-page Python runner.
  performance: 'readonly',
  cancelAnimationFrame: 'readonly',
  loadPyodide: 'readonly',
  // Web Worker sandbox used to run user JavaScript off the main thread.
  Worker: 'readonly',
  // Namespaces published by the extracted front-end modules, loaded by their
  // own script tags before app.js.
  QjoUI: 'readonly',
  QjoDomain: 'readonly'
};

const SHARED_RULES = {
  ...js.configs.recommended.rules,
  // Catch dead code and typos, which is the whole point here.
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-const-assign': 'error',
  'no-fallthrough': 'warn',
  // Deliberate patterns in this codebase.
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-control-regex': 'off',
  'no-useless-escape': 'warn',

  // ── Structural ratchet ───────────────────────────────────────────────────
  // Thresholds sit just above what the code does today, so nothing can get
  // worse, and each refactor lowers the number it just beat. Rules that fail
  // on day one get switched off on day two; these are meant to survive.
  //
  // Today's worst, for the record: sendMessage has a cyclomatic complexity of
  // 126 — 126 independent paths through one function, which is past the point
  // where it can be meaningfully tested. Anything over about 15 is hard to
  // hold in your head at once.
  complexity: ['warn', 30],
  'max-depth': ['warn', 5],
  'max-params': ['warn', 6],
  'max-nested-callbacks': ['warn', 4],

  // Bug classes worth catching outright rather than warning about.
  eqeqeq: ['warn', 'smart'],
  'no-var': 'warn',
  'prefer-const': ['warn', { destructuring: 'all' }],
  'no-throw-literal': 'error',
  'no-return-await': 'warn',
  'require-atomic-updates': 'off'
};

module.exports = [
  {
    ignores: ['node_modules/**', 'qcode-workspace/**', '.qcode-*/**', 'public/**/*.min.js']
  },
  {
    files: ['server.js', 'src/**/*.js', 'scripts/**/*.js', 'evals/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: NODE_GLOBALS
    },
    rules: SHARED_RULES
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: BROWSER_GLOBALS
    },
    rules: SHARED_RULES
  },
  {
    // public/domain holds pure logic with no DOM, deliberately loadable both
    // from a script tag and from a Node test — so it sees `module` as well.
    files: ['public/domain/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...BROWSER_GLOBALS, ...NODE_GLOBALS }
    },
    rules: SHARED_RULES
  }
];

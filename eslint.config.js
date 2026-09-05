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
  structuredClone: 'readonly',
  // Used by the keep-alive scheduler to resolve the hour in a named timezone.
  Intl: 'readonly'
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
  TextEncoder: 'readonly'
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
  'no-useless-escape': 'warn'
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
  }
];

// Shared plumbing for the browser suites: where Chromium is, where the app
// is served, how a suite counts and reports.
//
// Every suite prints one summary line, "N passed, M failed", and exits
// non-zero on any failure. run.js relies on that line: a suite that exits 0
// without printing it, or prints "0 passed", has checked nothing and is
// reported as a failure rather than as a pass.
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = (process.env.QJO_BASE_URL || 'http://127.0.0.1:3994').replace(/\/+$/, '');

/**
 * The Chromium binary to launch, in order of preference:
 *   1. QJO_CHROMIUM_PATH, when set (an explicit choice always wins);
 *   2. the build this Playwright version expects (`npx playwright install chromium`);
 *   3. any Chromium already under PLAYWRIGHT_BROWSERS_PATH, newest first —
 *      containers often ship one for a different Playwright version, and it
 *      drives these suites just as well.
 * Returns undefined when nothing is found, so the launch error names the fix.
 * @returns {string | undefined}
 */
function findChromium() {
  if (process.env.QJO_CHROMIUM_PATH) return process.env.QJO_CHROMIUM_PATH;
  try {
    const own = chromium.executablePath();
    if (own && fs.existsSync(own)) return own;
  } catch (_) { /* no bundled build for this version */ }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const builds = fs.readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const build of builds) {
    const candidate = path.join(root, build, 'chrome-linux', 'chrome');
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** @returns {import('playwright').LaunchOptions} */
function launchOptions() {
  const executablePath = findChromium();
  return executablePath ? { executablePath } : {};
}

/**
 * Every context a suite opens can reach the app and nothing else. The page
 * pulls Firebase, fonts and libraries from CDNs; whether those load depends
 * on the network the suite happens to run on (they are blocked in the
 * container these suites were written in, open on GitHub's runners), and a
 * test whose result depends on that is testing the network. A suite that
 * needs a third-party script serves a stub with page.route(), which takes
 * precedence over this context-level block.
 * @param {import('playwright').BrowserContext} context
 */
async function isolate(context) {
  const appOrigin = new URL(BASE_URL).origin;
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && url.origin !== appOrigin,
    (route) => route.abort('blockedbyclient')
  );
  return context;
}

/**
 * Chromium whose contexts are all isolated (see isolate). newPage() is
 * rebuilt on newContext() so a page opened directly is isolated too, and its
 * context is closed with it, matching Playwright's own browser.newPage().
 * @returns {Promise<import('playwright').Browser>}
 */
async function launchBrowser() {
  const browser = await chromium.launch(launchOptions());
  const openContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => isolate(await openContext(options));
  browser.newPage = async (options) => {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.once('close', () => { context.close().catch(() => {}); });
    return page;
  };
  return browser;
}

/**
 * A file from the repository, read as shipped. Suites that lift code out of
 * public/app.js read it through here so they always test the current file.
 * @param {string} relative
 */
function repoFile(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

module.exports = { devices, BASE_URL, REPO_ROOT, launchBrowser, launchOptions, repoFile };

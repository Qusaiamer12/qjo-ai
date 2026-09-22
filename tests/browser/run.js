#!/usr/bin/env node
// Runs every browser suite against a real server in a real Chromium.
//
//   npm run test:browser                  boot the server, run all suites
//   npm run test:browser -- boot xss      only suites whose name contains a filter
//   QJO_BASE_URL=http://host:port ...     use a server that is already running
//   --verbose                             print every assertion, not only failures
//
// A suite passes only when it exits 0 AND prints "N passed, 0 failed" with
// N > 0. A suite that exits 0 without that line never reached its end, and
// one that reports 0 passed checked nothing; both are failures. Those are the
// ways a browser test goes silently vacuous, and the runner is where that
// has to be caught, because each suite cannot vouch for itself.
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SUITE_TIMEOUT_MS = 180000;
const SERVER_BOOT_TIMEOUT_MS = 30000;
const SUMMARY = /(\d+) passed, (\d+) failed/g;

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const filters = args.filter((a) => !a.startsWith('--'));

/** @param {string} line */
const say = (line) => process.stdout.write(line + '\n');

function listSuites() {
  const all = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.js')).sort();
  if (!filters.length) return all;
  return all.filter((f) => filters.some((needle) => f.includes(needle)));
}

/** @returns {Promise<number>} */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {net.AddressInfo} */ (probe.address());
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts server.js and resolves once /api/health answers. Rejects with the
 * server's own output when it exits or stays silent, so a boot failure reads
 * as a boot failure and not as nineteen unrelated suite failures.
 */
async function bootServer() {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  let exited = null;
  child.on('exit', (code, signal) => { exited = signal || `exit code ${code}`; });

  const deadline = Date.now() + SERVER_BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) break;
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return { baseUrl, child, log: () => log };
    } catch (_) { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill('SIGKILL');
  const why = exited ? `the server exited (${exited})` : `/api/health did not answer within ${SERVER_BOOT_TIMEOUT_MS / 1000}s`;
  throw new Error(`${why}. Server output:\n${log.split('\n').slice(-40).join('\n')}`);
}

/**
 * @param {string} file
 * @param {string} baseUrl
 * @returns {Promise<{ file: string, ok: boolean, passed: number, failed: number, reason: string, output: string, ms: number }>}
 */
function runSuite(file, baseUrl) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, file)], {
      cwd: REPO_ROOT,
      env: { ...process.env, QJO_BASE_URL: baseUrl },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, SUITE_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      const summaries = [...output.matchAll(SUMMARY)];
      const last = summaries[summaries.length - 1];
      const passed = last ? Number(last[1]) : 0;
      const failed = last ? Number(last[2]) : 0;
      let reason = '';
      if (timedOut) reason = `timed out after ${SUITE_TIMEOUT_MS / 1000}s`;
      else if (!last) reason = `never printed its summary (exit code ${code}) — it stopped before its last assertion`;
      else if (failed > 0) reason = `${failed} assertion${failed === 1 ? '' : 's'} failed`;
      else if (code !== 0) reason = `exit code ${code} despite reporting no failures`;
      else if (passed === 0) reason = 'reported 0 passed — it checked nothing';
      resolve({ file, ok: !reason, passed, failed, reason, output, ms: Date.now() - started });
    });
  });
}

/**
 * Failing assertions plus anything that is not a passing line (stack traces,
 * notes). A suite that stopped early may have printed only passing lines, and
 * then the last of those is the useful part: it is where it stopped.
 */
function failureExcerpt(output) {
  const lines = output.split('\n').filter((l) => l.trim());
  const problems = lines.filter((l) => !l.startsWith('✅'));
  if (problems.length) return problems.slice(-40).join('\n');
  if (lines.length) return ['last output before it stopped:', ...lines.slice(-5)].join('\n');
  return '(no output at all)';
}

async function main() {
  try {
    require.resolve('playwright', { paths: [HERE] });
  } catch (_) {
    say('❌ Playwright is not installed. The browser suites are their own package:\n    npm ci --prefix tests/browser');
    return 1;
  }
  const suites = listSuites();
  if (!suites.length) {
    say(`No suite matches ${filters.join(', ')}.`);
    return 1;
  }

  let server = null;
  let baseUrl = process.env.QJO_BASE_URL;
  if (!baseUrl) {
    try {
      server = await bootServer();
    } catch (err) {
      say(`❌ Could not start the server: ${err.message}`);
      return 1;
    }
    baseUrl = server.baseUrl;
  }
  const stop = () => { if (server) server.child.kill('SIGTERM'); };
  process.on('SIGINT', () => { stop(); process.exit(130); });

  say(`Browser suites against ${baseUrl}\n`);
  const results = [];
  try {
    for (const file of suites) {
      const result = await runSuite(file, baseUrl);
      results.push(result);
      const name = file.replace(/\.test\.js$/, '');
      const seconds = (result.ms / 1000).toFixed(1);
      say(`${result.ok ? '✅' : '❌'} ${name.padEnd(22)} ${String(result.passed).padStart(3)} passed  ${seconds}s${result.ok ? '' : `  — ${result.reason}`}`);
      if (verbose) say(result.output.replace(/^/gm, '    '));
      else if (!result.ok) say(failureExcerpt(result.output).replace(/^/gm, '    '));
    }
  } finally {
    stop();
  }

  const failedSuites = results.filter((r) => !r.ok);
  const assertions = results.reduce((n, r) => n + r.passed, 0);
  say(`\n${results.length - failedSuites.length}/${results.length} suites passed, ${assertions} assertions passed`);
  if (failedSuites.length) say(`Failed: ${failedSuites.map((r) => r.file).join(', ')}`);
  return failedSuites.length ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => {
  say(`❌ Runner crashed: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});

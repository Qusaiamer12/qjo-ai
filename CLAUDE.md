# Working on Qjo

## How work is done here: the loop

Every change goes through this, not just the large ones. The owner asked for
it explicitly, and the history of this repo is the reason: most real defects
found here were found by re-checking work that already looked finished.

1. **Measure before changing.** Numbers, not impressions. Line counts,
   complexity, what a request actually sends, what reaches the model.
2. **Make the change.**
3. **Verify it in the real thing.** A browser for UI, the real route for
   server behaviour. A unit test proves the function; it does not prove the
   feature.
4. **Attack your own verification.** A check you have never seen fail is not
   a check. For anything that matters, break the code on purpose and confirm
   the test goes red, then restore it and confirm it goes green.
5. **Re-read the diff as a reviewer who wants to reject it.**
6. **Fix what that finds, and go round again** until a pass finds nothing.
7. **Only then commit and push.** Say what was verified and how.

### Traps this repo has already fallen into

Each of these produced a green result that meant nothing.

- **Vacuous browser probes.** A probe checked `window.lightMarkdown ? render :
  'NO_GLOBAL'`. When the renderer became a module the global vanished, every
  case rendered the literal string `NO_GLOBAL`, found no handlers in it, and
  reported "safe". Probes must refuse to run when their target is missing, and
  must include a positive control that proves they are looking at real output.
- **Assertions that match escaped text.** Searching rendered HTML for
  `/\son\w+=/` fails on correctly escaped `&lt;img onerror=...&gt;`. The
  mirror image — grepping for `<script` — passes on output that is still
  dangerous. Assert on real tags, or parse the DOM.
- **Top-level `const` is not a `window` property.** Function declarations at
  the top of a classic script are; `const` and `let` are not. Moving a
  function into a destructured binding removes its global.
- **An unexported env var.** `SC=... node test.js` without `export` hands the
  child `undefined`; the test crashes on `require` and its empty output looks
  like a result. Check exit codes, not just the absence of red lines.
- **A failure that does not explain itself.** A reload loop first showed up as
  "Timeout 30000ms exceeded". Tests should fail with the name of the problem.
- **Splitting a file multiplies its failure points.** One script either loads
  or does not. Five scripts can partially load. `public/boot.js` exists because
  of this.
- **A control that cannot fail.** The first isolation check "proved" CDN
  requests were blocked, but this container's Chromium could not reach them
  anyway; the next two controls were stopped by helmet's CSP and its
  Cross-Origin-Resource-Policy. A negative result only means something once
  the same probe, without the thing under test, gets a positive one.
- **Tests that pass only because the network is broken.** Firebase and every
  CDN are unreachable from the dev container and reachable on GitHub, so the
  same suite can meet two different pages. Browser suites block every origin
  but the app's (`tests/browser/harness.js`).
- **A mutation that cannot reach the code.** Re-creating "each key gets a
  fresh time budget" by resetting the budget *after* the loop's out-of-time
  check left the loop exiting before the reset ever ran; the suite stayed
  green and it looked like a gap in the tests. A surviving mutation is a
  question — is the test blind, or is the mutation dead? — not a verdict.
- **A fallback that invents a result.** When every search provider failed,
  a key-free fallback returned a placeholder ("Use the linked search page for
  manual verification") that counted as success and was cached. Production
  search looked alive in every metric while answering nothing. An empty
  result must be empty, and a failure must be logged and visible.
- **A test double standing in for the part that broke.** Every search test
  replaced `performSearch` with a stub, so ranking never met an Arabic
  question searched in English — the case production hit on every search the
  model wrote in English. It dropped every result and told the model "no
  results" with status `ok`. The end-to-end suite now runs the real search
  service against a fake provider over HTTP; stub below the thing under
  test, never the thing itself.
- **A message that names the wrong cause.** Every long request ended in
  "the server was probably asleep" above a technical reason that proved it
  was awake: `[groq:413, llm7:504]`. The real causes — a request over Groq's
  per-minute size, and a fixed 8-second wait for a first byte — went
  unlooked-for while the message pointed at a cold start.
- **A prompt that grows one feature at a time.** Every playbook — video
  scripts, cover letters, recipes, venting, charts — was added to the
  always-on prompt, and the language change added the Arabic rules beside the
  English ones. Nothing failed; it just got slower. Measured from the real
  page it had reached 5,800–6,900 tokens, so Groq's free tier (8,000 a
  minute, answer room included) refused almost every Arabic message and the
  slowest provider carried everything. A playbook goes in
  `src/services/playbooks.js` and is sent when the message calls for it;
  `test-language.js` holds the prompt to a size ceiling, and
  `node tests/browser/measure-request.js` shows what a message really sends.
- **Verification that lives outside the repo.** 264 browser assertions spent
  weeks in a scratch directory that is deleted with the container. A check
  that is not committed and not in CI does not exist.

## Verifying

```bash
npm test                  # server behaviour
npm run test:domain       # front-end pure logic, no browser
npm run test:search       # search decision, results, budget
npm run test:search-e2e   # hangs: fake provider over real HTTP, per-case watchdog
npm run test:long-requests  # long requests: Groq's per-minute size, slow first byte
npm run test:search-providers  # every search provider failing in every way
npm run test:language     # English-first; every Arabic prompt phrase retained
npm run test:route        # chat route: keep-alives, error events, fallback caching
npm run test:agent        # tool loop bounds
npm run test:tasks        # long-task durability across restarts
npm run test:fetch        # SSRF guards on fetch_page
npm run test:resilience   # key cooldowns, context recovery, trim budgets
npm run test:stream       # streaming integrity
npm run test:routing      # request classification
npm run test:pdf          # export rendering
npm run typecheck         # JSDoc checked by tsc, no build output
npm run lint              # complexity/depth/params ratchet + correctness
npm run structure         # per-file line budgets: shrink, never grow
npm run audit
npm run scan-secrets

# Real page, real Chromium, real server (boots its own on a free port).
npm ci --prefix tests/browser   # once: Playwright lives in its own package
npm run test:browser            # all suites; `-- boot xss` to filter

# Measurements, not tests — run before and after changing what a request
# carries or how providers are chosen:
node tests/browser/measure-request.js   # tokens a real message sends, by part
node scripts/sim-session.js [repoRoot]  # a session against Groq's real limits
```

A browser suite passes only if it exits 0 and prints `N passed, 0 failed`
with N > 0; the runner reports anything else (a crash, a missing summary,
zero assertions, a hang) as a failure. Set `QJO_CHROMIUM_PATH` to use a
specific Chromium; otherwise the harness finds one.

`npm run structure -- --update` records a file getting smaller. The large
files (`public/app.js`, `server.js`, `llmService.js`, `RoutingEngine.js`,
`chat.js`) never grow: new code goes into a module. A small single-purpose
module may grow with code that is its own job — a new failure kind in
`requestFailure.js`, stream reading next to the stream parser — and the commit
says so. Splitting a responsibility across files to satisfy a line count adds
a file that can fail to load and buys nothing.

## Shape of the code

See `docs/ARCHITECTURE.md` for the layers, where new code goes, security
boundaries and the failure table. In short:

- `server.js` is the only composition root and the only reader of
  `process.env`. Everything else receives its dependencies as arguments.
- `public/domain/` is pure: no DOM, no network, no state. Loadable from a
  script tag and from a Node test. New logic goes here whenever it can.
- `public/ui/` owns DOM behaviour; `public/boot.js` refuses to start the app
  if any module failed to load.
- `public/app.js` is the shell and is shrinking. It has a line budget.

## Things that must not regress

- English is the primary language and Arabic is first-class. A new interface
  string goes into `public/domain/i18n.js` in both languages, never inline.
  A new rule for Arabic writing goes into `src/services/arabicPrompt.js`; the
  snapshot in `scripts/fixtures/arabic-prompt-baseline.json` only grows.
- The always-on prompt stays under its ceiling (`test-language.js`). A rule
  only some messages need is a playbook, chosen by the message.
- Provider limits are per model: a key resting for one model is free for
  another, and a rest the provider named (retry-after) is kept, not tried.

- A provider returning an empty answer is a failure, never a result.
- A context-length rejection is a request fault: no key cooldown, no rotation.
- `fetch_page` opens model-chosen URLs: every address is checked after DNS
  resolution and again on every redirect hop.
- Markdown escapes the whole input before generating any markup.
- A long task's state lives in the store, never in a variable.

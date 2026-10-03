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
- **Routing that a sandboxed iframe walks around.** Chromium runs an iframe
  sandboxed without same-origin — every code preview — in a process of its
  own, and Playwright's routes did not reach it: the harness's block and a
  suite's stubs were both bypassed, the preview fetched React from the real
  CDN, and in this container that failed while on GitHub it would have
  passed. The harness keeps those frames in process, and harness.test.js
  proves the block holds inside one, against a control that loads.
- **A request Playwright never routes.** Playwright aborts every request whose
  URL ends in `/favicon.ico` before any route sees it, so a test can neither
  serve nor observe one — a site's own icon could never load in a suite. The
  source strip takes icons from one service at a path that can be routed.
- **A feature wired everywhere but the composition root.** The request layout
  that lets Groq reuse a conversation was built, every suite stayed green —
  none of them looked — and the real page still sent the old layout:
  `server.js` passed the route only the single-text prompt builder, and the
  route quietly took its fallback. The measurement found it (57% of each
  request new instead of 37%). A change to what a request carries is done
  when `measure-request.js` says so, and a suite that fails without it exists.
- **A stand-in that accepts what the real thing refuses.** The PDF suite called
  the export handler with a fake `res.send` that took anything. Puppeteer
  returns a `Uint8Array`, and Express sends anything that is not a `Buffer` as
  JSON: every PDF Chromium printed downloaded as `{"0":37,"1":80,…}`, while
  every suite was green. Found by fetching the file from the real server.
  A response's body is checked where a person would get it.
- **A rule that paints everything.** Four rules in mobile.css and styles.css
  repaint every span, div or element inside an answer, dark on light or light
  on dark. The code block keeps a dark header, so on a phone in light mode
  every label in it was 1.03:1, and a quiz built with inline colours went
  white on white in dark mode — while every suite was green, because none
  measured what a word sits on. The first exclusion written for it raised
  the selector's specificity and painted the dark-mode tables white on white
  instead: an exclusion goes inside `:where()`. `readability.test.js`
  measures every piece of text in an answer, against a control that fails.
- **A saved conversation nobody opened again.** Regenerating an answer kept
  the old one in Firestore, and a chat opened again showed both under one
  question — while every suite was green, because the only Firebase in them
  answered every read with nothing and kept no write. `fakeFirebase.js`
  keeps what it is given (and refuses what the real one refuses);
  `saved-chat.test.js` opens the chat again and compares.
- **A model that no longer exists, named by a setting.** Groq shut Llama 4
  Scout down on 2026-07-17; the default and `.env.example` still named it, and
  every picture came back "does not exist" for eleven weeks. The suites
  were green: their fake served whatever model they were told to. A fake
  provider serves the models the real one serves today (`image-chat.test.js`),
  and a retired ID gets its successor (`src/services/retiredModels.js`).
- **The page's own words read as the person's.** The page writes a note before
  a file's text ("answer from the retrieved sections"), and an image check read
  it as the person asking for an answer: every photo with readable text was
  "transcribed" and then "solved". The same reading let a CV's skills choose
  code, interfaces, lessons — a request over Groq's minute for one photo. What
  a message asks for is judged on `ownWords()` only, and a test reads the
  page's real wording.
- **A preview that resolves its links against the app.** A code preview is an
  `about:srcdoc` document, and its links take the app's address as their base:
  a site's `#about` turned the preview into Qjo's own sign-in page. Even
  setting `location.hash` there navigates. Every preview runs a guard first
  (`codeProject.js`), and `preview-links.test.js` clicks the links, against a
  control without the guard that does land on the app. The guard once failed
  to parse — a regex lost its backslash inside a template string — and the
  suite caught it: probes that only read a preview's text never would have.
- **The same file on another host is not the same file.** The preview sent
  unpkg addresses to jsdelivr, "which mirrors the same npm files". For a
  package's address with no file in it — Lucide's own snippet,
  `unpkg.com/lucide@latest` — unpkg serves the browser build and jsdelivr the
  CommonJS one: no icons, and the site's script stopped at that line. And a
  sandbox without same-origin throws on `localStorage`, which most sites read
  first thing. Every suite previewed pages written for the preview;
  `site-quality.test.js` runs one written the way sites are.
- **A runtime only ever met as a stand-in.** Every check of Python ran a fake
  Pyodide that echoed its input. The real one prints a pandas notice about
  pyarrow on every import and a matplotlib one on every `plt.show()`, and the
  page showed both under the output; on a phone in light mode the terminal's
  header was 1.02:1. `scripts/test-python.js` and `python-run.test.js` run
  real Pyodide, from a cache checked against its lock file.
- **An id that is unique only in its answer.** Code blocks are numbered from 0
  in every answer, so every answer's first output was `py-output-0`, and Run
  under a later answer printed under the first one — while every suite, each
  running one answer, was green. Find an element from the control that owns
  it, not by an id the page repeats.
- **Verification that lives outside the repo.** 264 browser assertions spent
  weeks in a scratch directory that is deleted with the container. A check
  that is not committed and not in CI does not exist.

## Verifying

```bash
npm test                  # server behaviour
npm run test:domain       # front-end pure logic, no browser
npm run test:code-studio  # which blocks make one preview, and the document it runs
npm run test:python       # Python as the page runs it, in real Pyodide: files in and out, plots, Excel
npm run test:search       # search decision, results, budget
npm run test:sources      # who published a source: ranking, what the model and page get
npm run test:vision       # an exercise in a picture: read by one model, solved by another
npm run test:scholarly    # papers and books from keyless catalogues, faked over HTTP
npm run test:prompt-cache # what a request opens with, per message context, reasoning effort, cached tokens
npm run test:search-e2e   # hangs: fake provider over real HTTP, per-case watchdog
npm run test:long-requests  # long requests: Groq's per-minute size, slow first byte
npm run test:search-providers  # every search provider failing in every way
npm run test:language     # English-first; every Arabic prompt phrase retained
npm run test:route        # chat route: keep-alives, error events, fallback caching
npm run test:agent        # tool loop bounds
npm run test:tasks        # long-task durability across restarts
npm run test:fetch        # SSRF guards on fetch_page
npm run test:resilience   # key cooldowns, per-minute token budgets, context recovery
npm run test:stream       # streaming integrity
npm run test:routing      # request classification
npm run test:pdf          # export rendering
npm run test:export-files # Word, Excel and slide files, generated and read back
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
GROQ_API_KEYS=… node scripts/eval-sites.js  # six real site answers, checked as the suite checks

# Real Python (npm run test:python, python-run.test.js) needs its packages once:
node tests/browser/fetch-pyodide.js     # numpy, pandas, matplotlib, sympy, hash-checked
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

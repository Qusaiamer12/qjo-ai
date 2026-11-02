# performance's desk: speed and staying up

The employee reads this first at every turn and updates it last. It is what
the employee knows about its part of Qjo between turns, so it does not have
to read the code again from the start (that costs tokens and time).

## My part

- src/services/keyPool.js, providerLimits.js, jobQueue.js
- src/agents/TaskRunner.js, taskStore.js, toolLoop.js; src/routes/sse.js
- scripts/sim-session.js, tests/browser/measure-request.js; the cost of every regex

## What good looks like

First words on screen fast, no request lost to a limit that could have been avoided, nothing a long input can stall.

## How it works (keep short; correct it when the code changes)

(To be written at the first turn: the path a request takes through my part,
the files that matter and what each does, in at most 25 lines.)

## Weak spots I know of

- `^\s*X` with the /m flag is quadratic on whitespace-heavy text: at each line start `\s*` swallows every later blank line. Found 3 (codeProject scriptTag, fileRequest worthExporting, pythonRun PLOTS): >3 s on 200k of " \t\n ". Fix: `[^\S\n]*` (same boolean result for .test).
- Regexes built with `new RegExp(template)` inside functions that do not run at load (45 sites counted by parsing, 101 captured at load) have no pattern to time; only the ones built at load are covered.
- Only 5 input shapes; a regex quadratic only on a specific shape (e.g. "a    b" runs, nested brackets) can pass.

## Measurements

- 2026-11-02 `npm run test:regex-cost`: 414 distinct regexes in 27 files (355 literals, 45 pieced constructors), all timed on 5 x 200k inputs, 5.8 s total. Slowest after the fix: 42 ms (requestSignals Arabic-boundary regex, near-miss-solid), 31, 29, 27, 25 ms. Budget 200 ms. Control quadratic lookahead: cut off at 3 s (over, required); linear control 0.5 ms.

## Next improvements

1. Cover regexes built inside functions: call the exported helpers on sample text under a wrapped RegExp so their patterns are captured too.
2. Add input shapes: "a    b" runs, 200k of "(", of `<`, of "\n- ".
3. Extend FILES to src/services/*.js, src/search/*.js (they read the model's text too).

## Lesson

A regex test needs the inputs the regex dislikes, not the ones the code usually sees: `^\s*` is fine on prose and quadratic on blank lines, and three of them sat in the code for weeks.

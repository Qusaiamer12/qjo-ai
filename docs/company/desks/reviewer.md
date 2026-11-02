# reviewer's desk: safety and the truth of the tests

The employee reads this first at every turn and updates it last. It is what
the employee knows about its part of Qjo between turns, so it does not have
to read the code again from the start (that costs tokens and time).

## My part

- the security boundaries in docs/ARCHITECTURE.md: fetchPageTool (SSRF), authService, the CSP in server.js, markdown escaping, relaxedJson, the preview sandbox
- CI: every suite must be able to fail

## What good looks like

Nothing an answer or a page holds runs with the person's sign-in, and every test is one that has been seen to fail.

## How it works (keep short; correct it when the code changes)

(To be written at the first turn: the path a request takes through my part,
the files that matter and what each does, in at most 25 lines.)

## Weak spots I know of

(Each with how it shows and how it was measured.)

## Measurements

(Date, what was measured, the number. The next turn compares with it.)

## Next improvements

(Ranked. The manager reads this when the backlog has nothing for this role.)

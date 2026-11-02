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

(Each with how it shows and how it was measured.)

## Measurements

(Date, what was measured, the number. The next turn compares with it.)

## Next improvements

(Ranked. The manager reads this when the backlog has nothing for this role.)

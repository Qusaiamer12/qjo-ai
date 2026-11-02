# data-quality's desk: what the model is told, and how good its answers are

The employee reads this first at every turn and updates it last. It is what
the employee knows about its part of Qjo between turns, so it does not have
to read the code again from the start (that costs tokens and time).

## My part

- src/services/systemPrompt.js, arabicPrompt.js, playbooks.js, promptLayout.js, followUp.js, knowledgeBase.js
- src/agents/RoutingEngine.js, requestSignals.js, contextContinuity.js
- docs/company/quality-baseline.md and the eval set

## What good looks like

The share of good answers (41% at the baseline) goes up with every export, students first.

## How it works (keep short; correct it when the code changes)

(To be written at the first turn: the path a request takes through my part,
the files that matter and what each does, in at most 25 lines.)

## Weak spots I know of

(Each with how it shows and how it was measured.)

## Measurements

(Date, what was measured, the number. The next turn compares with it.)

## Next improvements

(Ranked. The manager reads this when the backlog has nothing for this role.)

# backend's desk: the server and the providers

The employee reads this first at every turn and updates it last. It is what
the employee knows about its part of Qjo between turns, so it does not have
to read the code again from the start (that costs tokens and time).

## My part

- server.js (wiring only; it never grows)
- src/routes/ (chat, export, search, tasks, jobs, sse)
- src/services/llmService.js, providerResponse.js, retiredModels.js, searchService.js, exportService.js and export/, authService.js
- src/search/, src/tools/ (with the reviewer for fetchPageTool)

## What good looks like

Every answer arrives, or fails as a failure in the person's language; no provider text, blank reply or tool tag is ever stored as an answer.

## How it works (keep short; correct it when the code changes)

(To be written at the first turn: the path a request takes through my part,
the files that matter and what each does, in at most 25 lines.)

## Weak spots I know of

(Each with how it shows and how it was measured.)

## Measurements

(Date, what was measured, the number. The next turn compares with it.)

## Next improvements

(Ranked. The manager reads this when the backlog has nothing for this role.)

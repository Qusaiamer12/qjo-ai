# frontend's desk: the page

The employee reads this first at every turn and updates it last. It is what
the employee knows about its part of Qjo between turns, so it does not have
to read the code again from the start (that costs tokens and time).

## My part

- public/app.js (the shell; it only shrinks)
- public/ui/*.js
- public/domain/*.js except the prompt words
- public/index.html, preview.html, boot.js; the code preview (codeProject.js)

## What good looks like

What the model answers reaches the person whole: rendered, runnable, exportable, and the same when the chat is opened again.

## How it works (keep short; correct it when the code changed)

- Load: index.html lists every module as `defer` scripts, then app.js. boot.js checks each `window.QjoDomain.*` / `QjoUI.*` exists (REQUIRED list), reloads once, else shows an error. A new module = index.html + boot.js REQUIRED + boot.test.js MODULES + check-structure.js.
- public/domain/*: pure IIFEs, attach to `window.QjoDomain`, `module.exports` for Node (scripts/test-domain.js). public/ui/*: DOM, `window.QjoUI.createX({deps})`, deps handed in by app.js.
- i18n.js: `CATALOG.{en,ar}` + `createTranslator`; app.js `t(key, vars)`. Every string in both languages; test-domain checks parity.
- Send: app.js sendMessage builds history (historyWindow, ownWords, siteRequest/pythonRun/mathPlot choose playbooks), POSTs /api/chat, reads SSE with streamProtocol (chunk, reasoning, tool_call, done).
- Live render: ui/streamingView.js owns the bubble: reasoning card (made only when words arrive), tool steps, answer through markdown.js (escapes the whole input first) and streamBlocks (code/chart/quiz/image blocks). Then answerExports, sourceStrip, quiz, mathPlot, pythonRun, imageBlock, canvas (code preview) attach to the finished answer.
- Save: app.js (~2941) stores `<think>\n transcript \n</think>\n\n answer` in Firestore. Opening a chat calls renderMessage (~1535), which splits `<think>` out again and draws the card with domain/reasoningCard.js. Elapsed time is not stored, so a saved card says "Completed".
- Language: qjoLanguage in localStorage `qjo_language`; applyLanguage fills `[data-i18n*]`; dir flips to rtl.
- Browser suites: tests/browser/*.test.js through harness.js (blocks every origin but the app's); fakeFirebase.js keeps writes (`__signIn`, `__store`). `npm run test:browser -- name` filters; CI runs them all.
- Worktree gotcha: a fresh worktree has no tests/browser/node_modules; symlink it from the main checkout (not committed).

## Weak spots I know of

- app.js is 4,919 lines and still holds renderMessage, sendMessage, auth, sidebar: new features want to land there (wc -l, 2026-11-02).
- The saved path had its own English copy of the reasoning card (label, timer, aria-label, fallback step). Measured: an Arabic saved chat read "Reasoning" / "Completed" (suite red, 2 of 37 assertions). Fixed 2026-11-02. The backlog said "Thought for": it is "Completed", because the duration is never stored.
- Other inline `qjoLanguage === 'ar' ? ... : ...` strings remain in app.js and streamingView (Rerun label, live reasoning label): outside the catalog and outside the parity test.
- A saved card loses its real duration.

## Measurements

- 2026-11-02: app.js 4,950 -> 4,919 lines. test:domain 246 passed. reasoning-card suite 37 assertions (29 before, 8 new).

## Next improvements

1. Store the reasoning duration with the saved message so a reopened card says "Thought for 3.2s" like the live one.
2. Sweep the `qjoLanguage === 'ar' ?` ternaries into i18n.js (count them first) with a test that fails on a new one.
3. Move renderMessage out of app.js into a ui module.

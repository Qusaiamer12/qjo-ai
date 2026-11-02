# Backlog: what the employees work on next

The manager keeps this list. When an employee goes idle and the token officer
says there is room, the manager gives it the top open item for its role. An
item is closed by the commit that fixes it (its hash goes on the line). When a
role has nothing open, the employee runs its **standing hunt** below: work
that finds the next defect or makes Qjo's answers better. Whatever a hunt
finds becomes a new item here.

Order: by score (`manager.md`: reach × severity × confidence ÷ cost); main red
or the site down always first.

## Open

| # | Role | Item | Why | Score |
|---|---|---|---|---|
| 1 | frontend | ~~"Download my chats" in settings~~ done (e91a58c) | the quality baseline needs the owner's chats | — |
| 2 | frontend | ~~A saved chat's reasoning card still says "Thought for" in Arabic (`renderReasoningCardHtml`, app.js) done (b6b99b8): the card is now translated (it said "Reasoning"/"Completed", not "Thought for"); duration is not stored, so no "Thought for 3.2s" on reopen~~ | the live card was fixed, the saved path was not | 3×2×1.0÷1 = 6 |
| 3 | data-quality | "اكتبلي برنامج يومي يطبع التاريخ" routes as a plan, not code | known trade-off of the follow-up change | 2×4×0.8÷1 = 6.4 |
| 4 | data-quality | A fixed eval set of 60 invented questions, 10 per group (students by field, employees, technical, business, general, Arabic dialect), checked with no key: which playbooks, which route, request size (`measure-request.js`) | the baseline must not wait on the owner's file | 5×3×1.0÷3 = 5 |
| 5 | data-quality | ~~Score the owner's exported answers~~ done: `quality-baseline.md` | the baseline | — |
| 6 | backend | ~~Provider or server text is still shown as the answer (8 in October, 46 in September): a failure must reach the page as a failure, in the person's language, and never be stored as the answer; fix the causes the texts name~~ done (dfc4326): failure no longer saved as answer, in-stream provider errors fail over; the exported error texts are not in the repo, so other causes remain unmatched | quality baseline: the most common failure people see | 5×4×1.0÷2 = 10 |
| 7 | backend | ~~A blank reply, a raw tool-call tag or reasoning alone is stored and shown as the answer (13 in 7 chats): treat it as a failure and retry | quality baseline | 5×4×0.8÷2 = 8 |
| 8 | data-quality | ~~Classify the 50 wrong answers by cause (fast model chosen, low reasoning, no search, playbook, the question misread) on invented copies of the questions, with no key: what decides the route each would get today~~ done: `test:wrong-answers`, table in `quality-baseline.md` | wrong answers did not fall from September to October; students 21 of them | — |
| 9 | backend | Check the retired-model 404 on pictures and files (8 in one session) is gone with `retiredModels.js`, and that a test fails if a setting names a retired id | quality baseline; may be fixed already | 3×4×0.3÷0.5 = 7.2 |
| 10 | data-quality | Live facts (sport results, current office-holders, "latest", "next") answered without a search, or wrong (14 sport answers wrong) | quality baseline | 4×4×0.8÷3 = 4.3 |
| 11 | data-quality | Asks questions instead of doing the task when the details are there (CV, diet plan, 3D plot: about 21) | quality baseline | 4×3×0.8÷2 = 4.8 |
| 12 | data-quality | Explainer and health boilerplate appear in answers that did not ask for them (about 17) | quality baseline | 4×3×0.8÷2 = 4.8 |
| 13 | backend | A photo of an exercise or a diagram ends with "unreadable, send a clearer one" (9; usefulness 1.9) | quality baseline | 3×4×0.8÷3 = 3.2 |

| 14 | backend | Raw-tool-markup stripping cuts answers that quote those tags as code (`<tool_call>`, `<function=`) | found reviewing item 7 | 2×3×0.5÷1 = 3 |

| 15 (closed, 95e26fd) | data-quality | Worked student problems (a sum, circuit, derivative, limit; playbook `problem` or intent math) go to the larger model first in Normal as a hard question does: 11 of 11 invented ones go to gpt-oss-20b today. Groq gives both models the same minute, so only latency costs. Test: `test:wrong-answers` expectation flips | students: 21 of the 50 wrong | 4×4×0.7÷1 = 11.2 |
| 16 | data-quality | A message about a fact that changes (match, score, "now", "latest", office-holder) gets default reasoning effort, and a search the model must make (`tool_choice: required` for the first round, or the search run before the model answers); today it is 20b at low with `auto` | 14 sport wrong; Max is no better | 4×4×0.7÷2 = 5.6 |
| 17 | data-quality | "الدالة" (the maths word) must not set the code playbook and overlay on a derivative or integral (3 of 4 calculus cases, +700 tokens, a code-shaped answer); keep "اكتب دالة" as code; add the diet-plan playbook (a plan with numbers in it is done, not asked about) | calculus rows of the table; item 11 | 3×3×0.8÷1 = 7.2 |

## Standing hunts (when a role has nothing open)

| Role | Hunt |
|---|---|
| frontend | Full `npm run test:browser`; any red is a bug with a root cause. Then the real page with the console open: every error or failed request is an item. |
| ux | One flow a student uses (ask, attach a PDF, export, read on a phone) measured at 360 px and 1280 px in both themes and both languages: tap targets, contrast, overflow. |
| data-quality | Ten eval questions from item 4 a day: what the model is told (playbooks, size), against what the question needs. A wrong or missing playbook is an item. |
| performance | `node scripts/sim-session.js` and the regex-cost fuzz on every pattern changed this week; anything over budget is an item. |
| backend | Each provider's failure modes (`test:search-providers`, `test:long-requests`, `test:resilience`) against what the provider does today; a retired model or a changed limit is an item. |
| reviewer | Every commit on main since its last review, read as a reviewer who wants to reject it; it attacks one test (breaks the code, sees whether the test goes red). |
| token-officer | Stays at its desk: the meter before every employee, and ways to spend less (`token-savings.md`). |

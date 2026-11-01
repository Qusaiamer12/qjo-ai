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
| 2 | frontend | A saved chat's reasoning card still says "Thought for" in Arabic (`renderReasoningCardHtml`, app.js) | the live card was fixed, the saved path was not | 3×2×1.0÷1 = 6 |
| 3 | data-quality | "اكتبلي برنامج يومي يطبع التاريخ" routes as a plan, not code | known trade-off of the follow-up change | 2×4×0.8÷1 = 6.4 |
| 4 | data-quality | A fixed eval set of 60 invented questions, 10 per group (students by field, employees, technical, business, general, Arabic dialect), checked with no key: which playbooks, which route, request size (`measure-request.js`) | the baseline must not wait on the owner's file | 5×3×1.0÷3 = 5 |
| 5 | data-quality | Score the owner's exported answers against the rubric (README) | waits on the owner's upload | running |

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

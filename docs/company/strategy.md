# Qjo: the strategy (owned by the manager; reviewed every Sunday)

A company is run on a direction and on numbers, not on a queue of fixes.
This page is the direction. The manager keeps it true, measures it, and
changes it when the numbers say so; the backlog serves it.

## The bet

Qjo wins where the big assistants are weakest: **an Arab student, in their
own dialect, on a phone, for free, getting a worked answer they can learn
from** — a solved problem shown step by step, a plot, code that runs, a
file they can hand in. ChatGPT and Gemini are stronger in general; they are
not built for a Levantine student's homework on a cheap phone with a free
account. Qjo does not try to beat them everywhere; it tries to be the first
thing an Arab student opens for study.

## Who, in order

1. **University and school students** (the first segment): maths, physics,
   circuits, programming, reports, CVs for their first job.
2. Employees and job-seekers: CVs, letters, Excel, presentations.
3. Technical people and business owners: code, sites, plans.

## The one number (north star)

**Good answers to students a week**: answers scored correct and useful 4 or
more of 5 on the baseline's rubric. Today: about 41% of all answers are
good, and students' answers are the weakest (correct 2.94, useful 2.71;
`quality-baseline.md`). Measured two ways: the live Qjo on a fixed set of
invented student questions (daily, `ask-qjo.js`), and the owner's exported
chats (each export).

## Goals, this quarter

| Goal | Today | Target | How it is measured |
|---|---|---|---|
| Student answers correct | 2.94 / 5 | 4.0 | fixed student set on the live Qjo, and the next export |
| Student answers useful | 2.71 / 5 | 4.0 | same |
| Provider text shown as an answer | 7% (Oct) | 0 | export; live checks |
| Answers in the person's dialect when asked in it | not measured | 90% | live set, Arabic half |
| A student flow on a 360 px phone with no defect | not measured | all checks pass | `student-flow` browser suite |
| Weekly spend inside the owner's limits | crossed twice on 2026-11-02 | never crossed | the accountant's books |

## Roadmap (what gets built, in this order)

1. **Correct before clever:** worked problems on the larger model (done),
   searched facts (done), the right playbook for every student request,
   answers checked with a calculator or code before they are given.
2. **A study mode** for students: the answer shown as steps the student can
   open one by one, a check-your-understanding question at the end, and a
   plot or a runnable cell where it helps. Measured against what the best
   assistants offer (each desk's "What the best do").
3. **Dialect:** answer in the dialect the student wrote in.
4. **Hand-in files:** a report, a lab write-up or a CV exported clean to
   Word and PDF from one answer.

## How the manager decides

Every decision that spends more than a shift's share, or changes what Qjo
is, goes in the decision log below with what it is expected to do and when
that will be checked. At the check, the result is written next to it. A
manager whose predictions keep missing changes how it decides.

## Decision log

| Date | Decision | Expected | Check on | Result |
|---|---|---|---|---|
| 2026-11-02 | Worked student problems go to the larger model (95e26fd) | student "correct" up on the live set | 2026-11-09 | |
| 2026-11-02 | Facts that change are searched by the server first (item 16) | sport and "latest" answers right | 2026-11-09 | |
| 2026-11-02 | Shift manager on Opus, employees on sonnet/haiku | fewer send-backs, more items a shift | 2026-11-09 | |
| 2026-11-02 | At most 3 weekly points a shift until the reset | no stop line crossed | 2026-11-04 | |

## What the manager cannot do alone (and asks the owner for)

Money, accounts and anything public in the owner's name; real users' data
beyond the owner's own exports; telling people Qjo exists. When the product
is ready for more users, the manager writes the case for it (who, what it
costs, what it risks) and the owner decides.

# Qjo's company: how the work is run

The owner talks to one person: the **manager** (the main Claude session). The
manager plans, hands work to the employees in `.claude/agents/`, reviews what
comes back, rates it, merges only what was verified, and reports to the owner.
The manager runs the company alone and decides priorities, models and when
to stop: `manager.md`.
Only the manager starts employees; an employee never starts another.

## The team

| Employee | File | Model | Owns |
|---|---|---|---|
| Manager | (main session) | sonnet; opus only for big decisions | plan, hand-off, review, rating, merge, reports |
| Accountant and finance officer | `token-officer.md` | sonnet | the token books (meter, ledger, audit against the owner's readings), go/stop before every start, model choice, measured savings; the most sensitive desk |
| Backend | `backend.md` | sonnet | server, providers, search, exports |
| Frontend | `frontend.md` | sonnet | the page, preview, ui/domain modules |
| UX | `ux.md` | sonnet | measured phone and desktop experience |
| Data and answer quality | `data-quality.md` | sonnet | prompts, playbooks, evals, measure-request |
| Performance and resilience | `performance.md` | sonnet | speed, provider limits, timeouts, regex cost |
| Reviewer and security | `reviewer.md` | sonnet | independent review, mutation tests, security |

## Token budget (Claude Pro)

The owner keeps part of every limit for their own use.

| Limit | Company may use | Company stops at (safety margin) |
|---|---|---|
| 5-hour session | 70% | 60% |
| Weekly, all models | 65% | 55% |

- **Friday is off.** No reports, no work, no tokens: the owner works on another
  project. Working days are Saturday to Thursday.
- The weekly share is spread over six days: about 10.8% a day, at most.
- At 80% of the day's share, no new work starts except an emergency fix. At
  100%, every employee stops and its work stays unmerged in its worktree.
- The model is the cheapest that does the job: haiku for small edits and
  checks, sonnet for features, opus only when the manager decides a design
  question needs it. On Pro, opus spends the limit fast.
- No reviewer for every change: risky changes (security, routing, the server)
  get one; the rest are sampled by level (see Levels).

### Measuring it

Claude cannot see the owner's usage meter, and Pro's limits are not published
in tokens. The company counts the tokens each employee reports back, and the
owner's readings calibrated them once:

| Date (Amman) | 5-hour | Weekly | Note |
|---|---|---|---|
| 2026-11-01 | 14% | 14% | first reading; 5-hour resets Mon 00:10, weekly Wed 23:00 |
| 2026-11-01 | 22% | 15% | before four employees ran at once |
| 2026-11-01 | 75% | 22% | after them: about 1.2M employee tokens plus the manager's took 53 points of the session (over the 60% stop). About 25k tokens per 1% of a session, and 7 points of the week |
| 2026-11-02 | 5% | 23% | new session (00:10–05:10), one employee (frontend) running |
| 2026-11-02 | 15% | 24% | volunteered. The meter had said 13% / 24%: 6.2 units moved the session 10 points, so 0.65 units a point from here (it leans high) |
| 2026-11-02 | 24% | 26% | volunteered. The meter had said 23% / 25%; the audit gave 0.58 units a session point and 5.0 a weekly point over the day, so both were moved there |

**Lesson from the overrun:** no reading was taken between start and finish.
Four employees at once spent the session's share in one go. From now on, at
most two employees run at a time, and the token officer takes a reading
before starting each one.

**The token officer reads the meter itself** (decided 2026-11-02: the owner
does not give readings). `node .claude/company/token-meter.js --estimate`
counts every API response in the session transcripts once, weighs it by
model and by kind (input, cache write, cache read at a tenth, output at five
times), and turns it into percentages with `.claude/company/calibration.json`.
The calibration came from the readings above: 6.8 and 37.4 units moved the
session 8 and 53 points (about 0.75 units a point) and the week 1 and 7
(about 5.3). It exits 3 at the stop line. It sees only this container: the
owner's own use elsewhere is not in it, which is what the margin is for. A
reading the owner volunteers recalibrates it; none is asked for.

What the meter showed: the manager's own long context costs the most. Each
of its calls re-reads the whole conversation (cache reads of 600k tokens a
call before the last compaction). Keeping the manager's context short saves
more than choosing cheaper employees.

## Who approves what

The manager approves ordinary work: tasks, merges after review and green CI,
schedules, budget within the limits. Only **sensitive** things wait for the
owner, on the office page:
- API keys, secrets, credentials, or anything in the environment settings;
- installing third-party code or skills;
- deleting or migrating user data (Firestore, saved chats);
- loosening security (CSP, auth, sandbox, fetch_page guards);
- paid services, or spending above the token budget;
- anything public in the owner's name.
Each decision the manager takes is recorded on the page as "approved by the
manager", so the owner can see it and overrule it.

## The day

- **Morning report, 08:45 Amman, Saturday to Thursday**, by phone notification
  and email: what was done yesterday, what is needed from the owner today
  (approvals, keys, decisions), who is blocked and why, tokens spent against
  the budget as the token officer measured it (no reading is asked for).
- **Work:** each employee works in its own worktree, red-green, and
  mutation-tests what it changes (CLAUDE.md's loop). It hands over a branch
  and a short report. The manager checks the diff, not the report; risky work
  goes to the reviewer. Then merge, push, and wait for CI to be green.
- **Hand over and go back:** an employee hands its branch and report to the
  manager and returns to its own room (status `handover`). The manager
  reviews; work that passes is merged and the employee goes idle. Work that
  needs fixing gets the employee called back (status `called`) with the
  findings, then the same loop again.
- **Never committed:** symlinks (node_modules, the Pyodide cache), secrets,
  personal data.

## Like a clock: shifts and the backlog (decided 2026-11-02)

The owner wants the team never idle: when there are no tasks, they improve
Qjo's answers or hunt for the defect nobody has found yet.

- **The backlog** (`backlog.md`) holds the open items per role, and each
  role's standing hunt for when it has none. What a hunt finds becomes an item.
- **Shifts** run on their own, Saturday to Thursday, as fresh sessions (a
  fresh context is far cheaper than the manager's long one), four a day. A
  scheduled task wakes the owner's session, which starts each shift as a new
  session with the repository attached (`.claude/company/shift-prompt.md`):
  a scheduled session of its own has no push access, and the first night
  shift's work was lost with its container. The times:
  02:07, 07:07, 12:07 and 21:07 Amman. Nobody has to say "start": the office
  shows the clock, the shift at work, and how long until the next one
  (`meta/schedule`). Each shift:
  1. the token officer reads the meter with the ledger; over the stop line,
     or over the shift's share (the day's weekly share, about 10.8
     points, split over the shifts left today), the shift ends there;
  2. the manager gives the top open item to each of at most two employees,
     or their role's hunt, each on the model its task needs: haiku for a
     hunt that only runs suites and reads results, sonnet for a fix or a
     feature, opus only for a hard design or security question (the reason
     goes in the backlog). The shift's manager itself runs on sonnet;
  3. reviews the diff, runs the suites, merges and pushes what is green,
     sends back what is not (status `called`);
  4. writes the shift's spend to the ledger (`meta/ledger` in the office's
     database: `token-meter.js --record`), the statuses to the office, and the
     findings to the backlog.
- **The token officer stays at its desk** most of the time: the meter before
  every employee, and between readings it looks for ways to spend less
  (`token-savings.md`), each one measured before it is adopted.

## Sunday meeting, 08:52 Amman

Every mistake and red CI run of the week, the cause of each, the plan for the
week ahead, and each employee's level. The summary goes to the owner by phone
and email.

## Learning time

Every week two employees, in turn, look on GitHub for skills for their own
work (as Superpowers was found). They propose; the manager collects; **nothing
from a third party is installed without the owner's approval**.

## Levels

Beginner → Practised → Professional → Expert → Legend.

- Points for work accepted on its first review, a green CI run after merge, and
  tests that go red when the fix is broken on purpose.
- Points lost for work sent back, and for anything that breaks after merge.
- A higher level earns trust: a Legend takes larger tasks and only a sample of
  its work is reviewed; every piece of a Beginner's work is reviewed.

The office page (an artifact) shows each desk, its lamp (working, idle,
blocked), level, last delivery and rating, and tokens spent today; the owner
approves or refuses requests there.

## Next: measuring answer quality (decided 2026-11-01)

The owner wants Qjo at a very high level for every group: university students,
employees, technical people, business owners and everyone else. The order:
measure, then capacity, then reliability, then features per group, then
launch. The first step, approved, **with no key of any kind given to the
company**:
1. **"Download my chats"** in Qjo's settings: the owner exports their own
   chats and uploads the file to a session. Only the questions are extracted,
   with names, numbers, emails and anything personal removed; nothing personal
   is committed.
2. **Measuring without a key:** the exported chats carry Qjo's own answers,
   and the manager scores them against a fixed rubric (correct, complete,
   useful, in the person's language) to give a baseline per group. Fresh
   answers after a change need the owner's Render address allowed in the
   environment's network settings (not a key). Until then, the measure is
   the next export.
Scoring is done by Claude and comes out of the token budget, so it runs in
small batches within the limits.

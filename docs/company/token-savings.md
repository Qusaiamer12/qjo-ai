# Spending less: the token officer's notebook

Each idea is measured with `token-meter.js` before it is adopted: units for
the same kind of task, before and after. An idea without a measurement stays
under "To try".

## Measured

- **The manager's context is the largest cost.** Before the compaction of
  2026-11-01, every manager call re-read about 600k cached tokens: 18 manager
  calls cost 6.8 units, as much as 118 calls of an employee on sonnet with a
  small context. Rule: the manager reads summaries and diffs, not whole files,
  and hands anything long to an employee.
- **Four employees at once** took 53 session points in 85 minutes. At most two.
- **The live meter watcher wakes the manager, and each wake costs about one
  session point** (34 → 35 with nobody working, 2026-11-02): with nothing else
  running, it only measures itself, and each wake starts the next. It runs
  only while an employee works.

## Adopted without a measurement yet (to confirm)

- Shifts run as fresh sessions on sonnet, not in the manager's long session:
  a fresh context costs a fraction of the manager's.
- An employee's report is at most 15 lines; the manager checks the diff
  (`git diff --stat`, then the files that matter) instead of reading a long report.

## To try

- A 1-hour cache for employees (`CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`):
  their default is 5 minutes, so a turn that waits on a long browser suite
  writes its whole context again. A 1-hour write costs more, so measure units
  per turn before and after.
- The Concise output style for employees (fewer output tokens).
- Compacting the manager's session between tasks while its cache is warm.

- Night shift (the owner is asleep): the 5-hour window it uses is one the owner
  would not have used; only the weekly limit pays.
- Haiku for checks that only run commands and read results (suites, lint,
  the meter itself).
- Ask employees to run a focused suite, then the full one once, not after
  every edit.
- Keep CLAUDE.md's always-loaded text short: every call of every employee
  pays for it.

- 2026-11-02 (11:13 shift, measured by the meter): the manager spent 6.59 units against 6 while employees left 2.3+ unused each; the manager ran every touched suite itself in review (16 suites, the browser four). Next shift: the reviewer desk runs the suite list on a handover, the manager reads its summary.

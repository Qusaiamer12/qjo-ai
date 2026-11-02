# Performance review: the monthly league

The six desks (backend, frontend, ux, data quality, performance, reviewer)
compete every month on numbers, not impressions. The manager keeps the
score, coaches every desk, and at the end of the month the last desk is put
on notice; a desk last two months running is replaced.

## Points (written by the manager after every review)

| Earned | Points |
|---|---|
| Work merged on its first review | +3 |
| The live Qjo answers measurably better because of it (`ask-qjo.js`, before and after) | +4 |
| A defect found by its own hunt and turned into an item someone fixed | +2 |
| A test of its that was broken on purpose and went red (shown in the handover) | +1 |
| A scouting find the company adopted (`scouting.md`) | +2 |
| Finished within its allowance, or split cleanly over windows | +1 |

| Lost | Points |
|---|---|
| Sent back at review | −2 |
| Anything it merged that broke main or the live Qjo | −5 |
| Said done or passing without proof | −3 |
| Ran past its allowance, or hit maxTurns with nothing handed over | −2 |
| Its desk notebook not updated at handover | −1 |

`monthPoints` in the office is the month's total; `points` is the career
total that sets the level. The office shows each desk's rank.

## Comparing with the best

Each desk measures its part against the best assistants (ChatGPT, Gemini,
Claude). Nobody here holds keys or accounts for them, so the comparison is
done two ways, and says which:
- **Features:** on the web, what the best assistants offer for the same need
  (a student's worked problem, a file, a chart, a CV) and how; written in
  the desk's notebook as "What the best do".
- **Answers:** the desk writes the answer a top assistant would give to an
  invented question (as Claude, the strongest model it can call), then asks
  the live Qjo the same question and scores both on the baseline's rubric.
  The gap is the desk's to close.

## Coaching

After each review the manager writes one lesson into the employee's file
(`.claude/agents/<role>.md`, "Lessons"): what to repeat, what to stop. Each
desk also writes one lesson for itself in its notebook. The lessons are how
the employee is better next month than this one.

## Notice and replacement

- **Last of the month:** on notice. The manager writes what has to change,
  with a number, in its file.
- **Last two months running, or a −5 twice:** the manager proposes to the
  owner a replacement: the employee's file rewritten (its approach, its
  model, its rules) as a new hire. Its desk notebook stays: the knowledge
  belongs to the company, not to the employee. The owner decides.

# Answer quality: the baseline (2026-11-02)

Measured from the owner's own chats, exported with "Download my chats": 138
chats, 439 answered questions and 23 with no answer, 412 of 462 questions in
Arabic. Each answer was scored 1–5 by one reviewer (data-quality, on sonnet)
for correctness, completeness, usefulness, language and format, and given a
failure kind. The chats, the scores and the reviewer's notes stay out of the
repository: they are the owner's. Only these totals are kept, so the next
export can be compared with them.

## Totals

| | Mean |
|---|---|
| Correct | 3.25 |
| Complete | 3.22 |
| Useful | 3.05 |
| Language | 4.08 |
| Format | 3.53 |

Good (correct and useful 4+, no failure): 178 of 439 (41%). Bad: 145 (33%).
Without greetings, 53% of answers had a failure.

| Segment | Pairs | Correct | Useful | Format |
|---|---|---|---|---|
| General | 254 | 3.46 | 3.28 | 3.73 |
| Student | 110 | 2.94 | 2.71 | 3.17 |
| Employee | 26 | 3.08 | 2.69 | 3.31 |
| Business | 25 | 3.20 | 3.00 | 3.52 |
| Technical | 24 | 2.67 | 2.67 | 3.25 |

Students, the first segment, get the weakest answers after technical people.

## By month: what earlier fixes already changed

| Month | Pairs | Good | Error text shown | Wrong | No answer |
|---|---|---|---|---|---|
| 2026-09 | 288 | 116 (40%) | 46 (16%) | 25 (9%) | 17 |
| 2026-10 | 117 | 49 (42%) | 8 (7%) | 20 (17%) | 5 |
| 2026-11 | 10 | 5 | 0 | 1 | 1 |

Provider text shown as an answer fell by more than half after September's
fixes, but it has not gone. Wrong answers did not fall: they are now the
largest failure. Of the 50 wrong answers, 21 were students' (physics,
circuits, calculus, plots) and 14 were sport, where the facts are live and
no search was made.

## Failure kinds

none 251 · error text 55 · wrong 50 · other 40 · incomplete 20 · off-topic 9 ·
wrong language 7 · file ignored 3 · refused 2 · too long 2.

The next measure is the next export, scored the same way, against these
numbers.

## Why the wrong answers are wrong (measured 2026-11-02, no key)

`npm run test:wrong-answers` (scripts/test-wrong-answers.js) sends 24 invented
questions of the baseline's kinds through the real chat route, routing engine
and llmService, against a fake Groq, as the page's default Normal mode does,
and Max for the first two rows. It records what each is given today. Sizes are
characters / 3.5, so Arabic is under-counted; `measure-request.js` gives true
tokens from the page. `--table` prints every row.

| Kind (of the 50 wrong) | Model, effort | Search | Playbooks | Est. tokens | Cause |
|---|---|---|---|---|---|
| Physics, circuits, calculus (11 cases; students, 21) | 20b, default effort (Max: 120b) | offered | problem or math | 3.6–4.6k | **Fast model**: 11 of 11 go to gpt-oss-20b; only a puzzle, 600+ characters or two "why/compare" cues earn the larger one |
| Calculus that says "الدالة" (3 of 4) | as above | offered | math **+ code** | 4.6k (+700) | **Playbook wrong**: the usual Arabic word for f(x) sets the code playbook and engineering overlay on a derivative |
| Plot a function or a surface (3) | 20b, default | offered | mathplot | 4.0–4.3k | none found in what is sent (control) |
| Sport, office-holders, "latest" (6; sport 14) | 20b, **low** | offered, `tool_choice: auto` | none | 3.6k | **Low reasoning and no search forced**: the rule "call web_search" is in the core prompt; a 20b at low effort may skip it. Max does not change it |
| Diet plan with its numbers in the message | 20b, default | offered | **none** | 3.6k | **Playbook missing** (a CV gets writing+cv) |
| Chat, explanation | 20b, low | offered | teach/banter | 3.9–4.2k | none (control) |

Not decidable without a key: whether a given 20b answer is wrong, and how often
it skips a search it was told to make. The first needs the eval set run once
with a key; the fixes below are ranked on what routing sends, not on that rate.

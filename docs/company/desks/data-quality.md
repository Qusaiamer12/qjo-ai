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

A chat message takes this path (src/routes/chat.js is the caller):
1. `detectNeeds` (playbooks.js) reads the person's `ownWords` (not attached files) and returns the
   overlays: search/files, code, site, python, plot, picture and `playbooks`. `selectPlaybooks`
   matches regexes on the newest message (plus the one before when `isFollowUp`, followUp.js).
2. `buildChatPromptParts` (systemPrompt.js): the core (stable, cacheable, under the ceiling in
   test-language.js) goes first; what the message needs (overlays, playbooks, date) rides with the
   message as turn text (promptLayout.js `layoutChatRequest`). Arabic notes (arabicPrompt.js) join
   when Arabic is in play.
3. `routeUserRequestDeterministic` gives an agent hint; `classifyQjoRequest` an intent
   (math, code, research, reasoning, ...), both in RoutingEngine.js.
4. `callAgent` picks the pipeline: code intent -> code; Max or `largerModelFirst` (thinkingNeed
   hard: a puzzle, 600+ chars, two of why/compare/decide/numbers/long, or a site) -> larger models;
   else flash. `largerModelFirst` also takes a worked problem (workedProblem.js: mathAsked, calculus words, or the `problem` playbook). The page's Normal sends gpt-oss-20b as the explicit model, kept unless the question
   is hard. Greetings take the lite track.
5. `reasoningEffort` (promptLayout.js): Normal is `low` unless math intent, a thinking intent
   (code, math, reasoning, research, file) or thinkingNeed; Max keeps the default (medium).
6. Tools: calculate always, web_search + fetch_page whenever no source pack came with the message
   (the model decides; `tool_choice` is always `auto`). The core prompt tells it to search changing facts.
Reproduce what a message gets, with no key: `npm run test:wrong-answers` (real route, fake Groq);
true tokens: `node tests/browser/measure-request.js`.

## Weak spots I know of

- Conceptual "why" questions (lightning before thunder) are not worked problems: 20b, default effort.
- Facts that change run on 20b at low effort with search left to the model (6 of 6 invented).
- English "function" still sets code on a calculus question ("derivative of the function f(x)"): CODE_WORDS `\bfunction\b`, not yet guarded.
- The diet playbook is matched on words (diet, calories, سعرة, نظام غذائي...); "what should I eat" is not.
- Circuits are intent `general`, not math (mathAsked misses them); they rely on the `problem` playbook.
- Every answer's wrongness is unknown without a key: routing is measured, answers are not.

## Measurements

- 2026-11-02, test:wrong-answers, 24 invented questions: Normal sends 24 of 24 to gpt-oss-20b; effort
  default on 15, low on 9 (facts that change, CV, chat); web_search offered on 24; request
  3.6k (plain) to 4.6k (calculus with code playbook) estimated tokens (chars/3.5, Arabic under-counted).
  Mutations: `largerModelFirst` always true -> 2 red; "دالة" removed from CODE_WORDS -> 2 red.

- 2026-11-02, after item 15: 10 of 10 worked problems go to gpt-oss-120b in Normal; chat/plain facts (4 cases) stay on 20b. Mutation (drop workedProblem) -> 1 red.

- 2026-11-02, after item 17: calc-1/2/4 request 4566-4572 -> 3832-3838 tokens (-734), no code playbook or overlay; do-2 (diet) gets the `diet` playbook (+190 tokens, only on those messages). "دالة" is code only as "اكتب/اعمل/سوي (لي) دالة" or "دالة بايثون/جافا/...". Mutations: "دالة" back in CODE_WORDS -> 5 red; سعرة words removed -> 1 red (after adding a calories-only case; the first test was blind, other words matched).

## Next improvements

1. (done) Backlog 15.
2. Backlog 16: facts that change get default effort and a forced first search (sport, 14).
3. (done) Backlog 17.
3b. English "function" in a calculus question still brings code (same fix, with a maths guard).

Lesson: a test message matching two rules cannot show either is needed; give each rule a message only it matches. Never run bare `git stash`.
4. Run the 24 questions once with a key and score them: how often 20b is actually wrong.

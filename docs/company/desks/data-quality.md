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
   (the model decides; `tool_choice` is always `auto`). A fact that changes (src/agents/liveFacts.js:
   `asksChangingFact` on ownWords of the newest message: when-word + topic, a "who is the <office>",
   or a match result with no year) is searched BY THE SERVER first: `runChain` gets `firstSearch` and
   uses `searchFirstRound` (a synthetic assistant tool_call) in place of the first model call, so
   `runToolRounds` runs the search, emits the page events, and the model's first call already holds
   the result. Effort for those is default (`reasoningEffort({live})`).
Reproduce what a message gets, with no key: `npm run test:wrong-answers` (real route, fake Groq);
true tokens: `node tests/browser/measure-request.js`.

## Weak spots I know of

- Conceptual "why" questions (lightning before thunder) are not worked problems: 20b, default effort.
- Facts that change: searched first now (item 16), but the query is the person's own words (no rewrite by the model); the list of when/topic words is hand-made, so a new kind of changing fact (a flight, a visa fee) is missed until added. Not searched when a past year is in the message or a 'first/former/was' word.
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

- 2026-11-02, after item 16: test:wrong-answers 43 checks (was 24): 12 invented changing-fact messages (6 Arabic) all searched first at default effort; 7 near-misses and 9 more not. Request text unchanged (3586 est. tokens for live-3, same as before) + the result the search returns (cap 6000 chars, about 1.7k tokens) which replaces the model's own search round. Mutations: detector off -> 3 red + 5 red in e2e; detector always true -> 2 red + e2e hangs; effort left low -> 1 red. Wrong first draft: the Arabic question mark U+061F is inside \u0600-\u06FF, so "امس؟" was missed; boundaries use letters only (U+0621-064A), and a ب/و/ل/ف/ك prefix is allowed.

## Next improvements

1. (done) Backlog 15.
2. (done) Backlog 16. Next: use the model's rewritten query (or searchService's rewriter) for the first search; run the 14 sport questions with a key.
3. (done) Backlog 17.
3b. English "function" in a calculus question still brings code (same fix, with a maths guard).

Lesson: a test message matching two rules cannot show either is needed; give each rule a message only it matches. Never run bare `git stash`.
4. Run the 24 questions once with a key and score them: how often 20b is actually wrong.

Lesson: a boundary written as a character class is only as right as the class: U+0600-06FF holds the Arabic question mark, so probe with real punctuation, not just bare words. Run the old tests against the new default: four e2e scenarios silently changed meaning when their sport question became server-searched.

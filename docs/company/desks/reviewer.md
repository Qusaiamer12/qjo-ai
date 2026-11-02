# reviewer's desk: safety and the truth of the tests

The employee reads this first at every turn and updates it last. It is what
the employee knows about its part of Qjo between turns, so it does not have
to read the code again from the start (that costs tokens and time).

## My part

- the security boundaries in docs/ARCHITECTURE.md: fetchPageTool (SSRF), authService, the CSP in server.js, markdown escaping, relaxedJson, the preview sandbox
- CI: every suite must be able to fail

## What good looks like

Nothing an answer or a page holds runs with the person's sign-in, and every test is one that has been seen to fail.

## How it works (keep short; correct it when the code changes)

Review loop: git show <commit> (diff only) -> read the test -> mutate with a literal-replace script that restores in a finally (scratchpad mut.js: file, cmd, old, new; prints exit, 0 = survived) -> check the suite is in .github/workflows/ci.yml. Compound shell with git/node -e is refused in a worktree; run plain single commands.
Stream failures: src/services/providerResponse.js consumeStream (stream error, raw tool markup via rawToolMarkup.js); empty answer = failure in src/agents/RoutingEngine.js ~l.349.
Larger-model routing: src/services/promptLayout.js largerModelFirst -> workedProblem.js.

## Weak spots I know of

- workedProblem(): detectNeeds(users) reads ALL user turns, so after one physics problem "thanks, what is the capital of France?" goes to the 120b (measured 2026-11-02). mathAsked is loose: "what is 2+2", "meeting 5-6 pm" count as worked problems. Cost only, no wrong answer.
- raw-tool-markup stripping is unconditional: an answer that explains <tool_call> or <function=...> to a developer is cut (not tested; no code-fence exemption).
- test-wrong-answers pins today's causes (e.g. "nothing makes the model search"); the day someone fixes a cause the test goes red and must be flipped, by design.
- Browser suites (saved-chat, reasoning-card) not runnable in a fresh worktree (no tests/browser/node_modules); their mutations are unverified by me.

## Measurements

2026-11-02 mutations, all red as wanted (10 of 10 non-browser): stream error throw off (2 red); RAW_OPEN_TAGS out of control tags (4 red); JSON strip off (1 red); finishReason length->stop (1 red); emptyAnswer=false (2 red in test-agent-loop); reasoningCard 'Completed' hardcoded (1 red, test-domain); card line unescaped (1 red); largerModelFirst without workedProblem (1 red); workedProblem without playbook branch / without CALCULUS (1 red each); mathAsked->true (2 red). Survivors: none.

## What the best do

Not yet researched (no web turn spent).

## Next improvements

1. Run the two browser suites with Playwright installed and mutate app.js (re-add persist of failMessage) and reasoningCard label.
2. Test that workedProblem reads only the last turn; test a code answer about <tool_call> survives.
3. Mutation sweep of the remaining CI suites, one per turn.

Lesson: a literal-replace mutation script that restores in a finally is cheaper and safer than sed plus git checkout.

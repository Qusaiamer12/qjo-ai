# Qjo Knowledge Base Scale-Up (Batch 1 + Infrastructure)

Version: `qkb-scale-batch1-2026-09-03`

## Scope
First step toward the 5,000-entry knowledge base target (AI-generated content
only, per product decision): multi-file/two-layer infrastructure with a
persistent vector cache and a validation script, plus the first content batch.

## Infrastructure
- **Two layers** in `knowledge/`:
  - `taskcraft` — guidance + exemplar per task (drives answer quality).
  - `facts` — verified reference answers (Arabic-first knowledge).
- **Multi-file loading** (`loadKnowledgeDirectory`): every `qkb-*.json` is
  merged; ids namespaced `t:`/`f:`; duplicates skipped with a warning. Add
  files freely — no code change, ever.
- **Persistent vector cache** (`knowledge/.vector-cache.json`, gitignored):
  memory-mode embeddings are computed once, then reused across restarts.
  Invalidated automatically when the combined KB version string changes.
  At 5k entries this turns a multi-minute warmup into an instant boot.
  A log line recommends Qdrant when in-memory exceeds 1,500 entries.
- **Language-aware injection extended to facts**: English queries now get an
  explicit "answer in the user's language" note on factual blocks too.
- **`npm run kb:validate`** — schema/duplicate/size checks + progress toward
  the 5,000 target (`KB_TARGET`), layer and domain distribution.
- `kb:sync` now upserts the whole directory (both layers) to Qdrant.
- Fixed: `loadKnowledgeDirectory`/`entryPayload` exported for scripts.

## Batch 1 content (254 total entries, 5.1% of target)
| File | Layer | Entries | Coverage |
|---|---|---|---|
| qkb-v1.json (v1.1) | taskcraft | 46 | 6 core domains (bilingual since v1.1) |
| qkb-taskcraft-b2.json | taskcraft | 109 | subdomains: python/js/java/cpp debugging, git, testing/TDD, security, docker/CI/deploy, css/responsive/react, auth/db/caching, REST, algorithms, pandas, docs, error-handling/logging/refactor/ts/node, business/academic writing, legal/medical/financial summarization, root-cause/SWOT, tech/offer comparison, simplified explanation set, kids/zero-to-hero teaching, advanced editing (paraphrase, dialect↔MSA, SEO, headlines, presentation, OCR cleanup), finance math (loans, compound, chained discounts), probability/combinatorics/sequences/functions/trig/calculus, physics/chemistry estimation |
| qkb-facts-b1.json | facts | 99 | Jordan (48: geography, history, universities, culture, practical) + tech reference (51: API→WebSocket, security, AI/LLM/RAG concepts) |

Dynamic facts (prices, schedules) are deliberately excluded — those belong to
web search. Facts with contested dates are either avoided or hedged.

## Verification
- `npm run kb:validate` → 254 unique entries, 0 errors, 0 warnings.
- Unit tests (mocked embedder): 254-entry load, taskcraft/facts layer routing,
  Arabic + English fact blocks with correct headers/notes, disk-cache reuse
  (0 re-embeds on re-init), chitchat skip.
- `npm run lint` 0 errors · `npm test` 34/34 · `npm run audit` 0 new failures ·
  `npm run scan-secrets` clean · server boot check with KB wired.

## QAlpaca — Batch 2 (same day): +128 entries → 382 total
User direction: "make something valuable like Alpaca, from AI models" — QAlpaca
is our own instruction dataset: AI-generated like Alpaca, but Arabic-first
bilingual, Qjo-standard-driven, and retrieval-structured (Alpaca is
English-only, generic, research-licensed; none of it was imported).
- `qkb-taskcraft-b3.json` (64): frameworks (Next.js/Tailwind/Vue/Express),
  mobile (Flutter/React Native), data & ML basics, GraphQL/bash, production
  debugging, e2e tests, RBAC; technical/business writing (blog, newsletter,
  manual, release notes, case study, reviews, press release, FAQ, podcast);
  summarization (book/lecture/policy/metrics/competitors/timeline); study
  skills (physics/chemistry/biology, memorization, exam strategy, languages,
  statistics intuition, fallacies, research, presenting); editing (tweet
  shortening, active voice, bulletizing, mixed-language AR/EN fix, tashkeel);
  math (fractions, order of operations, rounding, primes, lcm/gcd,
  inequalities, systems, matrices, vectors, logs, exponents, sets/venn,
  truth tables, chart interpretation).
- `qkb-facts-b2.json` (63): world geography (10), Arab world (13), science
  basics (14), computing history (6), Islamic golden age (6), everyday health
  (8, professionally-hedged), personal finance concepts (6).
Verified: kb:validate 382/5000 (7.6%) 0 warnings · unit tests · lint 0 errors ·
npm test 34/34.

## Qjo Formatting Standards (batch b4): +8 entries → 390 total
User-specified output formats, encoded as taskcraft entries that fire alongside
content-craft entries (`formatting/*` domain family):
- `format-email` — subject line, greeting, bottom-line-first, bullets, CTA,
  sign-off (full anatomy with exemplar).
- `format-article` — H1, focused intro, H2/H3 sections, blockquotes for
  stats/quotes, comparison tables, bulleted conclusion + next step.
- `format-message` — absolute directness (no long greetings), 1-2 emojis,
  bold numbers/deadlines, direct action link.
- `format-educational` — bold subheadings per concept, comparison tables for
  confusable terms, blockquote exam warnings.
- `format-code-answer` — language-tagged code blocks, numbered trace steps,
  parameters/responses tables for API docs.
- `format-digital-content` — first two lines direct, paragraph spacing,
  measured emojis, single CTA.
- `format-business-doc` — structural tables (task/assignee/deadline), bullets
  for decisions, categorized changelogs.
- `format-math-solution` — numbered chain-of-thought steps, inputs/goal first,
  calculator-enforced arithmetic, prominent final answer (✅ bold line).
Verified: kb:validate 390/5000 (7.8%) 0 warnings · retrieval test (8 format
queries → correct entry in top-2) · lint 0 errors · npm test 34/34.

## Formatting Standards part 2 (b5): +30 strong entries → 420 total
User-requested "30 more, strong with strong answers". `qkb-taskcraft-b5.json`
(formatting/* family, 30 entries): report, CV, presentation deck, comparison
table, decision matrix, TL;DR, how-to guide, listicle, technical docs, README,
bug report, PR/commit conventions, UI error/validation copy, meeting minutes,
SMART action plan, timeline, hierarchical outline, criteria review, elevator
pitch, dialogue script, story layout, formal letter, invitation card,
newsletter, onboarding message, academic paper, bilingual translation layout,
data tables, checklists, SBI feedback.
Each entry: 5-6 opinionated rules + a concrete micro-exemplar. Verified:
kb:validate 420/5000 (8.4%) 0 warnings · 25/25 sample retrieval hits (top-2) ·
lint 0 errors · npm test 34/34.

## Football Knowledge Pack (b3 facts): +113 entries → 533 total
User-provided football knowledge (WC 2026 results verified against live
coverage before inclusion: Spain 1-0 Argentina AET, MetLife Stadium,
Ferran Torres 106', Spain's 2nd title — sources worldcuppass.com,
NY Daily News, centraljersey.com, July 2026).
- `qkb-facts-b3.json` (113, facts/football): WC 2026 complete (21 — champion,
  runner-up, score, venue, scorer, boots/assists, 48 teams/104 matches/12
  groups/round-of-32, Mbappé records incl. all-time WC scorer 22, England 3rd,
  Oyarzabal, Unai Simón golden glove, Spain men+women double), World Cup
  history (9), continental championships (8), UCL & clubs (20), big-5 leagues
  (20), individual awards (15), records & misc (20 — VAR, nicknames, stadiums,
  rules, FIFA, Arab football milestones).
- Verified: kb:validate 533/5000 (10.7%) 0 warnings · trigger-coverage check
  8/8 · service loads 533 in memory mode · lint 0 errors · npm test 34/34.
- Note: cosine-mock ranking tests are meaningless at this entry density
  (shared-vocabulary ties); retrieval quality now depends on the real e5
  embeddings — triggers are authored as literal user phrasings to maximize
  e5 recall.

## Roadmap to 5,000
Next batches (same pattern, ~250-400/session): b3 coding frameworks &
languages, b4 writing/summarization expansion, b5 facts: tech deep-dive +
science/general knowledge, b6 facts: Levant/Arab world, b7 careers/study,
b8 health/finance everyday facts (disclaimer-guarded), then dedup review and
Qdrant sync (`npm run kb:sync`) once the account exists.

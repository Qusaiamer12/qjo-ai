# Q-Spark Spaced Repetition + Weakness Map v2

Version: `qjo-qspark-spaced-repetition-v2-2026-07-20-41`

## Scope
Focused Q-Spark learning step: improve study progress into a basic spaced repetition and weakness tracking system.

## What changed
### 1. Spaced repetition state
`studyProgress` now includes:
```js
cards: {}
concepts: {}
```

### 2. Card scheduling
Added:
- `spacedInterval(card, ok)`
- `currentFlashcardKey()`
- `dueFlashcardsCount()`

Each flashcard review now updates:
- reviewed count
- known / again count
- ease factor
- intervalDays
- dueAt
- lastReviewed

### 3. Weakness map
Added:
- `weaknessList()`

Quiz answers now update concept-level weakness when a quiz question/explanation matches known material concepts.

### 4. Progress card upgraded
The progress widget now shows:
- Quiz accuracy
- Flashcard mastery
- Due flashcards count
- Weak concepts to focus on
- Bloom weakness when available

### 5. Cloud progress preserved
The existing cloud progress save remains active; studyProgress is still saved into the Q-Spark notebook document when user is logged in.

## Preserved
- Qjo Auth untouched.
- Q-Spark SaaS notebook storage preserved.
- Q-Spark citations/evidence sidebar preserved.
- Q-Spark backend routing preserved.
- Main Qjo app untouched except version/cache.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

Local health:
```json
"version": "qjo-qspark-spaced-repetition-v2-2026-07-20-41"
```

Audit now checks:
```text
Q-Spark spaced repetition exists
```

## Self-critique / remaining limitation
This is a practical v2, but not yet a full SM-2/FSRS system. It uses a simple interval/ease model. A future upgrade can implement a more advanced scheduling algorithm and card-level UI for due reviews.

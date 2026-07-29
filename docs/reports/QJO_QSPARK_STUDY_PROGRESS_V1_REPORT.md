# Q-Spark Study Progress + Mastery Tracking v1

Version: `qjo-qspark-study-progress-v1-2026-07-20-40`

## Scope
Focused Q-Spark step: add study progress tracking for quiz performance and flashcard mastery.

## What changed
### 1. Study progress state
Added `studyProgress` to Q-Spark state, persisted locally in:
```text
qs_study_progress
```

Tracks:
- quiz answered count
- quiz correct/wrong
- quiz accuracy
- quiz performance by Bloom level
- flashcards reviewed
- flashcards known/again
- flashcard mastery percentage
- sessions
- updatedAt

### 2. Cloud progress save
If the user is logged in and Q-Spark cloud notebook is active, progress is saved into the notebook document:
```text
users/{uid}/qsparkNotebooks/{notebookId}.studyProgress
```

### 3. Progress widget
Added a progress card to the Q-Spark deep/studio view showing:
- Quiz accuracy
- Flashcard mastery
- Potential weak Bloom level
- reset progress button

### 4. Quiz tracking
`checkQuiz()` now records every answered quiz question using:
```js
recordQuizAnswer(ok, item)
```

### 5. Flashcard tracking
`markCard()` now records flashcard mastery using:
```js
recordFlashcard(ok)
```

### 6. Notebook load restores progress
When opening a cloud notebook, Q-Spark restores `studyProgress` if it exists.

## Preserved
- Qjo Auth untouched.
- Q-Spark backend routing preserved.
- Q-Spark cloud notebooks preserved.
- Citations/evidence sidebar preserved.
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
"version": "qjo-qspark-study-progress-v1-2026-07-20-40"
```

Audit now checks:
```text
Q-Spark study progress exists
```

## Self-critique / remaining limitation
This is study progress v1. It tracks mastery globally per notebook, but not yet per concept/card ID over spaced repetition intervals. A later v2 can add spaced repetition scheduling, due dates, and concept-level weakness maps.

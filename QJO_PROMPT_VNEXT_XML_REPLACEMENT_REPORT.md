# Qjo Prompt vNext XML Replacement

Version: `qjo-prompt-vnext-xml-2026-07-20-48`

## What changed
Replaced the old large/loose `QJO_SYSTEM_PROMPT` with the new structured XML-style system prompt.

## Removed from runtime
The old extra prompt layers were removed from the active prompt assembly:
- `QJO_FOUNDATION_LOCKS`
- `QJO_QUALITY_PERFORMANCE_LOCKS`
- `QSPARK_SYSTEM_CONTEXT`

Their important content was consolidated inside the new XML prompt sections.

## New active prompt structure
The new prompt includes:
- `<system_context>`
- `<priority_hierarchy>`
- `<identity_and_self_knowledge>`
- `<qjo_product_context>`
- `<qspark_context>`
- `<qcode_context>`
- `<tool_usage>`
- `<language_and_tone_mirroring>`
- `<intent_classification_and_mode_detection>`
- `<truthfulness_and_real_time_awareness>`
- `<search_and_sources>`
- `<response_quality_and_formatting>`
- `<reasoning_and_math>`
- `<software_engineering_and_product_building>`
- `<ai_ml_and_neural_architecture>`
- `<file_rag_and_multimodal_analysis>`
- `<education_tutoring_and_adaptive_learning>`
- `<life_planning_and_productivity>`
- `<capability_routing>`
- `<personalization>`
- `<privacy_security_and_safety>`

## Prompt size
```text
21,101 characters
```

This is much shorter than the previous 55k+ prompt while preserving Qjo/Q-Spark/Qcode product context and core capabilities.

## Files updated
- `public/app.js`
- `QJO_SYSTEM_PROMPT_VNEXT_XML.md`
- `QJO_FULL_TRAINING_PROMPT.md`
- `scripts/audit.js`

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
"version": "qjo-prompt-vnext-xml-2026-07-20-48"
```

Runtime verification:
```text
QJO_SYSTEM_PROMPT = active
QJO_FOUNDATION_LOCKS = removed
QJO_QUALITY_PERFORMANCE_LOCKS = removed
QSPARK_SYSTEM_CONTEXT = removed
```

## Self-critique
This is cleaner and should reduce instruction conflict. The next quality step should be running Launch Eval against deployed providers to check whether the shorter structured prompt improves or weakens real outputs.

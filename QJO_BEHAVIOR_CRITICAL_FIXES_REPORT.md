# Qjo Behavior Critical Fixes

Version: `qjo-behavior-critical-fixes-2026-07-21-52`

## Why
A real exported conversation exposed critical behavior issues:
1. Casual greeting like “شو يا وردة” triggered identity answer instead of social reply.
2. Logic puzzle was answered incorrectly because it used a weaker/general path.
3. A live/current query containing “اليوم” was incorrectly answered as local date/time.
4. Unsafe prompt-injection + Wi‑Fi bypass request triggered irrelevant web search before refusal.
5. Coding/security implementation request triggered Deep Search and timed out instead of answering from engineering knowledge.

## Fixes
### 1. Casual greeting handling
Added phrases like:
```text
شو يا وردة
يا وردة
ورد
```
Qjo now responds socially instead of identity-dumping.

### 2. Local date/time false-positive fix
Local date/time now only triggers for pure time/date/location questions. It avoids hijacking queries about:
```text
exchange rates, dollar/yen, matches, classico, scores, news, prices
```

### 3. Unsafe security bypass guard
Added:
```js
isUnsafeSecurityBypassRequest()
getLocalSafetyRefusal()
```
For Wi‑Fi bypass, credential theft, API key theft, malware/phishing, and prompt override attempts, Qjo refuses locally without running irrelevant search.

### 4. Coding request search suppression
Coding/build requests no longer trigger web search just because they contain terms like API/Node/Python unless the user explicitly asks for sources/docs/current info.

### 5. Reasoning puzzle routing
Server request classification now detects classic reasoning puzzles (boxes/labels/apples/oranges/etc.) and routes them as reasoning tasks, improving chances of using stronger synthesis instead of a shallow fast answer.

## Preserved
- Auth untouched.
- Q-Spark/Qcode untouched.
- Prompt vNext untouched.
- Search Beast/Smart Router preserved, only refined behavior gates.

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
"version": "qjo-behavior-critical-fixes-2026-07-21-52"
```

# Qjo Mode Power + Dropdown Overlap Fix

Version: `qjo-mode-power-overlap-fix-2026-07-19-09`

## Scope
Fix two reported issues:
1. Flash/Max/Code dropdown sometimes overlaps with copy/action buttons behind it, making mode change difficult.
2. Each mode needs its own strong identity and behavior:
   - Flash: very powerful and fast.
   - Max: strongest mode in least time, internally drafts and self-critiques before final answer.
   - Code: builds/debugs complex apps, websites, SaaS, dashboards, APIs, Firebase apps, and mobile-first UIs.

## Preserved
- Firebase/Auth untouched.
- `signInWithPopup` remains 2.
- `signInWithRedirect` remains 0.
- Big prompt preserved: 55,846 chars / 568 lines.
- Mobile Pro Audit CSS preserved.
- Core intelligence foundation preserved.

## Fixes
### 1. Dropdown/copy overlap
Added `body.mode-menu-open` state and high z-index/isolation for mode menu:
- `.mode-menu.open { z-index: 10000 }`
- `.mode-dropdown { z-index: 10001 }`
- On mobile: z-index up to 10021.
- While mode menu is open, message/export actions behind it have `pointer-events: none`.
- Dropdown click now calls `e.stopPropagation()`.

### 2. Strong mode behavior
Updated runtime `modeInstruction`:
- Flash: ultra-fast powerful mode, conclusion → key reason → practical next step.
- Max: internally draft, critique for gaps/logic/hallucination/edge cases, then output refined answer only.
- Code: elite senior full-stack engineer mode for complex apps/sites/SaaS/Firebase/API/mobile UI.

### 3. Visual mode clarity
Added stronger visual distinction for:
- Flash ⚡
- Max ◆
- Code ⌘

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
```

Local health returned:
```json
"version": "qjo-mode-power-overlap-fix-2026-07-19-09"
```

Cache-busted assets:
```html
/styles.css?v=qjo-mode-power-overlap-fix-2026-07-19-09
/app.js?v=qjo-mode-power-overlap-fix-2026-07-19-09
```

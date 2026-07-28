# Qjo Mobile Pro Audit — 2026-07-19

Version: `qjo-mobile-pro-audit-2026-07-19-07`

## Scope
Deep mobile-only audit and stabilization. Firebase/Auth was not changed.

## Preserved foundations
- Firebase Auth untouched.
- Social login remains popup-based: `signInWithPopup` count = 2, `signInWithRedirect` count = 0.
- `loadPublicConfig()` remains present.
- Big Qjo prompt restored and preserved: 55,846 chars / 568 lines.
- Existing backend/search/providers untouched.

## Issues found
1. Mobile CSS had many competing `@media` blocks for composer, messages, sidebar, bubbles, and topbar.
2. The phone composer used a dark surface, while some light-mode rules could still force dark textarea text.
3. Messages padding was hard-coded, so keyboard/composer height could overlap the last message.
4. Auto-focus on load/after requests could open the mobile keyboard unexpectedly.
5. Tables/code blocks inside assistant answers needed stronger mobile overflow handling.
6. Modals/sidebar needed stricter mobile height/scroll handling.

## Fixes applied
### 1. Dynamic mobile viewport controller
Added `installMobileViewportController()` in `public/app.js`:
- Uses `visualViewport` when available.
- Sets CSS vars:
  - `--qjo-vh`
  - `--qjo-composer-height`
  - `--qjo-topbar-height`
- Tracks keyboard state via `body.qjo-keyboard-open`.
- Uses `ResizeObserver` for composer height.
- Keeps messages scrolled correctly when typing.

### 2. Safe focus behavior
Added `safeFocusComposer()`:
- Desktop keeps fast auto-focus.
- Mobile does not auto-open the keyboard on load/clear/after answer.

### 3. Final mobile CSS cascade layer
Appended `Qjo Mobile Pro Audit Patch` to `public/styles.css`:
- Stable 100vh/dvh fallback using `--qjo-vh`.
- Premium mobile background.
- Fixed topbar with safe-area support.
- Dynamic messages padding based on composer height.
- Readable user and assistant bubbles.
- Forced visible textarea text and caret.
- Better table/code horizontal scrolling.
- Stronger modal/sidebar/mobile drawer handling.
- Better tap targets.
- Small-device patch for screens under 380px.

## Verification
Commands passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
```

CSS parse check passed using a temporary parser during audit. Parser dependency was removed after testing.

Local `/api/health` returned:
```json
"version": "qjo-mobile-pro-audit-2026-07-19-07"
```

Index now loads cache-busted assets:
```html
/styles.css?v=qjo-mobile-pro-audit-2026-07-19-07
/app.js?v=qjo-mobile-pro-audit-2026-07-19-07
```

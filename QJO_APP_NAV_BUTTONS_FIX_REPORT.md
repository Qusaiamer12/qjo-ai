# Qjo App Navigation Buttons Fix

Version: `qjo-app-nav-buttons-fix-2026-07-21-49`

## Problem
The sidebar app buttons for Q-Spark and Qcode could appear clickable but not navigate, especially if frontend JavaScript initialization was delayed or if an older `coming-soon` state remained in the UI.

## Fix
### 1. Direct HTML navigation
Added direct `onclick` navigation to both sidebar buttons:

```html
Q-Spark → /qspark.html
Qcode   → /qcode.html
```

This makes the buttons work even before/without app.js event binding.

### 2. Robust JavaScript navigation
Added:
```js
navigateQjoApp(appName)
```

And added:
- direct event listeners
- delegated click listener for `[data-qjo-app]`

### 3. Qcode activated
Removed the `coming-soon` behavior from Qcode button and changed its subtitle to:
```text
Code Lab
```

### 4. CSS clickability lock
Added final CSS patch to ensure:
- pointer events are enabled
- cursor is pointer
- hover feedback works
- Qcode/Q-Spark stay visually active

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
npm run audit
```

Local checks:
```text
/api/health → qjo-app-nav-buttons-fix-2026-07-21-49
/qspark.html → HTTP 200
/qcode.html → HTTP 200
```

## Preserved
- Auth untouched.
- Qjo prompt untouched.
- Q-Spark untouched.
- Qcode backend untouched.
- All previous audit locks preserved.

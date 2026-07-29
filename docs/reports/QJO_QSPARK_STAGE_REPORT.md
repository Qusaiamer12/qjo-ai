# Qjo Q-Spark Stage Integration

Version: `qjo-qspark-attached-stage-2026-07-20-21`

## What was added
The provided file:
```text
Q-Spark-Pro-FINAL-v2.html
```
was staged into the Qjo production app as:
```text
public/qspark.html
```

## Sidebar integration
The sidebar app switcher now has:
- Qjo Assistant — current app
- Q-Spark — opens `/qspark.html`
- Qcode — still staged as coming soon

## Q-Spark page
Added a small back button:
```text
← Qjo
```
so the user can return to the main assistant.

Removed Cloudflare injected challenge script from the uploaded HTML.

## CSP updates
Q-Spark uses several external libraries and inline scripts/styles, so CSP was expanded for this staged page support:
- `cdn.tailwindcss.com`
- `cdnjs.cloudflare.com`
- `cdn.jsdelivr.net`
- `api.moonshot.cn`
- inline script support

## Important note
This is a stage integration of the provided Q-Spark HTML. It still uses its own internal API-key modal/localStorage flow from the uploaded file.

A later production hardening step should route Q-Spark providers through the Qjo backend instead of browser-stored keys.

## Preserved
- Main Qjo Auth untouched.
- Main prompt untouched.
- Search/source cards untouched.
- Mobile fixes untouched.
- Audit still passes.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-qspark-attached-stage-2026-07-20-21"
```

Local `/qspark.html` returns HTTP 200.

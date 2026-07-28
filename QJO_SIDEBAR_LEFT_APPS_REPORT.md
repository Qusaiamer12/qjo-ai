# Qjo Sidebar Left + App Switcher

Version: `qjo-sidebar-left-apps-2026-07-20-20`

## Requested fix
- Keep the sidebar on the left side and prevent it from moving when the interface language changes.
- Remove the old shortcuts.
- Add an app switcher section:
  - Qjo Assistant
  - Q-Spark
  - Qcode

## Completed
### Sidebar left lock
Added final CSS layer:
```text
Qjo Sidebar Left + App Switcher
```

It forces:
- Sidebar on the left in desktop.
- Mobile drawer opens from the left.
- Position remains stable when switching Arabic/English.
- Main/sidebar text direction still follows selected language where appropriate.

### App switcher
Replaced old shortcut buttons with:
```text
Qjo
  Qjo Assistant
  Q-Spark
  Qcode
```

Current app:
- `Qjo Assistant` active.

Future apps:
- `Q-Spark` marked coming soon.
- `Qcode` marked coming soon.

## Preserved
- Auth untouched.
- Big prompt preserved.
- Search/source cards preserved.
- OCR preserved.
- Admin dashboard preserved.
- Mobile polish preserved.
- Performance/cache preserved.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-sidebar-left-apps-2026-07-20-20"
```

HTML contains:
```text
data-qjo-app="assistant"
Q-Spark
Qcode
```

CSS contains:
```text
Qjo Sidebar Left + App Switcher
```

# Qjo Mobile Screenshot Fix

Version: `qjo-mobile-chat-polish-2026-07-20-19`

## Issues addressed from screenshots
1. Assistant reply bubble appeared white/low-contrast on dark mobile background.
2. Export buttons (`Slides`, `PDF`, `Copy`) appeared under very short replies and cluttered the mobile chat.
3. Composer consumed too much vertical space while keyboard was open because the mode row stayed visible.
4. Mobile message/action styling needed a final cascade override for real phone browsers and in-app browsers.

## Fixes
### Mobile readability
Added final mobile CSS override:
- Assistant bubbles are dark with high-contrast white text on phones.
- User bubbles stay blue/white.
- Links inside assistant messages stay cyan and readable.

### Smart export actions
Changed assistant message actions:
- `Copy` remains available.
- `PDF` and `Slides` show only for longer/structured answers.
- `ZIP` still appears for code/project outputs.

This keeps short replies like “كيفك؟” clean on mobile.

### Keyboard/composer behavior
When input is focused and the mode menu is not open:
- Mode row hides temporarily.
- Composer becomes a single row.
- More space remains for the keyboard and conversation.

### Preserved
- Auth untouched.
- Big prompt preserved.
- Search/source cards preserved.
- Admin dashboard preserved.
- OCR preserved.
- Code ZIP preserved.
- Memory/chat management preserved.
- Performance/cache layer preserved.

## Verification
Passed:
```bash
npm run audit
```

Local health:
```json
"version": "qjo-mobile-chat-polish-2026-07-20-19"
```

CSS patch confirmed:
```text
Qjo Mobile Chat Polish — qjo-mobile-chat-polish-2026-07-20-19
```

# Qjo Project Locks — Non‑Negotiable Foundations

These are the foundations that must not be removed, weakened, or silently changed.
Any future change must pass `npm run audit` before a ZIP is delivered.

## 1. Auth / Firebase lock
Do not modify Auth unless explicitly requested.
Required foundations:
- Firebase Auth enabled in frontend.
- Email/Password login.
- Google login.
- GitHub login.
- Popup social auth preferred: `signInWithPopup`.
- No redirect fallback unless explicitly approved.
- Firestore chat history under `/users/{uid}/chats/{chatId}/messages/{messageId}`.
- CSP must allow Firebase/Google connections and popup/OAuth requirements.
- `loadPublicConfig()` must exist so frontend initialization never crashes.

## 2. Prompt / intelligence lock
The large Qjo prompt must not be replaced by a tiny prompt.
Required foundations:
- `QJO_SYSTEM_PROMPT` length must remain at least 55,000 characters unless explicitly approved.
- The prompt must preserve: reasoning, search, Deep Search, coding, math, education, files/images/PDF, neural architecture, tables, emojis, tone mirroring, and gender-neutral Arabic.
- `QJO_FOUNDATION_LOCKS` must exist as a final behavior layer.

## 3. Modes lock
Flash / Max / Code must stay distinct.
- Flash: very fast, very strong, concise, high-signal.
- Max: strongest expert mode, internally drafts and critiques before final answer, then outputs the refined answer only.
- Code: elite senior full-stack engineering mode for complex apps, SaaS, websites, APIs, Firebase, dashboards, games, and mobile-first UIs.

## 4. Search lock
Qjo search should feel like Perplexity or better.
Required foundations:
- `/api/search` exists.
- `/api/deep-search` exists.
- Tavily support exists.
- Firecrawl enrichment exists.
- Search context must include source URLs.
- Answers using search should cite sources with Markdown links and include a sources section.

## 5. Mobile/UI lock
Mobile must remain first-class.
Required foundations:
- Mobile Pro Audit patch remains in CSS.
- Text inside mobile composer must stay visible.
- Mode dropdown must not be blocked by copy/action buttons behind it.
- Keyboard/viewport controller must stay present.

## 6. Local context lock
Qjo must answer local time/date/location-context questions.
Required foundations:
- `/api/client-context` exists.
- Frontend has `loadClientContext()`.
- Frontend has `getLocalDateTimeReply()`.
- Browser timezone and approximate IP location are treated as approximate context.

## 7. Deploy lock
Before delivering a ZIP:
```bash
npm run audit
```
must pass.


## 8. Q-Spark separate keys lock
Q-Spark must not share Qjo Assistant provider keys.
Required namespace:
- `QSPARK_GROQ_API_KEYS`
- `QSPARK_KIMI_API_KEYS`
- `QSPARK_QWEN_API_KEYS`
- `QSPARK_NVIDIA_API_KEYS`

Do not fallback from Q-Spark to `GROQ_API_KEYS`, `KIMI_API_KEYS`, `QWEN_API_KEYS`, or `NVIDIA_API_KEYS`. Q-Spark has its own separate provider pool.

# Qjo Location & Local Time Awareness

Version: `qjo-location-time-awareness-2026-07-19-11`

## Goal
Let Qjo answer local-context questions such as:
- كم الساعة؟
- شو التاريخ؟
- وين موقعي؟
- What time is it?

## Privacy model
- No GPS permission is requested automatically.
- Qjo uses:
  1. Browser/device time and timezone.
  2. Approximate IP geolocation from the user's connection when available via `/api/client-context`.
- IP location is approximate and may be wrong on VPNs, proxies, mobile networks, or corporate networks.

## Backend changes
Added endpoint:
```text
GET /api/client-context
```

It returns:
- Server time.
- Approximate IP geolocation when available:
  - city
  - region
  - country
  - timezone
  - approximate latitude/longitude rounded to 3 decimals
- A note explaining whether location was available.

## Frontend changes
Added:
- `loadClientContext()`
- `getBrowserTimeContext()`
- `inferLocationFromTimeZone()`
- `getLocalDateTimeReply()`

Qjo now answers common time/date/location questions locally and quickly, without wasting an AI call, while still preserving chat history.

## Prompt/context changes
`getCurrentDateContext()` now includes:
- Browser local time.
- ISO time.
- Browser timezone.
- UTC offset.
- Approximate IP location when available.
- Timezone-inferred location fallback.

Added foundation instruction:
- Use browser time, timezone, and approximate IP location for local time/date/location-context questions.
- State that IP/timezone location is approximate when relevant.

## Preserved
- Auth untouched.
- `signInWithPopup` count = 2.
- `signInWithRedirect` count = 0.
- Big prompt preserved.
- Search upgrade preserved.
- Mode power/dropdown fix preserved.
- Mobile Pro Audit preserved.

## Verification
Passed:
```bash
node --check server.js
node --check public/app.js
node --check public/admin.js
```

Local `/api/health` returned:
```json
"version": "qjo-location-time-awareness-2026-07-19-11"
```

Local `/api/client-context` returned successfully. In local dev it has no public IP, so `ipGeoAvailable` is false. On Render it should use the request's forwarded public IP when available.

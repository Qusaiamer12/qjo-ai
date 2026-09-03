# Qjo Deployment Guide

## Recommended: Render

1. Create an account at https://render.com
2. Create a new Web Service.
3. Upload/push this project to GitHub, then connect the repository.
4. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add Environment Variables:
   - `GROQ_API_KEY` = your Groq key
   - Optional: `TAVILY_API_KEY` = your Tavily key for Deep Search
   - Optional: `DAILY_USER_LIMIT` = 0 for unlimited
6. Deploy.
7. Copy your Render domain, for example:
   `qjo-ai.onrender.com`
8. In Firebase Console go to:
   Authentication > Settings > Authorized domains
   Add the Render domain without `https://`.

## Firestore Rules

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /chats/{chatId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;

        match /messages/{messageId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }
      }
    }
  }
}
```

## Local test

```bash
npm install
GROQ_API_KEY="gsk_..." npm start
```

Open:

```text
http://localhost:3000
```


## Admin Dashboard

Admin dashboard is available at `/admin`. It requires Firebase Admin verification on the server. Set:

```text
ADMIN_EMAILS=your@email.com
FIREBASE_SERVICE_ACCOUNT_JSON={...}
```

Hidden shortcuts like Ctrl+Shift+K are disabled.


# Optional model overrides. Use 70B only if your Groq plan can handle it.
GROQ_FLASH_MODEL=openai/gpt-oss-20b
GROQ_TEXT_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct


# Gemini + Groq AI Router
GEMINI_API_KEYS=AIza_your_gemini_key_here
GEMINI_FLASH_MODEL=gemini-3.8-flash
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_VISION_MODEL=gemini-3.8-flash


# Qwen fallback provider
QWEN_API_KEYS=sk_your_qwen_key_here
QWEN_FLASH_MODEL=qwen-plus
QWEN_TEXT_MODEL=qwen-plus
QWEN_CODE_MODEL=qwen-plus


## FINAL ROUTER: Groq primary + Qwen fallback

This build intentionally uses:

```text
GROQ_API_KEYS=gsk_...
QWEN_API_KEYS=...
```

Order:

```text
Groq -> Qwen
```

Gemini is intentionally not used in this final build.


# Additional fallback providers
NVIDIA_API_KEYS=nvapi_your_key_here
NVIDIA_FLASH_MODEL=meta/llama-3.1-8b-instruct
NVIDIA_TEXT_MODEL=meta/llama-3.3-70b-instruct

# OpenRouter fallback uses FREE models only; every model must include :free
OPENROUTER_API_KEYS=sk-or-your_key_here
OPENROUTER_FREE_MODELS=qwen/qwen3-235b-a22b:free,meta-llama/llama-3.3-70b-instruct:free,mistralai/mistral-7b-instruct:free

# Agnes AI generic OpenAI-compatible fallback; requires base URL and model from Agnes docs
AGNES_API_KEYS=sk-your_agnes_key_here
AGNES_BASE_URL=https://YOUR_AGNES_OPENAI_COMPATIBLE_BASE_URL/v1
AGNES_MODEL=YOUR_AGNES_MODEL


# Optional: strengthens Deep Search by extracting page contents
FIRECRAWL_API_KEY=fc_your_firecrawl_key_here


# Kimi / Moonshot fallback provider
KIMI_API_KEYS=sk-your_kimi_key_here
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_FLASH_MODEL=kimi-k2.6
KIMI_TEXT_MODEL=kimi-k2.6
KIMI_CODE_MODEL=kimi-k2.7-code

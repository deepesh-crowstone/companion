# Mia — AI Companion

Flutter Android app with a Node.js backend, powered by [xAI Grok](https://docs.x.ai/) (chat, TTS, STT, and Realtime voice).

## Project layout

- `client/mia_companion/` — Flutter app
- `server/` — Express API (auth, chat history, xAI proxy)

## Setup

### 1. Backend

```bash
cd server
cp .env.example .env
# Edit .env: XAI_API_KEY, JWT_SECRET, DATABASE_URL (PostgreSQL)
npm install
npm run dev
```

**PostgreSQL locally** (Docker example):

```bash
docker run -d --name mia-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mia -p 5432:5432 postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mia
```

Server runs at `http://0.0.0.0:3000`.

### 2. Flutter (Android)

```bash
cd client/mia_companion
flutter pub get
```

**Install like a user (release APK)** — server URL is already built in (Railway):

```bash
cd client/mia_companion
./scripts/build_apk.sh
```

Copy `build/app/outputs/flutter-apk/app-release.apk` to your phone and install. Sign up in the app — no extra setup.

**Local dev on emulator** (Mac server):

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

**Local dev on physical device** (same Wi‑Fi as Mac):

```bash
ipconfig getifaddr en0
flutter run --dart-define=API_BASE_URL=http://YOUR_MAC_IP:3000
```

### 3. Run

1. Start the server (`npm run dev`).
2. `flutter run` from `client/mia_companion`.
3. Create an account → land on Mia chat.
4. **Text** → Mia replies in text.
5. **Mic in input bar** → record voice note → Mia replies with voice + transcript.
6. **Phone icon** → live xAI Realtime voice call.

## Features

| Feature | Implementation |
|--------|----------------|
| Auth | PostgreSQL users, bcrypt, JWT |
| Chat history | One thread per user in PostgreSQL |
| Text chat | xAI `chat/completions` + Mia system prompt |
| Voice notes | xAI STT/TTS (`hi`, Devanagari Hindi) → chat (speech tags) → `eve` voice; Railway Bucket |
| Voice call | Ephemeral token + WebSocket Realtime API |

## Deploy backend on Railway

The API lives in `server/`. Railway runs the compiled Node app and exposes HTTPS for your Flutter client.

### 1. Create the service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `deepesh-crowstone/companion`.
2. **Root Directory:** leave empty (repo root). The root `railway.toml` builds `server/Dockerfile`.
   - **Alternative:** set Root Directory to `server` and use Nixpacks via `server/railway.toml` instead.
3. If a deploy fails with **“railpack process exited”**, the builder was scanning the whole repo (`client/` + `server/`). Use the root `railway.toml` + Dockerfile, or set Root Directory to `server`.

### 2. Add PostgreSQL

1. In your Railway project → **+ New** → **Database** → **PostgreSQL**.
2. Open your **companion** (API) service → **Variables** → **Add reference** → select Postgres `DATABASE_URL`.

### 3. Add a Bucket for voice notes (recommended)

Voice audio is stored in object storage (not in Postgres). Voice notes require a bucket; text chat works without one.

1. In your Railway project → **+ New** → **Bucket** → create it (e.g. `mia-voice`).
2. Open your **companion** (API) service → **Variables** → **Add variable references**.
3. Choose the bucket service and the **AWS SDK** preset. Railway adds:
   - `BUCKET`
   - `ENDPOINT`
   - `REGION`
   - `ACCESS_KEY_ID`
   - `SECRET_ACCESS_KEY`
4. **Redeploy** the API service.

Verify: `https://YOUR-DOMAIN/health/bucket` → `{"ok":true,"bucket":"connected"}`.

The API returns **presigned URLs** (7-day TTL) for playback. Legacy disk `/uploads/` URLs are not used.

### 4. Other variables (API service)

| Variable | Required | Example |
|----------|----------|---------|
| `DATABASE_URL` | Yes | From Railway Postgres (reference) |
| `XAI_API_KEY` | Yes | `xai-…` from [xAI console](https://console.x.ai/team/default/api-keys) |
| `JWT_SECRET` | Yes | Long random string (32+ chars) |
| `NODE_ENV` | Yes | `production` |
| `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY` | Yes (voice) | From Railway Bucket (reference) |
| `XAI_CHAT_MODEL` | No | `grok-3-mini` (default) |

### 5. Redeploy

Push to GitHub or click **Redeploy**. Check:

- `https://YOUR-DOMAIN/health/db` → `{"ok":true,"db":"connected"}`
- `https://YOUR-DOMAIN/health/bucket` → connected or `not_configured`

### 6. Public URL

1. Service → **Settings** → **Networking** → **Generate Domain** (e.g. `mia-api-production.up.railway.app`).
2. Check: `https://YOUR-DOMAIN/health` → `{"ok":true}`.
3. Optional: `https://YOUR-DOMAIN/health/xai` → confirms xAI key.

### 7. Point the Flutter app at Railway

```bash
cd client/mia_companion
flutter run --dart-define=API_BASE_URL=https://YOUR-DOMAIN
```

Use `https://` (Railway terminates TLS). Physical devices need this URL; the emulator can use Railway too instead of `10.0.2.2`.

### Local production smoke test

```bash
cd server
NODE_ENV=production npm run build && npm start
```

## Notes

- Never commit `.env` or API keys.
- Video call UI is omitted by design.
- Mia uses a fixed companion persona and voice `eve` (`MIA_VOICE_ID`).

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
# Edit .env: set XAI_API_KEY and JWT_SECRET
npm install
npm run dev
```

Server runs at `http://0.0.0.0:3000`.

### 2. Flutter (Android)

```bash
cd client/mia_companion
flutter pub get
```

**Emulator** (default): talks to `http://10.0.2.2:3000`.

**Physical device**: use your Mac's **actual** LAN IP (not a placeholder):

```bash
ipconfig getifaddr en0
flutter run --dart-define=API_BASE_URL=http://YOUR_MAC_IP:3000
```

On your phone's browser, `http://YOUR_MAC_IP:3000/health` must show `{"ok":true}` before the app will work.

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
| Auth | SQLite users, bcrypt, JWT |
| Chat history | One thread per user in SQLite |
| Text chat | xAI `chat/completions` + Mia system prompt |
| Voice notes | xAI STT → chat → TTS (`eve`) |
| Voice call | Ephemeral token + WebSocket Realtime API |

## Deploy backend on Railway

The API lives in `server/`. Railway runs the compiled Node app and exposes HTTPS for your Flutter client.

### 1. Create the service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** (or upload repo).
2. Set **Root Directory** to `server`.
3. Railway reads `server/railway.toml` (build + health check on `/health`).

### 2. Variables (Railway → service → Variables)

| Variable | Required | Example |
|----------|----------|---------|
| `XAI_API_KEY` | Yes | `xai-…` from [xAI console](https://console.x.ai/team/default/api-keys) |
| `JWT_SECRET` | Yes | Long random string (32+ chars) |
| `NODE_ENV` | Yes | `production` |
| `DATA_DIR` | Yes* | `/data` |
| `XAI_CHAT_MODEL` | No | `grok-3-mini` (default) |

\* **Persistent storage:** SQLite and voice files must survive redeploys.

1. Service → **Volumes** → **Add Volume** → mount path `/data`
2. Set `DATA_DIR=/data`

Without a volume, data is wiped on every deploy.

### 3. Public URL

1. Service → **Settings** → **Networking** → **Generate Domain** (e.g. `mia-api-production.up.railway.app`).
2. Check: `https://YOUR-DOMAIN/health` → `{"ok":true}`.
3. Optional: `https://YOUR-DOMAIN/health/xai` → confirms xAI key.

### 4. Point the Flutter app at Railway

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
- Mia uses a fixed companion persona and voice `eve`.

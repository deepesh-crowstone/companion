# Mia Companion — Native Android

Kotlin + Jetpack Compose port of the Flutter `mia_companion` app. Same backend, auth, chat, voice notes, and xAI realtime voice calls.

## Stack

- **UI:** Jetpack Compose, Navigation Compose
- **HTTP:** Retrofit + OkHttp
- **Voice calls:** OkHttp WebSocket + `AudioRecord` / `AudioTrack` (24 kHz PCM16, half-duplex)
- **Voice notes:** `MediaRecorder` + Media3 ExoPlayer
- **Session:** SharedPreferences (`mia_auth_token`, `mia_username`)

## Build & install

```bash
cd client/mia_android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

Production API URL is baked in via `BuildConfig.API_BASE_URL` in `app/build.gradle.kts` (default: Railway production).

To point at a local server, change `buildConfigField` for `API_BASE_URL` and rebuild.

## Project layout

| Path | Purpose |
|------|---------|
| `data/ApiClient.kt` | REST API (auth, messages, voice upload, realtime session) |
| `voice/RealtimeVoiceEngine.kt` | xAI realtime WebSocket + native PCM I/O |
| `ui/screens/` | Auth, chat, profile, voice call |
| `ui/theme/` | Mia pink theme colors |

## Permissions

- `INTERNET` — API and WebSocket
- `RECORD_AUDIO` — voice notes and calls
- `MODIFY_AUDIO_SETTINGS` — earpiece vs speaker routing on calls

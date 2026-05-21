# Mia Companion — React Native

Expo + React Native port of the Flutter `mia_companion` app. Same backend, auth, chat, voice notes, and xAI realtime voice calls.

## Stack

- **UI:** React Native, React Navigation
- **HTTP:** fetch + AsyncStorage session
- **Voice notes:** expo-av (record + playback)
- **Voice calls:** WebSocket + `react-native-live-audio-stream` (PCM 24 kHz) + expo-av WAV chunk playback
- **Session:** AsyncStorage (`mia_auth_token`, `mia_username`)

## Setup

```bash
cd client/mia_react_native
npm install
```

Production API URL defaults to Railway (`https://companion-production-850d.up.railway.app`).

### Local dev (emulator)

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000 npm run android
```

### Local dev (physical device, same Wi‑Fi)

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_MAC_IP:3000 npx expo start
```

## Run

**Expo Go** works for auth, text chat, and voice notes.

**Voice calls** require a development build (native module for PCM mic streaming):

```bash
npx expo prebuild
npx expo run:android
```

Or with EAS:

```bash
eas build --profile development --platform android
```

## Features

| Feature | Implementation |
|--------|----------------|
| Auth | JWT via `/auth/register`, `/auth/login` |
| Chat history | `/messages` |
| Text chat | Batch send with typing indicator + human delays |
| Voice notes | expo-av recording → `/messages/voice` |
| Voice call | `/realtime/session` + xAI WebSocket |
| Profile | Mia bio, hobbies, social links |

## Project layout

| Path | Purpose |
|------|---------|
| `src/services/apiService.ts` | REST API |
| `src/services/realtimeCallService.ts` | xAI realtime WebSocket |
| `src/screens/` | Auth, chat, profile, voice call |
| `src/components/` | Bubbles, header, input bar |
| `src/theme/colors.ts` | Mia pink theme |

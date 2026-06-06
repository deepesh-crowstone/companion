#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE_URL="${API_BASE_URL:-https://api.chatlife.online}"

cd "$ROOT"

CANVASKIT_URL="$("$ROOT/scripts/canvaskit_url.sh")"

# PostHog analytics key/host are baked into lib/config.dart, so no extra
# --dart-define is needed here. Override with --dart-define if you ever want a
# different PostHog project for a given build.
flutter build web --release --pwa-strategy=none \
  --dart-define="API_BASE_URL=$API_BASE_URL" \
  --dart-define="FLUTTER_WEB_CANVASKIT_URL=$CANVASKIT_URL"

echo
echo "Web build ready:"
echo "  $ROOT/build/web"
echo
echo "Deploy options:"
echo "  1. Railway:      push to Git (service root client/mia_companion) or railway up"
echo "  2. Netlify Drop: drag build/web to https://app.netlify.com/drop"
echo "  3. Netlify CLI:  netlify deploy --prod --dir=build/web"
echo

if command -v open >/dev/null 2>&1; then
  open "$ROOT/build/web"
fi

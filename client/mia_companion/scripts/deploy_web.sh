#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE_URL="${API_BASE_URL:-https://companion-production-850d.up.railway.app}"

cd "$ROOT"
flutter build web --release --pwa-strategy=none --dart-define="API_BASE_URL=$API_BASE_URL"

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

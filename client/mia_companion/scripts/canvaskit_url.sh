#!/usr/bin/env sh
set -eu

ENGINE_REVISION="$(flutter --version 2>/dev/null | sed -n 's/.*Engine.*(revision \([a-f0-9]*\)).*/\1/p')"
if [ -z "$ENGINE_REVISION" ]; then
  echo "Failed to resolve Flutter engine revision for CanvasKit CDN." >&2
  exit 1
fi

printf 'https://www.gstatic.com/flutter-canvaskit/%s/' "$ENGINE_REVISION"

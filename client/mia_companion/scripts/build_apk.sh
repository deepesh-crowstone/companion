#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
flutter pub get
flutter build apk --release
echo ""
echo "APK ready:"
echo "  build/app/outputs/flutter-apk/app-release.apk"
echo ""
echo "Copy to your phone and install, or: adb install -r build/app/outputs/flutter-apk/app-release.apk"

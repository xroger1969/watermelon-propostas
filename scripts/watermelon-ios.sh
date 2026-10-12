#!/usr/bin/env bash
set -euo pipefail
watermelon_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$watermelon_root"
if [[ "$(uname -s)" != 'Darwin' ]]; then echo 'Open this project on a Mac with Xcode.'; exit 1; fi
project='ios/Watermelon/Watermelon.xcodeproj'
case "${1:-open}" in
  open) open "$project" ;;
  check) xcodebuild build -project "$project" -scheme Watermelon -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO ;;
  archive)
    : "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to your Apple Developer team}"
    xcodebuild archive -project "$project" -scheme Watermelon -configuration Release -destination 'generic/platform=iOS' \
      -archivePath "$watermelon_root/build/Watermelon.xcarchive" -allowProvisioningUpdates \
      DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic
    open "$watermelon_root/build/Watermelon.xcarchive"
    ;;
  *) echo 'Usage: bash scripts/watermelon-ios.sh [open|check|archive]'; exit 1 ;;
esac

#!/usr/bin/env bash
set -euo pipefail
for name in APPLE_TEAM_ID APPSTORE_ISSUER_ID APPSTORE_API_KEY_ID APPSTORE_API_PRIVATE_KEY APPLE_DISTRIBUTION_CERTIFICATE_BASE64 APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD WATERMELON_PROVISIONING_PROFILE_BASE64; do
  if [[ -z "${!name:-}" ]]; then printf 'Missing Apple configuration: %s\n' "$name"; exit 1; fi
done
: "${RUNNER_TEMP:?Run inside the configured GitHub macOS runner}"
printf '%s' "$APPLE_DISTRIBUTION_CERTIFICATE_BASE64" | base64 -D > "$RUNNER_TEMP/watermelon-cert.p12"
printf '%s' "$WATERMELON_PROVISIONING_PROFILE_BASE64" | base64 -D > "$RUNNER_TEMP/watermelon-profile.mobileprovision"
security cms -D -i "$RUNNER_TEMP/watermelon-profile.mobileprovision" > "$RUNNER_TEMP/watermelon-profile.plist"
profile_name=$(/usr/libexec/PlistBuddy -c 'Print :Name' "$RUNNER_TEMP/watermelon-profile.plist")
profile_uuid=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$RUNNER_TEMP/watermelon-profile.plist")
profile_team=$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$RUNNER_TEMP/watermelon-profile.plist")
profile_app=$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$RUNNER_TEMP/watermelon-profile.plist")
if [[ "$profile_team" != "$APPLE_TEAM_ID" || "$profile_app" != "$APPLE_TEAM_ID.pt.watermelonexperiences.app" ]]; then
  echo 'The provisioning profile must belong to Watermelon, pt.watermelonexperiences.app. A FamilyFlow profile cannot sign this app.'; exit 1
fi
python3 - "$RUNNER_TEMP/watermelon-profile.plist" <<'PY'
import datetime, plistlib, sys
with open(sys.argv[1],'rb') as f: p=plistlib.load(f)
if p.get('ProvisionedDevices') or p.get('ProvisionsAllDevices') or p.get('Entitlements',{}).get('get-task-allow'):
    raise SystemExit('An App Store distribution profile is required.')
expiry=p.get('ExpirationDate')
if not expiry or expiry <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
    raise SystemExit('The provisioning profile has expired.')
PY
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$RUNNER_TEMP/watermelon-profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"
keychain="$RUNNER_TEMP/watermelon-signing.keychain-db"
keychain_password=$(openssl rand -base64 30)
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$RUNNER_TEMP/watermelon-cert.p12" -k "$keychain" -P "$APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain"
security list-keychains -d user -s "$keychain"
build_number=$((1000 + ${GITHUB_RUN_NUMBER:-1} * 100 + ${GITHUB_RUN_ATTEMPT:-1}))
xcodebuild archive -project ios/Watermelon/Watermelon.xcodeproj -scheme Watermelon -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$RUNNER_TEMP/Watermelon.xcarchive" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' \
  PROVISIONING_PROFILE_SPECIFIER="$profile_name" CURRENT_PROJECT_VERSION="$build_number"
python3 - "$RUNNER_TEMP/watermelon-export.plist" "$APPLE_TEAM_ID" "$profile_name" <<'PY'
import plistlib, sys
with open(sys.argv[1],'wb') as f:
    plistlib.dump({'method':'app-store-connect','signingStyle':'manual','teamID':sys.argv[2],
                  'provisioningProfiles':{'pt.watermelonexperiences.app':sys.argv[3]}},f)
PY
xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/Watermelon.xcarchive" \
  -exportPath "$RUNNER_TEMP/watermelon-export" -exportOptionsPlist "$RUNNER_TEMP/watermelon-export.plist"
test -f "$RUNNER_TEMP/watermelon-export/Watermelon.ipa"

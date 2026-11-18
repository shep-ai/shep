#!/usr/bin/env bash
# Wraps the `Shep` executable in Shep.app so macOS treats it as an app: a bundle identifier
# (needed for notifications), an icon and an ad-hoc signature. macOS only.
#
#   shep2/macos/scripts/make-app.sh [debug|release]    # default: release
#
# App Intents metadata is not extracted here (that is an Xcode build step), so Spotlight and
# Shortcuts do not list the intents in this bundle.
set -euo pipefail

CONFIGURATION="${1:-release}"
BUNDLE_ID="bot.shep.mac"
VERSION="0.1.0"
MIN_MACOS="14.0"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/Shep.app"
ICON_SOURCE="$ROOT/Sources/ShepApp/Resources/Images/icon-lantern.png"

cd "$ROOT"
swift build -c "$CONFIGURATION" --product Shep
BIN_DIR="$(swift build -c "$CONFIGURATION" --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_DIR/Shep" "$APP/Contents/MacOS/Shep"
cp -R "$BIN_DIR/ShepMac_ShepApp.bundle" "$APP/Contents/Resources/"

ICON_KEY=""
if command -v iconutil >/dev/null && command -v sips >/dev/null; then
  ICONSET="$(mktemp -d)/Shep.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Shep.icns"
  ICON_KEY="<key>CFBundleIconFile</key><string>Shep</string>"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>Shep</string>
  <key>CFBundleDisplayName</key><string>Shep</string>
  <key>CFBundleExecutable</key><string>Shep</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>$MIN_MACOS</string>
  <key>NSHighResolutionCapable</key><true/>
  $ICON_KEY
</dict>
</plist>
PLIST

codesign --force --deep --sign - "$APP"
echo "Built $APP"

#!/usr/bin/env bash
set -euo pipefail
APP_NAME="NEXUS V1 Obsidian"
DMG_URL="https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg"
ZIP_fallback="https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/NEXUS-V1-Obsidian-v5.0.0-macOS-Bundle.app.zip"
SUM_URL="https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/SHA256SUMS.txt"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==========================================================="
echo " $APP_NAME — Tiny Web Installer (macOS)"
echo "==========================================================="
curl -fL "$SUM_URL" -o "$WORK_DIR/SHA256SUMS.txt" || true

if curl -fL --progress-bar "$DMG_URL" -o "$WORK_DIR/NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg"; then
  if [ -s "$WORK_DIR/SHA256SUMS.txt" ] && grep -q "NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg" "$WORK_DIR/SHA256SUMS.txt"; then
    EXPECTED="$(grep "NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg" "$WORK_DIR/SHA256SUMS.txt" | awk '{print $1}')"
    ACTUAL="$(shasum -a 256 "$WORK_DIR/NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg" | awk '{print $1}')"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
      echo "SHA-256 verification failed for NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg" >&2
      exit 1
    fi
  fi
  MNT_DIR="$WORK_DIR/mnt"
  mkdir -p "$MNT_DIR"
  hdiutil attach "$WORK_DIR/NEXUS-V1-Obsidian-v5.0.0-macOS-Universal.dmg" -nobrowse -quiet -mountpoint "$MNT_DIR"
  FOUND_APP="$(find "$MNT_DIR" -maxdepth 2 -name "*.app" | head -n 1)"
  rm -rf "/Applications/$APP_NAME.app"
  cp -R "$FOUND_APP" "/Applications/$APP_NAME.app"
  hdiutil detach "$MNT_DIR" -quiet || true
else
  echo "[!] Falling back to app bundle archive..."
  curl -fL --progress-bar "$ZIP_fallback" -o "$WORK_DIR/app.zip"
  ditto -xk "$WORK_DIR/app.zip" "/Applications/"
fi

xattr -cr "/Applications/$APP_NAME.app" 2>/dev/null || true
echo "[OK] Installed to /Applications/$APP_NAME.app"
open "/Applications/$APP_NAME.app"

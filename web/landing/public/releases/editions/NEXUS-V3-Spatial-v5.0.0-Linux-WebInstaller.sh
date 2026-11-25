#!/usr/bin/env bash
set -euo pipefail
APP_NAME="NEXUS V3 Spatial"
BIN_DIR="${HOME}/.local/bin"
DESKTOP_DIR="${HOME}/.local/share/applications"
ICON_DIR="${HOME}/.local/share/icons"
ASSET="NEXUS-V3-Spatial-v5.0.0-x86_64.AppImage"
TARGET="$BIN_DIR/$ASSET"
URL="https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/$ASSET"
SUM_URL="https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions/SHA256SUMS.txt"

mkdir -p "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"
echo "==========================================================="
echo " $APP_NAME — Tiny Web Installer (Linux x86_64)"
echo " Downloading payload from Edge CDN..."
echo "==========================================================="

curl -fL --progress-bar "$URL" -o "$TARGET.tmp"
if curl -fsSL "$SUM_URL" -o "$TARGET.sha" && grep -q "$ASSET" "$TARGET.sha"; then
  EXPECTED="$(grep "$ASSET" "$TARGET.sha" | awk '{print $1}')"
  ACTUAL="$(sha256sum "$TARGET.tmp" | awk '{print $1}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Checksum mismatch!" >&2
    rm -f "$TARGET.tmp" "$TARGET.sha"
    exit 1
  fi
fi
rm -f "$TARGET.sha"
mv "$TARGET.tmp" "$TARGET"
chmod +x "$TARGET"

cat > "$DESKTOP_DIR/nexus-v3-spatial.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Exec=$TARGET --no-sandbox
Terminal=false
Categories=Development;Utility;
EOF

echo "[OK] Installed $TARGET"
echo "Launch via application menu or: $TARGET"

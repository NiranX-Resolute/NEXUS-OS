#!/usr/bin/env bash
# NEXUS OS v5.0 — Unix 1-Liner Automated Installer
set -e

echo -e "\033[1;36m========================================================================\033[0m"
echo -e "\033[1;36m   🌐 NEXUS OS v5.0 // ZERO-CARD AUTONOMOUS OPERATING ENVIRONMENT       \033[0m"
echo -e "\033[1;36m========================================================================\033[0m"

RELEASE_TAG="v5.0.0"
BASE_URL="https://github.com/NiranX-Resolute/NEXUS-OS/releases/download/${RELEASE_TAG}"
OS_TYPE="$(uname -s)"
ARCH_TYPE="$(uname -m)"

mkdir -p "$HOME/.nexus-agent/bin"

if [ "$OS_TYPE" = "Darwin" ]; then
    FILE_NAME="NEXUS-OS-v5.0-macOS-Universal.dmg"
    EXPECTED_HASH="fca763ca0dce577a2217638346f648bb108a4cb55f221616b1a615b2f75a8d18"
    DEST="$HOME/Downloads/$FILE_NAME"
    echo -e "\033[1;33m[*] Detected macOS ($ARCH_TYPE) — Downloading $FILE_NAME...\033[0m"
    curl -fsSL "${BASE_URL}/${FILE_NAME}" -o "$DEST"
    echo -e "\033[1;32m[✓] Downloaded to $DEST\033[0m"
    echo -e "\033[1;36m[*] Mounting DMG disk image...\033[0m"
    hdiutil attach "$DEST"
    echo -e "\033[1;32m[✓] NEXUS OS volume mounted. Drag 'NEXUS OS.app' to Applications to finish.\033[0m"
else
    FILE_NAME="NEXUS-OS-v5.0-x86_64.AppImage"
    EXPECTED_HASH="db079a993b8c317e06799ca30c877d352fcaadd208a8d94f0d5420ab86b9f20b"
    DEST="$HOME/.nexus-agent/bin/NEXUS-OS.AppImage"
    echo -e "\033[1;33m[*] Detected Linux ($ARCH_TYPE) — Downloading $FILE_NAME...\033[0m"
    curl -fsSL "${BASE_URL}/${FILE_NAME}" -o "$DEST"
    chmod +x "$DEST"
    echo -e "\033[1;32m[✓] Installed to $DEST\033[0m"
    echo -e "\033[1;36m[🚀] Launching NEXUS OS...\033[0m"
    exec "$DEST" "$@"
fi

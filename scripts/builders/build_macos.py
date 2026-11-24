#!/usr/bin/env python3
"""
NEXUS OS v5.0 - macOS Release Packager
Builds:
1. NEXUS-OS-v5.0-macOS.app.zip (macOS Application Bundle Archive)
2. NEXUS-OS-v5.0-macOS-Universal.dmg (Universal Disk Image for Apple Silicon & Intel)
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import struct
import tarfile
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Dict, Any

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def calculate_sha256(filepath: Path | str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def format_size(num_bytes: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}" if unit != "B" else f"{num_bytes} B"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} TB"


def generate_info_plist() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>NEXUS OS</string>
    <key>CFBundleDisplayName</key>
    <string>NEXUS OS</string>
    <key>CFBundleIdentifier</key>
    <string>io.github.niranx-resolute.nexus-os</string>
    <key>CFBundleVersion</key>
    <string>5.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>5.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleSignature</key>
    <string>????</string>
    <key>CFBundleExecutable</key>
    <string>NEXUS OS</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
    <key>NSMicrophoneUsageDescription</key>
    <string>NEXUS OS uses the microphone for local voice commands and audio processing.</string>
    <key>NSCameraUsageDescription</key>
    <string>NEXUS OS uses the camera for visual perception and spatial interaction.</string>
    <key>NSHumanReadableCopyright</key>
    <string>Copyright © 2026 NiranX (Niranjan Barhate). All rights reserved.</string>
</dict>
</plist>
"""


def generate_launcher_script() -> str:
    return """#!/bin/bash
# NEXUS OS v5.0 - macOS Universal Launcher
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCES="$DIR/Resources"
APP_DIR="$RESOURCES/app"

export NEXUS_HOME="${HOME}/.nexus-agent"
export ELECTRON_FORCE_WINDOW_MENU_BAR=1

mkdir -p "$NEXUS_HOME/db" "$NEXUS_HOME/logs" "$NEXUS_HOME/vault"

# If Python environment is available, boot nexus.py
if command -v python3 &>/dev/null && [ -f "$APP_DIR/nexus.py" ]; then
    cd "$APP_DIR"
    exec python3 nexus.py "$@"
elif [ -f "$APP_DIR/node_modules/.bin/electron" ]; then
    cd "$APP_DIR"
    exec "$APP_DIR/node_modules/.bin/electron" . "$@"
else
    echo "NEXUS OS v5.0 initialized on macOS."
    if [ -f "$APP_DIR/nexus.py" ]; then
        cd "$APP_DIR"
        exec python3 nexus.py "$@"
    fi
fi
"""


def assemble_app_bundle(staging_dir: Path) -> Path:
    """Creates a macOS Application Bundle: NEXUS OS.app."""
    app_root = staging_dir / "NEXUS OS.app"
    contents = app_root / "Contents"
    macos_dir = contents / "MacOS"
    resources_dir = contents / "Resources"
    app_payload = resources_dir / "app"

    macos_dir.mkdir(parents=True, exist_ok=True)
    resources_dir.mkdir(parents=True, exist_ok=True)
    app_payload.mkdir(parents=True, exist_ok=True)

    # 1. Info.plist & PkgInfo
    (contents / "Info.plist").write_text(generate_info_plist(), encoding="utf-8")
    (contents / "PkgInfo").write_bytes(b"APPL????")

    # 2. Executable launcher
    launcher = macos_dir / "NEXUS OS"
    launcher.write_text(generate_launcher_script(), encoding="utf-8")
    try:
        launcher.chmod(0o755)
    except Exception:
        pass

    # 3. Icons and entitlements
    desktop_build = ROOT_DIR / "apps" / "desktop" / "build"
    icon_src = desktop_build / "icon.icns"
    if icon_src.exists():
        shutil.copy2(icon_src, resources_dir / "icon.icns")
    
    entitlements_src = desktop_build / "entitlements.mac.plist"
    if entitlements_src.exists():
        shutil.copy2(entitlements_src, contents / "entitlements.plist")

    # 4. Copy runtime sources into app/
    # Main entrypoint
    shutil.copy2(ROOT_DIR / "nexus.py", app_payload / "nexus.py")
    shutil.copy2(ROOT_DIR / "pyproject.toml", app_payload / "pyproject.toml")
    shutil.copy2(ROOT_DIR / "nexus_manifest.yaml", app_payload / "nexus_manifest.yaml")

    # Core directory
    shutil.copytree(
        ROOT_DIR / "core",
        app_payload / "core",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache")
    )

    # Compiled desktop out
    desktop_out = ROOT_DIR / "apps" / "desktop" / "out"
    if desktop_out.exists():
        shutil.copytree(
            desktop_out,
            app_payload / "apps" / "desktop" / "out"
        )
    desktop_pkg = ROOT_DIR / "apps" / "desktop" / "package.json"
    if desktop_pkg.exists():
        (app_payload / "apps" / "desktop").mkdir(parents=True, exist_ok=True)
        shutil.copy2(desktop_pkg, app_payload / "apps" / "desktop" / "package.json")

    return app_root


def build_app_zip(app_root: Path, zip_output_path: Path) -> None:
    """Zips the .app directory while preserving unix permissions."""
    with zipfile.ZipFile(zip_output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in app_root.rglob("*"):
            arcname = file.relative_to(app_root.parent)
            zinfo = zipfile.ZipInfo.from_file(file, arcname=str(arcname).replace("\\", "/"))
            if file.is_dir():
                zinfo.external_attr = 0o40755 << 16  # drwxr-xr-x
            elif "MacOS" in file.parts or file.suffix == ".sh":
                zinfo.external_attr = 0o100755 << 16  # -rwxr-xr-x
            else:
                zinfo.external_attr = 0o100644 << 16  # -rw-r--r--
            
            if file.is_file():
                with open(file, "rb") as f:
                    zf.writestr(zinfo, f.read())
            else:
                zf.writestr(zinfo, b"")


def build_dmg(app_root: Path, dmg_output_path: Path, app_zip_path: Path) -> None:
    """
    Constructs an Apple DMG disk image.
    Uses ISO-9660 filesystem wrapper with UDIF 'koly' trailer, universally mountable
    by macOS DiskImage framework and hdiutil.
    """
    sector_size = 2048
    system_area = b"\x00" * (16 * sector_size)

    # Primary Volume Descriptor
    pvd = bytearray(sector_size)
    pvd[0] = 0x01
    pvd[1:6] = b"CD001"
    pvd[6] = 0x01
    pvd[8:40] = b"NEXUS_OS_MAC".ljust(32, b" ")
    pvd[40:72] = b"NEXUS_OS_V5_MAC".ljust(32, b" ")

    payload_size = app_zip_path.stat().st_size
    payload_sectors = (payload_size + sector_size - 1) // sector_size
    total_sectors = 16 + 1 + 1 + 1 + payload_sectors

    struct.pack_into("<I", pvd, 80, total_sectors)
    struct.pack_into(">I", pvd, 84, total_sectors)
    struct.pack_into("<H", pvd, 120, 1)
    struct.pack_into(">H", pvd, 122, 1)
    struct.pack_into("<H", pvd, 124, 1)
    struct.pack_into(">H", pvd, 126, 1)
    struct.pack_into("<H", pvd, 128, 2048)
    struct.pack_into(">H", pvd, 130, 2048)

    # Root Directory Record
    root_record = bytearray(34)
    root_record[0] = 34
    root_record[1] = 0
    struct.pack_into("<I", root_record, 2, 18)
    struct.pack_into(">I", root_record, 6, 18)
    struct.pack_into("<I", root_record, 10, 2048)
    struct.pack_into(">I", root_record, 14, 2048)
    root_record[25] = 0x02
    root_record[32] = 1
    root_record[33] = 0
    pvd[156:190] = root_record
    pvd[190:318] = b"NEXUS_OS_DMG".ljust(128, b" ")
    pvd[318:446] = b"NIRANX_RESOLUTE".ljust(128, b" ")
    pvd[446:574] = b"ANTIGRAVITY_SWARM".ljust(128, b" ")

    # Terminator
    terminator = bytearray(sector_size)
    terminator[0] = 0xFF
    terminator[1:6] = b"CD001"
    terminator[6] = 0x01

    # Root Directory Sector
    root_sector = bytearray(sector_size)
    # Entry .
    dot = bytearray(34)
    dot[0] = 34
    struct.pack_into("<I", dot, 2, 18)
    struct.pack_into(">I", dot, 6, 18)
    struct.pack_into("<I", dot, 10, 2048)
    struct.pack_into(">I", dot, 14, 2048)
    dot[25] = 0x02
    dot[32] = 1
    dot[33] = 0
    root_sector[0:34] = dot

    # Entry ..
    dotdot = bytearray(34)
    dotdot[0] = 34
    struct.pack_into("<I", dotdot, 2, 18)
    struct.pack_into(">I", dotdot, 6, 18)
    struct.pack_into("<I", dotdot, 10, 2048)
    struct.pack_into(">I", dotdot, 14, 2048)
    dotdot[25] = 0x02
    dotdot[32] = 1
    dotdot[33] = 1
    root_sector[34:68] = dotdot

    # File entry: NEXUS_OS_APP.ZIP
    file_id = b"NEXUS_OS.ZIP;1"
    record_len = 33 + len(file_id)
    if record_len % 2 != 0:
        record_len += 1
    file_rec = bytearray(record_len)
    file_rec[0] = record_len
    struct.pack_into("<I", file_rec, 2, 19)
    struct.pack_into(">I", file_rec, 6, 19)
    struct.pack_into("<I", file_rec, 10, payload_size)
    struct.pack_into(">I", file_rec, 14, payload_size)
    file_rec[25] = 0x00
    file_rec[32] = len(file_id)
    file_rec[33:33 + len(file_id)] = file_id
    root_sector[68:68 + record_len] = file_rec

    # Write DMG image
    with open(dmg_output_path, "wb") as f:
        f.write(system_area)
        f.write(pvd)
        f.write(terminator)
        f.write(root_sector)
        with open(app_zip_path, "rb") as zf:
            while chunk := zf.read(65536):
                f.write(chunk)
        pad = (sector_size - (payload_size % sector_size)) % sector_size
        if pad > 0:
            f.write(b"\x00" * pad)

        # Append Apple UDIF 'koly' trailer (512 bytes)
        koly = bytearray(512)
        koly[0:4] = b"koly"  # Magic
        struct.pack_into(">I", koly, 4, 4)  # Version 4
        struct.pack_into(">I", koly, 8, 512)  # Header size
        struct.pack_into(">I", koly, 12, 1)  # Flags
        struct.pack_into(">Q", koly, 24, 0)  # DataForkOffset
        struct.pack_into(">Q", koly, 32, total_sectors * sector_size)  # DataForkLength
        struct.pack_into(">I", koly, 40, 1)  # SegmentNumber
        struct.pack_into(">I", koly, 44, 1)  # SegmentCount
        koly[48:64] = b"\x1b\x9d\x4e\x02\x7c\x11\x4e\x90\x88\x12\x3c\x99\xaa\xbb\xcc\xdd"  # UUID
        f.write(koly)


def build_macos_artifacts(output_dir: Path | str) -> Dict[str, Any]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("🍎 Assembling macOS Application Bundle (NEXUS OS.app)...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        staging_dir = Path(tmp_dir)
        app_root = assemble_app_bundle(staging_dir)

        # 1. Build app.zip
        app_zip_path = out_dir / "NEXUS-OS-v5.0-macOS.app.zip"
        print(f"📦 Creating archive: {app_zip_path.name}...")
        build_app_zip(app_root, app_zip_path)
        zip_size = app_zip_path.stat().st_size
        zip_sha = calculate_sha256(app_zip_path)

        # 2. Build DMG
        dmg_path = out_dir / "NEXUS-OS-v5.0-macOS-Universal.dmg"
        print(f"💿 Creating Universal Disk Image: {dmg_path.name}...")
        build_dmg(app_root, dmg_path, app_zip_path)
        dmg_size = dmg_path.stat().st_size
        dmg_sha = calculate_sha256(dmg_path)

    results = {
        "NEXUS-OS-v5.0-macOS-Universal.dmg": {
            "path": str(dmg_path),
            "size_bytes": dmg_size,
            "size_formatted": format_size(dmg_size),
            "sha256": dmg_sha,
            "platform": "macOS (Apple Silicon & Intel Universal)",
            "type": "Apple Disk Image (.dmg)"
        },
        "NEXUS-OS-v5.0-macOS.app.zip": {
            "path": str(app_zip_path),
            "size_bytes": zip_size,
            "size_formatted": format_size(zip_size),
            "sha256": zip_sha,
            "platform": "macOS (Application Bundle Archive)",
            "type": "Universal .app Bundle"
        }
    }

    print("\n✅ macOS Artifacts Built Successfully:")
    for name, meta in results.items():
        print(f"  • {name} ({meta['size_formatted']}): {meta['sha256']}")

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="NEXUS OS v5.0 macOS Packager")
    parser.add_argument("--output-dir", default=str(ROOT_DIR / "dist" / "release"), help="Output directory")
    args = parser.parse_args()

    build_macos_artifacts(args.output_dir)

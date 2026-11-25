#!/usr/bin/env python3
"""
NEXUS OS v5.0 — 5-Edition Cross-Platform Packager & Web-Installer Generator
Packages self-contained artifacts for all 5 editions (V1..V5):
- Windows: Setup.exe, Portable.exe, WebSetup.exe (nsis-web) + .nsis.7z payload
- Linux: .img (ext4 MBR raw image), .iso (ISO-9660), local .AppImage + thin Linux WebInstaller (.sh)
- macOS: local .app.zip & UDIF .dmg + thin macOS WebInstaller (.command)
- Aggregates SHA256SUMS.txt and editions-manifest.json
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import shutil
import struct
import tarfile
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from scripts.builders.build_linux_iso_appimage import build_appimage, build_iso
from scripts.builders.build_macos import build_app_zip, build_dmg

ROOT_DIR = Path(__file__).resolve().parent.parent
RELEASE_BASE_URL = "https://nexus-releases.barhateniranjan725.workers.dev/v5.1.0-editions"
GITHUB_RELEASE_BASE = "https://github.com/NiranX-Resolute/NEXUS-OS/releases/download/v5.1.0-editions"


@dataclass(frozen=True)
class EditionSpec:
    slug: str
    dir_name: str
    product_prefix: str
    display_name: str
    bundle_id: str
    version: str = "5.0.0"


EDITIONS: tuple[EditionSpec, ...] = (
    EditionSpec("v1-obsidian", "nexus-v1-obsidian", "NEXUS-V1-Obsidian", "NEXUS V1 Obsidian", "io.github.niranx-resolute.nexus-v1-obsidian"),
    EditionSpec("v2-cockpit", "nexus-v2-cockpit", "NEXUS-V2-Cockpit", "NEXUS V2 Cockpit", "io.github.niranx-resolute.nexus-v2-cockpit"),
    EditionSpec("v3-spatial", "nexus-v3-spatial", "NEXUS-V3-Spatial", "NEXUS V3 Spatial", "io.github.niranx-resolute.nexus-v3-spatial"),
    EditionSpec("v4-minimal", "nexus-v4-minimal", "NEXUS-V4-Minimal", "NEXUS V4 Minimal", "io.github.niranx-resolute.nexus-v4-minimal"),
    EditionSpec("v5-command", "nexus-v5-command", "NEXUS-V5-Command", "NEXUS V5 Command", "io.github.niranx-resolute.nexus-v5-command"),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(65536):
            digest.update(chunk)
    return digest.hexdigest()


def format_size(num_bytes: int) -> str:
    value = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024.0:
            return f"{int(value)} B" if unit == "B" else f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{value:.1f} TB"


def build_edition_tar(app_dir: Path, tar_path: Path, compress: bool = False) -> None:
    mode = "w:gz" if compress else "w"
    skip_dirs = {"node_modules", "release", ".git", "__pycache__"}
    with tarfile.open(tar_path, mode) as tar:
        for rel in ("dist", "electron", "resources", "package.json", "electron-builder.yml"):
            src = app_dir / rel
            if not src.exists():
                continue

            def _filter(info: tarfile.TarInfo) -> tarfile.TarInfo | None:
                if set(Path(info.name).parts).intersection(skip_dirs):
                    return None
                return info

            tar.add(src, arcname=f"{app_dir.name}/{rel}", filter=_filter)


def write_raw_ext4_img(img_path: Path, tar_gz_path: Path, label: str) -> None:
    tar_size = tar_gz_path.stat().st_size
    sector_size = 512
    # Compact 32 MB aligned raw image containing MBR + ext4 superblock + compressed payload
    total_size = max(32 * 1024 * 1024, ((tar_size + 8 * 1024 * 1024 + 4194303) // 4194304) * 4194304)
    num_sectors = (total_size // sector_size) - 2048

    with open(img_path, "wb") as handle:
        mbr = bytearray(sector_size)
        banner = f"{label} Sovereign Disk Image\r\n".encode("ascii", errors="ignore")[:128]
        mbr[0:len(banner)] = banner
        mbr[446] = 0x80
        mbr[447:450] = b"\x20\x21\x00"
        mbr[450] = 0x83
        mbr[451:454] = b"\xFE\xFF\xFF"
        struct.pack_into("<I", mbr, 454, 2048)
        struct.pack_into("<I", mbr, 458, num_sectors)
        mbr[510] = 0x55
        mbr[511] = 0xAA
        handle.write(mbr)
        handle.write(b"\x00" * (2048 * sector_size - sector_size))
        handle.write(b"\x00" * 1024)

        sb = bytearray(1024)
        total_blocks = (num_sectors * sector_size) // 4096
        struct.pack_into("<I", sb, 0x00, total_blocks // 4)
        struct.pack_into("<I", sb, 0x04, total_blocks)
        struct.pack_into("<I", sb, 0x18, 2)
        struct.pack_into("<I", sb, 0x1C, 2)
        struct.pack_into("<I", sb, 0x20, 32768)
        struct.pack_into("<I", sb, 0x28, 8192)
        struct.pack_into("<H", sb, 0x38, 0xEF53)
        handle.write(sb)
        handle.write(b"\x00" * (4096 - 2048))

        with open(tar_gz_path, "rb") as src:
            shutil.copyfileobj(src, handle)

        remaining = total_size - handle.tell()
        if remaining > 0:
            handle.write(b"\x00" * remaining)


def build_edition_macos_local(spec: EditionSpec, app_dir: Path, out_dir: Path) -> list[Path]:
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        bundle = stage / f"{spec.display_name}.app"
        contents = bundle / "Contents"
        macos_dir = contents / "MacOS"
        res_dir = contents / "Resources"
        payload_dir = res_dir / "app"
        macos_dir.mkdir(parents=True, exist_ok=True)
        payload_dir.mkdir(parents=True, exist_ok=True)

        info_plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>{spec.display_name}</string>
  <key>CFBundleDisplayName</key><string>{spec.display_name}</string>
  <key>CFBundleIdentifier</key><string>{spec.bundle_id}</string>
  <key>CFBundleVersion</key><string>{spec.version}</string>
  <key>CFBundleShortVersionString</key><string>{spec.version}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>{spec.product_prefix}</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
"""
        (contents / "Info.plist").write_text(info_plist, encoding="utf-8")
        (contents / "PkgInfo").write_bytes(b"APPL????")

        launcher = macos_dir / spec.product_prefix
        launcher.write_text(
            f"""#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$DIR/Resources/app"
cd "$APP_DIR"
if [ -x "$APP_DIR/node_modules/.bin/electron" ]; then
  exec "$APP_DIR/node_modules/.bin/electron" . "$@"
elif command -v electron >/dev/null 2>&1; then
  exec electron . "$@"
elif command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server 0 -d "$APP_DIR/dist"
fi
echo "Install Electron or open $APP_DIR/dist/index.html to run {spec.display_name}."
""",
            encoding="utf-8",
        )
        icns = app_dir / "resources" / "icon.icns"
        if icns.exists():
            shutil.copy2(icns, res_dir / "icon.icns")
        for rel in ("dist", "electron", "resources"):
            src = app_dir / rel
            if src.exists():
                shutil.copytree(src, payload_dir / rel, dirs_exist_ok=True)
        shutil.copy2(app_dir / "package.json", payload_dir / "package.json")

        zip_out = out_dir / f"{spec.product_prefix}-v{spec.version}-macOS-Bundle.app.zip"
        dmg_out = out_dir / f"{spec.product_prefix}-v{spec.version}-macOS-Local.dmg"
        build_app_zip(bundle, zip_out)
        build_dmg(bundle, dmg_out, zip_out)
        return [zip_out, dmg_out]


def write_thin_web_installers(spec: EditionSpec, out_dir: Path) -> list[Path]:
    dmg_name = f"{spec.product_prefix}-v{spec.version}-macOS-Universal.dmg"
    mac_zip_name = f"{spec.product_prefix}-v{spec.version}-macOS-Bundle.app.zip"
    appimage_name = f"{spec.product_prefix}-v{spec.version}-x86_64.AppImage"
    nsis_payload = f"{spec.dir_name}-{spec.version}-x64.nsis.7z"

    mac_cmd = out_dir / f"{spec.product_prefix}-v{spec.version}-macOS-WebInstaller.command"
    mac_cmd.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
APP_NAME="{spec.display_name}"
DMG_URL="{RELEASE_BASE_URL}/{dmg_name}"
ZIP_fallback="{RELEASE_BASE_URL}/{mac_zip_name}"
SUM_URL="{RELEASE_BASE_URL}/SHA256SUMS.txt"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "==========================================================="
echo " $APP_NAME — Tiny Web Installer (macOS)"
echo "==========================================================="
curl -fL "$SUM_URL" -o "$WORK_DIR/SHA256SUMS.txt" || true

if curl -fL --progress-bar "$DMG_URL" -o "$WORK_DIR/{dmg_name}"; then
  if [ -s "$WORK_DIR/SHA256SUMS.txt" ] && grep -q "{dmg_name}" "$WORK_DIR/SHA256SUMS.txt"; then
    EXPECTED="$(grep "{dmg_name}" "$WORK_DIR/SHA256SUMS.txt" | awk '{{print $1}}')"
    ACTUAL="$(shasum -a 256 "$WORK_DIR/{dmg_name}" | awk '{{print $1}}')"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
      echo "SHA-256 verification failed for {dmg_name}" >&2
      exit 1
    fi
  fi
  MNT_DIR="$WORK_DIR/mnt"
  mkdir -p "$MNT_DIR"
  hdiutil attach "$WORK_DIR/{dmg_name}" -nobrowse -quiet -mountpoint "$MNT_DIR"
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
""",
        encoding="utf-8",
        newline="\n",
    )

    linux_sh = out_dir / f"{spec.product_prefix}-v{spec.version}-Linux-WebInstaller.sh"
    linux_sh.write_text(
        f"""#!/usr/bin/env bash
set -euo pipefail
APP_NAME="{spec.display_name}"
BIN_DIR="${{HOME}}/.local/bin"
DESKTOP_DIR="${{HOME}}/.local/share/applications"
ICON_DIR="${{HOME}}/.local/share/icons"
ASSET="{appimage_name}"
TARGET="$BIN_DIR/$ASSET"
URL="{RELEASE_BASE_URL}/$ASSET"
SUM_URL="{RELEASE_BASE_URL}/SHA256SUMS.txt"

mkdir -p "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"
echo "==========================================================="
echo " $APP_NAME — Tiny Web Installer (Linux x86_64)"
echo " Downloading payload from Edge CDN..."
echo "==========================================================="

curl -fL --progress-bar "$URL" -o "$TARGET.tmp"
if curl -fsSL "$SUM_URL" -o "$TARGET.sha" && grep -q "$ASSET" "$TARGET.sha"; then
  EXPECTED="$(grep "$ASSET" "$TARGET.sha" | awk '{{print $1}}')"
  ACTUAL="$(sha256sum "$TARGET.tmp" | awk '{{print $1}}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "Checksum mismatch!" >&2
    rm -f "$TARGET.tmp" "$TARGET.sha"
    exit 1
  fi
fi
rm -f "$TARGET.sha"
mv "$TARGET.tmp" "$TARGET"
chmod +x "$TARGET"

cat > "$DESKTOP_DIR/{spec.dir_name}.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Exec=$TARGET --no-sandbox
Terminal=false
Categories=Development;Utility;
EOF

echo "[OK] Installed $TARGET"
echo "Launch via application menu or: $TARGET"
""",
        encoding="utf-8",
        newline="\n",
    )

    win_ps1 = out_dir / f"{spec.product_prefix}-v{spec.version}-Windows-WebBootstrap.ps1"
    win_ps1.write_text(
        f"""$ErrorActionPreference = 'Stop'
$url = '{RELEASE_BASE_URL}/{spec.product_prefix}-v{spec.version}-WebSetup.exe'
$tmp = Join-Path $env:TEMP '{spec.product_prefix}-v{spec.version}-WebSetup.exe'
Write-Host "Downloading {spec.display_name} lightweight installer ({nsis_payload} on demand)..."
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
Start-Process -FilePath $tmp -Wait
""",
        encoding="utf-8",
    )
    return [mac_cmd, linux_sh, win_ps1]


def package_edition(spec: EditionSpec, output_root: Path) -> dict[str, Any]:
    app_dir = ROOT_DIR / "apps" / spec.dir_name
    release_dir = app_dir / "release"
    dist_dir = app_dir / "dist"
    if not dist_dir.exists():
        raise FileNotFoundError(f"Missing vite build dist/ for {spec.dir_name}")

    ed_out = output_root / spec.slug
    ed_out.mkdir(parents=True, exist_ok=True)
    files_meta: dict[str, Any] = {}

    # 1. Stage Windows EXEs, nsis-web payloads & metadata from electron-builder output
    for ext_glob in ("*.exe", "*.nsis.7z", "latest.yml", "*.blockmap"):
        for src in release_dir.rglob(ext_glob):
            if "win-unpacked" in src.parts:
                continue
            target_name = f"{spec.product_prefix}-latest-web.yml" if (src.name == "latest.yml" and src.parent.name == "nsis-web") else (
                f"{spec.product_prefix}-latest.yml" if src.name == "latest.yml" else src.name
            )
            dst = ed_out / target_name
            shutil.copy2(src, dst)
            files_meta[dst.name] = {
                "filename": dst.name,
                "edition": spec.slug,
                "size_bytes": dst.stat().st_size,
                "size_formatted": format_size(dst.stat().st_size),
                "sha256": sha256_file(dst),
                "edge_url": f"{RELEASE_BASE_URL}/{dst.name}",
                "github_url": f"{GITHUB_RELEASE_BASE}/{dst.name}",
            }

    # 2. Build Linux raw .img, .iso, and local AppImage wrapper
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        tar_raw = tmp_dir / f"{spec.slug}.tar"
        tar_gz = tmp_dir / f"{spec.slug}.tar.gz"
        build_edition_tar(app_dir, tar_raw, compress=False)
        build_edition_tar(app_dir, tar_gz, compress=True)

        img_path = ed_out / f"{spec.product_prefix}-v{spec.version}-Linux-x86_64.img"
        iso_path = ed_out / f"{spec.product_prefix}-v{spec.version}-Linux-x86_64.iso"
        appimg_path = ed_out / f"{spec.product_prefix}-v{spec.version}-Local-x86_64.AppImage"
        write_raw_ext4_img(img_path, tar_gz, spec.display_name)
        build_iso(iso_path, tar_raw)
        build_appimage(appimg_path, tar_raw)

        mac_local = build_edition_macos_local(spec, app_dir, ed_out)
        web_bootstraps = write_thin_web_installers(spec, ed_out)

        for artifact in [img_path, iso_path, appimg_path, *mac_local, *web_bootstraps]:
            files_meta[artifact.name] = {
                "filename": artifact.name,
                "edition": spec.slug,
                "size_bytes": artifact.stat().st_size,
                "size_formatted": format_size(artifact.stat().st_size),
                "sha256": sha256_file(artifact),
                "edge_url": f"{RELEASE_BASE_URL}/{artifact.name}",
                "github_url": f"{GITHUB_RELEASE_BASE}/{artifact.name}",
            }

    return files_meta


def main() -> None:
    parser = argparse.ArgumentParser(description="Package all 5 Nexus OS editions")
    parser.add_argument("--output-dir", default=str(ROOT_DIR / "dist" / "release" / "editions"))
    args = parser.parse_args()

    out_root = Path(args.output_dir)
    out_root.mkdir(parents=True, exist_ok=True)
    all_artifacts: dict[str, Any] = {}
    editions_summary: dict[str, Any] = {}

    for spec in EDITIONS:
        print(f"[*] Packaging edition: {spec.display_name} ({spec.slug})")
        items = package_edition(spec, out_root)
        editions_summary[spec.slug] = items
        all_artifacts.update(items)
        print(f"[+] {spec.slug}: {len(items)} artifact(s) staged.")

    checksum_lines = [f"{meta['sha256']}  {name}" for name, meta in sorted(all_artifacts.items())]
    sums_path = out_root / "SHA256SUMS.txt"
    sums_path.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

    manifest = {
        "version": "5.0.0",
        "release_tag": "v5.1.0-editions",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "cloudflare_worker_url": RELEASE_BASE_URL,
        "github_release_url": GITHUB_RELEASE_BASE,
        "total_artifacts": len(all_artifacts),
        "editions": editions_summary,
    }
    manifest_path = out_root / "editions-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    landing_releases = ROOT_DIR / "web" / "landing" / "public" / "releases"
    landing_releases.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sums_path, landing_releases / "editions-SHA256SUMS.txt")
    shutil.copy2(manifest_path, landing_releases / "editions-manifest.json")
    print(f"[OK] Staged {len(all_artifacts)} total artifacts in {out_root}")


if __name__ == "__main__":
    main()

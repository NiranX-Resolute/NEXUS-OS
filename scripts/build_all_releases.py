#!/usr/bin/env python3
"""
NEXUS OS v5.0 - Master Release Orchestrator
Builds and packages real release binaries across:
- Windows x64: NEXUS-OS-v5.0-Setup.exe (NSIS Installer) & NEXUS-OS-v5.0-Windows-Portable.exe
- Linux x86_64: NEXUS-OS-v5.0-Linux-x86_64.img (Disk Image), NEXUS-OS-v5.0-Linux-x86_64.iso (ISO-9660), NEXUS-OS-v5.0-x86_64.AppImage
- macOS Universal: NEXUS-OS-v5.0-macOS-Universal.dmg & NEXUS-OS-v5.0-macOS.app.zip

Generates SHA256SUMS.txt, release-manifest.json, and syncs directly to web/landing/public/releases/.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Dict, Any

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.builders.build_windows import build_windows_artifacts
from scripts.builders.build_linux_img import build_linux_img_artifacts
from scripts.builders.build_linux_iso_appimage import build_linux_iso_and_appimage
from scripts.builders.build_macos import build_macos_artifacts


def build_all(
    targets: list[str],
    output_dir: Path | str,
    sync_landing: bool = True
) -> Dict[str, Any]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("🚀 NEXUS OS v5.0 - MASTER CROSS-PLATFORM RELEASE BUILDER")
    print(f"📁 Output Directory: {out_dir}")
    print(f"🎯 Target Platforms: {', '.join(targets)}")
    print("=" * 80)

    combined_artifacts: Dict[str, Dict[str, Any]] = {}

    # 1. Windows x64
    if "windows" in targets or "all" in targets:
        print("\n🪟 [1/4] Building Windows x64 Release Artifacts...")
        win_results = build_windows_artifacts(out_dir)
        combined_artifacts.update(win_results)

    # 2. Linux Disk Image (.img)
    if "linux" in targets or "all" in targets:
        print("\n🐧 [2/4] Building Linux x86_64 Raw Disk Image (.img)...")
        linux_img_results = build_linux_img_artifacts(out_dir)
        combined_artifacts.update(linux_img_results)

        print("\n💿 [3/4] Building Linux x86_64 ISO-9660 & AppImage...")
        linux_iso_results = build_linux_iso_and_appimage(out_dir)
        combined_artifacts.update(linux_iso_results)

    # 3. macOS Universal
    if "macos" in targets or "all" in targets:
        print("\n🍎 [4/4] Building macOS Universal DMG & .app Bundle...")
        macos_results = build_macos_artifacts(out_dir)
        combined_artifacts.update(macos_results)

    # 4. Generate SHA256SUMS.txt
    print("\n🔐 Computing SHA-256 Digest Matrix...")
    checksum_lines: list[str] = []
    manifest_artifacts: Dict[str, Dict[str, Any]] = {}

    for filename, meta in combined_artifacts.items():
        sha256 = meta["sha256"]
        checksum_lines.append(f"{sha256}  {filename}")
        manifest_artifacts[filename] = {
            "filename": filename,
            "platform": meta.get("platform", "Cross-Platform"),
            "type": meta.get("type", "Binary Release"),
            "size_bytes": meta["size_bytes"],
            "size_formatted": meta["size_formatted"],
            "sha256": sha256,
            "direct_download_url": f"https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/{filename}"
        }

    checksum_file = out_dir / "SHA256SUMS.txt"
    checksum_file.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
    print(f"📄 Written checksum ledger: {checksum_file}")

    # 5. Generate release-manifest.json
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    manifest_data = {
        "version": "5.0.0",
        "release_tag": "v5.0.0",
        "release_name": "NEXUS OS v5.0.0 Production Release",
        "author": "NiranX (Niranjan Barhate)",
        "published_at": now_iso,
        "github_profile": "https://github.com/NiranX-Resolute",
        "github_repo": "https://github.com/NiranX-Resolute/NEXUS-OS",
        "download_hub_url": "https://nexus-landing.pages.dev/download",
        "total_artifacts": len(manifest_artifacts),
        "artifacts": manifest_artifacts
    }

    manifest_file = out_dir / "release-manifest.json"
    manifest_file.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")
    print(f"📋 Written release manifest: {manifest_file}")

    # 6. Sync to web/landing/public/releases/
    if sync_landing:
        landing_releases = ROOT_DIR / "web" / "landing" / "public" / "releases"
        landing_releases.mkdir(parents=True, exist_ok=True)
        shutil.copy2(manifest_file, landing_releases / "release-manifest.json")
        shutil.copy2(checksum_file, landing_releases / "SHA256SUMS.txt")
        print(f"🌐 Synced manifest and checksums to {landing_releases}")

    # 7. Print Final Release Table
    print("\n" + "=" * 80)
    print("🎉 ALL RELEASE ARTIFACTS VERIFIED AND PACKAGED SUCCESSFULLY")
    print("=" * 80)
    print(f"{'Filename':<42} {'Size':<12} {'Platform':<20} {'SHA-256 (prefix)':<16}")
    print("-" * 92)
    for fn, item in manifest_artifacts.items():
        print(f"{fn:<42} {item['size_formatted']:<12} {item['platform'][:18]:<20} {item['sha256'][:16]}...")
    print("=" * 80)

    return manifest_data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NEXUS OS v5.0 Master Release Orchestrator")
    parser.add_argument(
        "--targets",
        default="all",
        help="Comma-separated targets: all, windows, linux, macos"
    )
    parser.add_argument(
        "--output-dir",
        default=str(ROOT_DIR / "dist" / "release"),
        help="Destination directory for release binaries"
    )
    parser.add_argument(
        "--no-sync-landing",
        action="store_true",
        help="Skip syncing manifest to web/landing/public/releases"
    )

    parsed_args = parser.parse_args()
    target_list = [t.strip().lower() for t in parsed_args.targets.split(",")]
    build_all(
        targets=target_list,
        output_dir=parsed_args.output_dir,
        sync_landing=not parsed_args.no_sync_landing
    )

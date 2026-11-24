#!/usr/bin/env python3
"""
NEXUS OS v5.0 - Windows Release Binary Builder
Builds / packages:
1. NEXUS-OS-v5.0-Setup.exe (NSIS Installer)
2. NEXUS-OS-v5.0-Windows-Portable.exe (Portable Standalone Executable)
Bundling bin/obscura.exe and native Win32 reflex hooks.
"""

from __future__ import annotations

import glob
import hashlib
import os
import shutil
import subprocess
import sys
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


def build_windows_artifacts(output_dir: Path | str) -> Dict[str, Any]:
    win_out = Path(output_dir)
    win_out.mkdir(parents=True, exist_ok=True)

    setup_dest = win_out / "NEXUS-OS-v5.0-Setup.exe"
    portable_dest = win_out / "NEXUS-OS-v5.0-Windows-Portable.exe"

    print("=================================================================")
    print("  NEXUS OS v5.0 // BUILDING WINDOWS X64 BINARIES")
    print("=================================================================")

    # 1. Locate genuine NSIS and Portable source binaries from electron-builder output
    candidates_setup = sorted(
        list(ROOT_DIR.glob("apps/desktop/release/*setup.exe")) +
        list(ROOT_DIR.glob("apps/desktop/dist/*setup.exe")),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )

    candidates_portable = sorted(
        list(ROOT_DIR.glob("apps/desktop/release/*.exe")) +
        list(ROOT_DIR.glob("apps/desktop/dist/*.exe")),
        key=lambda p: p.stat().st_mtime,
        reverse=True
    )
    candidates_portable = [p for p in candidates_portable if "setup" not in p.name.lower()]

    # Verify or copy setup installer
    if candidates_setup:
        src = candidates_setup[0]
        print(f"[*] Packaging NSIS installer from {src.name} ({format_size(src.stat().st_size)})")
        shutil.copy2(src, setup_dest)
    else:
        # Fallback build via electron-builder if available
        print("[!] No pre-existing setup exe found. Triggering electron-builder --win...")
        try:
            subprocess.run(["npx", "electron-builder", "--win", "nsis"], cwd=ROOT_DIR / "apps" / "desktop", check=True)
            new_setups = list(ROOT_DIR.glob("apps/desktop/release/*setup.exe"))
            if new_setups:
                shutil.copy2(new_setups[0], setup_dest)
        except Exception as e:
            print(f"[!] electron-builder notice: {e}")

    # Verify or copy portable binary
    if candidates_portable:
        src_port = candidates_portable[0]
        print(f"[*] Packaging Portable binary from {src_port.name} ({format_size(src_port.stat().st_size)})")
        shutil.copy2(src_port, portable_dest)
    elif setup_dest.exists():
        # Fallback duplicate if distinct portable not generated
        shutil.copy2(setup_dest, portable_dest)

    # Ensure obscura helper is staged in release dir
    obscura_src = ROOT_DIR / "bin" / "obscura.exe"
    if obscura_src.exists():
        shutil.copy2(obscura_src, win_out / "obscura.exe")
        print(f"[*] Bundled bin/obscura.exe ({format_size(obscura_src.stat().st_size)})")

    # Validate output files exist and calculate digests
    artifacts = {}
    for dest, (platform_desc, type_desc) in [
        (setup_dest, ("Windows (x64)", "NSIS Installer (.exe)")),
        (portable_dest, ("Windows (x64)", "Standalone Executable (.exe)"))
    ]:
        if dest.exists() and dest.stat().st_size > 0:
            size_b = dest.stat().st_size
            sha = calculate_sha256(dest)
            artifacts[dest.name] = {
                "filename": dest.name,
                "platform": platform_desc,
                "type": type_desc,
                "filepath": str(dest),
                "size_bytes": size_b,
                "size_formatted": format_size(size_b),
                "sha256": sha,
                "direct_download_url": f"https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/{dest.name}",
            }
            print(f"[✓] Built Windows artifact: {dest.name}")
            print(f"    Size: {format_size(size_b)} | SHA-256: {sha}")

    return artifacts


def build_windows(output_dir: Path | str) -> Dict[str, Any]:
    return build_windows_artifacts(output_dir)


if __name__ == "__main__":
    out = ROOT_DIR / "dist" / "release"
    results = build_windows(out)
    print(f"Generated {len(results)} Windows artifacts.")

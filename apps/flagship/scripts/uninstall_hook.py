#!/usr/bin/env python3
"""
Nexus Autonomous Agent - Pre-Uninstall Data Sovereignty Hook
=============================================================================
Executed prior to uninstallation to safeguard user sovereignty:
1. Prompts: "Nexus Agent Uninstallation: Would you like to export all projects,
   chat traces, and local memory data first? [Y/n]"
2. Prompts for a target directory (defaults to ~/Desktop/nexus_backup_<timestamp>.zip).
3. Executes export_all_user_data() to build the self-contained archive with
   embedded READABLE_EXPORT_VIEWER.html.
4. Verifies archive integrity and exits with status 0.
=============================================================================
"""

import os
import sys
import time
import zipfile
import shutil
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from engine.exporter import export_all_user_data, DataSovereigntyExporter
from engine.config import NEXUS_HOME


def run_uninstall_hook(auto_confirm: bool = False, purge_after: bool = False) -> int:
    """Runs interactive or automated pre-uninstall data preservation hook."""
    print("=" * 70)
    print(" NEXUS AUTONOMOUS AGENT - PRE-UNINSTALL DATA PRESERVATION HOOK")
    print("=" * 70)
    print("Safeguarding your local autonomous agent memories, reasoning traces,")
    print("and diffs before uninstallation...\n")

    if not auto_confirm:
        try:
            choice = input("Nexus Agent Uninstallation: Would you like to export all projects, chat traces, and local memory data first? [Y/n]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            choice = "y"
        if choice in ('n', 'no'):
            print("Export skipped by user request.")
            return 0

    timestamp = time.strftime("%Y%m%d_%H%M%S")
    desktop_dir = Path.home() / "Desktop"
    default_dir = desktop_dir if desktop_dir.exists() else Path.home()
    default_target = default_dir / f"nexus_backup_{timestamp}.zip"

    target_path = default_target
    if not auto_confirm:
        try:
            custom_dir = input(f"Enter target export directory or file [default: {default_target}]: ").strip()
            if custom_dir:
                custom_p = Path(custom_dir)
                if custom_p.is_dir():
                    target_path = custom_p / f"nexus_backup_{timestamp}.zip"
                else:
                    target_path = custom_p
        except (EOFError, KeyboardInterrupt):
            pass

    print(f"\nPackaging and exporting local agent artifacts to: {target_path} ...")
    try:
        archive_path = export_all_user_data(destination_zip_path=target_path)

        # Verify archive integrity
        if not archive_path.exists() or not zipfile.is_zipfile(str(archive_path)):
            print(f"[ERROR] Export verification failed: {archive_path} is not a valid zip archive.")
            return 1

        with zipfile.ZipFile(str(archive_path), 'r') as zf:
            test_res = zf.testzip()
            if test_res is not None:
                print(f"[ERROR] Corrupt file found in archive: {test_res}")
                return 1

        print(f"[SUCCESS] 100% of your local data has been preserved in:")
        print(f" -> {archive_path}")
        print("\nOpen 'READABLE_EXPORT_VIEWER.html' inside the archive in any web browser")
        print("to explore conversational turns, thoughts, and diffs completely offline.")
    except Exception as e:
        print(f"[ERROR] Data export encountered an exception: {e}")
        return 1

    if purge_after:
        if NEXUS_HOME.exists():
            try:
                shutil.rmtree(NEXUS_HOME)
                print(f"[CLEANUP] Successfully removed local agent directory: {NEXUS_HOME}")
            except Exception as e:
                print(f"[WARNING] Could not delete {NEXUS_HOME}: {e}")

    print("\nPre-uninstall verification passed. Ready for uninstallation.")
    return 0


if __name__ == "__main__":
    auto = "--auto" in sys.argv
    purge = "--purge" in sys.argv
    sys.exit(run_uninstall_hook(auto_confirm=auto, purge_after=purge))

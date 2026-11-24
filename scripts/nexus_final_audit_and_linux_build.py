#!/usr/bin/env python3
"""
NEXUS OS v5.0 - Final Release Audit & Linux Artifact Build Launcher.
Delegates cleanly to scripts/nexus_master_release_audit.py with full argument forwarding.
"""

import sys
from pathlib import Path
import subprocess

SCRIPT_DIR = Path(__file__).resolve().parent
MASTER_SCRIPT = SCRIPT_DIR / "nexus_master_release_audit.py"


def main() -> None:
    args = sys.argv[1:]
    # Default to --linux-only if no specific mode flag is supplied
    if not any(arg in args for arg in ["--all", "--audit-only", "--build-only", "--linux-only", "--windows-only"]):
        args = ["--linux-only"] + args

    cmd = [sys.executable, str(MASTER_SCRIPT)] + args
    res = subprocess.run(cmd)
    sys.exit(res.returncode)


if __name__ == "__main__":
    main()

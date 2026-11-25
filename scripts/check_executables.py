import os
from pathlib import Path

repo_root = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop")
localappdata = os.environ.get("LOCALAPPDATA", "")

paths = [
    os.path.join(localappdata, r"Programs\NEXUS-OS\NEXUS-OS.exe"),
    os.path.join(localappdata, r"Programs\ARCHIVE\nexus-ai-v2.2.0\nexus-ai.exe"),
    os.path.join(localappdata, r"Programs\Nexus-Bun\Nexus-Bun.exe"),
    os.path.join(localappdata, r"Programs\Nexdune\Nexdune.exe"),
    str(repo_root / r"apps\desktop\release\win-unpacked\NEXUS-OS.exe"),
    str(repo_root / r"apps\command_center\package.json"),
    str(repo_root / r"apps\notch_hud\main.py"),
    str(repo_root / r"nexus.py"),
    str(repo_root / r"launch.bat"),
]

for p in paths:
    print(f"{os.path.exists(p)}: {p}")

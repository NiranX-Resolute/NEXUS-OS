import os
from pathlib import Path

base = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\apps\desktop\release\win-unpacked")
print("win-unpacked contents:")
for item in base.glob("*"):
    print(" ", item.name)

res = base / "resources"
if res.exists():
    print("resources contents:")
    for item in res.glob("*"):
        print("  ", item.name)

# Also check apps/desktop/out
out_dir = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\apps\desktop\out")
print("apps/desktop/out exists:", out_dir.exists())
if out_dir.exists():
    for item in out_dir.glob("*"):
        print(" ", item.name)

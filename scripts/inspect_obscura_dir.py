import os
from pathlib import Path

target_dir = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\obscura-x86_64-windows (1)")
print("Directory exists:", target_dir.exists())

if target_dir.exists():
    for root, dirs, files in os.walk(target_dir):
        rel = os.path.relpath(root, target_dir)
        print(f"[{rel}]")
        for f in files:
            fp = Path(root) / f
            print(f"  - {f} ({fp.stat().st_size} bytes)")

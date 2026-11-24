import shutil
from pathlib import Path

workspace_root = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop")
source_dir = workspace_root / "obscura-x86_64-windows (1)"
dest_bin = workspace_root / "bin"
dest_bin.mkdir(parents=True, exist_ok=True)

for fname in ["obscura.exe", "obscura-worker.exe"]:
    src = source_dir / fname
    dst = dest_bin / fname
    if src.exists():
        print(f"Copying {src} -> {dst}")
        shutil.copy2(src, dst)
        print(f"Copied {fname}: {dst.stat().st_size} bytes")

# Also try C:\Nexus-OS\bin if possible
try:
    nexus_bin = Path(r"C:\Nexus-OS\bin")
    nexus_bin.mkdir(parents=True, exist_ok=True)
    for fname in ["obscura.exe", "obscura-worker.exe"]:
        src = source_dir / fname
        dst = nexus_bin / fname
        if src.exists():
            shutil.copy2(src, dst)
            print(f"Copied to system {dst}")
except Exception as e:
    print(f"Could not copy to C:\\Nexus-OS\\bin: {e}")

import shutil
import subprocess
import sys
import time

winget = shutil.which("winget") or r"C:\Users\NiranX\AppData\Local\Microsoft\WindowsApps\winget.EXE"

apps = [
    ("Google Cloud SDK", "Google.CloudSDK"),
    ("Ollama", "Ollama.Ollama")
]

for name, pkg_id in apps:
    print(f"\n==========================================", flush=True)
    print(f"Installing {name} ({pkg_id}) via winget...", flush=True)
    print(f"==========================================", flush=True)
    cmd = [
        winget, "install",
        "--id", pkg_id,
        "-e",
        "--source", "winget",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--silent"
    ]
    try:
        t0 = time.time()
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        dur = round(time.time() - t0, 1)
        print(f"Result for {name} ({dur}s, returncode {p.returncode}):", flush=True)
        if p.stdout:
            print("STDOUT:\n" + p.stdout[:500], flush=True)
        if p.stderr:
            print("STDERR:\n" + p.stderr[:500], flush=True)
    except Exception as e:
        print(f"Error installing {name}: {e}", flush=True)

print("\nAll requested winget installations finished.", flush=True)

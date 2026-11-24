import shutil
import subprocess
import time

winget = shutil.which("winget") or r"C:\Users\NiranX\AppData\Local\Microsoft\WindowsApps\winget.EXE"

print("Starting Google Cloud SDK installation via winget...", flush=True)
cmd = [
    winget, "install",
    "--id", "Google.CloudSDK",
    "-e",
    "--source", "winget",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--silent"
]

t0 = time.time()
res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
dur = round(time.time() - t0, 1)

print(f"Finished in {dur}s with returncode {res.returncode}", flush=True)
if res.stdout:
    print("STDOUT:\n" + res.stdout[:1000], flush=True)
if res.stderr:
    print("STDERR:\n" + res.stderr[:1000], flush=True)

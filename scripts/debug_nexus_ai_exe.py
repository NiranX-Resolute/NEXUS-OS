import subprocess
import os

exe = r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\apps\desktop\release\win-unpacked\nexus-ai.exe"
print("Running:", exe)
try:
    res = subprocess.run([exe], capture_output=True, text=True, timeout=10)
    print("Return code:", res.returncode)
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
except subprocess.TimeoutExpired as e:
    print("Process kept running! (TimeoutExpired after 10s)")
except Exception as e:
    print("Exception:", e)

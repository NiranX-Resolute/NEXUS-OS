import subprocess
import time
import os

exe = r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\apps\desktop\release\win-unpacked\nexus-ai.exe"
p = subprocess.Popen([exe], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=os.path.dirname(exe))

time.sleep(3)
poll = p.poll()
print("Poll status after 3s:", poll)

if poll is not None:
    out, err = p.communicate()
    print("STDOUT:\n", out)
    print("STDERR:\n", err)
else:
    print("Process is actively running with PID:", p.pid)

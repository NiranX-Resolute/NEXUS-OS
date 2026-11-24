import os
import sys
import time
import subprocess
from pathlib import Path

repo_root = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop")
python_bin = sys.executable

# 1. Start Puter AI Server (port 8088)
puter_server = repo_root / "apps" / "puter-chat" / "server.py"
if puter_server.exists():
    print("[+] Launching Puter AI Server (:8088)...", flush=True)
    subprocess.Popen(
        [python_bin, str(puter_server), "--no-browser"],
        cwd=str(puter_server.parent),
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )

# 2. Start Fast Desktop Agent Daemon
fast_agent = repo_root / "core" / "desktop_agent" / "nexus_fast_agent.py"
if fast_agent.exists():
    print("[+] Launching Fast Desktop Agent Daemon...", flush=True)
    subprocess.Popen(
        [python_bin, str(fast_agent)],
        cwd=str(repo_root),
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )

# 3. Start Command Center dev server (Vite on :5173)
bun_bin = r"C:\Users\NiranX\AppData\Roaming\npm\bun.cmd"
cc_dir = repo_root / "apps" / "command_center"
if cc_dir.exists() and os.path.exists(bun_bin):
    print("[+] Launching Command Center Development Server (:5173)...", flush=True)
    subprocess.Popen(
        [bun_bin, "run", "dev"],
        cwd=str(cc_dir),
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )

# 4. Launch Desktop Workstation (nexus-ai.exe)
desktop_exe = repo_root / "apps" / "desktop" / "release" / "win-unpacked" / "nexus-ai.exe"
if desktop_exe.exists():
    print(f"[+] Launching Nexus Desktop Workstation: {desktop_exe}...", flush=True)
    subprocess.Popen(
        [str(desktop_exe)],
        cwd=str(desktop_exe.parent),
        creationflags=subprocess.DETACHED_PROCESS | 0x00000200 if sys.platform == "win32" else 0
    )
    print("[SUCCESS] Nexus AI Desktop Workstation spawned successfully!", flush=True)
else:
    print("[!] nexus-ai.exe not found at release/win-unpacked", flush=True)

# 5. Open browser tabs for Command Center and Puter AI Hub
time.sleep(1.5)
import webbrowser
webbrowser.open("http://localhost:5173")
webbrowser.open("http://localhost:8088")
print("[+] Opened browser interfaces at http://localhost:5173 and http://localhost:8088", flush=True)

import os
import subprocess
from pathlib import Path

desktop = Path(os.path.expanduser(r"~\Desktop"))
repo_root = Path(r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop")
icon_exe = repo_root / r"apps\desktop\release\win-unpacked\nexus-ai.exe"

shortcuts = [
    {
        "name": "NEXUS AI.lnk",
        "target": str(repo_root / "launch.bat"),
        "workdir": str(repo_root),
        "icon": str(icon_exe),
        "desc": "NEXUS AI - Autonomous Multi-Agent Desktop Workstation"
    },
    {
        "name": "Nexus Command Center v5.0.lnk",
        "target": str(repo_root / "launch_command_center.bat"),
        "workdir": str(repo_root),
        "icon": str(icon_exe),
        "desc": "Nexus Command Center v5.0 - 3D Core Orb & AgentTown Visualizer"
    },
    {
        "name": "Nexus Puter AI Chat.lnk",
        "target": str(repo_root / "launch_puter_ai.bat"),
        "workdir": str(repo_root),
        "icon": str(icon_exe),
        "desc": "Nexus Puter AI Chat - 500+ LLMs Free-Tier Hub"
    }
]

for sc in shortcuts:
    lnk_path = desktop / sc["name"]
    ps_cmd = f"""
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('{lnk_path}')
    $Shortcut.TargetPath = '{sc["target"]}'
    $Shortcut.WorkingDirectory = '{sc["workdir"]}'
    if (Test-Path '{sc["icon"]}') {{
        $Shortcut.IconLocation = '{sc["icon"]},0'
    }}
    $Shortcut.Description = '{sc["desc"]}'
    $Shortcut.Save()
    """
    res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
    print(f"Created {lnk_path.name}: {lnk_path.exists()} (ret: {res.returncode})")

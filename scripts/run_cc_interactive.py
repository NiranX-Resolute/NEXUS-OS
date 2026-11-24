import subprocess

cmd = [
    "schtasks", "/create",
    "/tn", "NexusCommandCenterLauncher",
    "/tr", r'"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\launch_command_center.bat"',
    "/sc", "once",
    "/st", "23:59",
    "/it",
    "/f"
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Create returncode:", res.returncode)

if res.returncode == 0:
    run_res = subprocess.run(["schtasks", "/run", "/tn", "NexusCommandCenterLauncher"], capture_output=True, text=True)
    print("Run returncode:", run_res.returncode)
    print("Run STDOUT:", run_res.stdout)

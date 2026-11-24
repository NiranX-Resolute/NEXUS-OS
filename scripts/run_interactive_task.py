import subprocess

cmd = [
    "schtasks", "/create",
    "/tn", "NexusAILauncher",
    "/tr", r'"C:\Users\NiranX\Documents\antigravity\Nexus Desktop\launch.bat"',
    "/sc", "once",
    "/st", "23:59",
    "/it",
    "/f"
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Create returncode:", res.returncode)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)

if res.returncode == 0:
    run_res = subprocess.run(["schtasks", "/run", "/tn", "NexusAILauncher"], capture_output=True, text=True)
    print("Run returncode:", run_res.returncode)
    print("Run STDOUT:", run_res.stdout)
    print("Run STDERR:", run_res.stderr)

# ===================================================
# Nexus Desktop Fast Agent - Zero-Card Edge Bridge
# ===================================================
$RootDir = (Resolve-Path "$PSScriptRoot\..\..").Path
$PythonExe = Join-Path $RootDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) { $PythonExe = "python" }
$AgentScript = Join-Path $RootDir "core\desktop_agent\nexus_fast_agent.py"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Nexus Desktop Fast Agent - Zero-Card Edge Bridge" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Connecting to: https://nexus-bridge-7l1.pages.dev/api" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the daemon at any time.`n" -ForegroundColor DarkGray

& $PythonExe $AgentScript

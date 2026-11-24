# ===================================================
# Nexus Scholar - Accessible Student Studio Agent
# ===================================================
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$PythonExe = "python"
if (Test-Path "$ScriptDir\.venv\Scripts\python.exe") {
    $PythonExe = "$ScriptDir\.venv\Scripts\python.exe"
} elseif (Test-Path "$ScriptDir\..\.venv\Scripts\python.exe") {
    $PythonExe = (Resolve-Path "$ScriptDir\..\.venv\Scripts\python.exe").Path
}

$AgentScript = Join-Path $ScriptDir "desktop_agent\nexus_scholar_daemon.py"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "  Nexus Scholar - Socratic Student Studio Daemon" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Using Python: $PythonExe" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the daemon at any time.`n" -ForegroundColor DarkGray

& $PythonExe $AgentScript

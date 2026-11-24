# Nexus OS Unified Application Launcher
# Boots Unified Nexus OS v5.0 (IPC Spine + Dynamic Notch HUD + Workstation) on WinSta0\Default

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent $scriptDir
$nexusPy = Join-Path $projectRoot "nexus.py"

$venvPy = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (Test-Path $venvPy) {
    & "$venvPy" "$nexusPy" @args
} elseif (Get-Command uv -ErrorAction SilentlyContinue) {
    uv run --python "$projectRoot\.venv" python "$nexusPy" @args
} else {
    python "$nexusPy" @args
}


# Nexus OS v5.0 - Master Control Launcher (PowerShell)
param (
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$PythonBin = "python"
if (Test-Path "$ScriptDir\.venv\Scripts\python.exe") {
    $PythonBin = "$ScriptDir\.venv\Scripts\python.exe"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonBin = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonBin = "py"
}

Write-Host "[NEXUS-V5] Invoking Master CLI: $PythonBin nexus.py $Arguments" -ForegroundColor Cyan
& $PythonBin "$ScriptDir\nexus.py" @Arguments

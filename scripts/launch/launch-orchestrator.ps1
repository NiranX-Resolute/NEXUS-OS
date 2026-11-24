# Nexus Orchestrator Daemon Launcher (PowerShell)
param (
    [int]$Port = 8090,
    [switch]$Interactive = $false
)

$RootDir = (Resolve-Path "$PSScriptRoot\..\..").Path
$NexusDir = "$RootDir\nexus"

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "       N E X U S   C O R E   O R C H E S T R A T O R                           " -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan

if (-not (Test-Path "$NexusDir\dist\index.js")) {
    Write-Host "[+] Compiling TypeScript sources..." -ForegroundColor Cyan
    npm --prefix "$NexusDir" run build
}

if ($Interactive) {
    node "$NexusDir\dist\index.js"
} else {
    Write-Host "[+] Starting Orchestrator Daemon on port $Port..." -ForegroundColor Green
    node "$NexusDir\dist\index.js" --serve --port=$Port
}

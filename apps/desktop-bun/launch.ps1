# Nexus Bun Sovereign Workstation — 1-Click Launcher
param (
    [switch]$Dev = $false,
    [switch]$Headless = $false
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

$Exe = "$RootDir\dist\Nexus-Bun.exe"
$InstalledExe = "$env:LOCALAPPDATA\Programs\Nexus-Bun\Nexus-Bun.exe"

if (-not $Dev -and (Test-Path $Exe)) {
    Write-Host "[+] Launching compiled standalone executable..." -ForegroundColor Green
    Start-Process -FilePath $Exe -WorkingDirectory "$RootDir\dist"
} elseif (-not $Dev -and (Test-Path $InstalledExe)) {
    Write-Host "[+] Launching installed Nexus Bun executable..." -ForegroundColor Green
    Start-Process -FilePath $InstalledExe -WorkingDirectory (Split-Path $InstalledExe)
} else {
    Write-Host "[+] Launching via Bun runtime engine..." -ForegroundColor Cyan
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if ($Headless) {
        & bun run src/server/index.ts --headless
    } else {
        & bun run src/server/index.ts --desktop
    }
}

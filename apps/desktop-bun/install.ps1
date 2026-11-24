# Nexus Bun Sovereign Workstation — Automated Standalone Installer
param (
    [switch]$LaunchAfterInstall = $false
)

$ErrorActionPreference = "Stop"

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "       N E X U S   B U N   S O V E R E I G N   W O R K S T A T I O N           " -ForegroundColor Green
Write-Host "                     S T A N D A L O N E   I N S T A L L E R                   " -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $ScriptDir "dist"
$InstallDir = "$env:LOCALAPPDATA\Programs\Nexus-Bun"

if (-not (Test-Path "$DistDir\Nexus-Bun.exe")) {
    Write-Host "[*] Executable not found. Compiling with Bun..." -ForegroundColor Yellow
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Set-Location $ScriptDir
    & bun run src/build.ts
    & bun build --compile --outfile=dist/Nexus-Bun.exe src/server/index.ts
}

# 1. Terminate any currently running instances
Write-Host "[1/4] Checking for running instances..." -ForegroundColor Cyan
Get-Process -Name "Nexus-Bun" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

# 2. Provision Directory
Write-Host "[2/4] Provisioning installation directory: $InstallDir..." -ForegroundColor Cyan
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# 3. Copy Application Assets
Write-Host "[3/4] Deploying standalone binary and sovereign assets..." -ForegroundColor Cyan
Copy-Item -Path "$DistDir\*" -Destination $InstallDir -Recurse -Force

# 4. Create Desktop & Start Menu Shortcuts
Write-Host "[4/4] Creating system shortcuts (Desktop & Start Menu)..." -ForegroundColor Cyan
$WshShell = New-Object -ComObject WScript.Shell

# Desktop Shortcut
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$DesktopShortcut = $WshShell.CreateShortcut("$DesktopPath\Nexus Bun Workstation.lnk")
$DesktopShortcut.TargetPath = "$InstallDir\Nexus-Bun.exe"
$DesktopShortcut.WorkingDirectory = $InstallDir
$DesktopShortcut.Description = "Nexus AI Sovereign Bun Desktop Workstation"
if (Test-Path "$InstallDir\icon.ico") {
    $DesktopShortcut.IconLocation = "$InstallDir\icon.ico,0"
}
$DesktopShortcut.Save()

# Start Menu Shortcut
$StartMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Nexus Bun"
if (-not (Test-Path $StartMenuDir)) {
    New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
}
$StartMenuShortcut = $WshShell.CreateShortcut("$StartMenuDir\Nexus Bun Workstation.lnk")
$StartMenuShortcut.TargetPath = "$InstallDir\Nexus-Bun.exe"
$StartMenuShortcut.WorkingDirectory = $InstallDir
$StartMenuShortcut.Description = "Nexus AI Sovereign Bun Desktop Workstation"
if (Test-Path "$InstallDir\icon.ico") {
    $StartMenuShortcut.IconLocation = "$InstallDir\icon.ico,0"
}
$StartMenuShortcut.Save()

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Nexus Bun Sovereign Workstation Installed Successfully!" -ForegroundColor Green
Write-Host " Destination: $InstallDir" -ForegroundColor White
Write-Host " Desktop Shortcut: $DesktopPath\Nexus Bun Workstation.lnk" -ForegroundColor White
Write-Host " Start Menu: $StartMenuDir\Nexus Bun Workstation.lnk" -ForegroundColor White
Write-Host "===============================================================================" -ForegroundColor Green

if ($LaunchAfterInstall) {
    Write-Host "[*] Launching Nexus Bun Workstation..." -ForegroundColor Cyan
    Start-Process -FilePath "$InstallDir\Nexus-Bun.exe" -WorkingDirectory $InstallDir
}

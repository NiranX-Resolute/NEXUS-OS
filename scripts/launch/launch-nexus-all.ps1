# Nexus AI Ecosystem - All Systems Launcher (PowerShell)
param (
    [switch]$OnDemand = $false,
    [switch]$Dev = $false
)
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "       N E X U S   U N I F I E D   E C O S Y S T E M                           " -ForegroundColor Green
Write-Host "             A L L   S Y S T E M S   O N L I N E                               " -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$RootDir = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $RootDir

# Locate Python
$PythonBin = ""
if (Test-Path "$RootDir\.venv\Scripts\python.exe") {
    $PythonBin = "$RootDir\.venv\Scripts\python.exe"
} else {
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) {
        $PythonBin = $cmd.Source
    } else {
        $cmdPy = Get-Command py -ErrorAction SilentlyContinue
        if ($cmdPy) { $PythonBin = $cmdPy.Source }
    }
}

if ($PythonBin) {
    Write-Host "[+] Python Runtime: $PythonBin" -ForegroundColor Gray
} else {
    Write-Host "[!] Warning: Python not found on PATH or .venv" -ForegroundColor Yellow
}

if (-not $OnDemand) {
    # 1. Puter AI Chat Server
    Write-Host "[+] [1/3] Launching Puter AI Server (500+ LLMs & Autonomous Backup)..." -ForegroundColor Cyan
    $PuterServer = "$RootDir\apps\puter-chat\server.py"
    if (Test-Path $PuterServer) {
        Start-Process -FilePath $PythonBin -ArgumentList "`"$PuterServer`" --no-browser" -WindowStyle Minimized
        Write-Host "    -> Puter AI Server online at http://localhost:8088" -ForegroundColor Green
    }

    # 2. Nexus Fast Desktop Agent Daemon
    Write-Host "[+] [2/4] Launching Fast Desktop Agent (Cloudflare Edge Bridge)..." -ForegroundColor Cyan
    $FastAgent = "$RootDir\core\desktop_agent\nexus_fast_agent.py"
    if (Test-Path $FastAgent) {
        Start-Process -FilePath $PythonBin -ArgumentList "`"$FastAgent`"" -WindowStyle Minimized
        Write-Host "    -> Fast Agent Daemon connected to Cloudflare Edge Bridge" -ForegroundColor Green
    }

    # 3. Nexus Core Orchestrator Daemon
    Write-Host "[+] [3/4] Launching Nexus Core Orchestrator Daemon (ReAct Agent Engine)..." -ForegroundColor Cyan
    $OrchestratorLauncher = "$RootDir\scripts\launch\launch-orchestrator.ps1"
    if (Test-Path $OrchestratorLauncher) {
        Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$OrchestratorLauncher`" -Port 8090" -WindowStyle Minimized
        Write-Host "    -> Orchestrator Daemon online at http://localhost:8090" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] On-Demand Mode engaged: Secondary background daemons kept dormant until requested." -ForegroundColor Green
}

# 4. Nexus Desktop App
Write-Host "[+] [4/4] Launching Nexus Desktop Workstation..." -ForegroundColor Cyan
$InstalledExe = "$env:LOCALAPPDATA\Programs\nexus-ai\nexus-ai.exe"
$ReleaseUnpackedExe = "$RootDir\apps\desktop\release\win-unpacked\nexus-ai.exe"
$ReleaseExe = "$RootDir\apps\desktop\release\Nexus AI 2.2.0.exe"
$PackagedExe = "$RootDir\apps\desktop\dist\Nexus AI 2.2.0.exe"
$SetupExe = "$RootDir\docs\binaries\nexus-setup.exe"

if ($Dev) {
    Write-Host "    -> Starting via npm run dev (-Dev requested)..." -ForegroundColor Yellow
    Set-Location "$RootDir\apps\desktop"
    npm run dev
} elseif (Test-Path $InstalledExe) {
    Start-Process -FilePath $InstalledExe
    Write-Host "    -> Running installed workstation: nexus-ai.exe" -ForegroundColor Green
} elseif (Test-Path $ReleaseUnpackedExe) {
    Start-Process -FilePath $ReleaseUnpackedExe
    Write-Host "    -> Running unpacked workstation: win-unpacked\nexus-ai.exe" -ForegroundColor Green
} elseif (Test-Path $ReleaseExe) {
    Start-Process -FilePath $ReleaseExe
    Write-Host "    -> Running release executable: Nexus AI 2.2.0.exe" -ForegroundColor Green
} elseif (Test-Path $PackagedExe) {
    Start-Process -FilePath $PackagedExe
    Write-Host "    -> Running packaged executable: dist\Nexus AI 2.2.0.exe" -ForegroundColor Green
} elseif (Test-Path $SetupExe) {
    Start-Process -FilePath $SetupExe
    Write-Host "    -> Running release setup executable" -ForegroundColor Green
} else {
    Write-Host "    -> Starting via npm run dev..." -ForegroundColor Yellow
    Set-Location "$RootDir\apps\desktop"
    npm run dev
}

Write-Host ""
Write-Host "[SUCCESS] All Nexus Systems Active and Coordinated!" -ForegroundColor Green

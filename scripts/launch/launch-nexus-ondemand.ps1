# Nexus AI Ecosystem - On-Demand Zero-Waste Launcher (PowerShell)
param (
    [switch]$AllSystems = $false
)

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "       N E X U S   O N - D E M A N D   E N G I N E   L A U N C H E R           " -ForegroundColor Green
Write-Host "           Z E R O - W A S T E   R E S O U R C E   M O D E                     " -ForegroundColor Green
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
}

if ($AllSystems) {
    Write-Host "[!] Launching all background daemons simultaneously..." -ForegroundColor Yellow
    # 1. Puter AI Chat Server
    $PuterServer = "$RootDir\apps\puter-chat\server.py"
    if (Test-Path $PuterServer) {
        Start-Process -FilePath $PythonBin -ArgumentList "`"$PuterServer`" --no-browser" -WindowStyle Minimized
        Write-Host "    -> Puter AI Server online at http://localhost:8088" -ForegroundColor Green
    }

    # 2. Nexus Fast Desktop Agent Daemon
    $FastAgent = "$RootDir\core\desktop_agent\nexus_fast_agent.py"
    if (Test-Path $FastAgent) {
        Start-Process -FilePath $PythonBin -ArgumentList "`"$FastAgent`"" -WindowStyle Minimized
        Write-Host "    -> Fast Agent Daemon connected to Cloudflare Edge Bridge" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] ON-DEMAND MODE ACTIVE: Background daemons set to DORMANT (0 MB overhead)." -ForegroundColor Green
    Write-Host "    Components will awaken strictly when requested by the user." -ForegroundColor Gray
}

# 3. Launch Nexus Desktop Workstation in On-Demand Mode
Write-Host "[+] Launching Nexus Desktop Workstation..." -ForegroundColor Cyan
$InstalledExe = "$env:LOCALAPPDATA\Programs\nexus-ai\nexus-ai.exe"
$PackagedExe = "$RootDir\apps\desktop\dist\Nexus AI 2.2.0.exe"
$ReleaseExe = "$RootDir\docs\binaries\nexus-setup.exe"

if (Test-Path $InstalledExe) {
    Start-Process -FilePath $InstalledExe
    Write-Host "    -> Running installed workstation: nexus-ai.exe" -ForegroundColor Green
} elseif (Test-Path $PackagedExe) {
    Start-Process -FilePath $PackagedExe
    Write-Host "    -> Running packaged executable: Nexus AI 2.2.0.exe" -ForegroundColor Green
} elseif (Test-Path $ReleaseExe) {
    Start-Process -FilePath $ReleaseExe
    Write-Host "    -> Running release setup executable" -ForegroundColor Green
} else {
    Write-Host "    -> Starting via npm run dev..." -ForegroundColor Yellow
    Set-Location "$RootDir\apps\desktop"
    npm run dev
}

Write-Host ""
Write-Host "[SUCCESS] Nexus On-Demand Engine Engaged! Efficient and ready." -ForegroundColor Green

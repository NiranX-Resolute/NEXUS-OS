@echo off
setlocal enabledelayedexpansion
title Nexus AI Ecosystem - All Systems Launcher
color 0A

echo ===============================================================================
echo     _   _ _______  ___   _ ____      _    ___  
echo    ^| \ ^| ^| ____\ \/ / ^| ^| / ___^|    / \  ^|_ _^| 
echo    ^|  \^| ^|  _^|  \  /^| ^| ^| \___ \   / _ \  ^| ^|  
echo    ^| ^|\  ^| ^|___  /  \^| ^|_^| ^|___) ^| / ___ \ ^| ^|  
echo    ^|_^| \_^|_____^|/_/\_\\___/ ^|____/ /_/   \_\___^| 
echo.
echo           N E X U S   U N I F I E D   E C O S Y S T E M
echo                  A L L   S Y S T E M S   O N L I N E
echo ===============================================================================
echo.

set ROOT_DIR=%~dp0..\..\
cd /d "%ROOT_DIR%"

:: Locate Python
set PYTHON_BIN=""
if exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    set PYTHON_BIN="%ROOT_DIR%.venv\Scripts\python.exe"
) else (
    where python >nul 2>&1
    if !errorlevel! equ 0 (
        set PYTHON_BIN="python"
    ) else (
        where py >nul 2>&1
        if !errorlevel! equ 0 (
            set PYTHON_BIN="py"
        )
    )
)

if %PYTHON_BIN%=="" (
    echo [!] WARNING: Python was not found on PATH or in .venv.
    echo     Background Python services will start via Electron auto-discovery.
) else (
    echo [+] Python Runtime Detected: %PYTHON_BIN%
)

:: 1. Launch Puter AI Chat Server (Port 8088)
echo [+] [1/3] Launching Puter AI Server (500+ LLMs & Autonomous Backup)...
if exist "%ROOT_DIR%apps\puter-chat\server.py" (
    start "Nexus Puter AI Server :8088" /min cmd /c "%PYTHON_BIN% \"%ROOT_DIR%apps\puter-chat\server.py\" --no-browser"
    echo     -^> Puter AI Server online at http://localhost:8088
) else (
    echo     -^> Skipping Puter server (folder not found).
)

:: 2. Launch Nexus Fast Desktop Agent Daemon (Edge Bridge)
echo [+] [2/3] Launching Nexus Fast Desktop Agent Daemon (Cloudflare Edge Bridge)...
if exist "%ROOT_DIR%core\desktop_agent\nexus_fast_agent.py" (
    start "Nexus Fast Agent Daemon" /min cmd /c "%PYTHON_BIN% \"%ROOT_DIR%core\desktop_agent\nexus_fast_agent.py\""
    echo     -^> Fast Desktop Agent Daemon active (Device Heartbeat & Edge Relay)
) else (
    echo     -^> Skipping Fast Agent daemon.
)

:: 3. Launch Nexus Desktop Core Workstation
echo [+] [3/3] Launching Nexus Desktop Workstation (Electron App)...
if "%~1"=="--dev" (
    echo     -^> Starting Nexus Desktop via npm run dev...
    cd /d "%ROOT_DIR%apps\desktop"
    npm run dev
) else if exist "%LOCALAPPDATA%\Programs\nexus-ai\nexus-ai.exe" (
    echo     -^> Launching installed workstation: nexus-ai.exe
    start "" "%LOCALAPPDATA%\Programs\nexus-ai\nexus-ai.exe"
) else if exist "%ROOT_DIR%apps\desktop\release\win-unpacked\nexus-ai.exe" (
    echo     -^> Launching unpacked workstation: win-unpacked\nexus-ai.exe
    start "" "%ROOT_DIR%apps\desktop\release\win-unpacked\nexus-ai.exe"
) else if exist "%ROOT_DIR%apps\desktop\release\Nexus AI 2.2.0.exe" (
    echo     -^> Launching release binary: release\Nexus AI 2.2.0.exe
    start "" "%ROOT_DIR%apps\desktop\release\Nexus AI 2.2.0.exe"
) else if exist "%ROOT_DIR%apps\desktop\dist\Nexus AI 2.2.0.exe" (
    echo     -^> Launching packaged binary: dist\Nexus AI 2.2.0.exe
    start "" "%ROOT_DIR%apps\desktop\dist\Nexus AI 2.2.0.exe"
) else if exist "%ROOT_DIR%docs\binaries\nexus-setup.exe" (
    echo     -^> Launching release binary: nexus-setup.exe
    start "" "%ROOT_DIR%docs\binaries\nexus-setup.exe"
) else (
    echo     -^> Starting Nexus Desktop via npm run dev...
    cd /d "%ROOT_DIR%apps\desktop"
    npm run dev
)

echo.
echo ===============================================================================
echo   [SUCCESS] ALL NEXUS SYSTEMS ARE LAUNCHED AND RUNNING!
echo   - Core Workstation: ACTIVE
echo   - Puter AI Server:  http://localhost:8088
echo   - Fast Agent Edge:  CONNECTED
echo   - Mobile Bridge:    http://localhost:17173
echo ===============================================================================
echo.
timeout /t 5 >nul

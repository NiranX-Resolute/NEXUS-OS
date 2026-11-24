@echo off
title Nexus Desktop Fast Agent Daemon
echo ===================================================
echo   Nexus Desktop Fast Agent - Zero-Card Edge Bridge
echo ===================================================
echo Connecting to: https://nexus-bridge-7l1.pages.dev/api
set ROOT_DIR=%~dp0..\..\
if exist "%ROOT_DIR%.venv\Scripts\python.exe" (
    "%ROOT_DIR%.venv\Scripts\python.exe" "%ROOT_DIR%core\desktop_agent\nexus_fast_agent.py"
) else (
    python "%ROOT_DIR%core\desktop_agent\nexus_fast_agent.py"
)
pause

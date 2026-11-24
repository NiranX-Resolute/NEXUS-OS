@echo off
setlocal
title Nexus OS v5.0 - Master Control Launcher
cd /d "%~dp0"

:: Locate Python Runtime
set "PYTHON_BIN=python"
if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYTHON_BIN=%~dp0.venv\Scripts\python.exe"
) else (
    where python >nul 2>&1
    if errorlevel 1 (
        where py >nul 2>&1
        if not errorlevel 1 set "PYTHON_BIN=py"
    )
)

echo [NEXUS-V5] Invoking Master CLI via %PYTHON_BIN% nexus.py %*
"%PYTHON_BIN%" "%~dp0nexus.py" %*

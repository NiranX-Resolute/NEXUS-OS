@echo off
title Nexus Companion - Daily Living Assistive Agent
echo ===================================================
echo   Nexus Companion - Assistive Living Local Agent
echo ===================================================
echo.

set PYTHON_EXE=python
if exist "%~dp0.venv\Scripts\python.exe" set PYTHON_EXE=%~dp0.venv\Scripts\python.exe
if exist "%~dp0..\.venv\Scripts\python.exe" set PYTHON_EXE=%~dp0..\.venv\Scripts\python.exe

echo Using Python: %PYTHON_EXE%
echo Starting Nexus Companion Daemon...
"%PYTHON_EXE%" "%~dp0desktop_agent\nexus_companion_daemon.py"
pause

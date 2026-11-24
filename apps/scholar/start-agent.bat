@echo off
title Nexus Scholar - Accessible Student Studio Agent
echo ===================================================
echo   Nexus Scholar - Socratic Student Studio Daemon
echo ===================================================
echo.

set PYTHON_EXE=python
if exist "%~dp0.venv\Scripts\python.exe" set PYTHON_EXE=%~dp0.venv\Scripts\python.exe
if exist "%~dp0..\.venv\Scripts\python.exe" set PYTHON_EXE=%~dp0..\.venv\Scripts\python.exe

echo Using Python: %PYTHON_EXE%
echo Starting Nexus Scholar Socratic Daemon...
"%PYTHON_EXE%" "%~dp0desktop_agent\nexus_scholar_daemon.py"
pause

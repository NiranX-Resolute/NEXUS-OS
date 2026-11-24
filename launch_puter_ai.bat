@echo off
title Nexus Puter AI Hub (500+ LLMs)
cd /d "%~dp0"
echo Starting Nexus Puter AI Hub on port 8088...
start http://localhost:8088
".venv\Scripts\python.exe" "apps\puter-chat\server.py"

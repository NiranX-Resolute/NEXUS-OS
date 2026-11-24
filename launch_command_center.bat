@echo off
title Nexus Command Center v5.0
cd /d "%~dp0apps\command_center"
echo Starting Nexus Command Center (React 19 + Three.js + Bun)...
start http://localhost:5173
"C:\Users\NiranX\AppData\Roaming\npm\bun.cmd" run dev

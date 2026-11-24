@echo off
title Nexus Bun Sovereign Workstation
setlocal
cd /d "%~dp0"

if exist "dist\Nexus-Bun.exe" (
    start "" "dist\Nexus-Bun.exe" %*
) else (
    bun run src/server/index.ts --desktop
)
endlocal

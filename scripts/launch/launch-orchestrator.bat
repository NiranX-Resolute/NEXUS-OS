@echo off
title Nexus Core Orchestrator Daemon
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-orchestrator.ps1" %*

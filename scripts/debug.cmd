@echo off
REM CIM debug: auto-compile then open VS Code Extension Development Host
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0debug.ps1" %*

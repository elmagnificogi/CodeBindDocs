@echo off
REM CodeBind Docs debug: auto-compile then open VS Code Extension Development Host
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0debug.ps1" %*

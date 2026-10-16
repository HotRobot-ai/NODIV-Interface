@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0NODIV-V2-STARTER.ps1"
echo.
pause

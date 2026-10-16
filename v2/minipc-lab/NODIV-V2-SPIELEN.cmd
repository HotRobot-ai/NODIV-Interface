@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0NODIV-V2-SPIELEN.ps1"
echo.
pause

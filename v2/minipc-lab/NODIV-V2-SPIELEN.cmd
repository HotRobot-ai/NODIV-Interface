@echo off
cd /d "%~dp0"
if /I "%~1"=="--smoke" (
  if not exist "%~dp0NODIV-V2-SPIELEN.ps1" exit /b 11
  if not exist "%~dp0server\server.mjs" exit /b 12
  if not exist "%~dp0NODIV-V2-FOUNDER-RECOVERY.mjs" exit /b 13
  if not exist "%~dp0server\founder-recovery.mjs" exit /b 14
  findstr /C:"NODIV_LAB_MODE=desktop" "%~dp0config.example.env" >nul || exit /b 15
  echo NODIV BLOCK07 STARTER SMOKE PASS
  exit /b 0
)
powershell.exe -NoProfile -File "%~dp0NODIV-V2-SPIELEN.ps1"
echo.
pause

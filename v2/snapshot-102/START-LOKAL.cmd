@echo off
cd /d "%~dp0"
echo NODIV V2 - ISOLIERTER TEST AUF DIESEM PC
node --version
if errorlevel 1 (
 echo Node.js nicht gefunden. Bitte PowerShell neu starten oder Node.js Installation pruefen.
 pause
 exit /b 1
)
echo.
echo Browser-Adresse: http://127.0.0.1:8787/lab
echo Nur auf diesem PC erreichbar. Keine produktiven NODIV-Daten.
echo Server mit STRG+C beenden.
echo.
node lan-lab.mjs
pause

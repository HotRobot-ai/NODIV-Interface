@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if /I "%~1"=="--smoke" (
  if not exist "%~dp0server\server.mjs" exit /b 12
  if not exist "%~dp0NODIV-V2-FOUNDER-RECOVERY.mjs" exit /b 13
  if not exist "%~dp0server\founder-recovery.mjs" exit /b 14
  findstr /C:"NODIV_LAB_MODE=desktop" "%~dp0config.example.env" >nul || exit /b 15
  echo NODIV BLOCK07 STARTER SMOKE PASS
  exit /b 0
)
where node >nul 2>&1 || (echo FEHLER: Node.js nicht gefunden.& goto :fail)
where tailscale >nul 2>&1 || (echo FEHLER: Tailscale nicht gefunden.& goto :fail)
if not exist ".env" copy /Y "config.example.env" ".env" >nul
echo NODIV V2 - MISSION WUERZBURG
echo TESTMODUS // SCHREIBTISCHBETRIEB
echo.
echo 1 = Founder Access Card einmalig einrichten
echo 2 = NODIV V2 TESTMODUS starten
echo 3 = Founder Access Card wiederherstellen
set /p "choice=Auswahl (1/2/3): "
if "%choice%"=="1" goto :bootstrap
if "%choice%"=="2" goto :game
if "%choice%"=="3" goto :recovery
echo Abgebrochen.
exit /b 0
:bootstrap
if exist "data\nodiv-v2-desktop.sqlite" (echo FEHLER: Spielstand vorhanden. Founder Recovery mit Auswahl 3 verwenden.& goto :fail)
set "port=8790"
set "script=NODIV-V2-NFC-SETUP.mjs"
goto :launch
:recovery
if not exist "data\nodiv-v2-desktop.sqlite" (echo FEHLER: Kein Spielstand fuer Recovery.& goto :fail)
if not exist "data\founder-recovery.key" (echo FEHLER: Founder Recovery-Schluessel fehlt.& goto :fail)
set "port=8790"
set "script=NODIV-V2-FOUNDER-RECOVERY.mjs"
goto :launch
:game
node "server/desktop-config-check.mjs" || goto :fail
rem Founder UID and mode are checked by the same Node.js validator.
if exist "data\nodiv-v2-desktop.sqlite" echo Vorhandener Spielstand bleibt erhalten.
set "port=8787"
set "script=server/server.mjs"
:launch
rem Netstat avoids starting a second local listener on the same port.
netstat -ano -p tcp | findstr /R /C:":%port% .*LISTENING" >nul && (echo FEHLER: Port %port% ist bereits belegt.& goto :fail)
echo Schalte privaten Tailscale-Zugriff auf Port %port% ...
tailscale serve --https=443 off >nul 2>&1
tailscale serve --bg %port%
if errorlevel 1 (echo FEHLER: Tailscale Serve fehlgeschlagen.& goto :fail)
echo.
echo NODIV bereit. HTTPS-Adresse auf dem Smartphone in Chrome oeffnen.
echo Dieses Fenster offen lassen. Beenden mit Strg+C.
node "%script%"
set "result=%errorlevel%"
echo Tailscale Serve wird abgeschaltet ...
tailscale serve --https=443 off >nul 2>&1
if not "%result%"=="0" goto :fail
exit /b 0
:fail
echo.
pause
exit /b 1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $ts) { throw 'Tailscale nicht gefunden.' }
if (-not (Test-Path '.env')) { Copy-Item 'config.example.env' '.env' }

Write-Host 'NODIV V2 - MISSION WUERZBURG' -ForegroundColor Cyan
Write-Host 'TESTMODUS // SCHREIBTISCHBETRIEB'
Write-Host ''
Write-Host '1 = Founder Access Card einmalig einrichten'
Write-Host '2 = NODIV V2 TESTMODUS starten'
Write-Host '3 = Founder Access Card wiederherstellen'
$choice = Read-Host 'Auswahl (1/2/3)'
if ($choice -notin @('1','2','3')) { Write-Host 'Abgebrochen.'; exit }

$db = Join-Path $PSScriptRoot 'data\nodiv-v2-desktop.sqlite'
$recoveryKey = Join-Path $PSScriptRoot 'data\founder-recovery.key'

if ($choice -eq '1') {
  if (Test-Path $db) {
    throw 'Vorhandener NODIV-Spielstand erkannt. Founder-Karte nicht neu bootstrappen. Bei Verlust/Defekt Auswahl 3 verwenden.'
  }
  $port = 8790
  $script = 'NODIV-V2-NFC-SETUP.mjs'
} elseif ($choice -eq '3') {
  if (-not (Test-Path $db)) { throw 'Kein vorhandener NODIV-Spielstand fuer Recovery gefunden.' }
  if (-not (Test-Path $recoveryKey)) { throw 'Founder Recovery-Schluessel fehlt. Es wird keine Ersatzberechtigung erzeugt.' }
  $gamePort = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
  if ($gamePort) { throw 'NODIV TESTMODUS laeuft noch. Erst den Spielserver beenden, dann Recovery starten.' }
  $port = 8790
  $script = 'NODIV-V2-FOUNDER-RECOVERY.mjs'
} else {
  $port = 8787
  $script = 'server/server.mjs'
  $raw = Get-Content '.env' -Raw
  if ($raw -notmatch '(?m)^NODIV_LAB_MODE=desktop\s*$') {
    throw 'BLOCK 07 verlangt NODIV_LAB_MODE=desktop.'
  }
  $m = [regex]::Match($raw, '(?m)^NODIV_UID_FOUNDER_CARD=([0-9A-Fa-f]{8,32})\s*$')
  if (-not $m.Success) {
    throw 'Founder Access Card fehlt. Zuerst Auswahl 1 ausfuehren.'
  }
  if (Test-Path $db) {
    Write-Host 'Vorhandener NODIV-Testspielstand erkannt. Er wird NICHT geloescht.' -ForegroundColor Yellow
    Write-Host 'Registrierungen, Spielfortschritt und Historie bleiben erhalten.'
  } else {
    Write-Host 'Neuer lokaler NODIV-Testspielstand wird angelegt.' -ForegroundColor Green
  }
}

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) { throw "Port $port bereits belegt. Bitte alten NODIV-Dienst schliessen." }

Write-Host "Schalte privaten Tailscale-Zugriff auf Port $port ..."
& tailscale serve --https=443 off | Out-Null
& tailscale serve --bg $port
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Serve fehlgeschlagen.' }

Write-Host ''
if ($choice -eq '3') {
  Write-Host 'FOUNDER RECOVERY bereit. HTTPS-Adresse auf dem Smartphone in Chrome oeffnen.' -ForegroundColor Yellow
  Write-Host 'Nur die neue Founder Access Card scannen. Der Spielstand wird nicht zurueckgesetzt.'
} else {
  Write-Host 'NODIV bereit. HTTPS-Adresse auf dem Smartphone in Chrome oeffnen.' -ForegroundColor Green
}
if ($choice -eq '2') {
  Write-Host 'TESTMODUS: Fehlende Rollen oder Hardware werden nicht erzeugt.' -ForegroundColor Yellow
  Write-Host 'Datenbank niemals fuer einen normalen Neustart loeschen.'
}
Write-Host 'Dieses Fenster offen lassen. Beenden mit Strg+C.'
try {
  & node $script
  if ($LASTEXITCODE -ne 0) { throw "Node-Prozess beendet mit Exitcode $LASTEXITCODE." }
} finally {
  Write-Host 'Tailscale Serve wird abgeschaltet ...'
  & tailscale serve --https=443 off | Out-Null
}

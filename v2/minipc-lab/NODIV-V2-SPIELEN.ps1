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
$choice = Read-Host 'Auswahl (1/2)'
if ($choice -notin @('1','2')) { Write-Host 'Abgebrochen.'; exit }

if ($choice -eq '1') {
  $port = 8790
  $script = 'NODIV-V2-NFC-SETUP.mjs'
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
  $db = Join-Path $PSScriptRoot 'data\nodiv-v2-desktop.sqlite'
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
Write-Host 'NODIV bereit. HTTPS-Adresse auf dem Smartphone in Chrome oeffnen.' -ForegroundColor Green
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

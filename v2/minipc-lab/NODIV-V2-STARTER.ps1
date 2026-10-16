$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $ts) { throw 'Tailscale nicht gefunden.' }
if (-not (Test-Path '.env')) { Copy-Item 'config.example.env' '.env' }

Write-Host 'NODIV V2 - BLOCK 06 REALTEST' -ForegroundColor Cyan
Write-Host '1 = Founder Access Card einmalig einrichten'
Write-Host '2 = BLOCK 06 Haupttest starten'
$choice = Read-Host 'Auswahl (1/2)'
if ($choice -notin @('1','2')) { Write-Host 'Abgebrochen.'; exit }

if ($choice -eq '1') {
  $port = 8790
  $script = 'NODIV-V2-NFC-SETUP.mjs'
} else {
  $port = 8787
  $script = 'server/server.mjs'
  $raw = Get-Content '.env' -Raw
  if ($raw -notmatch '(?m)^NODIV_LAB_MODE=registration\s*$') {
    throw 'BLOCK 06 verlangt NODIV_LAB_MODE=registration.'
  }
  $m = [regex]::Match($raw, '(?m)^NODIV_UID_FOUNDER_CARD=([0-9A-Fa-f]{8,32})\s*$')
  if (-not $m.Success) {
    throw 'Founder Access Card fehlt. Zuerst Auswahl 1 ausfuehren.'
  }
  $db = Join-Path $PSScriptRoot 'data\nodiv-v2-registration.sqlite'
  if (Test-Path $db) {
    Write-Host 'Vorhandener BLOCK-06-Datenbestand erkannt. Er wird NICHT geloescht.' -ForegroundColor Yellow
    Write-Host 'Registrierung, Eventzustand und Spieltransaktionen bleiben erhalten.'
  } else {
    Write-Host 'Neuer isolierter BLOCK-06-Datenbestand wird angelegt.' -ForegroundColor Green
  }
}

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) { throw "Port $port bereits belegt. Bitte alten Testdienst schliessen." }

Write-Host "Schalte privaten Tailscale-Zugriff auf Port $port ..."
& tailscale serve --https=443 off | Out-Null
& tailscale serve --bg $port
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Serve fehlgeschlagen.' }

Write-Host 'HTTPS-Adresse auf dem Smartphone in Chrome oeffnen.' -ForegroundColor Green
if ($choice -eq '2') {
  Write-Host 'Keine Datenbank loeschen oder neu initialisieren. Fehler werden im bestehenden Testbestand nachverfolgt.' -ForegroundColor Yellow
}
Write-Host 'Dieses Fenster offen lassen. Beenden mit Strg+C.'
try {
  & node $script
  if ($LASTEXITCODE -ne 0) { throw "Node-Prozess beendet mit Exitcode $LASTEXITCODE." }
} finally {
  Write-Host 'Tailscale Serve wird abgeschaltet ...'
  & tailscale serve --https=443 off | Out-Null
}

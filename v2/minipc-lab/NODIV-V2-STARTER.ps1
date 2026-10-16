$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$ts = (Get-Command tailscale -ErrorAction SilentlyContinue)
if (-not $ts) { throw 'Tailscale nicht gefunden.' }
if (-not (Test-Path '.env')) { Copy-Item 'config.example.env' '.env' }
Write-Host 'NODIV V2 - Windows Teststarter (nur TEST-V2)' -ForegroundColor Cyan
Write-Host '1 = NFC-Tags einmalig einrichten'
Write-Host '2 = NODIV V2 Spieltest starten'
$choice = Read-Host 'Auswahl (1/2)'
if ($choice -notin @('1','2')) { Write-Host 'Abgebrochen.'; exit }
if ($choice -eq '1') {
  $port=8790
  $script='NODIV-V2-NFC-SETUP.mjs'
} else {
  $port=8787
  $script='server/server.mjs'
  $raw=Get-Content '.env' -Raw
  if ($raw -match 'NODIV_UID_ACCESS_CARD=TESTACCESS9003') {
    throw 'Zuerst NFC-Einrichtung (Auswahl 1) abschliessen.'
  }
  $db=Join-Path $PSScriptRoot 'data/nodiv-v2-test.sqlite'
  if (Test-Path $db) {
    Write-Host 'Vorhandene TEST-Datenbank erkannt. NICHT automatisch loeschen.' -ForegroundColor Yellow
    Write-Host 'Wenn sie noch Platzhalter enthaelt, ist eine separate Sicherung und Neuinitialisierung erforderlich.'
  }
}
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) { throw "Port $port bereits belegt. Bitte alten Testdienst schliessen." }
Write-Host "Schalte privaten Tailscale-Zugriff auf Port $port ..."
& tailscale serve --https=443 off | Out-Null
& tailscale serve --bg $port
if ($LASTEXITCODE -ne 0) { throw 'Tailscale Serve fehlgeschlagen.' }
Write-Host 'Die angezeigte HTTPS-Adresse auf dem Samsung in Chrome oeffnen (ohne ?setup=1).' -ForegroundColor Green
Write-Host 'Dieses Fenster offen lassen. Beenden mit Strg+C.'
try { & node $script } finally {
  Write-Host 'Tailscale Serve wird abgeschaltet ...'
  & tailscale serve --https=443 off
}

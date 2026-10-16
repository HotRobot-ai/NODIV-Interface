# NODIV V2 — Mini-PC-Ersttest (TEST ONLY)

Ziel: ein isolierter Schreibtischtest mit Windows-Mini-PC, Android/Chrome, echtem NFC-Leseereignis und genau **einem 1-Core-Exchange**. Keine V1-Produktivdaten, kein Deployment, kein Port-Forwarding.

## Technischer Stand
- SQLite ist die einzige Wahrheit in diesem Test.
- Ein installierter Test-Node besitzt exakt drei Cores; Pioneer P9003 besitzt exakt einen Core.
- Node-Scan -> kurzlebige Einmalfreigabe -> 1-Core-Prepare -> zwei Core-Scans -> 4-stelliger Access Code -> atomarer Confirm.
- `operation_id` macht die Bestätigung idempotent. Ein zweiter vorbereiteter Request kann dieselben Cores nach dem ersten Commit nicht erneut buchen.
- Browser-NFC ist **TEST ONLY**: ein Web-NFC-`serialNumber`-Wert beweist noch keinen manipulationssicheren Reader. Er wird nur für diesen isolierten Hardwaretest verwendet.

## Voraussetzung
**Node.js 24 LTS, mindestens 24.15**. Keine npm-Abhängigkeiten werden benötigt.

## 1. Ordner
Release nach `C:\NODIV-V2-TEST` entpacken.

## 2. Konfiguration
`config.example.env` nach `.env` kopieren. Die sechs `NODIV_UID_*` Werte durch die Seriennummern der ausschließlich für V2 verwendeten Test-Tags ersetzen. Schreibweise ist egal; der Server normalisiert `:` und `-`.

## 3. Automatische Prüfung
In PowerShell im Release-Ordner:

    npm test
    npm run precheck

Erwartung: Tests grün; 20 sequenzielle + 10 parallele API-Leseanfragen grün; ein synthetischer Exchange + Replay grün.

## 4. Testdaten starten
`RESET-TEST.cmd` einmal ausführen. Danach `START-TEST.cmd`.

Lokal prüfen: `http://127.0.0.1:8787/health`.

## 5. HTTPS für Android Web NFC
Web NFC funktioniert nicht über normales `http://192.168.x.x`. Für den schnellen Ersttest ist der bereits im Projekt erprobte private Tailscale-Weg geeignet:

1. Tailscale auf Mini-PC und Android im selben privaten Tailnet aktivieren.
2. Server lokal auf `127.0.0.1:8787` laufen lassen.
3. Auf dem Mini-PC Tailscale Serve auf den lokalen Port schalten (Syntax anhand der installierten Tailscale-Version prüfen): HTTPS -> `http://127.0.0.1:8787`.
4. Die von Tailscale angezeigte `https://...ts.net` Adresse in Chrome auf Android öffnen.
5. Nach dem Test Tailscale Serve wieder zurücksetzen.

Alternative: `NODIV_TLS_KEY` und `NODIV_TLS_CERT` auf ein vom Android-Gerät vertrautes Zertifikat setzen. Keine selbstsignierte Warnseite einfach wegklicken; Web NFC braucht einen tatsächlich sicheren Kontext.

## 6. Echter Ablauf
1. `ACCESS CARD SCANNEN` — TEST-Pioneer-Karte.
2. `NODE SCANNEN` — TEST-Node-Tag.
3. `1-CORE EXCHANGE VORBEREITEN` — erst jetzt erscheint der Access Code.
4. Eigenen Test-N-Core scannen.
5. Einen der drei Node-Cores scannen.
6. `EXCHANGE BESTÄTIGEN`.
7. Serverzustand prüfen: Pioneer weiterhin 1 Core, Node weiterhin exakt 3 Cores, genau ein EXCHANGE-Beleg.
8. Noch einmal bestätigen: Antwort muss `REPLAY` sein, keine zweite Buchung.
9. Server stoppen/starten und Zustand erneut laden — Buchung muss bestehen bleiben.

## Grenzen dieses Releases
- Nur Pioneer / 1-Core-Exchange ist über HTTP/UI freigeschaltet.
- Kein produktionsreifer NFC-Vertrauenspfad; Web-NFC-Serial ist ausschließlich Hardware-/UX-Test.
- Kein V1-Cutover, keine Datenmigration, keine Produktiv-Credentials.
- EVAC, RESTORE, Catch, Upload, RE-SUPPLY und FOP sind nicht über diese Test-UI schaltbar.
- COM und Mission Board bleiben unangetastet.

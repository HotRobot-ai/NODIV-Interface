# NODIV V2 – INITIAL DEPLOYMENT / TECHNISCHER PRÜFBERICHT

Stand: 24.10.2026  
Branch: `feature/v2-initial-deployment`  
Produktivdeployment: keines  
Mission Board / COM: unverändert eingefroren

## Ausgangspunkt

Technischer Ausgangspunkt ist `feature/v2-nodiv-identity-polish @ 1089f6b916a63088b24ab46217f3a842d2dcf77e`.

Der bisherige flexible Desktopmodus blieb rückwärtskompatibel erhalten. Der neue strukturierte Initial-Deployment-Ablauf wird nur verwendet, wenn Founder einen Initial-Deployment-Teamplan angelegt hat.

## Implementierter Umfang

- Founder-Spielerverwaltung mit echtem Namen, Rolle und Callsign.
- Eindeutiger automatisch vergebener Callsign, wenn kein eigener gewählt wird.
- Access-Card-Bindung an vorbereitete Spieleridentität.
- Persistenter Teamplan aus 1 FOP + 2 Pioneer.
- Zwei unterschiedliche Start-Nodes.
- Sechs konkrete Deployment-Cores, drei je Pioneer.
- Persönlicher Start-Core getrennt von Deployment-Transit.
- Pioneer-Deployment-Transit → bestätigte FOP-Übergabe → bestehende FOP-Installation.
- FOP-Bestätigung beider Pioneer mit idempotentem Wiederholungsschutz.
- Falsche Pioneer-/Core-/Node-Kombinationen werden serverseitig abgelehnt.
- Pioneer-Node-Inbetriebnahme ohne Veränderung des Core-Besitzes.
- Normale Pioneer-Feldaktionen bleiben serverseitig blockiert, bis beide Start-Nodes installiert und von den richtigen Pioneers aktiviert wurden.
- Danach unveränderter Übergang in das bestehende Gameplay.
- Persistenter Recovery-Pfad für einen bereits autoritativ installierten Node nach Prozessunterbrechung.
- HTML-/CSV-Auswertung mit automatischen Fakten, Fehlerereignissen, Core-Bilanz und getrenntem Spielerfeedback.

## Rückwärtskompatibilität

Nicht ersetzt oder neu implementiert wurden:
- Exchange,
- persönliche Slots,
- HQ Upload / Secure Approach,
- RESTORE,
- RE-SUPPLY,
- Catch / Ghost,
- gemeinsamer FOP-Installationskern,
- EVAC.

Der vorhandene flexible Desktop-Teststart bleibt verfügbar, solange kein strukturierter Initial-Deployment-Teamplan angelegt wurde.

## Datenintegrität

Deployment-Cores verwenden weiterhin die bestehende Core-Tabelle. Es gibt keinen zweiten Core-Bestand.

Zulässiger Initial-Deployment-Pfad:
`HQ/RESERVE → TRANSIT/PIONEER/DEPLOYMENT_TRANSIT → TRANSIT/FOP/IN_TRANSIT → NODE/DEPLOYED`.

Persönliche Start-Cores verwenden unverändert:
`HQ/RESERVE → PIONEER/FIELD`.

Damit bleiben persönliche Slot-Grenzen und Deployment-Material getrennt.

## Automatisierte Abnahme

Status bei Erstellung dieses Berichts: **CI-Lauf für diesen Branch noch ausstehend.**

Der finale Status wird erst nach einem vollständigen GitHub-Actions-Lauf gesetzt. Der Workflow prüft:
- gemeinsame V2-Serverregression,
- vollständige Desktop-/Labregression,
- Initial-Deployment-End-to-End-Test,
- Negativfälle,
- Neustart/Persistenz,
- erster normaler Exchange nach Teamfreigabe,
- Syntax,
- Paket-Smoke,
- Windows-Starter/PowerShell/Import.

## VERIFIZIERT

Noch nichts aus dem neuen Initial-Deployment-Branch wird in diesem Bericht vor dem CI-Lauf als automatisiert verifiziert bezeichnet.

## OFFEN

- Reale Schreibtischabnahme mit Android Chrome und echten Access Cards.
- Reale NFC-Scans der sechs Deployment-Cores.
- Reale Installation beider physischen Start-Nodes.
- Pioneer-Inbetriebnahme beider realen Nodes.
- Danach mindestens ein echter normaler Exchange.
- Sichtprüfung der Rolleninterfaces auf den verwendeten Smartphones.

## BLOCKIERT

Kein technischer Blocker bekannt. Die Hardwareabnahme kann nur am vorhandenen physischen Testaufbau durchgeführt werden.

## Produktgrenze

Kein Merge nach `main`, kein produktives Deployment, keine produktive Eventinitialisierung.

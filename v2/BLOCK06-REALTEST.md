# NODIV V2 – BLOCK 06: Repräsentativer Smartphone-/NFC-Abschlusstest

Stand: 16.10.2026  
Gilt ausschließlich für den isolierten BLOCK-06-Teststand. Keine Produktivänderung.

## Zweck

Dieser Durchlauf bestätigt nur die durch BLOCK 05/06 neu betroffenen Rollen-, HQ- und EVAC-Pfade auf Gaming-PC + Smartphone + NFC. Bereits bestandene BLOCK-01/02-Grundlagen werden nicht erneut bewiesen.

## PASS-Abfolge

### A. Rollenlogin

Je einmal mit der vorhandenen Test-Access-Card anmelden:
- Founder
- FOP
- Pioneer
- Local
- Unbound

PASS:
- Rolle/Identität sofort erkennbar.
- genau eine klare nächste Handlung.
- Local/Unbound sehen keine internen Node-/HQ-Daten.
- FOP sieht im Normalbetrieb keine EVAC-Steuerung.

### B. Pioneer Node

Mit Pioneer:
1. Node per NFC scannen.
2. einen zulässigen Exchange über die neue Rollenoberfläche ausführen.
3. Serverprüfung und Commit müssen klar getrennt erkennbar sein.

PASS:
- Exchange bestätigt.
- Node bleibt 3/3.
- anschließender Node-Cooldown wird verständlich angezeigt.

### C. HQ / Secure Approach

Mit einem Test-Pioneer mit mindestens 150 E gesicherter Energie:
1. HQ öffnen.
2. Secure Approach aktivieren.
3. Uploadpunkt scannen/anmelden.
4. einen zulässigen Upload abschließen.

PASS:
- 150 E genau einmal abgebucht.
- Catch-Schutz/Reservierung sichtbar.
- keine Doppelabbuchung bei Reload/Retry.
- Uploadabschluss verständlich bestätigt.

### D. Local oder Unbound Catch

1. Local oder Unbound anmelden.
2. Pioneer Access Card per NFC scannen.
3. Catch-Preview prüfen.
4. Catch bestätigen.

PASS:
- geschützter Pioneer wird verständlich blockiert.
- ungeschützter gültiger Pioneer kann erfolgreich gecatcht werden.
- keine NODIV-Interninformationen im Catcher-Interface.

### E. FOP Node

1. FOP anmelden.
2. einen isolierten Test-Node scannen.
3. den serverseitig angebotenen Node-Ablauf durchführen.

PASS:
- Scan → Serverprüfung → Commit klar.
- Installation nur mit exakt drei gültigen Cores.
- Node danach exakt 3/3.
- keine EVAC-Steuerung vor EVAC.

### F. Repräsentativer EVAC-Pfad

Im isolierten EVAC-Testzustand:
1. Founder startet EVAC nach Readiness.
2. FOP erneut öffnen: EVAC-Steuerung muss jetzt sichtbar sein.
3. ein FOP-Team bilden.
4. einen zugewiesenen Node + drei zugehörige Cores per NFC prüfen und Recovery bestätigen.
5. zugewiesenen Pioneer öffnen.
6. eigenen EVAC-Auftrag öffnen.
7. einen Cargo-Core für Last Secure Upload scannen.
8. Final Upload bestätigen.

PASS:
- normale Field-Aktionen sind während EVAC gesperrt.
- FOP sieht nur gültige Zuweisungen.
- Recovery akzeptiert nur passenden 3/3-Snapshot.
- Pioneer sieht nur eigenen Auftrag/Cargo.
- Final Upload sichert alle drei Cargo-Cores und nutzt nur den gewählten Core für finale Energie.
- keine technischen Rohfehler in der Spieleroberfläche.

## UX-PASS

Bei allen obigen Schritten:
- outdoor-lesbare Schrift.
- große Touchflächen.
- keine doppelten Aufforderungen.
- blockierte Aktion erklärt die nächste mögliche Handlung.
- keine Browser-/Clientzustände wirken als Spielwahrheit.

## Ergebnis

BLOCK 06 gilt real als bestanden, wenn A–F ohne spielerische Sackgasse funktionieren und kein Core verloren, doppelt gebucht oder zwei Besitzern gleichzeitig zugeordnet erscheint.

Bei einem Fehler nur den betroffenen neuen Pfad reproduzieren; keine pauschale Wiederholung alter BLOCK-01/02-Tests.

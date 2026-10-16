# NODIV V2 – BLOCK 06: Vollständiger Spielablauf

## Startauftrag

**Auftrag:** Setze NODIV V2 unmittelbar nach dem verifizierten BLOCK 05 fort und prüfe das Spiel erstmals als vollständigen zusammenhängenden Ablauf über alle freigegebenen Rollen und Kernmechaniken.

## 1. Verbindlicher Ausgangspunkt

Lies zuerst den aktuellen **NODIV-MASTERSTAND** in Google Drive und prüfe anschließend den tatsächlichen GitHub-Stand.

Repository:
- `HotRobot-ai/NODIV-Interface`

Zu verifizieren:
- BLOCK-05-Branch: `feature/v2-block05-roles`
- Draft-PR #3 gegen `feature/v2-block04-integrity`
- `v2/BLOCK05-ROLES.md`
- letzter erfolgreicher BLOCK-05-Actions-Nachweis aus dem Abschlussbericht.

Übernimm keine unbestätigten Abschlussmeldungen. Prüfe den tatsächlichen Branch-HEAD und den dazugehörigen finalen Actions-Run.

BLOCK 01 und 02 sind abgeschlossen. Die realen PC-/Handy-/NFC-Ersttests fanden auf dem **Gaming-PC**, nicht auf dem Mini-PC statt. Erfolgreiche reale NFC-Tests nicht grundlos wiederholen.

BLOCK 03 hat die Core-mutierenden Spielbausteine auf eine gemeinsame SQLite-Wahrheit zusammengeführt. BLOCK 04 hat Regeln, Konfliktsperren, Idempotenz, Parallelzugriffe und Recovery abgesichert. BLOCK 05 hat Founder, FOP, Pioneer, Local und Unbound an diesen Kern angebunden, Secure Approach auf V2-Parität gebracht und die Rollenführung smartphone-first umgesetzt.

## 2. Ziel von BLOCK 06

Prüfe und vervollständige den **vollständigen Spielablauf als ein zusammenhängendes Event** – von der isolierten Eventvorbereitung bis zum bestätigten Abschluss.

Nicht einzelne Funktionen noch einmal isoliert beweisen, sondern nachweisen, dass die bereits entwickelten Komponenten in der realen Reihenfolge gemeinsam funktionieren, sich nicht widersprechen und die Spieler zu jedem Zeitpunkt eine eindeutige nächste Handlung erhalten.

Leitlinie:

**Ein Event. Eine SQLite-Wahrheit. Fünf Rollen. Keine Sackgassen.**

## 3. Verbindliche Architektur

Die SQLite-/Serverlogik bleibt die einzige Datenwahrheit.

Clients dürfen weiterhin nicht selbst entscheiden oder dauerhaft verwalten:
- Core-Eigentum oder Energie.
- Slot-Kapazität.
- Missionen/Berechtigungen.
- Cooldowns/Sperren.
- Ghost-/Catch-Schutz.
- Upload-/Secure-Approach-Reservierungen.
- RE-SUPPLY-Ziel oder Cargo.
- EVAC-Teams, Node-Zuweisungen oder Final-Upload-Energie.
- Eventzustand.

Alle UI-Zustände und nächsten Handlungen werden aus dem Serverzustand abgeleitet.

## 4. Durchgängiger Eventablauf

Erzeuge eine **isolierte V2-Testveranstaltung**, keine produktive Eventinitialisierung.

Prüfe in sinnvoller Reihenfolge mindestens:

### Founder / Eventvorbereitung
- Eventzustände und Readiness aus realen V2-Daten.
- nur zulässige Founder-Aktionen.
- keine simulierten Live-Daten.
- PRE-EVAC/EVAC-Start nur über die bestehenden Guards.
- Eventabschluss erst nach tatsächlich erfüllten EVAC-Bedingungen.

### FOP / Aufbau
- Node-Installation mit exakt drei Cores.
- Scan → Serverprüfung → Commit.
- installierte Nodes bleiben 3/3.
- Recovery bei Reload/Restart nur soweit durch BLOCK-05-Pfade neu betroffen.
- normale EVAC-Steuerung bleibt vor EVAC unsichtbar.

### Pioneer / Normalbetrieb
- Start 1/3.
- Node-Exchange.
- 5-Minuten-Node-Cooldown.
- RESTORE #1 → 2/3.
- erforderlicher 2-Core-Exchange.
- RESTORE #2 → 3/3.
- 1-Stunden-RESTORE-Zielsperre.
- Catch und Ghost-Schutz im realen Ablauf.
- HQ Anmeldung.
- normaler Teil-Upload.
- optionaler Secure Approach: 150 E / 5 Minuten Schutz + exklusive Reservierung.
- echter 3/3-Voll-Upload.
- Pflicht-RE-SUPPLY muss im selben Commit entstehen; keine 0/3-Sackgasse.
- RE-SUPPLY durchführen und persönliches Inventar wiederherstellen.

### Local
- Access.
- Pioneer Access Card scannen.
- Catch-Preview.
- blockierter Catch bei Ghost/Schutz verständlich.
- erfolgreicher Catch.
- kein Zugriff auf NODIV-Interninformationen.

### Unbound
- aktuelles freigegebenes Access-/Catch-Grundgerüst im Gesamtfluss.
- **keine neue Sondermechanik erfinden.**
- falls weiterhin keine Founder-Entscheidung für eine Unbound-Sondermechanik vorliegt, bleibt diese ausdrücklich außerhalb BLOCK 06.

### EVAC / Abschluss
- Founder startet EVAC erst nach Readiness.
- normale Core-mutierende Feldaktionen frieren ein.
- FOP-EVAC-Steuerung erscheint erst jetzt.
- FOP bildet gültige Teams.
- Node-Zuweisungen kollisionsfrei.
- pro Node: physischer/isolierter Scanpfad + 3-Core-Snapshot + Recovery.
- Cargo geht an den serverseitig zugewiesenen Pioneer.
- Pioneer sieht nur den eigenen EVAC-Auftrag.
- Last Secure Upload: genau ein ausgewählter Cargo-Core liefert finale Energie; alle drei Cargo-Cores werden gesichert.
- Team-Receipts/Reconciliation.
- alle erforderlichen Nodes deinstalliert/evakuiert.
- Eventabschluss über die bestehende Completion-Logik.
- am Ende keine verlorenen, doppelt gebuchten oder gleichzeitig mehreren Besitzern zugeordneten Cores.

## 5. Reale Smartphone-/NFC-Prüfung

BLOCK 06 darf die bereits bestandenen BLOCK-01/02-Ersttests nicht stumpf wiederholen.

Da BLOCK 05 jedoch neue Rollen- und EVAC-Scanpfade ergänzt hat, führe einen **repräsentativen realen Durchlauf auf dem Gaming-PC + Smartphone + NFC** für genau die neu hinzugekommenen bzw. geänderten Pfade durch.

Mindestens:
- Login/Interface je Rolle.
- ein Pioneer-Node-Exchange über die neue Rollenoberfläche.
- ein HQ-/Secure-Approach-Ablauf.
- ein Local- oder Unbound-Catch.
- ein FOP-Node-Ablauf.
- ein repräsentativer EVAC-Recovery/Final-Upload-Pfad.

Kein erneuter Grundlagenvergleich, wenn der gleiche NFC-Unterbau unverändert ist. Der Mini-PC bleibt ein späterer Zielserver; die früheren realen Tests fanden auf dem Gaming-PC statt.

## 6. Restart / Recovery

Wiederhole alte Restarttests nicht pauschal.

Prüfe nur neue BLOCK-05-Zustände, die einen Neustart überleben müssen:
- Secure-Approach-/HQ-Reservierung.
- laufende Upload-Anmeldung, soweit dauerhaft gespeichert.
- rollenbezogener Serverzustand.
- EVAC-Zuweisungen/Recovery-Receipts.

Kein Browserzustand darf nach Neustart zur Wahrheit werden.

## 7. UX-Abnahme

Für jede Rolle auf Smartphone prüfen:
- sofort erkennbare Rolle/Identität.
- genau eine offensichtliche nächste Handlung.
- Scan, Serverprüfung und Commit verständlich getrennt.
- keine doppelten Aufforderungen.
- keine technischen Fehlercodes für Spieler.
- bei blockierter Aktion wird erklärt, was jetzt möglich ist.
- draußen lesbare Schrift und ausreichend große Touchflächen.
- FOP-EVAC im Normalbetrieb unsichtbar.

UI-Probleme gezielt korrigieren; keine neue Designarchitektur bauen.

## 8. Tests

Automatisierte Tests nur dort erweitern, wo der zusammenhängende Ablauf neue Cross-Action-Risiken zeigt.

Mindestens:
- kompletter isolierter Event-End-to-End-Test.
- Ownership-/Audit-Integrität nach dem kompletten Ablauf.
- kein Client-Bypass gegenüber SQLite.
- keine Parallelaktion während EVAC.
- Full-Upload/RE-SUPPLY ohne Sackgasse.
- relevante Replay-/Retry-Fälle.
- bestehende Regressionen weiter grün.

Der **30-Spieler-Belastungstest ist nicht automatisch Bestandteil dieses Blocks**, solange der Founder ihn nicht ausdrücklich als Teil von BLOCK 06 festlegt.

## 9. Verbindliche Grenzen

- Mission Board und sämtliche COM-Erweiterungen bleiben vollständig eingefroren.
- keine Entwicklung, Tests, Integration, Runner-Reparaturen oder Nebenarbeit daran.
- keine neue Unbound-Sonderregel ohne Founder-Entscheidung.
- keine produktive Veröffentlichung.
- keine produktive Eventinitialisierung.
- kein Merge nach `main` ohne Founder-Freigabe.
- keine unnötige neue Architektur.
- keine clientseitige Parallelwahrheit.
- erfolgreiche Tests nur wiederholen, wenn der durch BLOCK 05 geänderte Pfad es technisch verlangt.

## 10. Abschlusskriterien

BLOCK 06 ist erst abgeschlossen, wenn nachweisbar:
1. ein vollständiges isoliertes Event über die fünf Rollen ohne Sackgasse durchgespielt wurde.
2. Founder-, FOP-, Pioneer-, Local- und Unbound-Führung im tatsächlichen Ablauf zusammenpasst.
3. Exchange, RESTORE, Catch, HQ Upload, Secure Approach, RE-SUPPLY, FOP und EVAC dieselbe SQLite-Wahrheit behalten.
4. Full-Upload niemals einen Pioneer ohne sicheren Pflicht-RE-SUPPLY auf 0/3 zurücklässt.
5. EVAC erst nach Freigabe erscheint und normale Aktionen danach korrekt einfriert.
6. relevante API-/Browser-/Integrationstests grün sind.
7. die durch BLOCK 05 neu hinzugekommenen Smartphone-/NFC-Pfade repräsentativ real geprüft wurden.
8. Implementiert / automatisiert getestet / real getestet / GitHub gespeichert / produktiv veröffentlicht / Echtbetrieb sauber getrennt dokumentiert sind.
9. keine produktive Änderung erfolgt ist.
10. der NODIV-MASTERSTAND aktualisiert und die Speicherung verifiziert wurde.
11. der eine nächste sinnvolle Schritt nach BLOCK 06 bestimmt und als Startauftrag vorbereitet ist.

**Beginne mit der tatsächlichen Bestandsprüfung und arbeite anschließend ohne unnötige Rückfragen weiter.**

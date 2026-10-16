# NODIV V2 – BLOCK 04: Spielregeln und Datenintegrität

Stand: 16.10.2026  
Status: **isoliert implementiert und automatisiert getestet – nicht produktiv**

## Verifizierter Ausgangspunkt

- Repository: `HotRobot-ai/NODIV-Interface`
- BLOCK-03-Branch: `feature/v2-block03-consolidation`
- Verifizierter BLOCK-03-HEAD: `a508036ea7561cbb4838e86af56501fbf8e5bc49`
- BLOCK 01 und BLOCK 02 bleiben abgeschlossen.
- Die realen PC-/Handy-/NFC-Tests aus BLOCK 01/02 wurden auf dem Gaming-PC durchgeführt, nicht auf dem Mini-PC.
- Mission Board und sämtliche COM-Erweiterungen blieben unangetastet.

## BLOCK-04-Branch

`feature/v2-block04-integrity`

## Gesicherte Invarianten

### Gemeinsame Datenwahrheit
Alle normalen Core-mutierenden Aktionen arbeiten weiter auf derselben SQLite-Datenbank. Zusätzliche Integritätsprüfungen erkennen ungültige Node-Bestände, verwaiste Eigentümer, ungültige HQ-Zuordnungen und überschrittene Pioneer-Kapazitäten. Es wurde keine zweite Eigentumsverwaltung eingeführt.

### Exchange
- Node muss installiert sein und exakt drei `DEPLOYED` N-Cores besitzen.
- Rein = raus; maximal entsprechend Pioneer-Kapazität.
- Persönliche Eingänge müssen `FIELD` sein.
- Nach erfolgreichem Exchange gilt der bestehende 5-Minuten-Node-Cooldown.
- Cooldown ist persistent und überlebt einen Prozess-/Runtime-Neustart.
- Aktive Missions-/Operationsreservierungen können nicht durch Exchange umgangen werden.
- Idempotenter Replay bleibt möglich; abweichende Wiederholung wird abgewiesen.

### RESTORE
- RESTORE #1 und #2 benötigen eine aktive, nicht abgelaufene, exakt zu Pioneer/Node/Transit-Core passende Mission.
- RESTORE #1 setzt einen vorherigen normalen Exchange voraus.
- RESTORE #2 setzt RESTORE #1 plus einen echten 2-Core-Exchange danach voraus.
- Nur der niedrigste sichtbare Node-Core darf verdrängt werden.
- Der Transit-Core muss `IN_TRANSIT` und dem ausführenden Pioneer zugeordnet sein.
- Das Ergebnis muss mindestens 450 E Node-Energie erreichen.
- Nach RESTORE gilt für den ausführenden Pioneer die bestehende 1-Stunden-Sperre auf dem Ziel-Node.
- Missionsabschluss, Core-Transfer und Slot-Freischaltung erfolgen in derselben Transaktion.

### Catch
- Höchster catchbarer sichtbarer E-Wert bleibt verbindlich.
- Missionsgebundene Transit-/reservierte Cores bleiben geschützt.
- Ghost-Schutz und Catch-Receipt bleiben atomar/idempotent.
- Ein gestarteter EVAC friert Catch jetzt genauso wie die übrigen normalen Ownership-Aktionen ein.
- Ein vorbereiteter Catch kann einen inzwischen abgeschlossenen Exchange nicht überschreiben.

### HQ Upload
- Nur eigene `FIELD`-Cores können normal hochgeladen werden.
- EVAC-Cargo kann nicht über den normalen HQ-Upload eingeschleust werden.
- Energie wird aus den serverseitigen Core-Werten berechnet.
- Ownership, Energieverbuchung, Audit und Idempotenz bleiben atomar; Replay schreibt keine Energie doppelt gut.

### RE-SUPPLY
- Erfordert eine aktive, nicht abgelaufene, exakt gebundene Mission.
- Transit-Core, Ziel-Node und niedrigster auszugebender Core werden serverseitig geprüft.
- Persönliches Inventar muss leer sein.
- RESTORE-Zielsperre sowie aktive Node-/Core-Reservierungen können nicht umgangen werden.
- Abgelaufene Transitmissionen werden beim Wiederanlauf kontrolliert auf HQ/`RESERVE` zurückgeführt und als `CANCELLED` markiert; Recovery ist idempotent.

### FOP
- Installation weiterhin nur als atomare 3-Core-Operation auf einen verfügbaren/leeren Node.
- Deinstallation weiterhin nur bei exakt drei `DEPLOYED` Cores.
- Aktive Missionen/Reservierungen am Ziel-Node blockieren widersprüchliche FOP-Mutationen.

### EVAC und Eventabschluss
- `EVAC STARTED` sperrt normale Ownership-Aktionen einschließlich Catch.
- EVAC-Teamreservierungen, Node-Recovery, Cargo-Provenienz, Final Upload, Energieledger und Abschluss bleiben in der gemeinsamen SQLite-Wahrheit.
- Nur aktive, noch nicht abgelaufene normale Missionen/Reservierungen gelten als Abschlussblocker; abgelaufene Transitmissionen werden vorher kontrolliert recovered.
- Der bestehende dedizierte EVAC-Pfad bleibt erhalten; keine normale Upload-Abkürzung.

### Gleichzeitige Zugriffe / Neustart
- SQLite verwendet für file-backed Betrieb WAL und `BEGIN IMMEDIATE`.
- Ein echter Zwei-Worker-Test öffnet zwei getrennte SQLite-Verbindungen und startet konkurrierende Exchanges gleichzeitig. Exakt eine Mutation commitet; die zweite wird nach Serialisierung durch den Node-Cooldown abgewiesen.
- Ein file-backed Simulations-Test unterbricht eine Transaktion vor dem Commit, öffnet die DB danach neu und weist vollständigen Rollback sowie erfolgreichen kontrollierten Retry nach.

## Automatisierte Nachweise

GitHub Actions Workflow: `V2 Block04 Integrity`  
Erfolgreicher Run: `38932715930`

- V2 Server: **129 / 129 bestanden**
- Mini-PC-Lab-Regression: **5 / 5 bestanden**
- Gesamt in diesem Lauf: **134 / 134 bestanden**
- Darin enthalten: reale konkurrierende SQLite-Schreiber, Restart/Rollback, Cooldown-Persistenz, RESTORE-Progression, Cross-Action-Reservierung, Catch↔EVAC-Freeze und Transit-Mission-Recovery.

Ein vorheriger erweiterter Lauf deckte ungültige Alt-Fixtures und uneinheitliche Fehlerreihenfolge auf. Die Regeln wurden nicht aufgeweicht; die Fixtures wurden auf reale `DEPLOYED`-/EVAC-Provenienz-Zustände korrigiert und die Konfliktfehler wieder eindeutig geordnet.

## Statusgrenzen

- **Implementiert:** ja, auf `feature/v2-block04-integrity`
- **Automatisiert getestet:** ja
- **GitHub gespeichert:** ja
- **Produktiv veröffentlicht:** nein
- **Im Echtbetrieb geprüft:** nein
- **Reale NFC-Tests wiederholt:** nein; dafür bestand kein technischer Grund
- **Produktiv-Event initialisiert:** nein

## Verbleibende Risiken / nächste Grenze

- BLOCK 04 beweist Integrität und Regelkonsistenz im isolierten V2-/Lab-Betrieb, nicht den produktiven Feldbetrieb.
- Ein echter 30-Spieler-Last-/Latenztest und der spätere Mini-PC-Feldeinsatz sind separate Schritte.
- Der optionale V1-`Secure Approach` (150 E / 5 Minuten) ist im aktuellen V2-Kompositionskern noch kein eigener migrierter Aktionspfad. Er ist deshalb derzeit kein Umgehungspfad, muss aber vor Fertigstellung des Pioneer-HQ-Interfaces auf Parität gebracht oder bewusst vom Founder anders entschieden werden.
- Mission Board und COM bleiben eingefroren.

## Nächster sinnvoller Schritt

BLOCK 05: die fünf Rolleninterfaces Founder, FOP, Pioneer, Local und Unbound auf den nun abgesicherten V2-Kern verdrahten und die bestehenden Spielabläufe mobil, intuitiv und ohne clientseitige Parallelwahrheit ausführbar machen.

# NODIV V2 – BLOCK 06: Vollständiger Spielablauf

Stand: 16.10.2026  
Branch: `feature/v2-block06-full-flow`  
Basis: BLOCK 05 `54acdd2ef31cceb4976f94bf24cc1f74f6b71a12`  
Draft-PR: #4 gegen `feature/v2-block05-roles`

## Status

BLOCK 06 ist **automatisiert vollständig durchgespielt**, aber noch **nicht final abgeschlossen**, solange die im Startauftrag verlangte repräsentative reale Smartphone-/NFC-Abnahme der durch BLOCK 05 neu hinzugekommenen Rollen- und EVAC-Pfade fehlt.

Keine Produktivänderung. Kein Merge nach `main`. Keine produktive Eventinitialisierung. Mission Board und sämtliche COM-Erweiterungen blieben eingefroren.

## Verifizierter Ausgangspunkt

- BLOCK-05-Branch: `feature/v2-block05-roles`.
- finaler BLOCK-05-HEAD: `54acdd2ef31cceb4976f94bf24cc1f74f6b71a12`.
- finaler BLOCK-05-Actions-Run `38937309211`: erfolgreich.
- BLOCK-05-Nachweis: 142/142 V2-Servertests, 9/9 Mini-PC-Labtests und Browser-Client-Syntax bestanden.
- Reale BLOCK-01/02-PC-/Handy-/NFC-Ersttests wurden nicht wiederholt; sie fanden auf dem Gaming-PC statt.

## Gefundene und behobene Cross-Flow-Lücken

### 1. RESTORE #2 ließ den Pioneer nicht tatsächlich 3/3 erreichen

Der bisherige V2-Pfad erhöhte bei RESTORE #2 die Kapazität auf 3, schob den verdrängten niedrigsten Node-Core aber zum HQ. Damit hatte der Pioneer nach der vorgesehenen Progression nur zwei persönliche FIELD-Cores und konnte im normalen Ablauf keinen echten 3/3-Voll-Upload erreichen.

Korrektur:
- RESTORE #1 und #2 ersetzen weiterhin den niedrigsten Node-Core durch den zugewiesenen HQ-Transit-Core.
- Der verdrängte niedrigste Node-Core geht in beiden Progressionsphasen an den ausführenden Pioneer.
- Die Kapazität steigt im selben Commit von 1→2 bzw. 2→3.
- Node bleibt 3/3.
- 1-Stunden-RESTORE-Zielsperre bleibt unverändert.

Damit ist die bestehende Progression tatsächlich durchgängig:
`1/3 → Exchange → RESTORE #1 → 2/3 → 2-Core-Exchange → RESTORE #2 → 3/3`.

### 2. Founder hatte im Rollen-/Labpfad keinen Eventabschluss

Die bestehende EVAC-Completion-Domänenlogik war vorhanden, aber der BLOCK-05-Rollenpfad endete nach EVAC praktisch beim Monitoring.

Korrektur:
- Founder-Rollenprojektion prüft die bestehende EVAC-Completion-Gate-Logik.
- `EVAC_COMPLETE` erscheint nur, wenn alle autoritativen EVAC-Nachweise vollständig sind und keine aktiven Missionen/Reservierungen offen sind.
- neuer Founder-Lab-Endpunkt `POST /api/founder/evac/complete` ruft ausschließlich die vorhandene Completion-Domänenlogik auf.
- Founder-UI zeigt „EVENT ABSCHLIESSEN“ erst nach serverseitiger Freigabe.
- vor vollständigem EVAC bleibt Completion fail-closed.

## Vollständiger automatisierter Eventnachweis

Neu: `v2/server/block06-full-event.test.mjs`.

Ein zusammenhängendes isoliertes Event prüft in einer SQLite-Datenwahrheit:

1. Founder/FOP-Eventvorbereitung.
2. zehnten Start-Node durch FOP mit exakt drei IN-TRANSIT-Cores installieren.
3. FOP-EVAC-Steuerung vor EVAC unsichtbar.
4. Pioneer 1/3 startet mit einem persönlichen Core.
5. 1-Core-Exchange und 5-Minuten-Node-Cooldown.
6. RESTORE #1 → tatsächliches 2/3-Inventar.
7. erforderlicher 2-Core-Exchange.
8. RESTORE #2 → tatsächliches 3/3-Inventar.
9. 1-Stunden-RESTORE-Zielsperre.
10. normaler Teil-Upload über HQ.
11. Secure Approach mit exakt 150 E, exklusiver Reservierung und Catch-Schutz.
12. Local-Catch und Unbound-Catch über das gemeinsame freigegebene Grundgerüst; keine neue Unbound-Sondermechanik.
13. echter 3/3-Voll-Upload.
14. atomar erzeugter Pflicht-RE-SUPPLY; kein erfolgreicher 0/3-Zustand ohne Auftrag.
15. RE-SUPPLY und erneute 3/3-Node-Invariante.
16. Founder-EVAC-Readiness und EVAC-Start.
17. normale Exchange-/Catch-Aktionen nach STARTED eingefroren.
18. fünf FOP-Teams für zehn ursprüngliche Event-Nodes.
19. zehn Node-Recoveries mit 3-Core-Snapshot und konsumiertem Single-Use-V2-NFC-Grant.
20. zehn Pioneer Final Uploads; genau ein ausgewählter Core liefert finale Energie, alle drei Cargo-Cores werden gesichert.
21. Team-Complete-/Withdrawal-Receipts und Reconciliation.
22. zehn ursprüngliche Nodes deinstalliert.
23. keine NODE-/EVAC_CARGO-Reste.
24. Founder erhält erst jetzt `EVAC_COMPLETE`.
25. Eventabschluss und idempotenter Replay.
26. finale SQLite-Integritätsprüfung.

## Automatisierte Nachweise

Erster BLOCK-06-CI-Nachweis auf Code-/Teststand `3b0ec1821a2fc5998dfbff8e420bc660ca1827e1`:

- GitHub Actions Run `38938972679`: **SUCCESS**.
- V2 Server: **143/143 bestanden**.
- Mini-PC Lab: **9/9 bestanden**.
- Browser-Client-Syntax: **bestanden**.
- der neue vollständige BLOCK-06-Eventtest selbst ist bestanden.

Der finale HEAD-Nachweis nach Dokumentationscommits wird separat verifiziert.

## Statusabgrenzung

- isoliert implementiert: **JA**.
- vollständiger automatisierter Eventablauf: **JA**.
- automatisierte Regressionen: **JA**.
- GitHub gespeichert: **JA**.
- neue BLOCK-05/06 Smartphone-/NFC-Pfade real geprüft: **NOCH NICHT**.
- produktiv veröffentlicht: **NEIN**.
- Echtbetrieb: **NEIN**.

## Offener Abschlussnachweis

Für den finalen BLOCK-06-Abschluss bleibt genau die im Startauftrag verlangte repräsentative reale Abnahme auf Gaming-PC + Smartphone + NFC offen. Sie wird auf die neu betroffenen Pfade begrenzt; alte BLOCK-01/02-Grundlagentests werden nicht wiederholt.

Ablauf: siehe `v2/BLOCK06-REALTEST.md`.

Erst nach diesem PASS werden MASTERSTAND als „BLOCK 06 abgeschlossen“ finalisiert und BLOCK 07 verbindlich vorbereitet.

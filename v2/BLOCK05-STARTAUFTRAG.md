# NODIV V2 – BLOCK 05: Rolleninterfaces und durchgängige Spielerführung

**Auftrag:** Setze die Entwicklung von NODIV V2 unmittelbar nach dem abgeschlossenen BLOCK 04 fort.

## 1. Verbindlicher Ausgangspunkt

Lies zuerst den aktuellen **NODIV-MASTERSTAND** in Google Drive und prüfe anschließend den tatsächlichen GitHub-Stand.

Repository:
- `HotRobot-ai/NODIV-Interface`

Zu verifizieren:
- BLOCK-04-Branch: `feature/v2-block04-integrity`
- den im MASTERSTAND dokumentierten finalen BLOCK-04-Commit
- den erfolgreichen finalen BLOCK-04-GitHub-Actions-Lauf

Übernimm keine unbestätigten Abschlussmeldungen.

BLOCK 01 und BLOCK 02 sind abgeschlossen. Die realen PC-, Handy- und NFC-Tests fanden auf dem **Gaming-PC**, nicht auf dem Mini-PC statt. Erfolgreiche reale NFC-Ersttests nicht grundlos wiederholen.

BLOCK 03 hat die Core-mutierenden Spielbausteine auf einer gemeinsamen SQLite-Wahrheit zusammengeführt. BLOCK 04 hat die Spielregeln, Konfliktsperren, Idempotenz, konkurrierende Schreibzugriffe und Restart-/Recovery-Verhalten abgesichert.

## 2. Ziel von BLOCK 05

Baue die **fünf Rolleninterfaces Founder, FOP, Pioneer, Local und Unbound** so an den abgesicherten V2-Kern an, dass die vorhandenen Spielabläufe vom Spieler vollständig, mobil und intuitiv bedienbar sind.

Leitlinie:
**So wenig Informationen wie möglich, so viele wie nötig.**

Keine Verwaltungsdashboards. Die Oberflächen sollen wie hochwertige NODIV-Einsatzinterfaces wirken: starke Atmosphäre, klare Zustände, große Touchflächen, draußen auf dem Smartphone lesbar und pro Situation genau eine offensichtliche nächste Handlung.

## 3. Verbindliche Architekturregel

Die SQLite-/Serverlogik aus BLOCK 04 bleibt die **einzige Datenwahrheit**.

Die Clients dürfen insbesondere nicht selbst entscheiden oder dauerhaft verwalten:
- Core-Eigentum
- sichtbare/verborgene Energie
- Slot-Kapazität
- Cooldowns oder Sperrzeiten
- RESTORE-/RE-SUPPLY-Berechtigung
- Catch-Zielcore
- Ghost-Schutz
- Upload-Energie
- EVAC-Zustand oder Reservierungen

UI-Zustände werden aus dem Serverzustand abgeleitet. Keine zweite Eigentumslogik, keine parallele Browser-Wahrheit und keine lokale Regelkopie, die den Server umgehen kann.

## 4. Rollen

### Founder

Baue ein kompaktes Founder-Einsatzinterface für die bereits vorhandenen V2-Funktionen und Zustände.

Es muss den tatsächlichen Eventzustand verständlich zeigen und nur Aktionen anbieten, die laut Backend zulässig sind.

Keine neue Spielmechanik. Keine produktive Eventinitialisierung oder Veröffentlichung ohne gesonderte Founder-Freigabe.

### FOP

Der starke NODIV-Header bleibt.

Darunter ein kompaktes Einsatzterminal für die vorhandenen FOP-Abläufe:
- Node-Installation mit exakt drei Cores
- Deinstallation
- klare Scan-/Bestätigungsführung
- verständliche Fehler-/Recovery-Zustände
- EVAC-Ablauf erst dann sichtbar, wenn EVAC tatsächlich gestartet wurde

**Die Evakuierungssteuerung ist im Normalbetrieb unsichtbar.** Die bestehende EVAC-Mechanik selbst wird nicht verändert.

### Pioneer

Bilde die vorhandenen Regeln verständlich ab:
- 1/3 → 2/3 → 3/3 Slots
- persönliche N-Cores und Inventarenergie
- Node-Besuch und zulässiger Exchange
- 5-Minuten-Node-Cooldown
- RESTORE #1/#2 nur bei serverseitiger Qualifikation
- 1-Stunden-RESTORE-Zielsperre
- missionsgebundene Transit-Cores klar von persönlichem Inventar trennen
- RE-SUPPLY
- HQ // Upload Anmeldung
- normaler HQ Upload
- Ghost-/Schutzstatus nur soweit für die nächste Handlung nötig
- EVAC-Endablauf nur im tatsächlichen EVAC-Zustand

Vor Fertigstellung des HQ-Bereichs ausdrücklich prüfen, ob der bestehende optionale **Secure Approach** aus V1 in V2 bereits vollständig vorhanden ist. Falls nicht, zuerst die bestehende Regel **150 E / 5 Minuten Catch-Schutz + exklusive Upload-Reservierung** transaktionssicher in die V2-Datenwahrheit übernehmen. Keine Regeländerung ohne Founder-Entscheidung.

### Local

Ein bewusst reduziertes Interface:
- Access-Card-Identität
- Pioneer finden / Catch auslösen
- klare Scanführung
- Ghost-/Schutzsperren verständlich anzeigen
- keine NODIV-Interninformationen offenlegen

### Unbound

Das bestehende Rollenbild beibehalten und nur bereits verbindlich entschiedene Mechaniken umsetzen.

Falls für eine Unbound-Sondermechanik noch keine Founder-Entscheidung vorliegt, **nicht erfinden**. In diesem Fall zunächst das gemeinsame Catch-/Access-Grundgerüst sauber anbinden und die offene Spielregel als Founder-Entscheidung markieren.

## 5. UX / Design

- Smartphone zuerst; Desktop darf funktionieren, ist aber nicht die Leitgröße.
- Große Touchflächen und gut lesbare Texte für Outdoor-Nutzung.
- Starkes, einheitliches NODIV-Branding.
- Rollenbezogene Atmosphäre ohne unnötige Dekoration.
- Statusanzeigen müssen eindeutig sein.
- Keine doppelten Aufforderungen.
- Keine kryptischen technischen Fehlermeldungen für Spieler.
- Bei blockierter Aktion immer sagen, **was jetzt möglich ist**.
- NFC-Scan, Serverprüfung und Commit müssen visuell klar voneinander unterscheidbar sein, ohne den Spieler mit Technikdetails zu belasten.

## 6. Vorgehensweise

1. Bestehende V2-Interfaces und Adapter zuerst prüfen; vorhandene Arbeit gezielt weiterverwenden.
2. Pro Rolle den realen Spielerablauf gegen den BLOCK-04-Kern abgleichen.
3. Fehlende Serveradapter nur dort ergänzen, wo ein vorhandener Spielablauf sie tatsächlich benötigt.
4. UI und Backend nicht parallel neu erfinden.
5. Zusammengehörige Änderungen effizient bündeln.
6. Automatisierte Browser-/API-/Integrationstests risikogerecht erweitern.
7. Die bereits bestandenen realen NFC-Ersttests nicht wiederholen, außer ein geänderter NFC-Pfad macht das technisch notwendig.
8. Keine produktiven Deployments, Eventinitialisierungen oder spielverändernden Aktionen.

## 7. Verbindliche Grenzen

- **Mission Board und sämtliche COM-Erweiterungen bleiben vollständig eingefroren.**
- Keine Entwicklung, Tests, Integration, Runner-Reparaturen oder Nebenarbeiten an Mission Board/COM.
- Bestehende Spielmechaniken bleiben erhalten.
- Keine neue Spielregel ohne Founder-Entscheidung.
- Keine produktive Veröffentlichung ohne Founder-Freigabe.
- Keine unnötige neue Architektur.
- Keine clientseitige Parallelwahrheit.
- Bestehende erfolgreiche Tests nicht ohne technischen Grund wiederholen.

## 8. Abschlusskriterien

BLOCK 05 ist erst abgeschlossen, wenn nachweisbar:

1. Founder-, FOP-, Pioneer-, Local- und Unbound-Interface gegen den V2-Kern geprüft und die freigegebenen Abläufe angebunden sind.
2. Für jede Rolle die nächste Handlung auf Smartphone klar und intuitiv ist.
3. Die UI keine Regelumgehung gegenüber dem BLOCK-04-Kern ermöglicht.
4. Relevante API-/Browser-/Integrationstests grün sind.
5. Implementiert / getestet / GitHub gespeichert / produktiv veröffentlicht / im Echtbetrieb geprüft sauber getrennt dokumentiert sind.
6. Keine produktive Änderung erfolgt ist.
7. Der Google-Drive-MASTERSTAND aktualisiert und die Speicherung verifiziert wurde.
8. Der vollständige Startauftrag für BLOCK 06 vorbereitet ist.

**Beginne mit der tatsächlichen Bestandsprüfung und arbeite anschließend ohne unnötige Rückfragen weiter.**

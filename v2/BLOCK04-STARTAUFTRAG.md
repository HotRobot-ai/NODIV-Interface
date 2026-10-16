# NODIV V2 – BLOCK 04: Spielregeln und Datenintegrität

Lies zuerst den aktuellen Google-Drive-MASTERSTAND und prüfe den tatsächlichen GitHub-Stand des BLOCK-03-Entwicklungszweigs. BLOCK 01, BLOCK 02 und BLOCK 03 sind abgeschlossen. Erfolgreiche PC-/Handy-/NFC-Tests und die BLOCK-03-Kompatibilitätstests nicht ohne technischen Grund wiederholen.

## Ziel
Prüfe den in BLOCK 03 zusammengeführten V2-Kern systematisch gegen die verbindlichen Spielregeln und Datenintegritätsregeln von NODIV / Mission Würzburg. Korrigiere nur nachgewiesene Abweichungen. Keine neue Spielmechanik erfinden und keine abgeschlossenen Bausteine neu entwickeln.

## Verbindlich zu prüfen
1. Eine einzige autoritative Core-Eigentumswahrheit; keine Doppelbesitzer, verlorenen Cores oder parallelen Mutationpfade.
2. Installierter Node hat zu jedem abgeschlossenen Zustand exakt 3 N-Cores; nicht installierter Node 0.
3. Exchange: gleiche Anzahl rein/raus, 1–3 nach Pioneer-Kapazität, Node-Cooldown und Reservierungen korrekt.
4. RESTORE #1/#2: Progression 1/3→2/3→3/3, niedrigster Node-Core, geeigneter HQ-Core, IN-TRANSIT-Schutz und 1-Stunden-Zugriffssperre.
5. Catch: nur catchbare persönliche FIELD-Cores; höchster sichtbarer E-Wert; Missions-/Transit-/Reservierungs-Cores ausgeschlossen; Ghost-Schutz 5 Minuten.
6. Normaler HQ Upload: serverseitige Energieberechnung, Teil-/Vollupload, eindeutige Receipts/Replay, danach korrekter Re-Supply-Bedarf. Secure Approach nur als bestehende optionale 150-E-Regel prüfen.
7. RE-SUPPLY: Pioneer-Voraussetzungen, autoritatives Ziel und Cargo, Transit-Core ersetzt niedrigsten Node-Core, der niedrigste Core geht an den Pioneer; Node bleibt 3/3.
8. FOP: 3-Core-Install/Deinstall, Auftrags-/Loadout-Bindung, Scans, Recovery und atomare Node-/Core-Zustandsänderung.
9. EVAC/PRE-EVAC: normale Ownership-Aktionen nach EVAC-Start gesperrt; Cargo geschützt; 5 Teams/10 Originalnodes, Erweiterungsnodes, Recovery, Final Upload, Belege und Abschlussbedingungen konsistent.
10. Cross-Action-Konflikte: Reservierungen, Idempotenz, Replay, Rollback, Eventwechsel und Neustart dürfen keine inkonsistenten Zwischenzustände hinterlassen.

## Vorgehen
- Bestehende Tests und Implementierungen wiederverwenden.
- Zuerst eine Regel-/Invariant-Matrix erstellen: VERIFIZIERT / ABWEICHUNG / UNBEKANNT.
- Nur für ABWEICHUNGEN gezielte Codeänderungen und neue Tests.
- Cross-Action-Tests bevorzugen, wo zwei Bausteine dieselben Daten berühren.
- Keine Lasttests; der 30-Spieler-Lasttest bleibt ein späterer Block.

## Grenzen
Keine Produktivänderungen, kein Deployment und keine Eventinitialisierung. Mission Board und sämtliche COM-Erweiterungen bleiben vollständig eingefroren. Interfaces/Design sind nicht Gegenstand von BLOCK 04.

## Abschluss
MASTERSTAND mit geprüftem Regelstand, Änderungen, Testnachweisen, GitHub-Commit/Branch, offenen Risiken und dem einen nächsten Schritt aktualisieren. Danach den Startauftrag für BLOCK 05 – fünf Rolleninterfaces vorbereiten.

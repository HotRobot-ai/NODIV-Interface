# NODIV V2 – BLOCK 03 – V2-Bausteine zusammenführen

Datum: 2026-10-16
Status: isolierte V2-Entwicklung, keine Produktivänderung
Basis: `feature/v2-minipc-firsttest` @ `9f3d7167c2b76dc0277bb232dbf59f992d45affe`

## Ziel
Die vorhandenen V2-Bausteine Exchange, RESTORE, Catch, normaler HQ Upload, RE-SUPPLY, FOP und EVAC benutzen dieselbe SQLite-Datenwahrheit. BLOCK 01/02 bleiben als getesteter Laufzeit-/NFC-Unterbau erhalten. Mission Board und COM bleiben eingefroren.

## Verifizierte Quellstände
- GitHub: `feature/v2-minipc-firsttest` mit dem in BLOCK 02 getesteten WAL-fähigen `SqliteGameCore`.
- Vorhandene Gesamtintegration `NODIV-V2-EVAC-PRE-EVAC-73.zip`: 73/73 im damaligen Integrationsmodell; verwendet als Regel-/Ablaufreferenz, nicht blind zurückkopiert.
- Verifizierter EVAC-Integrationssatz Schritt 85: 26/26; enthält den vollständigen SQLite-Gate-/Deployment-Evidenz-Stand, der im GitHub-Zweig teilweise noch älter bzw. nicht vorhanden war.

## Zusammenführung
| Baustein | BLOCK-03-Stand |
|---|---|
| Exchange | Bestehender `SqliteGameCore`; unverändert als gemeinsame Transaktionsbasis. |
| RESTORE | Bestehende `RESTORE_1`/`RESTORE_2`-Validatoren im gemeinsamen Core; niedrigster Node-Core und Kapazitätswechsel bleiben atomar. |
| Catch | Bestehende `CatchTransaction` auf demselben Core/DB; reservierte/transitgebundene Cores bleiben ausgeschlossen. |
| HQ Upload | Gemeinsamer Core; Runtime ermittelt `actual_energy` serverseitig, keine vom Client frei vorgegebene Gutschrift. |
| RE-SUPPLY | Auf vorhandene Live-Regel korrigiert: Transit-Core ersetzt den niedrigsten Node-Core, dieser geht an den Pioneer; Node bleibt 3/3; Mission wird atomar abgeschlossen. |
| FOP | Vorhandenes 3-Core-Install/Deinstall-Prinzip in den gemeinsamen Core übernommen; genau drei Cores und Node-Zustand werden atomar geändert. |
| EVAC | Verifizierte Deployment-/Evidence-/SQLite-Gate-Teile aus Schritt 85 auf den aktuellen Core gesetzt. EVAC-Cargo bleibt geschützt; bei `EVAC STARTED` sind normale Ownership-Aktionen gesperrt. |

`gameplay-runtime.mjs` ist der neue Composition Root. Er erzeugt genau **eine** `SqliteGameCore`-Instanz und reicht dieselbe Instanz an Catch und EVAC weiter. Damit gibt es für Core-Eigentum, Balances, Operations und Audit keinen zweiten Laufzeit-Store.

## Neue/gezielte Prüfungen
Keine Wiederholung des realen BLOCK-01/02-Handy-/NFC-Tests. Stattdessen nur Regressionen, die wegen der Zusammenführung erforderlich waren:
- Core-Unit/Regeltests: 24/24.
- Neue BLOCK-03-Cross-Module-Tests: 3/3 (Exchange → RESTORE → Upload → RE-SUPPLY → Catch; FOP; EVAC-Freeze).
- Catch gegen den geänderten gemeinsamen Core: 17/17.
- EVAC gegen den geänderten gemeinsamen Core: 26/26.
- BLOCK-02-Mini-PC-Lab-Regression gegen den geänderten Core: 5/5.
- Gesamt: **75/75 bestanden**.

## Bewusst offen für BLOCK 04
BLOCK 03 ist die technische Zusammenführung, nicht die finale Regelfreigabe. In BLOCK 04 müssen insbesondere gegen die verbindlichen Spielregeln geprüft werden:
- Missionsvergabe/Target- und HQ-Core-Auswahl für RESTORE und RE-SUPPLY.
- Reservierungswechselwirkungen zwischen Exchange, Restore, RE-SUPPLY, Catch, FOP und EVAC.
- Pioneer-Progression 1/3 → 2/3 → 3/3 inklusive Voraussetzungen.
- Node-Cooldowns und Restore-Node-Sperre.
- Upload Teil/Voll, Re-Supply-Auslösung und Secure Approach (nur bestehende Regel prüfen, kein COM/Mission Board).
- FOP-Auftrags-/Loadout-Bindung, Recovery und Rollen-/Access-Card-Bindung.
- Eventzustände, EVAC Start-/Abschlusskriterien und PRE-EVAC-Abhängigkeiten.

## Grenzen
- Keine Produktivdaten, kein produktives Deployment, keine Eventinitialisierung.
- Kein erneuter physischer Handy-/NFC-Test; BLOCK 01/02 bleiben gültig.
- Keine UI-Zusammenführung; die fünf Rolleninterfaces folgen erst nach BLOCK 04.
- Mission Board und sämtliche COM-Erweiterungen bleiben eingefroren.

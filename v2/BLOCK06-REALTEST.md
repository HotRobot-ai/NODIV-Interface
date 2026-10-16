# NODIV V2 – BLOCK 06: vollständiger Realtest

Stand: 16.10.2026  
Umgebung: Gaming-PC + Smartphone + NFC + isolierte SQLite-Datenbanken  
Produktivänderungen: keine  
Mission Board / COM: eingefroren

## 1. Ziel

Dieser Ablauf ist die verbindliche erste praktische Abnahme von BLOCK 06. Er startet bei einer leeren V2-Registrierung, verwendet ausschließlich die real gescannten Access Cards, Node-Tags, N-Core-UIDs und eingravierten E-Werte und endet mit dem regulären Founder-Status `COMPLETED`.

Bereits bestandene BLOCK-01/02-Grundlagen werden nicht pauschal wiederholt. Fehler werden im vorhandenen Testbestand belassen und nachvollzogen; die Hauptdatenbank wird nicht automatisch gelöscht.

## 2. Start

Windows-Starter: `NODIV V2 Starter.cmd`

### Erstmalig

1. Auswahl **1 – Founder Access Card einmalig einrichten**.
2. Founder Access Card real per NFC scannen.
3. Starter neu öffnen.
4. Auswahl **2 – BLOCK 06 Haupttest starten**.
5. Die angezeigte private HTTPS-Adresse auf dem Smartphone in Chrome öffnen.

Die Founder-UID ist der einzige Bootstrapwert in `.env`. Es werden keine erfundenen Test-UIDs oder E-Werte in den Haupttestbestand übernommen.

## 3. Founder – reale Registrierung

Mit der Founder Access Card anmelden und folgende Hardware registrieren:

### Access Cards

- `FOP-TEST`
- `P9003`
- `P9004`
- `LOCAL-TEST`
- `UNBOUND-TEST`

Die Founder-Karte ist bereits durch den Bootstrap vorhanden.

### Nodes

Mindestens für diesen Ablauf:

- `NODE-001`
- `NODE-002`
- `NODE-003`
- `NODE-004`

Weitere vorbereitete Node-IDs bis `NODE-010` sind zulässig, aber für BLOCK 06 nicht erforderlich.

### N-Cores

Genau die vorhandenen zwölf Test-Cores als:

- `NC-001` bis `NC-012`

Für jeden Core:
1. eingravierten sichtbaren E-Wert eingeben,
2. genau diesen Core per NFC scannen,
3. erfolgreiche Registrierung abwarten.

### HQ

- realen HQ-Upload-Tag als `HQ-01` registrieren.

### Founder-PASS vor Initialisierung

Anzeige:
- Access Cards **6/6**
- Nodes **4/4**
- N-Cores **12/12**
- HQ **1/1**
- keine Preflight-Blocker.

Doppelte UIDs, doppelte Zielzuordnungen und ungültige Core-E-Werte müssen blockiert werden.

## 4. Persistenz vor Spielstart

Noch in `READY`:

1. Server beenden.
2. Starter Auswahl 2 erneut starten.
3. Founder erneut anmelden.
4. Prüfen, dass alle Registrierungen unverändert vorhanden sind.

Dann **TESTEVENT VORBEREITEN** auslösen.

Erwartet:
- Zustand `INITIALIZED`
- P9003 erhält 1 Start-Core,
- P9004 erhält 1 Start-Core,
- FOP erhält 6 Transit-Cores,
- die übrigen vier Cores bleiben HQ-Reserve,
- keinerlei physische UID/E-Werte werden erzeugt oder ersetzt.

Danach den Server ein zweites Mal neu starten und erneut prüfen, dass `INITIALIZED` erhalten bleibt.

Erst dann **EVENT STARTEN**.

Erwartet: `FIELD_ACTIVE`.

## 5. Rollenlogin

Je einmal real anmelden:

- Founder
- FOP
- P9003
- P9004
- Local
- Unbound

PASS:
- Rolle/Identität sofort erkennbar,
- genau eine klare nächste Handlung,
- Local/Unbound sehen keine internen Node-/HQ-Daten,
- FOP sieht im Normalbetrieb keine EVAC-Steuerung,
- Pioneer sieht nur eigenes Inventar/Missionen.

## 6. FOP – Erstinstallation

Mit FOP:

1. `NODE-001` scannen.
2. Drei der angezeigten sechs Transit-Cores real scannen und installieren.
3. `NODE-002` scannen.
4. Die drei übrigen Transit-Cores installieren.

Wichtig für den Secure-Approach-Test: Mindestens einer der sechs FOP-Cores hat laut Preflight mindestens **150 E**. Diesen Core in dem Node belassen, den P9004 für seinen ersten 1-Core-Exchange verwendet.

PASS:
- Installation nur mit exakt 3/3 gültigen Transit-Cores,
- beide Nodes danach `INSTALLED`,
- je Node exakt drei `DEPLOYED` Cores.

## 7. P9004 – Teil-Upload + Secure Approach + Schutztest

1. P9004 anmelden.
2. 1-Core-Exchange an einem installierten Node durchführen.
3. Als entnommenen Node-Core gezielt einen Core mit mindestens **150 E** wählen.
4. Nach dem Exchange **SYSTEMAUFTRAG ABRUFEN**.
5. RESTORE #1 vollständig real ausführen.
6. P9004 steht danach auf 2/3.
7. HQ öffnen und den Core mit mindestens 150 E als **Teil-Upload** sichern.
8. Secure Approach aktivieren: exakt **150 E** müssen einmal abgezogen werden.
9. Während der Schutz läuft Local oder Unbound anmelden und einen Catch auf P9004 versuchen.

Erwartet:
- Catch auf P9004 wird als geschützt blockiert,
- Reservierung/Schutz ist sichtbar,
- kein doppelter Energieabzug bei Reload/Retry.

Danach P9004 erneut anmelden, HQ-Tag scannen und den verbliebenen persönlichen Core normal hochladen.

## 8. P9003 – vollständige Progression 1/3 → 3/3

### 8.1 Exchange 1

1. P9003 anmelden.
2. 1-Core-Exchange durchführen.
3. **SYSTEMAUFTRAG ABRUFEN**.
4. RESTORE #1 ausführen.

Erwartet: Kapazität **2/3**.

### 8.2 Exchange 2

Nun einen Node verwenden, der für P9003 weder Restore-gesperrt noch im Exchange-Cooldown ist.

Falls die beiden zuerst installierten Nodes gerade beide ungeeignet sind:

1. FOP anmelden.
2. Einen nicht mehr benötigten installierten Node deinstallieren.
3. `NODE-003` scannen.
4. Falls angeboten: **3-CORE-LOADOUT ABRUFEN**.
5. Die drei gerade zurückgeführten Cores anhand der angezeigten E-Werte scannen.
6. `NODE-003` installieren.

Dann mit P9003 einen **2-Core-Exchange** durchführen.

Danach:
1. **SYSTEMAUFTRAG ABRUFEN**
2. RESTORE #2 vollständig ausführen.

Erwartet: Kapazität **3/3**.

### 8.3 Exchange 3

Für den 3-Core-Test einen für P9003 frischen Node verwenden. Falls nötig:

1. FOP deinstalliert einen nicht mehr benötigten Node.
2. `NODE-004` scannen.
3. neues serverseitiges 3-Core-Loadout abrufen,
4. `NODE-004` installieren.

Dann P9003:
1. Node scannen,
2. **3-Core-Exchange** auswählen,
3. alle drei persönlichen und alle drei Node-Cores real scannen,
4. Exchange bestätigen.

PASS:
- 1-, 2- und 3-Core-Exchange funktionieren nur gemäß aktueller Slotfreigabe,
- jeder Node bleibt nach Exchange exakt 3/3,
- Cooldown/Restore-Sperren werden nicht umgangen.

## 9. P9003 – Voll-Upload + RE-SUPPLY

Mit P9003 bei 3/3:

1. HQ öffnen.
2. HQ-Tag real scannen.
3. alle drei persönlichen Cores auswählen.
4. Voll-Upload bestätigen.

PASS:
- Inventar danach 0/3,
- drei Cores korrekt am HQ gesichert,
- genau eine Pflichtmission `RE-SUPPLY` wird zugewiesen,
- Transit-Core ist nicht catchbar.

RE-SUPPLY anschließend vollständig ausführen:
1. Ziel-Node scannen,
2. Transit-Core scannen,
3. niedrigsten geforderten Node-Core scannen,
4. Auftrag bestätigen.

PASS:
- P9003 besitzt wieder genau einen persönlichen Core,
- Node bleibt 3/3,
- Mission ist abgeschlossen.

## 10. Catch + Ghost-Schutz

Mit Local oder Unbound:

1. P9003 Access Card scannen.
2. Catch-Preview prüfen.
3. Catch bestätigen.

PASS:
- automatisch wird der höchste catchbare E-Wert von P9003 übertragen,
- danach Ghost-Schutz für P9003 aktiv.

Unmittelbar während des Ghost-Fensters erneut einen Catch auf P9003 versuchen.

PASS: `TARGET_PROTECTED` bzw. verständliche Spieleranzeige; keine zweite Umbuchung.

## 11. FOP – Rückbau

Mindestens einen installierten Test-Node mit FOP regulär deinstallieren.

PASS:
- exakt drei Node-Cores gehen kontrolliert zurück zur HQ-Reserve,
- Node steht `DEINSTALLED`,
- Integrität bleibt erhalten.

## 12. EVAC – separater repräsentativer Realtest bis COMPLETED

Der normale Haupttestbestand bleibt unverändert erhalten.

1. Haupttestserver beenden.
2. Starter erneut öffnen.
3. Auswahl **3 – EVAC Realtest**.
4. Das System erstellt einmalig eine separate SQLite-Kopie:
   - echte Founder-/FOP-/P9003-/P9004-Karten,
   - echte NODE-001-/NODE-002-Tags,
   - sechs echte registrierte N-Cores,
   - HQ-Tag,
   - zusätzliche Supportdaten ausschließlich in der separaten EVAC-Testdatenbank.
5. Founder anmelden und EVAC regulär starten.
6. FOP anmelden.
7. P9003- und P9004-Karte scannen und reales EVAC-Team bilden.
8. NODE-001 und NODE-002 jeweils mit den im FOP-Interface angezeigten drei echten Core-E-Werten vorbereiten.
9. Beide Nodes + jeweils 3/3 Cores real scannen und Recovery bestätigen.
10. P9003 und P9004 jeweils anmelden und ihren Last Secure Upload real mit einem der drei Cargo-Cores abschließen.

Erst wenn das reale Team **2/2 Recoveries und 2/2 Final Uploads** nachgewiesen hat, zeigt Founder **SUPPORT-TEAMS DURCHLAUFEN**.

Dieser Button arbeitet die vier nicht-physischen Supportteams ausschließlich über dieselben bestehenden EVAC-Team-, Recovery-, NFC-Grant-, Final-Upload- und Receipt-Regeln ab. Er schreibt nichts in den Haupttestbestand und umgeht keine Completion-Guards.

Danach muss Founder **EVENT ABSCHLIESSEN** erhalten.

Founder bestätigt den normalen Abschluss.

PASS:
- Zustand `COMPLETED`,
- 10/10 Recoveries,
- 10/10 Final Uploads,
- normale Field-Aktionen während EVAC gesperrt,
- reales Team ausschließlich per NFC,
- Support erst nach erfolgreicher physischer Team-Abnahme,
- Haupttestdatenbank unverändert.

## 13. Fehleraufnahme

Bei jedem Fehler notieren:
- Rolle,
- aktuelle Anzeige / erwartete Anzeige,
- unmittelbar vorherige Aktion,
- gescannter physischer Gegenstand,
- sichtbare Fehlermeldung,
- ob Reload oder Serverneustart beteiligt war.

Nicht die Datenbank löschen und nicht den Test blind neu beginnen. Zuerst den vorhandenen Zustand sichern und den konkreten Pfad untersuchen.

## 14. BLOCK-06-PASS

BLOCK 06 gilt praktisch bestanden, wenn:
- Registrierung und zwei Neustarts ohne Datenverlust funktionieren,
- alle fünf Rollen erreichbar und verständlich sind,
- FOP Install + erneutes Loadout + Rückbau funktionieren,
- Exchange 1/2/3, RESTORE #1/#2, Teil-/Voll-Upload, Secure Approach, Catch/Ghost und RE-SUPPLY real funktionieren,
- der repräsentative EVAC-Pfad das reale Team durch NFC prüft und anschließend den unveränderten vollständigen EVAC-Kern bis `COMPLETED` durchläuft,
- kein Core verloren, doppelt gebucht oder zwei Besitzern gleichzeitig zugeordnet ist,
- keine technische Sackgasse ohne klare nächste Handlung verbleibt.

Ein Fehler beendet nicht den gesamten BLOCK-06-Test. Er wird erfasst, der sichere Zustand bleibt bestehen, und anschließend entsteht daraus der gezielte Folgeauftrag.

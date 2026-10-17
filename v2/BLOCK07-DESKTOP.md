# NODIV V2 – BLOCK 07: spielbare PC-Version und flexibler Schreibtischbetrieb

Stand: 16.10.2026  
Branch: `feature/v2-block07-desktop-playable`  
Ausgangspunkt: BLOCK 06A, Commit `946422733ce5fc7f91c0dc2052355484c07d039b`  
Produktivänderungen: keine  
Mission Board / COM: eingefroren

## Verifizierter Ausgangspunkt

BLOCK 06A stellt den gemeinsamen SQLite-Spielkern, die fünf serverprojizierten Rollenansichten, Founder-Registrierung, Exchange, RESTORE, Catch, HQ Upload, RE-SUPPLY, FOP und EVAC bereit. Die BLOCK-06A-Oberfläche war jedoch auf einen repräsentativen Volltest mit festen Mindestmengen zugeschnitten.

Im Repository sind zugleich die älteren NODIV-V1-/REG-Oberflächen und das V1-Designsystem vorhanden. BLOCK 07 übernimmt daraus die etablierte NODIV-Designsprache, verwendet aber weiterhin den gemeinsamen V2-SQLite-/Runtime-Kern statt die Apps-Script-Architektur zurückzuportieren.

## BLOCK-07-Änderung

BLOCK 07 ergänzt einen eigenen `desktop`-TESTMODUS mit separater persistenter SQLite-Datei.

Beim ersten Start werden nur erzeugt:
- ein leerer Eventdatensatz in `READY`,
- die Founder-Identität als notwendiger Bootstrap,
- freie interne Node-Slots,
- ein noch ungebundener HQ-Slot.

Nicht erzeugt werden:
- Pioneer, FOP, Local oder Unbound,
- Hardware-UIDs,
- N-Cores,
- Energie.

Alle weiteren Identitäten und Hardwareobjekte entstehen ausschließlich durch Founder-Registrierung realer NFC-Tags.

## Flexibler Teststart

Founder kann einen Testbestand unabhängig von Voll-Event-Mindestmengen vorbereiten.

Der Server verteilt beim Vorbereiten ausschließlich tatsächlich registrierte Reserve-Cores:
- höchstens einen realen Start-Core je vorhandenen Pioneer,
- wenn möglich exakt drei reale Transit-Cores an einen vorhandenen FOP,
- alle übrigen Cores bleiben reale HQ-Reserve.

Danach kann `TESTSPIEL STARTEN` den Eventzustand auf `FIELD_ACTIVE` setzen.

Der Founder-Status berechnet aus dem aktuellen realen Bestand, ob Login, FOP-Nodebetrieb, Exchange, Catch, HQ Upload, RESTORE, RE-SUPPLY und Secure Approach erreichbar sind. EVAC wird nicht simuliert; es bleibt an die regulären EVAC-Gates gebunden.

Später registrierte Local-/Unbound-/FOP-Karten werden sofort im gemeinsamen Spielstand sichtbar. Ein später registrierter Pioneer erhält nur dann einen Start-Core, wenn tatsächlich ein freier, nicht missionsgebundener Reserve-Core vorhanden ist.

## Kontrolliertes Testende

Founder kann einen laufenden oder vorbereiteten TESTMODUS als `TEST_ENDED` beenden.

Dabei werden:
- keine offenen Missionen auf COMPLETED gesetzt,
- keine EVAC-Recoveries oder Final Uploads erzeugt,
- keine Core-Besitzstände künstlich bereinigt,
- keine Historie gelöscht.

Vor dem Zustandswechsel wird ein End-Snapshot mit Rollen-, Node-, Core-, Missions-, Operations- und EVAC-Status gespeichert. `TEST_ENDED` ist im SQLite-Schema ausdrücklich von `COMPLETED` getrennt.

## Rollenoberflächen

Die vorhandenen V2-Rollenoberflächen bleiben die technische Basis und wurden auf den flexiblen Betrieb angepasst.

- Founder sieht realen Hardwarebestand, Funktionsverfügbarkeit und genau die nächste Testaktion.
- FOP zählt im Desktopbetrieb ausschließlich registrierte reale Nodes; freie interne Node-Slots erscheinen nicht als Hardware.
- Pioneer, FOP, Local und Unbound erhalten außerhalb `FIELD_ACTIVE` eine eindeutige Sperranzeige statt aktiver Spielformulare.
- Aktive Formulare bleiben gegen passive Refreshes geschützt.
- Touchflächen bleiben smartphonegerecht.
- FOP-EVAC bleibt unsichtbar, solange EVAC nicht tatsächlich gestartet wurde.

## Windows-Betrieb

Der eindeutig benannte Einstieg ist:

`NODIV-V2-SPIELEN.cmd`

Er verwendet auf Gaming-PC und Mini-PC denselben Softwarestand und dieselbe Verzeichnisstruktur. Die lokale Datei `data/nodiv-v2-desktop.sqlite` wird bei normalen Starts nicht gelöscht.

## Abnahmekriterien für CI

Automatisiert zu prüfen:
- gemeinsame V2-Serverregression,
- komplette Mini-PC-Labregression,
- unvollständiger Teststart,
- Founder + FOP + Pioneer + 1 Node + reale Test-Core-Datensätze,
- FOP-Installation und 1-Core-Exchange über den gemeinsamen Runtime-Kern,
- fehlender Local/Unbound blockiert nur Catch,
- spätere Rollenregistrierung,
- späterer Pioneer erhält niemals erfundenen Core,
- vorzeitiges `TEST_ENDED` lässt offenen RESTORE-Auftrag offen,
- Neustart/Persistenz,
- Browser-JavaScript-Syntax,
- Windows-Starter- und Paket-Smoke.

Automatisierte NFC-Datensätze sind keine physische NFC-Abnahme.

## Statusgrenzen

- **Implementiert:** nach Commit auf BLOCK-07-Branch.
- **Automatisiert geprüft:** erst nach erfolgreichem GitHub-Actions-Lauf.
- **Auf GitHub gesichert:** Commit/Branch vorhanden.
- **Physisch getestet:** erst nach realem Android-/NFC-Durchlauf mit diesem BLOCK-07-Paket.
- **Produktiv freigegeben:** nicht Bestandteil von BLOCK 07; gesonderte Founder-Freigabe erforderlich.

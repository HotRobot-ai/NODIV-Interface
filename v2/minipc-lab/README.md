# NODIV V2 – BLOCK 07 DESKTOP TESTMODUS

**Isolierter Entwicklungsstand. Keine Produktivänderung. Mission Board und COM bleiben eingefroren.**

Dieser Ordner ist der gemeinsame lokale Spielstand für Gaming-PC und Mini-PC. Es gibt keine getrennten PC-Versionen.

## Start

Verbindlicher Windows-Einstieg:

`NODIV-V2-SPIELEN.cmd`

Der Starter bietet nur:

1. **Founder Access Card einmalig einrichten**
2. **NODIV V2 TESTMODUS starten**

Node.js 24 und Tailscale müssen auf dem Windows-PC vorhanden sein. Für echte NFC-Scans wird Android Chrome über die private HTTPS-Adresse verwendet.

## Datenhaltung

Standarddatenbank:

`data/nodiv-v2-desktop.sqlite`

Sie wird beim normalen Start **nicht gelöscht**. Founder-Registrierungen, Rollen, Node-Tags, N-Core-E-Werte, Besitzstände, Missionen und Historie bleiben nach einem Serverneustart erhalten.

## TESTMODUS

Founder kann mit dem tatsächlich vorhandenen Bestand arbeiten. Es gibt keine Mindestzahl für Spieler, Nodes oder N-Cores.

Founder registriert:
- FOP-, Pioneer-, Local- und Unbound-Access-Cards nach Bedarf,
- reale Node-Tags; die interne Node-Kennung wird automatisch vergeben,
- reale N-Cores mit UID und tatsächlich eingraviertem E-Wert,
- den realen HQ-Tag.

Vor `TESTSPIEL STARTEN` zeigt Founder, welche Funktionen mit dem aktuellen Bestand erreichbar sind. Fehlende Voraussetzungen sperren nur die betroffene Funktion.

Der Test kann kontrolliert als `TEST_ENDED` beendet werden. Das ist **kein** regulärer EVAC-/Eventabschluss. Offene Missionen oder Transaktionen werden dabei nicht künstlich als abgeschlossen markiert.

## Rolleninterfaces

Der gemeinsame V2-Runtime-Kern wird über die bestehenden NODIV-Rollenoberflächen bedient:

- Founder – Hardware, Testbestand, Start, Testende, reguläre EVAC-Freigaben nur bei echten Gates
- FOP – Node-Installation und Rückbau, EVAC erst nach tatsächlichem EVAC-Start
- Pioneer – Inventar, Exchange, RESTORE, HQ Upload, Secure Approach, RE-SUPPLY
- Local – Catch
- Unbound – Catch

Außerhalb `FIELD_ACTIVE` werden Feldaktionen sichtbar gesperrt statt technische Formulare anzubieten.

## Sicherheit

- keine automatisch erfundenen Hardware-UIDs,
- keine automatisch erfundenen N-Cores oder E-Werte,
- keine doppelte UID,
- keine automatische Datenbanklöschung,
- reguläre Exchange-/RESTORE-/Catch-/Upload-/FOP-/EVAC-Sicherheitsregeln bleiben unverändert,
- kein Merge nach `main`, kein Deployment und keine produktive Eventinitialisierung durch dieses Paket.

Details und Abnahmestand: `BLOCK07-DESKTOP.md`.

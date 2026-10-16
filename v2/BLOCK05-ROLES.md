# NODIV V2 – BLOCK 05: Rolleninterfaces und durchgängige Spielerführung

Stand: 16.10.2026  
Branch: `feature/v2-block05-roles`  
Basis: BLOCK 04 `0e7c078f7f4367f39e41bd962d090487bc6ebfaf`  
Draft-PR: #3 gegen `feature/v2-block04-integrity`

## Verifizierter Ausgangspunkt

- BLOCK-04-Branch stand exakt auf `0e7c078f7f4367f39e41bd962d090487bc6ebfaf`.
- Finaler vom Founder genannter BLOCK-04-Actions-Run `38933023888` wurde verifiziert: 129/129 V2-Servertests und 5/5 Mini-PC-Lab-Regressionen grün.
- Hinweis zur Alt-Dokumentation: `v2/BLOCK04-INTEGRITY.md` nennt noch den früheren grünen Run `38932715930`; der spätere Run `38933023888` ist ebenfalls erfolgreich und der verbindlich geprüfte Endnachweis.
- Reale PC-/Handy-/NFC-Ersttests aus BLOCK 01/02 fanden auf dem Gaming-PC statt. Sie wurden in BLOCK 05 nicht grundlos wiederholt.
- Mission Board und sämtliche COM-Erweiterungen blieben vollständig eingefroren.

## Implementiert

### Eine Datenwahrheit

Alle Rollenansichten werden aus SQLite/V2 abgeleitet. Der Browser verwaltet keine eigene Wahrheit für Core-Besitz, Energie, Slot-Kapazität, Missionen, Cooldowns, Ghost-Schutz, Reservierungen oder EVAC.

Neu:
- `v2/server/role-views.mjs`: serverseitige Projektionen für Founder, FOP, Pioneer, Local und Unbound.
- `v2/minipc-lab/server/server.mjs`: rollenbezogene API-Adapter auf die bestehende V2-Runtime.
- bestehende BLOCK-01/02-Lab-Endpunkte bleiben als Regression/Diagnose erhalten.

### Pioneer

Angebunden:
- 1/3 → 2/3 → 3/3 Slots aus Serverzustand.
- persönliches FIELD-Inventar und getragene sichtbare Energie.
- missionsgebundene IN-TRANSIT-Cores getrennt vom persönlichen Inventar.
- Node-Scan, serverseitig zulässiger 1–3-Core-Exchange, 5-Minuten-Node-Cooldown.
- RESTORE #1/#2 nur über aktive serverseitige Mission.
- 1-Stunden-RESTORE-Zielsperre aus SQLite.
- RE-SUPPLY.
- normaler HQ Upload.
- Ghost-/Schutzstatus.
- EVAC-Endablauf nur bei tatsächlichem `EVAC STARTED`.

### Secure Approach auf V2-Parität

Neu `v2/server/hq-access.mjs`:
- exakt 150 E serverseitige Abbuchung.
- exakt 5 Minuten Catch-Schutz.
- exklusive HQ-Uploadpunkt-Reservierung.
- GREEN/YELLOW/RED aus Serverzustand.
- Claim → serverseitige Auswahlprüfung → Commit.
- Request-/Upload-Replay ohne Doppelabbuchung.
- verlorene Confirm-Antwort kann mit derselben Operation sicher wiederholt werden.
- Reservierung wird nach erfolgreichem Upload atomar freigegeben.

### Voll-Upload → Pflicht-RE-SUPPLY

Eine bisher reale V2-Lücke wurde geschlossen: Bei echtem 3/3-Voll-Upload wird der Pflicht-RE-SUPPLY jetzt im selben SQLite-Commit gesichert.

Übernommen wurde die bestehende V1-Regel:
- Ziel ist der zulässige Node mit dem niedrigsten sichtbaren Node-Core.
- wenn mehrere Kandidaten existieren, wird der unmittelbar letzte abgeschlossene RE-SUPPLY-Ziel-Node nach Möglichkeit nicht erneut gewählt.
- HQ-Cargo: niedrigster verfügbarer Reserve-Core, der mindestens den ausgehenden Core erreicht; falls keiner reicht, höchster verfügbarer Reserve-Core.
- Cargo wird IN_TRANSIT an den Pioneer gebunden.
- wenn kein sicherer RE-SUPPLY-Auftrag erzeugt werden kann, rollt der vollständige 3/3-Upload zurück. Kein 0/3-Zwischenzustand ohne Pflichtauftrag.

### FOP

- starker NODIV-Einsatzkopf und kompakte nächste Handlung.
- Node-Scan entscheidet serverseitig INSTALL oder DEINSTALL.
- Installation verlangt exakt drei serverbestätigte IN-TRANSIT-Cores.
- Scan → Serverprüfung → Commit sichtbar getrennt.
- normale Node-Steuerung während EVAC gesperrt.
- EVAC-Steuerung bleibt im Normalbetrieb unsichtbar und erscheint erst bei tatsächlichem `STARTED`.

### Local

Bewusst reduziert:
- Access-Card-Identität.
- Pioneer-Access-Card scannen.
- Catch-Preview prüft Ziel, Ghost, Kapazität und Ziel-Core ausschließlich serverseitig.
- separater verbindlicher Catch-Commit.
- keine Node-/HQ-/NODIV-Interninformationen.

### Unbound

- gemeinsames Access-/Catch-Grundgerüst angebunden.
- keine nicht freigegebene Sondermechanik erfunden.
- keine alte V1-Network-Intelligence/Sonderlogik als neue V2-Spielregel übernommen.
- weiter offene Unbound-Sondermechanik bleibt Founder-Entscheidung.

### Founder

- kompakte serverseitige Event-/Rollen-/Node-Zusammenfassung.
- keine simulierten Live-Daten.
- nur aktuell zulässige Backend-Aktionen sichtbar.
- EVAC-Start nur bei `PRE_EVAC_READY`.
- keine produktive Eventinitialisierung und kein Deploymentpfad in BLOCK 05.

### EVAC

Die bestehenden produktionsnahen EVAC-Module wurden nicht abgeschwächt:
- Node Recovery und Final Upload verbrauchen weiterhin den vorhandenen Single-Use-V2-NFC-Grant innerhalb der Transaktion.
- Für den isolierten Browser-Labtest existiert `v2/minipc-lab/server/evac-lab-nfc.mjs`: ein ausdrücklich LAB-only Adapter, der nach den Web-NFC-Scans einen kurzlebigen Testnachweis und den bestehenden V2-Grant ausstellt.
- dieser Adapter ist kein produktiver Trust-Ersatz und ändert die EVAC-Domänenregeln nicht.

Rollenführung:
- Founder startet EVAC nur wenn Backend freigibt.
- FOP scannt zwei Pioneer-Access-Cards, bekommt serverseitig zwei freie EVAC-Nodes, scannt Ziel-Node + 3/3 Core-Snapshot und bestätigt Recovery.
- zugewiesener Pioneer sieht nur seinen eigenen EVAC-Auftrag.
- nach Recovery wählt Pioneer genau einen der drei Cargo-Cores, scannt diesen und bestätigt den Last Secure Upload.
- normale Pioneer/FOP-Aktionen sind während EVAC nicht parallel verfügbar.

## UX

`v2/minipc-lab/client/` wurde vom technischen Exchange-Testbildschirm zu einem smartphone-first NODIV-Feldinterface erweitert:
- große Touchflächen.
- hohe Kontraste für Outdoor-Nutzung.
- pro Rolle eine sichtbare Karte „NÄCHSTER SCHRITT“.
- Scan, Serverprüfung und Commit als drei klar getrennte Phasen.
- Spielerfehler werden in verständliche Handlungszustände übersetzt.
- BLOCK-02-Diagnosefunktionen sind in einen separaten Testbereich verschoben und steuern keine Spielregeln.

## Automatisierte Nachweise

GitHub Actions Run `38936768430` auf Commit `e64b108cdc027bf826b99e35d9f0f4c406026c4f`:
- Server regression: **141/141 bestanden**.
- Mini-PC lab regression: **9/9 bestanden**.
- Browser client syntax: **bestanden**.

Neue BLOCK-05-Nachweise enthalten insbesondere:
- Secure Approach: Debit, Ghost, Exklusivreservierung, Ablauf, Idempotenz.
- HQ Claim/Authorize/Confirm inkl. Lost-Response-Replay.
- 3/3-Full-Upload → atomarer Pflicht-RE-SUPPLY.
- Rollback eines Full-Uploads, wenn RE-SUPPLY nicht sicher zugewiesen werden kann.
- serverseitige Rollenansichten aller fünf Rollen.
- FOP-EVAC unsichtbar vor STARTED und sichtbar danach.
- fünf Rollen über echte Lab-API.
- Local Catch + Pioneer Secure Approach + FOP Install auf gemeinsamer SQLite-Wahrheit.
- EVAC Team → Node Recovery → Pioneer Final Upload; V2-NFC-Grant wurde dabei nachweislich konsumiert.

## Statusabgrenzung

- **implementiert:** ja, isoliert auf BLOCK-05-Branch.
- **automatisiert getestet:** ja.
- **GitHub gespeichert:** ja.
- **produktiver Merge:** nein.
- **produktiv veröffentlicht/deployed:** nein.
- **reale neue Smartphone-/NFC-Feldprüfung der BLOCK-05-Rollenoberflächen:** noch nicht erfolgt.
- **Echtbetrieb:** nein.

Die bestehenden realen NFC-Ersttests aus BLOCK 01/02 wurden nicht wiederholt. Da BLOCK 05 neue Rollen- und EVAC-Scanpfade ergänzt, gehört ein repräsentativer realer Rollen-/NFC-Durchlauf in BLOCK 06 zum vollständigen Spielablauf.

## Grenzen

- Mission Board und COM: unverändert eingefroren.
- keine neue Unbound-Sondermechanik.
- keine produktive Eventinitialisierung.
- kein Deployment.
- kein 30-Spieler-Lasttest; dieser ist laut Founder-Roadmap nicht BLOCK 05.
- der LAB-only EVAC-Proof-Adapter darf nicht als produktiver Reader-Trust interpretiert werden.

## Nächster Schritt

BLOCK 06: vollständiger Spielablauf von Eventvorbereitung bis Abschluss über Founder, FOP, Pioneer, Local und Unbound; bestehende V2-Pfade gemeinsam als reales Spiel prüfen, ohne Mission Board/COM und ohne produktive Veröffentlichung.

# NODIV V2 – INITIAL DEPLOYMENT / SCHREIBTISCHTEST

Stand: 24.10.2026  
Branch: `feature/v2-initial-deployment`  
Ausgangspunkt: `feature/v2-nodiv-identity-polish @ 1089f6b916a63088b24ab46217f3a842d2dcf77e`  
Produktivänderungen: keine  
Mission Board / COM: eingefroren

## Ziel dieses Testpakets

Dieses Paket erweitert den bestehenden V2-Desktopmodus um den vollständigen strukturierten Spielstart:

Founder-Vorbereitung → Pioneer-Rendezvous → FOP-Teamaktivierung → 2 × 3 Deployment-Cores → zwei Start-Node-Installationen → Pioneer-Inbetriebnahme beider Nodes → Freigabe des normalen Gameplays.

Die vorhandenen Gameplay-Systeme werden nicht ersetzt. Exchange, Upload, RESTORE, RE-SUPPLY, Catch, FOP-Funktionen und EVAC verwenden weiterhin den gemeinsamen V2-SQLite-/Runtime-Kern.

## Spieleridentität

Founder verwaltet Spieler mit:
- echtem Namen,
- Rolle,
- Callsign,
- zugeordneter Access Card.

Der echte Name bleibt in der Founder-Verwaltung. Spielerinterfaces zeigen den Callsign. Bleibt das Callsign-Feld leer, vergibt NODIV einen eindeutigen Callsign automatisch.

Eine Access Card wird erst nach der Spieleranlage per NFC an die konkrete Spieleridentität gebunden.

## Initial Deployment – Datenmodell

Der strukturierte Start besitzt eine persistente SQLite-Zustandsmaschine.

Für jedes Team werden dauerhaft gespeichert:
- Teamkennung,
- ein Field Operator,
- zwei Pioneer,
- zwei unterschiedliche Start-Nodes,
- sechs konkrete Deployment-N-Cores,
- jeweils drei Deployment-Cores pro Pioneer,
- FOP-Bestätigungen beider Pioneer,
- Materialübergaben,
- Installationsstatus beider Nodes,
- Pioneer-Inbetriebnahmen,
- Zeitpunkt der Teamfreigabe.

Deployment-Cores belegen keine persönlichen Pioneer-Inventarslots. Beim Vorbereiten erhält jeder Pioneer zusätzlich genau einen persönlichen Start-Core aus der verbleibenden HQ-Reserve.

Jeder Core bleibt zu jedem Zeitpunkt genau einem Besitzer/Zustand zugeordnet:
HQ → Pioneer Deployment Transit → FOP Transit → Node.

## Geführter Ablauf

### 1. Founder – Spieler vorbereiten

Im Founder-Interface:
1. echten Namen erfassen,
2. Rolle auswählen,
3. Callsign eingeben oder leer lassen,
4. Spieler vorbereiten,
5. anschließend `Access Card` auswählen und die Karte dieses Spielers scannen.

Für den vollständigen Start werden mindestens benötigt:
- 1 FOP,
- 2 Pioneer,
- 2 registrierte Nodes,
- 8 registrierte N-Cores.

Sechs Cores sind Deployment-Cores. Zwei weitere bleiben für die persönlichen Start-Cores erforderlich.

### 2. Founder – Team konfigurieren

Im Abschnitt `INITIAL DEPLOYMENT`:
1. Teamkennung prüfen,
2. FOP auswählen,
3. Pioneer A und B auswählen,
4. zwei unterschiedliche Start-Nodes auswählen,
5. drei konkrete Cores für Pioneer A auswählen,
6. drei konkrete Cores für Pioneer B auswählen,
7. `INITIAL DEPLOYMENT SPEICHERN`.

Der Server verhindert doppelte Spieler-, Node- und Core-Zuordnungen.

### 3. Founder – Vorbereitung

`INITIAL DEPLOYMENT VORBEREITEN`

Erwartung:
- Event wechselt von `READY` auf `INITIALIZED`,
- jeder Pioneer erhält einen persönlichen Start-Core,
- sechs Deployment-Cores werden als separater Transit an die beiden Pioneer gebunden,
- noch kein Feldbetrieb.

### 4. Founder – Rendezvous starten

`TEAM-RENDEZVOUS STARTEN`

Erwartung:
- Event wird `FIELD_ACTIVE`,
- normales Pioneer-Gameplay bleibt trotzdem serverseitig gesperrt,
- Pioneer sieht Teamkennung, Callsign des zuständigen FOP und genau die nächste Handlung,
- geheime Start-Node-Kennungen werden dem Pioneer im Rendezvous nicht angezeigt.

### 5. FOP – Team aktivieren

FOP öffnet sein Interface und scannt nacheinander die beiden Pioneer-Access-Cards.

Erwartung:
- falsche oder fremde Karte → Ablehnung,
- erster gültiger Pioneer → 1/2,
- wiederholter Scan → idempotent, keine Doppelaktivierung,
- zweiter gültiger Pioneer → `TEAM ACTIVATED`.

### 6. FOP – Deployment-Cores übernehmen

Für jeden Pioneer:
1. Pioneer-Access-Card scannen,
2. die drei zugeordneten Deployment-Cores scannen.

Erwartung:
- konkrete E-Werte werden angezeigt,
- vertauschter/falscher Core wird abgelehnt,
- nach erfolgreicher Übergabe gehören exakt diese drei Cores dem FOP-Transit,
- FOP kann keinen alternativen direkten HQ-Loadout für diesen Initial-Deployment-Auftrag abrufen.

### 7. FOP – Start-Node 1 installieren

1. zugewiesenen Node scannen,
2. exakt die drei zu diesem Node gehörenden Transit-Cores scannen,
3. Installation bestätigen.

Erwartung:
- falscher Node wird abgelehnt,
- vertauschter 3-Core-Satz wird abgelehnt,
- vorhandener gemeinsamer FOP-Installationskern führt die Installation aus,
- mechanischer vierstelliger Öffnungscode wird angezeigt,
- Node enthält danach exakt drei DEPLOYED-Cores.

### 8. Pioneer – Start-Node 1 aktivieren

Der zugehörige Pioneer scannt den eben installierten Node.

Erwartung:
- falscher Pioneer/falscher Node wird abgelehnt,
- Aktivierung verändert keinen Core-Besitz,
- normales Gameplay bleibt bei nur 1/2 aktivierten Nodes gesperrt.

### 9. Zweiter Node

Schritte 7 und 8 mit dem zweiten Pioneer und dem zweiten Core-Satz wiederholen.

Nach der zweiten gültigen Pioneer-Aktivierung:
- Teamstatus = `RELEASED`,
- normales Pioneer-Gameplay wird serverseitig freigegeben,
- der installierte Start-Node gilt für den jeweiligen Pioneer als bekannter Node.

### 10. Erste normale Spielaktion

Mindestens einen normalen Exchange durchführen.

Im Desktop-Testmodus gelten weiterhin die bereits festgelegten Testregeln. Im regulären Spielbetrieb bleibt die bestehende achtminütige Exchange-Node-Sperre unverändert.

## Unterbrechung / Neustart

Der Ablauf ist persistent.

Besonders abgesichert ist das Zeitfenster nach einer erfolgreichen gemeinsamen FOP-Installation: Falls der Prozess nach der autoritativen Node-/Core-Buchung, aber vor dem Initial-Deployment-Marker beendet wird, rekonstruiert NODIV den Installationsstatus beim nächsten Lesen aus dem tatsächlichen Node-/Core-Besitz.

Erfolgreiche Team-, Übergabe- und Aktivierungsschritte werden nicht doppelt gebucht.

## Negativprüfungen in der automatisierten Suite

Die Initial-Deployment-Tests prüfen unter anderem:
- gleicher Pioneer doppelt im Team,
- doppelt ausgewählter Deployment-Core,
- fremde Access Card bei FOP-Bestätigung,
- wiederholte Pioneer-Bestätigung,
- direkter HQ-FOP-Loadout während Initial Deployment,
- falscher Core-Satz bei Übergabe,
- fremder Node beim FOP,
- vertauschter Core-Satz bei Installation,
- falscher Pioneer bei Node-Aktivierung,
- vorzeitiger Exchange,
- Neustart/Persistenz,
- Rekonstruktion einer bereits autoritativ installierten Node,
- vollständige Freigabe erst nach 2/2 Aktivierungen,
- normaler Exchange nach der Freigabe,
- Core-Integrität,
- Testende und Reportexport.

## Auswertung

Founder kann HTML und CSV exportieren.

Automatisch protokolliert werden getrennt von Spielerfeedback:
- Initial-Deployment-Meilensteine,
- Gameplay-Operationen,
- abgelehnte API-Aktionen und Fehlercodes,
- relevante Zeitstempel,
- aktueller Core-Besitz und Energie,
- Teams, Callsigns und Nodes.

Das HTML erzeugt zusätzlich eine kompakte Einsatzübersicht mit Teamverlauf und Fakten. Spielerfeedback enthält getrennte Bewertungen für:
- Verständlichkeit,
- Bedienbarkeit,
- Scannen,
- Atmosphäre,
- Verbesserungsvorschlag.

## Kontrolliertes Testende

Founder kann das Testspiel als `TEST_ENDED` beenden.

Dabei werden:
- keine offenen Missionen künstlich abgeschlossen,
- keine Core-Besitzstände bereinigt,
- keine EVAC-Nachweise erfunden,
- der tatsächliche Endzustand gespeichert.

`TEST_ENDED` bleibt ausdrücklich von einem regulären `COMPLETED`-Event getrennt.

## Automatisierte Qualitätssicherung

Das GitHub-Actions-Paket wird nur erzeugt, wenn zuvor erfolgreich gelaufen sind:
- vollständige gemeinsame V2-Serverregression,
- vollständige Mini-PC-/Desktop-Testregression,
- Initial-Deployment-Positiv- und Negativtest,
- Browser-/Server-Syntaxprüfung,
- Paket-Smoke,
- Windows-Starter-Smoke,
- PowerShell-Syntax,
- Windows-Importtest.

Die Datei `SOURCE.txt` im erzeugten Paket dokumentiert Commit, Branch und CI-Run.

## Statusgrenzen

**VERIFIZIERT** darf nur heißen, was der erfolgreiche automatisierte Lauf beziehungsweise der reale Schreibtischtest tatsächlich nachweist.

**OFFEN:** Der abschließende Hardwaretest mit echten Android-Web-NFC-Scans, Access Cards, beiden realen Nodes und realen N-Cores. Automatisierte UID-Aufrufe ersetzen diesen Test ausdrücklich nicht.

**NICHT PRODUKTIV:** Kein Merge nach `main`, kein produktives Deployment und keine produktive Eventinitialisierung sind Bestandteil dieses Pakets.

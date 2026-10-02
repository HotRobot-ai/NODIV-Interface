# NODIV App V1 – verbindlicher Fahrplan

Stand: 2026-10-02

## Ziel
NODIV wird von einzelnen Webseiten zu einer gemeinsamen App/PWA mit einer zentralen Spiellogik. Smartphone, Situation Room und später Quest/VR verwenden dieselben Spielereignisse und dieselbe Datenquelle.

## Harte Architekturregeln
1. Eine gemeinsame NODIV-App, rollenbasierte Oberflächen statt getrennte Apps.
2. Spiellogik bleibt serverautoritativ: Catch, Cooldowns, N-Core-Ownership, Energie, Node-Zustände und Uploads werden nie nur im Client entschieden.
3. NFC ist eine austauschbare Geräteschicht. Android/Web-NFC zuerst; iOS/native NFC später, ohne die Spielregeln umzubauen.
4. Keine kontinuierliche GPS-Ortung. Räumliche Informationen entstehen nur aus registrierten Spielinteraktionen.
5. Situation Room und VR bleiben eigene Clients derselben API/Ereignisse.
6. Motion/Animation ist Bestandteil der UX, kein späteres Dekorationspaket.
7. Bestehende funktionierende Registrierung/Backend-Daten werden während der Migration nicht zerstört.

## Rollenstand
- PIONEER: Cyan/Blau; kontrollierte taktische NODIV-HUD-Sprache.
- LOCAL: Silber/Grau; bewusst eingeschränkt; 1 N-Core-Slot; Catch; kaum digitale Informationen; Observation draußen; persönlicher Pioneers-Caught-Counter.
- UNBOUND: Dunkelgrün/Schwarz + Neon-Grün; 2 N-Core-Slots; vernetzte Organisation; Network Activity/Probe, Node Discovery, Field Comms; physisch auffällige Rollenfarbe.
- LOCAL und UNBOUND: 5 Minuten persönlicher Catch-Cooldown. Währenddessen ist Catch im Client gesperrt und zusätzlich serverseitig zu prüfen.
- Catch-Ziel: höchster sichtbarer catchbarer persönlicher Pioneer-Core; IN TRANSIT ausgeschlossen.
- Secured Energy und physisch getragene Cores sind getrennte Zustände.

## Motion Language V1
Gemeinsame Ereignisse:
- APP_BOOT
- NFC_ARMED
- IDENTITY_VERIFIED / ACCESS_DENIED
- ROLE_ENTER
- CORE_TRANSFERRED
- CATCH_SUCCESS / CATCH_COOLDOWN
- NODE_EXCHANGE
- NODE_RESTORED
- FIELD_MESSAGE
- EMERGENCY

Rollencharakter:
- Pioneer: präzise, ruhig, Scan/HUD.
- Local: reduziert, harte kurze Intercept-Reaktionen.
- Unbound: Neon-Grün, kontrollierte Störung/Glitch, kompromittierte Systemwirkung.
- FOP: Command/Operations.

Animationen müssen prefers-reduced-motion respektieren und dürfen keine Spielaktion verdecken.

## Umsetzung
### Phase 1 – sichtbares App-Fundament
- PWA-Shell + Manifest + Service Worker.
- Boot-Sequenz.
- Access-Card/Identity-Gate.
- Rollenrouter.
- Pioneer, Local und Unbound als erste Views.
- Motion-System mit CSS/JS-Ereignissen.
- Dummy/Testmodus für sichtbare Entwicklung, ohne Live-Daten zu verändern.

### Phase 2 – echter vertikaler Schnitt
Access Card -> Server-Identität -> Rolleninterface -> echte N-Core-Daten -> eine echte Aktion -> Serverbestätigung -> animierte Rückmeldung.

### Phase 3 – Gameplay
Catch, Cooldowns, Upload, Node Exchange, Restore, Mission/Field Comms.

### Phase 4 – Operations
FOP, Founder, Situation Room; Echtzeit-Ereignisse.

### Phase 5 – weitere Clients
iOS-NFC-Brücke/Companion nach Hardwaretest; Quest/WebXR Situation Room auf derselben API.

## Erster Abnahmepunkt
Auf Android erscheint NODIV als installierbare App/PWA. Boot -> Identity -> Rollenansicht funktioniert sichtbar. Animationen sind bereits Teil dieses ersten Ergebnisses.

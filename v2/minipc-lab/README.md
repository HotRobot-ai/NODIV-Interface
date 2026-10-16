# NODIV V2 – BLOCK 06 REALTEST

**TEST ONLY. Keine Produktivänderung. Mission Board und COM bleiben eingefroren.**

Dieses Paket ist für den ersten zusammenhängenden BLOCK-06-Durchlauf auf Gaming-PC + Smartphone + NFC vorbereitet.

## Start

Nicht die alten Ersttest-Skripte verwenden. Der verbindliche Einstieg ist:

`NODIV-V2-STARTER.cmd`

Der Starter bietet:

1. **Founder Access Card einmalig einrichten**
2. **BLOCK 06 Haupttest starten**
3. **EVAC Realtest** als separate Testkopie nach dem Hauptdurchlauf

## Was vor dem Test benötigt wird

- Node.js 24
- Tailscale auf Gaming-PC und Smartphone
- Android/Chrome mit Web NFC
- reale Access Cards für Founder, FOP, zwei Pioneer, Local und Unbound
- vier reale Node-Tags für den kompakten 1/2/3-Exchange-Durchlauf
- zwölf reale N-Cores mit ihren tatsächlich eingravierten E-Werten
- realer HQ-Upload-Tag

## Datenhaltung

Der Haupttest verwendet:

`data/nodiv-v2-registration.sqlite`

Die Datei wird beim normalen Start **nicht gelöscht**. Registrierung, Eventzustand und Spieltransaktionen bleiben über Serverneustarts erhalten.

Der EVAC-Realtest verwendet getrennt:

`data/nodiv-v2-evac-realtest.sqlite`

Synthetische EVAC-Supportdaten existieren ausschließlich dort und niemals im realen Registrierungsbestand.

## Wichtig

- Keine erfundenen UIDs oder E-Werte eintragen.
- Bei einem Fehler die SQLite-Datei nicht löschen.
- Fehlermeldung und vorherige Aktion festhalten und den bestehenden Zustand erhalten.
- Die V1-Google-Owner-Recovery ist nicht als gleichwertige lokale V2-Recovery migriert. Für BLOCK 06 wird die reale Founder-Karte einmalig als Bootstrap gesetzt; es existiert absichtlich kein schwächerer Recovery-Backdoor.

## Verbindlicher Testablauf

Siehe `BLOCK06-REALTEST.md`.

Dort ist der vollständige Durchlauf dokumentiert:

Founder-Registrierung → Persistenz → Eventstart → FOP → P9004 Secure Approach → P9003 Exchange 1/2/3 → RESTORE #1/#2 → Teil-/Voll-Upload → RE-SUPPLY → Catch/Ghost → FOP-Rückbau → EVAC bis Founder `COMPLETED`.

## Keine Produktivfreigabe

Ein grüner automatisierter Test oder ein erfolgreicher BLOCK-06-Realtest veröffentlicht nichts produktiv. Merge, Deployment und produktiver Eventstart benötigen weiterhin eine gesonderte Founder-Freigabe.

# NODIV CI / DESIGN SYSTEM V1

## Kern
NODIV ist kein generisches Sci-Fi-Dashboard. Die CI soll technisch, hochwertig, urban und funktional wirken. Information vor Dekoration; Animation bestätigt Spielereignisse.

## Gemeinsame DNA
- Schwarz/Graphit als Bühne.
- Feine technische Linien statt dicker Kartenrahmen.
- Große Primärwerte, wenig redundante Beschriftung.
- Monospace für Systemstatus/Labels; klare Sans für Werte und Aktionen.
- Ein sichtbarer Akzent pro Rolle.
- Glows sparsam: Signal, Energie, Warnung oder bestätigte Aktion.
- Keine orange Akzentfarbe im normalen Rolleninterface.
- Keine dauernden aggressiven Glitches; Störung hat Bedeutung.

## Rollen
PIONEER: Cyan/Blau, präzise, stabil, militärisch-technisch.
LOCAL: Silber/Grau, reduziert, anonym, wenig Systemwissen.
UNBOUND: dunkles Grün + Neon-Grün, auffällig, vernetzt, kontrolliert kompromittiert.
FOP: folgt später als Operations-/Command-Sprache.

## UI-Regeln
- Nicht beschriften, was visuell bereits eindeutig ist (z.B. sichtbare zwei Slots nicht zusätzlich „2 Slots“ nennen).
- Primäraktion pro Ansicht klar erkennbar.
- Gesicherte Energie und physisch getragene Energie visuell trennen.
- Cooldown sperrt die betroffene Aktion sichtbar; Server bleibt autoritativ.
- Mobile first, große Touch-Ziele >= 48 px.

## Motion
Boot, NFC, Identity, Rollenwechsel, Catch, Core-Transfer, Node-Operation, Field Message und Emergency haben definierte Ereignisse.
Animationen sind kurz und funktional. prefers-reduced-motion wird respektiert.

## Assets
Logos, Rollenembleme und App-Icons werden als eigene Assets geführt. Keine eingebetteten zufälligen Varianten in einzelnen Screens.

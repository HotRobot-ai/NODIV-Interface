# Founder-Karte ersetzen, wenn sie defekt oder verloren ist

Die Founder-Identität bleibt P001. Eine neue NFC-Karte ersetzt die alte Karte. Der Zugang über das Google-Eigentümerkonto ist unabhängig von der bisherigen Karte. Ein öffentlich erreichbarer Recovery-Endpunkt existiert nicht.

1. Mit dem Google-Konto des Eigentümers der NODIV-Tabelle das bestehende Apps-Script-Projekt öffnen. Script-ID: `12ghO5SyvAiXf7lDHgQxQ47BCauKSiXX5Gvps5zpSP9OzeFbsXnyueKFO`.
2. UID der Ersatzkarte mit dem NFC-Leser ermitteln. Kein Geheimcode oder Notfallpasswort nötig.
3. Projekteinstellungen → Skripteigenschaften: `NODIV_FOUNDER_RECOVERY_UID` auf die UID der Ersatzkarte setzen, beispielsweise im Format `04:AB:CD:12:34:56:78` (Beispiel, nicht übernehmen).
4. `NODIV_FOUNDER_RECOVERY_CONFIRM` auf `REPLACE_FOUNDER_CARD:P001` setzen.
5. Im Editor `recoverFounderAccessFromEditor` auswählen und ausführen. Eine gegebenenfalls angeforderte Google-Autorisierung selbst prüfen.
6. Das Protokoll muss `Founder P001 wiederhergestellt` bestätigen. Danach mit der neuen Karte anmelden.

Die Funktion prüft aktives Google-Konto, effektives Ausführungskonto und den Eigentümer der Tabelle. Sie funktioniert ohne alte Karte oder alte Spielsitzung. Fremde Konten, doppelte UIDs, unklare Founder-Datensätze und fehlende Bestätigung werden abgewiesen. Neue UID und neue Card-ID werden gemeinsam mit Audit atomar gespeichert. Damit sind die alte Karte und alte Founder-Sitzungen ungültig. Identität und Rolle bleiben erhalten. Die Recovery-Eigenschaften werden nach Erfolg entfernt.

Die Funktion ist lokal mit simulierten Google-Diensten getestet. Ein echter Austausch der vorhandenen Founder-Karte wurde nicht durchgeführt.

## Hardware-Neustart

Der separate Founder-Reset `hardwarebindingsreset` entfernt aktive Testkarten, Node-/Core-/Uploadpunktbindungen, Aufträge, Test-Energiekonten und Vorbereitungsdaten. Ein aktueller Previewhash, Sicherungsreferenz und Bestätigung sind erforderlich. Aktive oder initialisierte Events sperren den Reset. Founderzeile, Core-IDs/Energiewerte sowie abgeschlossene Event- und Auditgeschichte bleiben erhalten. Die Audit-Epoch sperrt sämtliche bisherigen Spielsessions.

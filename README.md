# Fireboard Alarm Simulator (FAS) – Übungsalarme für Fireboard

Der Fireboard Alarm Simulator – kurz **FAS** – schickt **Übungsalarme an
Fireboard**. Die Alarme stehen in einer Excel-Tabelle. Sie werden entweder
automatisch zu zufälligen Zeiten, nach einem festen Zeitplan oder per
Tastendruck verschickt – so lässt sich eine Übung mit eingehenden Einsätzen
realistisch durchspielen.

**Was man braucht**

- einen Windows-PC (Windows 10/11) oder einen Mac
- ein Fireboard-Konto mit dem Modul **Alarmverarbeitung** und dessen **AuthKey**
  (Fireboard-Portal → Benutzerkonto → AuthKey-Verwaltung, Eintrag
  „Alarmverarbeitung PLUS“)
- eine Excel-Tabelle mit Alarmen – zwei Beispiele sind dabei

Alle Alarme werden als **Testalarme** gekennzeichnet. Java oder eine andere
Installation ist nicht nötig.

---

## Erste Schritte (Windows)

1. **Herunterladen:** Auf der
   [Releases-Seite](https://github.com/kventil/fireboard-alarm-simulator-releases/releases)
   bei der neuesten Version (z. B. `v1.2.0`) die Datei
   `fireboard-alarm-simulator-…-windows-x64.zip` herunterladen und entpacken.

2. **Starten:** Doppelklick auf **`fas.exe`**. Es öffnet sich der
   Startbildschirm:

   ```
    FAS   Fireboard Alarm Simulator v1.2.0 · Übung einrichten

    Schritt 1 · Welche Alarmdatei?

    › alarmdaten.xlsx                   4 Alarme
      alarmdaten_tecklenburg.xlsx       24 Alarme · Zufallsdaten
      Anderen Pfad eingeben …
   ```

   > Beim ersten Start warnt Windows eventuell („Der Computer wurde durch Windows
   > geschützt“). Dann auf *Weitere Informationen* → *Trotzdem ausführen* klicken.

3. **Ausprobieren:** Mit `↑` `↓` eine Datei wählen, `Enter`. In den
   Einstellungen steht **Testlauf** schon voreingestellt – noch einmal `Enter`,
   und die Übungsansicht öffnet sich. Im Testlauf wird **nichts** an Fireboard
   gesendet, man kann gefahrlos alles ausprobieren (Tasten siehe
   [unten](#tasten)).

4. **Echte Übung:** In den Einstellungen bei *Senden* mit `→` auf **Live**
   wechseln, bei *Ablauf* Von Hand oder Automatisch wählen, `Enter`. Dann den
   **AuthKey** eingeben oder einfügen (Rechtsklick / Strg+V) und `Enter`. Der
   Key wird nicht gespeichert – er wird bei jedem Start neu abgefragt.

**Eigene Alarme verwenden:** Die eigene Excel-Datei in den Ordner von
`fas.exe` legen – sie erscheint dann in der Liste. Oder die Datei im
Explorer **auf `fas.exe` ziehen**: FAS startet direkt mit dieser Datei.

**Wiederkehrende Übungen:** Wer den AuthKey nicht jedes Mal eintippen möchte,
kann ihn in eine Textdatei schreiben (z. B. `key.txt`) und FAS mit
`-keyfile` starten – siehe [AuthKey aus einer Datei](#authkey-aus-einer-datei).

### Mac

Die Datei `fireboard-alarm-simulator-…-macos-arm64.zip` (Mac mit Apple-Chip,
M1 und neuer) bzw. `…-macos-intel.zip` herunterladen und entpacken. Beim ersten
Mal im Programm *Terminal* die Download-Sperre entfernen und FAS starten:

```
cd ~/Downloads/fireboard-alarm-simulator-1.2.0-macos-arm64
xattr -d com.apple.quarantine fas
./fas
```

Danach genügt ein Doppelklick auf `fas` im Finder – es öffnet sich das
Terminal mit dem Startbildschirm.

---

## Die Excel-Tabelle

Jede Zeile ist ein Alarm, die erste Zeile enthält die Spaltennamen. Am
einfachsten nimmt man eine der Beispieldateien als Vorlage und ändert die
Einträge.

| externalNumber | keyword | announcement | location | situation |
|---|---|---|---|---|
| TEST0001 | H1 - Unwetter/Baum | ÜBUNG - Baum auf Fahrbahn | Brochterbecker Straße 40, 49545 Tecklenburg | Baum liegt quer über beide Fahrstreifen |
| TEST0002 | H0 - Unwetter/Wasser | ÜBUNG - Wasser im Keller | Markt 5, 49545 Tecklenburg | ca. 20 cm Wasser im Keller |

Die wichtigsten Spalten:

| Spalte | Bedeutung |
|---|---|
| `externalNumber` | Einsatznummer – muss **eindeutig** sein |
| `keyword` | Einsatzstichwort |
| `announcement` | Alarmnachricht |
| `location` | Anschrift der Einsatzstelle |
| `situation` | Meldebild |

Weitere Spalten (Meldender, Koordinaten, Lage-Updates, feste Zeitpunkte …)
stehen in der [Spaltenübersicht](#alle-spalten).

**Tipp:** Telefonnummern und Koordinaten als **Text** eingeben, damit Excel sie
nicht verändert.

---

## Das Programmfenster

```
   FAS   LIVE   Fireboard Alarm Simulator v1.2.0
  alarmdaten.xlsx · 24 Alarme · 4 pro 5:00 · JSON · Authkey ••••1234

  ━━━━━━━━━━──────────────────────────────  4 / 24 gesendet  1 Fehler
  Übungszeit 12:05 · Nächster Alarm in 2:41 · Intervall 3/6

    ✓  13:18:24  Z2    TEST100001  H0 - Unwetter/Wasser · Markt 5, 49545 Tecklenburg   HTTP 200
    ✗  13:18:25  Z3    TEST100002  H1 - Unwetter/Baum · Schloßstraße, 49545 Tecklen…   Alarm ✗ 401
  › ●  in 2:41   Z4    TEST100003  H0 - Unwetter/Baum · Am Hagen, 49545 Tecklenburg
    ◷  in 7:55   Z5    TEST100004  B2 - Brand · Sundern 12, 49545 Tecklenburg         Drehbuch 20:00
    ○            Z6    TEST100005  H1 - Unwetter/Dach · Wellenberg 10, 49545 Tecklenburg

  Letzter Fehler Zeile 3 (HTTP 401): Authkey vermutlich inkorrekt …
```

- **Oben:** Datei, Anzahl Alarme, Tempo – und ob gesendet wird: **LIVE** oder
  **TESTLAUF** (nichts wird gesendet).
- **Übungszeit:** läuft ab dem Start, steht während einer Pause still.
- **Liste:** ein Alarm pro Zeile. `Z4` ist Zeile 4 der Excel-Tabelle, `›` markiert
  den ausgewählten Alarm.

| Symbol | Bedeutung |
|---|---|
| `○` | wartet |
| `●` | kommt als Nächstes (mit Countdown) |
| `◷` | kommt zu einer festen Zeit ([Drehbuch](#nach-drehbuch)) |
| `✓` | gesendet |
| `✗` | Fehler – die Erklärung steht unter der Liste |

## Tasten

| Taste | Was passiert |
|---|---|
| `↑` `↓` | Alarm auswählen |
| `Enter` | ausgewählten Alarm **sofort** senden |
| `Leertaste` | **Pause** – alles hält an, bis zur nächsten Leertaste |
| `u` | Lage-Update des Alarms senden (z. B. „Scheune brennt jetzt vollständig“) |
| `c` | ausgewählten Alarm in Fireboard **schließen** |
| `C` `C` | **alle** gesendeten Alarme schließen (zweimal drücken) |
| `z` | einen [Zufallsalarm](#zufallsalarme) hinzufügen |
| `d` | Alarm für diese Übung streichen (die Excel-Datei bleibt unverändert) |
| `q` | Programm beenden |

---

## Eine Übung durchführen

### Zufällig verteilt

```
fas.exe alarmdaten.xlsx MEINKEY 600 4
```

Im Startbildschirm: *Ablauf* → **Automatisch**, dann *Alarme* und *Intervall*
einstellen – z. B. **4 Alarme alle 10 Minuten**. Wann genau innerhalb der
10 Minuten, ist jedes Mal zufällig – die Anzahl stimmt aber immer. Als Befehl
(Intervall in Sekunden) steht es oben.

### Von Hand

```
fas.exe alarmdaten.xlsx MEINKEY
```

Im Startbildschirm: *Ablauf* → **Von Hand**. Es wird nichts automatisch
gesendet; die Übungsleitung wählt einen Alarm mit `↑` `↓` und schickt ihn mit
`Enter` ab.

### Nach Drehbuch

In der Excel-Tabelle eine Spalte **`zeitpunkt`** anlegen und eintragen, wann der
Alarm kommen soll – gemessen ab Übungsbeginn:

| zeitpunkt | Alarm kommt … |
|---|---|
| `00:00` | sofort beim Start |
| `05:00` | nach 5 Minuten |
| `1:10:00` | nach 1 Stunde 10 Minuten |

Alarme mit Zeitpunkt werden immer automatisch gesendet. Zeilen ohne Zeitpunkt
laufen wie gewohnt zufällig oder von Hand – beides lässt sich mischen: feste
Schlüsselereignisse, dazwischen zufällige Alarme.

### Zufallsalarme

Statt jeden Alarm einzeln zu schreiben, kann FAS Alarme aus einer Liste von
Einsatzstichwörtern und Adressen **zusammenwürfeln** – mit der Taste `z` oder
beim Start mit `-random` (z. B. `fas.exe -random 20 alarmdaten_tecklenburg.xlsx MEINKEY 600 4`
für 20 Zufallsalarme). Wie man die Listen anlegt, steht
[hier](#zufallsalarme-einrichten). Die Tecklenburg-Beispieldatei enthält schon
14 Stichwörter und 24 Adressen.

### Lage-Updates

Ein Alarm kann sich im Lauf der Übung verschärfen, z. B. von „Rauch aus dem
Scheunendach“ (B2) zu „Scheune brennt in voller Ausdehnung“ (B3). Dazu in der
Tabelle die neuen Angaben eintragen (`update_keyword`, `update_situation`) und
in `update_after`, wie lange nach dem Alarm das Update kommen soll (z. B.
`08:00`). Ohne Zeitangabe wird das Update mit `u` von Hand ausgelöst.

---

## Nach der Übung

- **Alarme schließen:** `C` zweimal drücken – oder später FAS starten und im
  Startbildschirm bei *Was tun?* **Alle Alarme der Datei schließen** wählen. Die Alarme verschwinden dann von den Fireboard-Endgeräten.
- **Protokoll:** Neben der Excel-Datei liegt eine Datei
  `…_protokoll.csv`. Sie lässt sich mit Excel öffnen und zeigt jeden gesendeten
  Alarm mit Uhrzeit, Übungszeit und Ergebnis – praktisch für die
  Nachbesprechung.

## Wenn etwas schiefgeht

**Das Programm wurde mitten in der Übung beendet** (Laptop aus, Absturz, `q`)  
Einfach wieder starten. FAS fragt „Fortsetzen?“ – mit `J` geht die Übung
dort weiter, wo sie aufgehört hat. Bereits gesendete Alarme werden **nicht**
noch einmal geschickt.

**Fehler 401**  
Der AuthKey ist falsch, oder das Modul Alarmverarbeitung ist für das Konto
nicht freigeschaltet. AuthKey im Fireboard-Portal prüfen.

**„keine Verbindung“**  
Keine Internetverbindung, oder eine Firewall bzw. ein Proxy blockiert. Die
Meldung unter der Liste nennt den wahrscheinlichen Grund.

**Seltsame Zeichen statt Symbolen**  
Die alte Windows-Konsole kann die Symbole nicht darstellen. Das *Windows
Terminal* verwenden (Standard unter Windows 11) oder `-plain` hinter
`fas.exe` ergänzen.

**Der Alarm kommt in Fireboard nicht an**  
Im Fireboard-Portal unter *Alarmeingang* nachsehen, ob er dort erscheint.
Alle Alarme sind als Test gekennzeichnet und lassen sich dort auch gesammelt
wieder löschen.

**Der Mac verweigert den Start**  
Die Download-Sperre entfernen, siehe [Mac](#mac).

---
---

# Referenz

Die folgenden Abschnitte beschreiben alle Möglichkeiten im Detail.

## Aufruf und Optionen

```
fas                                   Startbildschirm
fas <exceldatei>                      Startbildschirm mit dieser Datei (auch per Drag & Drop)
fas [optionen] <exceldatei> <authkey> [<intervall-sek> <alarme-pro-intervall>]
fas [optionen] -keyfile <datei> <exceldatei> [<intervall-sek> <alarme-pro-intervall>]
```

Mit Excel-Datei und AuthKey startet FAS direkt ohne Startbildschirm. Der
Startbildschirm zeigt zu den gewählten Einstellungen den passenden Befehl an.

| Parameter | Bedeutung |
|---|---|
| `exceldatei` | Excel-Datei mit den Alarmen und optional den Daten für Zufallsalarme |
| `authkey` | AuthKey der Alarmdatenschnittstelle. `x` = Testlauf, es wird nichts gesendet |
| `intervall-sek` `alarme-pro-intervall` | Optional. Z. B. `600 4`: 4 Alarme je 600 Sekunden zu zufälligen Zeitpunkten. Ohne diese Angaben: manueller Modus |
| `-plain` | Einfache Textausgabe statt Oberfläche (automatischer Modus oder Drehbuch). Wird automatisch verwendet, wenn die Ausgabe umgeleitet wird |
| `-xml` | Alarme im XML-Format senden statt JSON |
| `-close` | Alle Alarme der Excel-Datei in Fireboard schließen und beenden |
| `-random anzahl` | So viele Zufallsalarme erzeugen und an die Alarme der Tabelle anhängen |
| `-seed n` | Startwert für Zufallsalarme: gleicher Seed = gleiche Übung. Ohne Angabe zufällig; der verwendete Seed steht im Kopf der Oberfläche |
| `-resume` / `-fresh` | Eine unterbrochene Übung ohne Nachfrage fortsetzen bzw. neu beginnen |
| `-keyfile datei` | AuthKey aus einer Textdatei lesen statt als Parameter, siehe unten |
| `FAS_URL` | Umgebungsvariable, ersetzt `https://login.fireboard.net/api` (z. B. für einen Testserver) |

Weitere Tasten: `j` `k` (wie `↑` `↓`), `g` / `G` (zum ersten / letzten Alarm),
`s` (wie `Enter`), `p` (wie Leertaste), `Entf` (wie `d`). Mit `Enter` lässt
sich ein bereits gesendeter Alarm erneut senden.

### AuthKey aus einer Datei

FAS speichert den AuthKey nie. Für wiederkehrende Übungen kann er in eine
Textdatei geschrieben werden (erste Zeile, z. B. `key.txt`) und mit `-keyfile`
übergeben werden – dann taucht er weder im Befehl noch in der Eingabe auf:

```
fas -keyfile key.txt alarmdaten.xlsx 600 4    # startet direkt
fas -keyfile key.txt                          # Startbildschirm, Key schon bekannt
```

Unter Windows lässt sich das per Verknüpfung auf einen Doppelklick legen:
Rechtsklick auf `fas.exe` → *Verknüpfung erstellen*, dann in den Eigenschaften
bei *Ziel* hinter `fas.exe` z. B. ` -keyfile key.txt` ergänzen. Die Key-Datei
wie ein Passwort behandeln und nicht weitergeben.

### Ablauf

Im automatischen Modus sendet der Countdown immer den nächsten noch offenen
Alarm ohne festen Zeitpunkt; von Hand gesendete Alarme verbrauchen keinen Platz
im Intervall. Nach dem letzten Alarm läuft das Programm weiter, damit Updates und
Schließen noch möglich sind.

## Alle Spalten

Die Alarme stehen im ersten Tabellenblatt (die Blätter für Zufallsalarme
ausgenommen). Die Reihenfolge der Spalten ist egal, fehlende Spalten werden
nicht übertragen, leere Zeilen übersprungen.

| Spalte | Inhalt |
|---|---|
| `externalNumber` | Leitstellen-/Einsatznummer |
| `keyword` | Einsatzstichwort |
| `announcement` | Alarmnachricht |
| `location` | Anschrift, z. B. `Markt 5, 49545 Tecklenburg` |
| `location_name` | Name des Geschädigten / Objekt |
| `location_info` | Zusatzinfo zur Einsatzstelle |
| `geo_location_auto` | `true`/`false`: automatische Georeferenzierung durch Fireboard |
| `geo_location_latitude`, `geo_location_longitude` | Koordinaten (WGS84, Punkt oder Komma) |
| `reporter_name`, `reporter_phone`, `reporter_info` | Meldender |
| `situation` | Meldebild |
| `timestampStarted` | Einsatzbeginn als Unix-Zeit (Sekunden oder Millisekunden); leer = Zeitpunkt des Eingangs |
| `uniqueId` | *optional* – eindeutige ID, sonst wird `externalNumber` verwendet |
| `update_keyword` | *optional* – neues Stichwort beim Lage-Update |
| `update_situation` | *optional* – neues Meldebild beim Lage-Update |
| `update_after` | *optional* – Update automatisch so lange nach dem Alarm senden: `mm:ss` (`10:00`) oder Sekunden (`600`); leer = nur von Hand mit `u` |
| `zeitpunkt` | *optional* – Drehbuch: Alarm zu dieser Übungszeit senden: `mm:ss`, `h:mm:ss` oder Sekunden; leer = Intervall bzw. von Hand |

- Zeiten (`zeitpunkt`, `update_after`) werden so gelesen, wie Excel sie anzeigt:
  `05:00` bedeutet 5 Minuten, auch wenn Excel daraus intern eine Uhrzeit macht.
- Jeder Alarm braucht eine eindeutige ID, sonst überschreiben sich die Alarme in
  Fireboard. Ohne `uniqueId` und `externalNumber` wird `FAS-<datei>-Z<zeile>`
  verwendet; doppelte IDs werden beim Start gemeldet.
- Ohne Koordinaten entscheidet die Georeferenzierungs-Einstellung im Portal, ob
  die Anschrift aufgelöst wird.
- Zeilen mit Fehlern (z. B. ungültige Zeitangabe) werden beim Start gemeldet und
  übersprungen.

Beispieldateien (in jeder Zip-Datei enthalten): `alarmdaten.xlsx`
(4 Beispielalarme) und `alarmdaten_tecklenburg.xlsx` (24 Unwetter-Einsätze mit
Lage-Updates, dazu 14 Stichwörter und 24 Adressen für Zufallsalarme).

## Zufallsalarme einrichten

Die Excel-Datei bekommt zwei weitere Tabellenblätter. Sie verwenden die gleichen
Spaltennamen wie die Alarmtabelle.

**`Stichwörter`** – ein Einsatzszenario pro Zeile, z. B. `keyword`,
`announcement`, `situation`, `update_keyword`, `update_situation`,
`update_after`, dazu:

| Spalte | Bedeutung |
|---|---|
| `gewicht` | Wie oft das Szenario im Verhältnis vorkommt (Standard 1; `5` = fünfmal so oft, `0` = nie) |
| `kategorie` | Nur Adressen mit einer dieser Kategorien verwenden, z. B. `landwirtschaft` oder `strasse, wohnhaus` |

**`Adressen`** – ein Einsatzort pro Zeile: `location`, `location_name`,
`location_info`, `geo_location_*` und `kategorie` (eine oder mehrere, durch
Komma getrennt).

So entsteht ein Zufallsalarm:

- Ein Szenario wird nach Gewicht gezogen, dazu eine Adresse mit passender
  Kategorie. So brennt die Scheune nur auf einem Hof, und der Baum liegt auf
  einer Straße.
- Jede Adresse kommt erst wieder dran, wenn alle anderen passenden einmal
  verwendet wurden.
- Fehlen `reporter_*`-Spalten, werden fiktive Meldende ergänzt (Nummern
  `0170-555…`).
- Zufallsalarme heißen in der Liste `R1`, `R2`, … und bekommen eindeutige IDs
  wie `ZUF-2609231512-001`.

Mit `-seed` lässt sich eine Übung exakt wiederholen, z. B. 20 Zufallsalarme,
4 je 10 Minuten:

```
fas -random 20 -seed 4711 alarmdaten_tecklenburg.xlsx <authkey> 600 4
```

Eine Datei nur mit den Sheets `Stichwörter` und `Adressen` funktioniert auch –
dann gibt es ausschließlich Zufallsalarme. `fas -close` schließt nur die
Alarme der Tabelle; Zufallsalarme mit `C` in der Oberfläche schließen.

## Lage-Updates und Schließen

Fireboard erkennt einen Alarm an seiner `uniqueId`. Wird dieselbe ID erneut
gesendet, aktualisiert Fireboard den vorhandenen Alarm – so werden Lage-Updates
übertragen.

Zum Schließen wird der Alarm mit `timestampClosed` erneut gesendet. Laut
Fireboard-Spezifikation wird er dann **auf den Endgeräten ausgeblendet**; ob das
auch den Einsatz in der Fireboard Suite abschließt, ist nicht dokumentiert. Da
die IDs aus der Excel-Datei stammen, lassen sich Alarme auch später noch
schließen: mit `c` in der Oberfläche oder `fas -close <datei> <authkey>`.

Die Übungszeit, `zeitpunkt` und `update_after` zählen ohne Pausen.

## Fortsetzen nach einer Unterbrechung

Beim Start liest FAS das Protokoll der Excel-Datei. Wurde die letzte Übung
nicht beendet, fragt es:

```
Die letzte Übung mit alarmdaten.xlsx wurde nicht beendet:
  12 Alarme gesendet, 9 davon offen, zuletzt am 23.09. 17:40 bei Übungszeit 0:45:10
Fortsetzen? [J/n]
```

- Beim Fortsetzen werden alle bereits gesendeten, aktualisierten und
  geschlossenen Alarme übernommen (Status „aus Protokoll“) und nicht erneut
  gesendet.
- Die Übungszeit läuft dort weiter, wo sie stehen geblieben ist – die
  Unterbrechung zählt wie eine Pause.
- Zufallsalarme werden mit demselben Seed identisch wiederhergestellt.
- Nicht gefragt wird, wenn am Ende alle gesendeten Alarme geschlossen wurden
  (Übung beendet) oder die letzte Übung ein Testlauf war und jetzt live gesendet
  wird (und umgekehrt).
- Im Startbildschirm erscheint die Frage als eigener Schritt; `-resume` bzw.
  `-fresh` beantworten sie vorab.
  Ohne Terminal (umgeleitete Ausgabe) beginnt die Übung ohne `-resume` neu.

## Protokoll

Jede Übertragung wird an `<exceldatei>_protokoll.csv` neben der Excel-Datei
angehängt (Semikolon-getrennt, öffnet direkt in Excel), jeder Programmstart mit
einer Zeile `Start`. Der AuthKey wird nie protokolliert.

```
Zeitpunkt;Übungszeit;Aktion;Zeile;uniqueId;Einsatznummer;Stichwort;Testlauf;HTTP;Ergebnis;Meldungen;Hinweis
23.09.2026 13:10:02;0:00:00;Start;;;;;nein;;neu;seed=4711 prefix=ZUF-2609231310;
23.09.2026 13:18:26;0:08:24;Alarm;Z11;TEST100010;TEST100010;B2 - Brand landw. Gebäude;nein;200;ok;;
23.09.2026 13:26:26;0:16:24;Lage-Update;Z11;TEST100010;TEST100010;B3 - Brand landw. Gebäude;nein;200;ok;;
23.09.2026 13:40:11;0:30:09;Schließen;Z11;TEST100010;TEST100010;B3 - Brand landw. Gebäude;nein;200;ok;;
```

Ein Protokoll im Format einer älteren Version wird beim Start in
`…_protokoll_alt_<datum>.csv` umbenannt und ein neues begonnen.

## Fehlermeldungen

Bei Fehlern zeigt FAS die Antwort von Fireboard und darunter (`↳`) die
wahrscheinliche Ursache, z. B.:

| Fehler | Wahrscheinliche Ursache |
|---|---|
| HTTP 400 | Ein Feld der Excelzeile hat einen Wert, den Fireboard nicht akzeptiert |
| HTTP 401 | AuthKey falsch oder Modul Alarmverarbeitung nicht freigeschaltet |
| HTTP 429 | Zu viele Alarme in kurzer Zeit |
| HTTP 500 / 502–504 | Störung oder Wartung bei Fireboard |
| keine Verbindung | Kein Internet, DNS-Problem, Firewall/Proxy oder Zertifikatsproblem |

## Fireboard-Schnittstelle

- Endpunkt: `POST https://login.fireboard.net/api?authkey=…&call=operation_data`
- Standardformat ist JSON nach der
  [OpenAPI-Spezifikation](https://login.fireboard.net/openapi/openapi_fireboard.json)
  ([Swagger](https://login.fireboard.net/swagger/)); mit `-xml` das XML-Format
  `fireboardOperation` aus dem Handbuch. Schließen erfolgt immer per JSON.
- Die Antwort (`status`, `errors`, `warnings`) wird ausgewertet und angezeigt.
- Die Schnittstelle kann nur schreiben: Es gibt keinen Abruf von Alarmen oder
  deren Bearbeitungsstand. Die Auswertung der Übung erfolgt in Fireboard selbst
  (Portal → Alarmeingang).
- Handbuch: [Schnittstelle Alarmdatenübernahme](https://login.fireboard.net/files/handbuecher/Handbuch_Schnittstelle_Alarmdatenuebernahme.pdf)

## Downloads im Detail

| Datei | System |
|---|---|
| `fireboard-alarm-simulator-<version>-windows-x64.zip` | Windows 10/11: Programm `fas.exe`, Beispieldaten, Anleitung |
| `fireboard-alarm-simulator-<version>-macos-arm64.zip` | Mac mit Apple-Chip (M1 und neuer) |
| `fireboard-alarm-simulator-<version>-macos-intel.zip` | Mac mit Intel-Prozessor |
| `checksums.txt` | SHA-256-Prüfsummen |

Für Übungen immer die neueste Version verwenden.

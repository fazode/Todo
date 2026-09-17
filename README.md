# Nachtnotiz

Web-App, um Aufgaben per Spracheingabe zu diktieren. Gedacht für den Moment, in dem
man nachts aufwacht und etwas einfällt, das morgen erledigt werden muss: Handy nehmen,
einmal auf das Mikrofon tippen, sprechen, weiterschlafen.

Kein Framework, kein Build, kein Server. Reines HTML, CSS und ES-Module.

## Was sie kann

- **Diktieren** über die Web Speech API, mit Live-Anzeige des Gesprochenen
- **Automatisches Trennen**: ein Diktat wie „Müll rausbringen, neue Aufgabe, Zahnarzt anrufen“
  wird zu zwei Einträgen (an Satzenden und an Phrasen wie „neue Aufgabe“, „nächster Punkt“)
- **Füllwörter raus**: „ähm“, „äh“, „hm“ verschwinden, Abkürzungen wie „z. B.“ bleiben heil
- **Diktierte Satzzeichen**: „… Fragezeichen“ am Ende wird zu `?`
- **Liste verwalten**: abhaken, bearbeiten, als wichtig markieren, löschen, jeweils mit Rückgängig
- **Nachtmodus**: dunkle, blaulichtarme Oberfläche, zusätzlich abdunkelbar
- **Display bleibt an** (Wake Lock), solange diktiert wird
- **Offline nutzbar** als installierbare PWA, Liste und Tippen funktionieren ohne Netz
- **Tippen als Rückfallebene**, falls der Browser kein Diktat kann oder es nachts zu still sein soll
- **Export/Import als JSON**, Kopieren als Textliste

Daten liegen ausschließlich im `localStorage` des Geräts. Es gibt kein Konto, keinen Server
und keine Synchronisierung.

## Bedienung

| Aktion | Wie |
| --- | --- |
| Diktat starten/stoppen | Mikrofon antippen, am Desktop auch Leertaste |
| Diktat abbrechen | `Esc` |
| Aufgabe bearbeiten | in den Text tippen, `Enter` oder Fokuswechsel speichert |
| Aufgabe löschen | Papierkorb, danach 6 Sekunden Rückgängig |
| Text leeren | leeren Text speichern löscht die Aufgabe |

## Lokal starten

```bash
npm start           # http://127.0.0.1:8080
```

Ein Aufruf über `file://` reicht nicht: Browser blockieren dort ES-Module und den
Mikrofonzugriff. Jeder andere statische Server tut es genauso, z. B. `python3 -m http.server`.

## Tests

```bash
npm test
```

Deckt die Textaufbereitung ab (Füllwörter, Trennregeln, Zeitformate). Keine Abhängigkeiten,
nur der Test-Runner von Node.

## Auf dem Handy nutzen

Das Mikrofon gibt der Browser nur in einem sicheren Kontext frei, also über HTTPS oder auf
`localhost`. Der kürzeste Weg ist GitHub Pages: in den Repo-Einstellungen unter
*Settings → Pages* als Quelle *GitHub Actions* wählen, dann veröffentlicht der Workflow
`.github/workflows/pages.yml` jeden Push auf `main`. Die Seite anschließend im Browser des
Handys öffnen und über „Zum Startbildschirm hinzufügen“ installieren.

## Browser

Die Spracherkennung läuft in Chrome, Edge und Safari (dort inklusive iOS). Firefox hat die
Web Speech API standardmäßig nicht aktiv: dort zeigt die App einen Hinweis, alles andere
funktioniert weiter. In den meisten Browsern läuft die Erkennung serverseitig beim
Browserhersteller und braucht deshalb kurz Internet.

## Struktur

```
index.html              Aufbau der Oberfläche
src/css/style.css       Nachttaugliches, dunkles Layout
src/js/app.js           Zustand, Rendering, Ereignisse
src/js/speech.js        Hülle um die Web Speech API inkl. Neustart nach Sprechpausen
src/js/parse.js         Rohtext zu Aufgaben: Füllwörter, Trennregeln, Zeitformat
src/js/store.js         localStorage mit Rückfallebene im Arbeitsspeicher
sw.js                   Service Worker für den Offline-Betrieb
tools/serve.js          Statischer Entwicklungsserver ohne Abhängigkeiten
tests/                  Tests für die Textaufbereitung
```

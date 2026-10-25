# Auftrag für schreibende Agenten (TestDaF-Modul)

Diese Datei ersetzt die frühere Pflichtlektüre von ~36.800 Zeichen (Schema + Musterdatei) pro Agent.
Ein Agent liest **nur diese Seite** plus seine Gerüstdatei und schreibt ausschließlich Inhalte.

## 1. Auftrag in drei Schritten

```bash
# 1. Gerüst ansehen (enthält schon Struktur, IDs, Items, Zeiten, TDN, audio)
cat src/content-testdaf/mt03/lesen-aufgabe-01.json

# 2. Inhalts-Fragment schreiben (NUR Inhaltsfelder, siehe §3) und einsetzen:
node scripts/montiere-aufgabe.mjs \
  --vorlage src/content-testdaf/mt03/lesen-aufgabe-01.json \
  --inhalt /tmp/fragment.json

# 3. Bei Fehlern: Fragment korrigieren und erneut einsetzen, bis der Validator 0 Fehler zeigt.
```

`montiere-aufgabe.mjs` setzt das Fragment in das Gerüst, prüft die Struktur und ruft danach
`validate-testdaf.mjs --file <datei>` auf. **Unbekannte Felder werden abgelehnt** — Tippfehler
fallen sofort auf. Ohne Fragment-Datei geht es auch direkt: Gerüstdatei von Hand füllen und
`node scripts/validate-testdaf.mjs --file mt03/lesen-aufgabe-01` laufen lassen.

## 2. Harte Regeln (alles andere prüft der Validator)

1. **`evidence` muss ein wörtliches Zitat** aus deinem eigenen Text/Transkript sein — Zeichen für
   Zeichen kopiert. Der Validator vergleicht den Text normalisiert (Kleinschreibung, Anführungszeichen
   egal), aber sonst exakt. Kein Paraphrasieren, kein Kürzen mit „…“.
2. **Alles ist eigener Text.** Kein Satz, keine Aufgabe, kein Transkript aus einem TestDaF-Buch,
   keiner Website, keinem Korpora-Auszug. `source_type` bleibt `"ai"`, die `attribution` aus dem
   Gerüst wird nicht verändert (außer Kürzen). Das Wort „Klett“ oder „Mit Erfolg“ darf dort nicht
   auftauchen — der Validator und der Kontrakt-Test lehnen das ab.
3. **Zahlen und Fakten müssen frei erfunden und in sich konsistent** sein (erfundene Studien, fiktive
   Namen, plausible Größenordnungen). Keine echten Personen, keine echten Studienergebnisse.
4. **Sprachniveau B2.** Natürliches Deutsch mit Umlauten. Die `*_id`-Felder sind korrekte
   Übersetzungen ins Bahasa Indonesia (kurz, keine Kommas nötig).
5. **Verteilung** (der Validator warnt sonst): `jn3` → alle drei Kategorien belegt, keine mehr als
   5×; `richtigfalsch` → mindestens 30 % „falsch“; `zuordnung` → mindestens 6 verschiedene
   Lösungsbuchstaben, jedes Angebot höchstens einmal, höchstens 3 gleiche Lösungen hintereinander.
6. **`mc3`**: genau 3 Optionen je Item mit plausiblen Distraktoren (vertauschte Zahl, vertauschte
   Ursache/Wirkung, zu absolute Aussage). Die richtige Option muss im Text wörtlich belegt sein.
7. **`kurzantwort`** (Hören 1 und 3): `loesung` = 1–3 Stichworte (je höchstens 3 Wörter),
   `schluessel` = 1–3 Gruppen; jede Gruppe ist ein Array von Schreibvarianten, und **alle** Gruppen
   müssen vorkommen, damit die Antwort als richtig gilt. Varianten ausschreiben
   (`["land", "länder", "ländern"]`), weil der Matcher Umlaute faltet, aber nicht rät.
8. **Glossar** mindestens 8, sinnvoll 12–18 Einträge, `artikel` nur `der`/`die`/`das`/`""`.

## 3. Umfang je Itemart (Richtwerte, der Validator warnt außerhalb)

| Aufgabe | Itemtyp | Items | Textumfang |
|---|---|---|---|
| Lesen 1 | `zuordnung` | 10 | 8 Kurztexte a–h, je 45–60 Wörter (zusammen 300–450) + Text I „kein Angebot passt“ (mindestens 2 Items → I) |
| Lesen 2 | `mc3` | 10 | ein journalistischer Text, 450–550 Wörter |
| Lesen 3 | `jn3` | 10 | ein wissenschaftlicher Text, 550–600 Wörter |
| Hören 1 | `kurzantwort` | 8 | Dialog 350–400 Wörter, 1× hören, Sprechermarken `[A]`, `[B]` |
| Hören 2 | `richtigfalsch` | 10 | Interview/Gesprächsrunde 550–580 Wörter, 1× hören |
| Hören 3 | `kurzantwort` | 7 | Vortrag mit Nachfrage ca. 600 Wörter, 2× hören |

Transkripte (Hören): **jede Zeile beginnt mit einer Sprechermarke in eckigen Klammern**, z. B.
`[Moderatorin] …` / `[Professorin Baumann] …`. Fakten (Uhrzeiten, Preise, Fristen, Mengen, Namen)
müssen so eindeutig im Text stehen, dass die Fragen mit Stichworten beantwortbar sind.

## 4. Arbeitsweise (Zeitbudget)

* Gerüst lesen, dann **einmal** schreiben — nicht erst recherchieren, nicht im Repo suchen.
* Fragment einsetzen und prüfen; Fehlerliste abarbeiten. Rechne mit **1–2 Korrekturrunden**.
* Nicht die ganze Bank validieren (das machen die Geschwister gleichzeitig) — immer `--file`.
* Nicht `npm`/`astro` starten, keine anderen Dateien anfassen. Ein Agent = eine Datei.

## 5. Fertig heißt

Der letzte Aufruf von `node scripts/validate-testdaf.mjs --file <deine datei>` zeigt
`0 error` und `0 warning`. Melde am Ende: Dateipfad, Itemzahl, Wortzahl des Textes/Transkripts
und die letzte Validator-Zeile.

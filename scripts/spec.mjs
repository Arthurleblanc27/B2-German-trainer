/**
 * TestDaF-Modul — Format-Tabelle für die Werkzeuge (reines JS, keine Abhängigkeiten).
 *
 * Einzige Wahrheit für die Skripte: `validate-testdaf.mjs`, `vorlage-erzeugen.mjs`
 * und `montiere-aufgabe.mjs` lesen diese Tabelle. Die App selbst nutzt
 * `src/data/testdaf.ts`; der Validator vergleicht beide zusätzlich gegeneinander,
 * damit sie nicht auseinanderlaufen.
 */
export const BEREICHE = {
  lesen: [
    { aufgabe: 1, items: 10, minuten: 15, typ: 'zuordnung', tdn: 3, kurztexte: 8, optionen: 9 },
    { aufgabe: 2, items: 10, minuten: 20, typ: 'mc3', tdn: 4 },
    { aufgabe: 3, items: 10, minuten: 15, typ: 'jn3', tdn: 5 }
  ],
  hoeren: [
    { aufgabe: 1, items: 8, minuten: 8, typ: 'kurzantwort', tdn: 3, playLimit: 1, woerter: [300, 500] },
    { aufgabe: 2, items: 10, minuten: 10, typ: 'richtigfalsch', tdn: 4, playLimit: 1, woerter: [450, 700] },
    { aufgabe: 3, items: 7, minuten: 12, typ: 'kurzantwort', tdn: 5, playLimit: 2, woerter: [500, 750] }
  ]
};

export const LIZENZEN = ['CC-BY-NC-SA-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'proprietary'];
export const FRAGETYPEN = ['zuordnung', 'mc3', 'jn3', 'richtigfalsch', 'kurzantwort'];

// Zeiten nach dem papierbasierten TestDaF: 60′ Lesen (inkl. 10′ Übertragen),
// 40′ Hören (davon 10′ Übertragen am Ende von Hörtext 3).
export const TESTDAF_PRUEFUNG = {
  lesen: { aufgaben: 3, items: 30, minuten: 60, uebertragen_minuten: 10 },
  hoeren: { aufgaben: 3, items: 25, minuten: 40, uebertragen_minuten: 10 }
};

export const TDN_LABEL = {
  3: 'TDN 3 — einfache Texte des Studienalltags',
  4: 'TDN 4 — detailliertes Verstehen, Standardsprache',
  5: 'TDN 5 — wissenschaftliche Sprache, implizite Informationen'
};

export function spez(bereich, aufgabe) {
  return (BEREICHE[bereich] ?? []).find((s) => s.aufgabe === Number(aufgabe));
}

export const mtKuerzel = (modelltest) => `mt${String(modelltest).padStart(2, '0')}`;

export const idFuer = (modelltest, bereich, aufgabe) => `testdaf-${mtKuerzel(modelltest)}-${bereich}-a${aufgabe}`;

export const audioPfad = (modelltest, bereich, aufgabe) =>
  `/audio/testdaf-${mtKuerzel(modelltest)}-${bereich}-a${aufgabe}.mp3`;

export const dateiName = (bereich, aufgabe) => `${bereich}-aufgabe-${String(aufgabe).padStart(2, '0')}.json`;

/** Alle 6 Aufgaben eines Modelltests in Prüfungsreihenfolge. */
export function aufgabenListe(modelltest) {
  return ['lesen', 'hoeren'].flatMap((bereich) =>
    BEREICHE[bereich].map((s) => ({
      modelltest: Number(modelltest),
      bereich,
      aufgabe: s.aufgabe,
      spec: s,
      id: idFuer(modelltest, bereich, s.aufgabe),
      datei: `${mtKuerzel(modelltest)}/${dateiName(bereich, s.aufgabe)}`
    }))
  );
}

export const attributionFuer = (modelltest, bereich, aufgabe) =>
  `Eigener Text (KI-generiert, manuell geprüft) — TestDaF-Modul, Modelltest ${modelltest}, ` +
  `${bereich === 'lesen' ? 'Leseverstehen' : 'Hörverstehen'} Aufgabe ${aufgabe}. ` +
  'Nur das Format orientiert sich am TestDaF; alle Texte und Items sind neu verfasst.';

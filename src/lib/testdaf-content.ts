/**
 * TestDaF-Modul — pemuat bank soal TestDaF (build-time, via Vite glob).
 *
 * Bank soal TestDaF terpisah dari bank Goethe B2 (src/content/**), supaya
 * validator + kontrak test skema lama tidak berubah: berkas TestDaF memakai
 * bentuk datanya sendiri (schemaVersion 2, `bereich` + `aufgabe`), jadi
 * `istUnit`/`istPruefung` di src/lib/content.ts mengabaikannya.
 */
import {
  TestdafAufgabeSchema,
  TestdafPruefungSchema,
  type TestdafAufgabe,
  type TestdafBereich,
  type TestdafFrage,
  type TestdafPruefung
} from '../data/testdaf';

// Relativer Glob — absolute '/src/...'-Globs brechen bei Symlink-Pfaden (C: → D:).
const module_ = import.meta.glob('../content-testdaf/**/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

const eintraege = Object.entries(module_).filter(([pfad]) => !/(^|\/)_/.test(pfad));

const istAufgabe = (v: Record<string, unknown> | null | undefined): boolean =>
  !!v && v['format'] === 'testdaf' && typeof v['bereich'] === 'string' && Array.isArray(v['fragen']);

const istPruefung = (v: Record<string, unknown> | null | undefined): boolean =>
  !!v && v['format'] === 'testdaf' && typeof v['id'] === 'string' && Array.isArray(v['aufgaben']);

/**
 * WICHTIG — hier wird geparst, nicht gecastet.
 *
 * Die JSON-Dateien lassen optionale Felder weg: `schluessel` steht nur bei
 * kurzantwort, `optionen` nur bei mc3. Erst das zod-Schema füllt die Defaults
 * (`schluessel: []`, `optionen: null`, `punkte: 1`, …). Ein reiner Typ-Cast
 * liefert zur Laufzeit `undefined` — und `frage.schluessel.length` im
 * Ergebnisbild sprengt dann das komplette Island-Rendering: Wertung,
 * Lösungsschlüssel und Erklärungen fehlten stillschweigend.
 */
const alsAufgabe = (wert: unknown): TestdafAufgabe | null => {
  const r = TestdafAufgabeSchema.safeParse(wert);
  if (r.success) return r.data;
  console.error('TestDaF: Aufgabe verletzt das Schema und wird übersprungen', r.error.issues.slice(0, 4));
  return null;
};

const alsPruefung = (wert: unknown): TestdafPruefung | null => {
  const r = TestdafPruefungSchema.safeParse(wert);
  if (r.success) return r.data;
  console.error('TestDaF: Prüfungsdatei verletzt das Schema und wird übersprungen', r.error.issues.slice(0, 4));
  return null;
};

const aufgaben: TestdafAufgabe[] = [];
const pruefungen: TestdafPruefung[] = [];
for (const [, wert] of eintraege) {
  const v = wert as Record<string, unknown> | null | undefined;
  if (istAufgabe(v)) {
    const a = alsAufgabe(v);
    if (a) aufgaben.push(a);
  } else if (istPruefung(v)) {
    const p = alsPruefung(v);
    if (p) pruefungen.push(p);
  }
}

export const alleTestdafAufgaben: TestdafAufgabe[] = aufgaben.sort(
  (a, b) =>
    Number(a.modelltest) - Number(b.modelltest) ||
    String(a.bereich).localeCompare(String(b.bereich)) ||
    Number(a.aufgabe) - Number(b.aufgabe)
);

export const alleTestdafPruefungen: TestdafPruefung[] = pruefungen.sort(
  (a, b) => Number(a.modelltest) - Number(b.modelltest)
);

export function testdafAufgabenVon(bereich: TestdafBereich): TestdafAufgabe[] {
  return alleTestdafAufgaben.filter((a) => a.bereich === bereich);
}

export function findeTestdafAufgabe(modelltest: number, bereich: TestdafBereich, aufgabe: number) {
  return alleTestdafAufgaben.find(
    (a) => Number(a.modelltest) === Number(modelltest) && a.bereich === bereich && Number(a.aufgabe) === Number(aufgabe)
  );
}

export function findeTestdafAufgabeNachId(id: string) {
  return alleTestdafAufgaben.find((a) => a.id === id);
}

export function findeTestdafPruefung(id: string) {
  return alleTestdafPruefungen.find((p) => p.id === id);
}

export function findeTestdafPruefungNachNummer(n: number) {
  return alleTestdafPruefungen.find((p) => Number(p.modelltest) === Number(n));
}

/** Die sechs Aufgaben eines Modelltests in Prüfungsreihenfolge (Lesen 1–3, Hören 1–3). */
export function aufgabenDerPruefung(p: TestdafPruefung): TestdafAufgabe[] {
  return p.aufgaben
    .map((id) => findeTestdafAufgabeNachId(id))
    .filter((a): a is TestdafAufgabe => !!a)
    .sort((a, b) => (a.bereich === b.bereich ? a.aufgabe - b.aufgabe : a.bereich === 'lesen' ? -1 : 1));
}

/** Verfügbare Modelltest-Nummern (für Routen + Navigation). */
export function modelltestNummern(): number[] {
  const ausAufgaben = alleTestdafAufgaben.map((a) => Number(a.modelltest));
  const ausPruefungen = alleTestdafPruefungen.map((p) => Number(p.modelltest));
  return [...new Set([...ausAufgaben, ...ausPruefungen])].sort((a, b) => a - b);
}

export function glossarVonTestdaf(a: TestdafAufgabe) {
  return a.glossar.map((g) => ({ ...g, quelle: a.id, aufgabe: a.aufgabe, bereich: a.bereich }));
}

export function alleTestdafGlossare() {
  return alleTestdafAufgaben.flatMap((a) => glossarVonTestdaf(a));
}

/** Kennzahlen für die Übersichtsseite. */
export function testdafStatistik() {
  const proBereich = (bereich: TestdafBereich) => {
    const aufgaben = testdafAufgabenVon(bereich);
    return {
      bereich,
      aufgaben: aufgaben.length,
      items: aufgaben.reduce((s, a) => s + a.fragen.length, 0),
      minuten: aufgaben.reduce((s, a) => s + a.zeit_minuten, 0),
      glossar: aufgaben.reduce((s, a) => s + a.glossar.length, 0)
    };
  };
  return {
    modelltests: modelltestNummern().length,
    lesen: proBereich('lesen'),
    hoeren: proBereich('hoeren'),
    glossar: alleTestdafGlossare().length
  };
}

/** Route-Helfer. */
export function testdafPfad(a: Pick<TestdafAufgabe, 'modelltest' | 'bereich' | 'aufgabe'>): string {
  return `/testdaf/mt/${a.modelltest}/${a.bereich}/${a.aufgabe}/`;
}

export function pruefungPfad(n: number): string {
  return `/testdaf/pruefung/${n}/`;
}

export function frageOptionen(a: TestdafAufgabe, f: TestdafFrage) {
  if (f.optionen && f.optionen.length) return f.optionen;
  if (f.typ === 'zuordnung') return a.antwort_optionen;
  if (f.typ === 'richtigfalsch')
    return [
      { key: 'richtig', text: 'Richtig' },
      { key: 'falsch', text: 'Falsch' }
    ];
  if (f.typ === 'jn3')
    return [
      { key: 'ja', text: 'Ja' },
      { key: 'nein', text: 'Nein' },
      { key: 'nichts', text: 'Text sagt dazu nichts' }
    ];
  return [];
}

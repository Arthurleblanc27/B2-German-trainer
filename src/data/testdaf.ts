/**
 * TestDaF-Modul — KONTRAK DATA (varian TestDaF, di samping skema Goethe B2).
 * ---------------------------------------------------------------------------
 * Berkas ini adalah sumber kebenaran tunggal untuk modul TestDaF:
 *   3 + 3 Aufgaben pro Modelltest, format persis seperti TestDaF:
 *
 *   Leseverstehen  45 menit (termasuk 5 menit mengalihkan jawaban)
 *     Aufgabe 1  10 item · Zuordnung (8 Kurztexte A–H + Text I)      · TDN 3 · 10′
 *     Aufgabe 2  10 item · Multiple Choice (A/B/C), teks jurnalistik · TDN 4 · 15′
 *     Aufgabe 3  10 item · Ja / Nein / „Text sagt dazu nichts“      · TDN 5 · 15′
 *
 *   Hörverstehen   30 menit (termasuk 5 menit mengalihkan jawaban)
 *     Aufgabe 1   8 item · jawaban singkat (kata kunci), diperdengarkan 1×  · TDN 3
 *     Aufgabe 2  10 item · Richtig / Falsch, diperdengarkan 1×              · TDN 4
 *     Aufgabe 3   7 item · Stichworte, diperdengarkan 2×                    · TDN 5
 *
 * ATURAN LISENSI (lihat B2-WEB-PLAN bagian A3 kategori E): isi bank ini adalah
 * karangan SENDIRI (source_type "ai", diperiksa manual). Materi TestDaF berlisensi
 * ketat hanya dipakai sebagai rujukan FORMAT, daftar tema, dan kosakata — tidak
 * pernah disalin. Buku „Mit Erfolg zum TestDaF" (Klett) tidak memuat teksnya di sini.
 */
import { z } from 'zod';

export const TESTDAF_SCHEMA_VERSION = 2 as const;
export const TESTDAF_FORMAT = 'testdaf' as const;

export const TESTDAF_BEREICHE = ['lesen', 'hoeren'] as const;
export type TestdafBereich = (typeof TESTDAF_BEREICHE)[number];

export const TESTDAF_FRAGE_TYPEN = ['zuordnung', 'mc3', 'jn3', 'richtigfalsch', 'kurzantwort'] as const;
export type TestdafFrageTyp = (typeof TESTDAF_FRAGE_TYPEN)[number];

export const JN3_OPTIONEN = [
  { key: 'ja', text: 'Ja' },
  { key: 'nein', text: 'Nein' },
  { key: 'nichts', text: 'Text sagt dazu nichts' }
] as const;

export const RF_OPTIONEN = [
  { key: 'richtig', text: 'Richtig' },
  { key: 'falsch', text: 'Falsch' }
] as const;

export const TDN_LABEL: Record<number, string> = {
  3: 'TDN 3 — einfache Texte des Studienalltags',
  4: 'TDN 4 — detailliertes Verstehen, Standardsprache',
  5: 'TDN 5 — wissenschaftliche Sprache, implizite Informationen'
};

export interface TestdafSpecEntry {
  aufgabe: number;
  items: number;
  minuten: number;
  typ: TestdafFrageTyp;
  playLimit?: number;
  tdn: number;
  kurz: string;
}

/**
 * Tabel format TestDaF — bagian yang MENGIKAT.
 * Zeiten nach dem papierbasierten TestDaF (testdaf.de, „Aufbau des papierbasierten
 * TestDaF"): Leseverstehen **60 Minuten inkl. 10 Minuten Übertragungszeit**,
 * Hörverstehen **40 Minuten** (davon 10 Minuten Übertragen am Ende von Hörtext 3).
 * Die Bearbeitungszeiten je Aufgabe summieren sich auf 50′ (Lesen) bzw. 30′ (Hören).
 */
export const TESTDAF_SPEC: Record<TestdafBereich, readonly TestdafSpecEntry[]> = {
  lesen: [
    { aufgabe: 1, items: 10, minuten: 15, typ: 'zuordnung', tdn: 3, kurz: 'Zuordnung · 8 Kurztexte A–H + Text I' },
    { aufgabe: 2, items: 10, minuten: 20, typ: 'mc3', tdn: 4, kurz: 'Multiple Choice A/B/C · journalistischer Text' },
    { aufgabe: 3, items: 10, minuten: 15, typ: 'jn3', tdn: 5, kurz: 'Ja / Nein / Text sagt dazu nichts · wissenschaftlicher Text' }
  ],
  hoeren: [
    { aufgabe: 1, items: 8, minuten: 8, typ: 'kurzantwort', playLimit: 1, tdn: 3, kurz: 'Kurze Antworten in Stichworten · Dialog' },
    { aufgabe: 2, items: 10, minuten: 10, typ: 'richtigfalsch', playLimit: 1, tdn: 4, kurz: 'Richtig / Falsch · Interview oder Gesprächsrunde' },
    { aufgabe: 3, items: 7, minuten: 12, typ: 'kurzantwort', playLimit: 2, tdn: 5, kurz: 'Stichworte · Vortrag oder Interview mit Expertin/Experte' }
  ]
};

export const TESTDAF_PRUEFUNG = {
  lesen: { bereich: 'lesen' as TestdafBereich, aufgaben: 3, items: 30, minuten: 60, uebertragen_minuten: 10 },
  hoeren: { bereich: 'hoeren' as TestdafBereich, aufgaben: 3, items: 25, minuten: 40, uebertragen_minuten: 10 }
};

export function testdafSpec(bereich: TestdafBereich, aufgabe: number): TestdafSpecEntry {
  const found = TESTDAF_SPEC[bereich].find((s) => s.aufgabe === aufgabe);
  if (!found) throw new Error(`Keine TestDaF-Aufgabe ${aufgabe} für Bereich ${bereich}`);
  return found;
}

/** Skala TestDaF: TDN 3/4/5 dari persentase item benar (per Prüfungsteil). */
export function tdnFuerProzent(prozent: number): 3 | 4 | 5 | 0 {
  if (prozent >= 80) return 5;
  if (prozent >= 60) return 4;
  if (prozent >= 40) return 3;
  return 0;
}

export function tdnLabel(tdn: number): string {
  if (tdn === 0) return 'unter TDN 3';
  return `TDN ${tdn}`;
}

/* ------------------------------------------------------------------ *
 * Skema Zod
 * ------------------------------------------------------------------ */

const keyText = z.object({ key: z.string().min(1), text: z.string().min(1) });

export const TestdafAudioSchema = z.object({
  src: z.string().min(1),
  dauer_sekunden: z.number().nonnegative().default(0),
  stimme: z.string().default('de-DE-KatjaNeural+de-DE-ConradNeural'),
  play_limit_pruefung: z.union([z.literal(1), z.literal(2)]),
  transcript: z.string().min(1),
  sprecher: z.array(z.string()).default([]),
  wort_timestamps: z.array(z.tuple([z.number(), z.number(), z.string()])).default([])
});
export type TestdafAudio = z.infer<typeof TestdafAudioSchema>;

export const TestdafFrageSchema = z.object({
  nr: z.number().int().positive(),
  typ: z.enum(TESTDAF_FRAGE_TYPEN),
  stamm_de: z.string().min(3),
  stamm_id: z.string().min(3),
  /** nur für mc3 (A/B/C); zuordnung nutzt antwort_optionen der Aufgabe */
  optionen: z.array(keyText).nullable().default(null),
  /** Musterlösungen bzw. Lösungsschlüssel */
  loesung: z.array(z.string().min(1)).min(1),
  /**
   * Nur kurzantwort: Gruppen von Synonymen. Jede Gruppe ist erfüllt, wenn EINE
   * der Formulierungen (normalisiert) in der Antwort vorkommt. Alle Gruppen
   * müssen erfüllt sein, damit das Item als richtig gilt.
   */
  schluessel: z.array(z.array(z.string().min(1)).min(1)).default([]),
  punkte: z.number().int().positive().default(1),
  explain_de: z.string().min(3),
  explain_id: z.string().min(3),
  /** wörtliches Zitat aus Text/Transkript — wird geprüft */
  evidence: z.string().min(3)
});
export type TestdafFrage = z.infer<typeof TestdafFrageSchema>;

export const TestdafTextSchema = z.object({
  key: z.string().min(1),
  titel: z.string().min(1),
  inhalt: z.string().min(1)
});

export const TestdafGlossarSchema = z.object({
  wort: z.string().min(1),
  artikel: z.enum(['der', 'die', 'das', '']).default(''),
  bedeutung_id: z.string().min(1),
  bedeutung_de: z.string().nullable().default(null),
  beispiel: z.string().nullable().default(null)
});

export const TestdafAufgabeSchema = z.object({
  schemaVersion: z.literal(2),
  format: z.literal('testdaf'),
  id: z.string().min(3),
  bereich: z.enum(TESTDAF_BEREICHE),
  aufgabe: z.number().int().min(1).max(3),
  modelltest: z.number().int().positive(),
  tdn: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  level: z.string().min(2),
  themenfeld: z.string().min(3),
  titel: z.string().min(3),
  titel_id: z.string().min(3),
  beschreibung_id: z.string().default(''),
  instruktion_de: z.string().min(10),
  instruktion_id: z.string().min(10),
  zeit_minuten: z.number().int().positive(),
  source_type: z.enum(['own', 'ai', 'public-domain']),
  lizenz: z.string().min(1),
  attribution: z.string().min(1),
  tags: z.array(z.string()).default([]),
  /** 'kurztexte' (Zuordnung A–H + I) | 'langtext' | 'keins' (Hören) */
  material_typ: z.enum(['kurztexte', 'langtext', 'keins']),
  texte: z.array(TestdafTextSchema).default([]),
  /** feste Antwortoptionen der Aufgabe (Zuordnung A–I) */
  antwort_optionen: z.array(keyText).default([]),
  audio: TestdafAudioSchema.nullable().default(null),
  fragen: z.array(TestdafFrageSchema).min(1),
  punkte_max: z.number().int().positive(),
  glossar: z.array(TestdafGlossarSchema).default([])
});
export type TestdafAufgabe = z.infer<typeof TestdafAufgabeSchema>;

/** Prüfungsdatei: verweist nur auf die sechs Aufgaben eines Modelltests. */
export const TestdafPruefungSchema = z.object({
  schemaVersion: z.literal(2),
  format: z.literal('testdaf'),
  id: z.string().min(3),
  modelltest: z.number().int().positive(),
  titel: z.string().min(3),
  titel_id: z.string().min(3),
  beschreibung_id: z.string().default(''),
  aufgaben: z.array(z.string().min(3)).length(6)
});
export type TestdafPruefung = z.infer<typeof TestdafPruefungSchema>;

/* ------------------------------------------------------------------ *
 * Validasi semantik
 * ------------------------------------------------------------------ */

export interface TestdafIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export const TESTDAF_LIZENZEN = ['CC-BY-NC-SA-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'proprietary'] as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[„“”»«"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function quelltext(a: TestdafAufgabe): string {
  const parts: string[] = [];
  parts.push(...a.texte.map((t) => `${t.titel}\n${t.inhalt}`));
  if (a.audio) parts.push(a.audio.transcript);
  parts.push(...a.antwort_optionen.map((o) => o.text));
  return parts.join('\n');
}

export function evidenceIsVerbatim(a: TestdafAufgabe, evidence: string): boolean {
  return norm(quelltext(a)).includes(norm(evidence));
}

export function optionKeys(a: TestdafAufgabe, f: TestdafFrage): Set<string> {
  const keys = new Set<string>();
  for (const o of f.optionen ?? []) keys.add(o.key);
  for (const o of a.antwort_optionen) keys.add(o.key);
  if (f.typ === 'richtigfalsch') for (const o of RF_OPTIONEN) keys.add(o.key);
  if (f.typ === 'jn3') for (const o of JN3_OPTIONEN) keys.add(o.key);
  return keys;
}

const woerter = (s: string) => s.split(/\s+/).filter((w) => /[a-zA-ZäöüÄÖÜß]/.test(w)).length;

/** Aturan lintas-field untuk satu Aufgabe. */
export function validateTestdafAufgabe(a: TestdafAufgabe, ctx: { strict?: boolean } = {}): TestdafIssue[] {
  const issues: TestdafIssue[] = [];
  const err = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });
  const spec = TESTDAF_SPEC[a.bereich].find((s) => s.aufgabe === a.aufgabe);
  if (!spec) {
    err('aufgabe-unbekannt', `Aufgabe ${a.aufgabe} existiert nicht für ${a.bereich}`);
    return issues;
  }

  // --- Struktur -------------------------------------------------------
  if (a.fragen.length !== spec.items) {
    err('item-count', `${a.bereich} Aufgabe ${a.aufgabe} braucht ${spec.items} Items, hat ${a.fragen.length}`);
  }
  if (a.zeit_minuten !== spec.minuten) {
    warn('zeit', `zeit_minuten ${a.zeit_minuten} ≠ Tabelle ${spec.minuten}`);
  }
  if (a.tdn !== spec.tdn) {
    err('tdn', `tdn ${a.tdn} ≠ Tabelle ${spec.tdn} für ${a.bereich} Aufgabe ${a.aufgabe}`);
  }
  const summe = a.fragen.reduce((s, f) => s + (f.punkte ?? 1), 0);
  if (summe !== a.punkte_max) err('punkte-max', `punkte_max ${a.punkte_max} ≠ Summe der Punkte ${summe}`);
  const nums = a.fragen.map((f) => f.nr);
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) {
      err('nr-folge', `Aufgabennummern müssen lückenlos 1..${nums.length} sein (gefunden: ${nums.join(',')})`);
      break;
    }
  }
  if (!a.id.startsWith(`testdaf-mt${String(a.modelltest).padStart(2, '0')}-`)) {
    err('id-prefix', `id "${a.id}" muss mit "testdaf-mt${String(a.modelltest).padStart(2, '0')}-" beginnen`);
  }

  // --- Lizenz ---------------------------------------------------------
  if (!TESTDAF_LIZENZEN.includes(a.lizenz as (typeof TESTDAF_LIZENZEN)[number])) {
    err('lizenz', `lizenz "${a.lizenz}" nicht in der Whitelist`);
  }
  if (a.source_type !== 'own' && a.attribution.trim().length < 3) {
    err('attribution', 'attribution ist für source_type != "own" Pflicht');
  }
  if (!/testdaf/i.test(a.attribution) && !/eigener text/i.test(a.attribution)) {
    warn('attribution-format', 'attribution sollte auf das eigene Material und das TestDaF-Format hinweisen');
  }
  if (/mit erfolg|klett/i.test(a.attribution)) {
    err('fremdquelle', 'attribution darf kein Fremdwerk als Quelle der Items nennen — nur als Format-Referenz');
  }

  // --- Audio ----------------------------------------------------------
  if (a.bereich === 'hoeren') {
    if (!a.audio) err('audio-fehlt', `Hören Aufgabe ${a.aufgabe}: audio-Objekt fehlt`);
    else {
      if (!a.audio.transcript.trim()) err('transcript', 'Hören: Transkript darf nicht leer sein');
      if (spec.playLimit && a.audio.play_limit_pruefung !== spec.playLimit) {
        err('play-limit', `play_limit_pruefung ${a.audio.play_limit_pruefung} ≠ Tabelle ${spec.playLimit}`);
      }
      if (a.audio.dauer_sekunden === 0 && ctx.strict) err('audio-todo', 'dauer_sekunden = 0 (Audio noch nicht produziert)');
      if (a.audio.wort_timestamps.length === 0) warn('timestamps', 'wort_timestamps ist leer (Alignment fehlt noch)');
      if (/\[(A|B|C|S|Moderator|Professor|Professorin)\]/i.test(a.audio.transcript) === false) {
        warn('sprecher-format', 'Transkript sollte Sprecherzeilen in eckigen Klammern haben, z. B. [A], [B], [Professorin]');
      }
    }
  }
  if (a.bereich === 'lesen' && a.audio !== null) err('audio-lesen', 'Lesen-Aufgabe darf kein audio haben');

  // --- Material -------------------------------------------------------
  if (a.bereich === 'lesen' && a.aufgabe === 1) {
    if (a.material_typ !== 'kurztexte') err('material', 'Lesen Aufgabe 1 braucht material_typ "kurztexte"');
    if (a.texte.length !== 8) err('kurztexte', `Lesen Aufgabe 1 braucht genau 8 Kurztexte, hat ${a.texte.length}`);
    const soll = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ist = a.texte.map((t) => t.key);
    if (ist.join('') !== soll.join('')) err('kurztext-keys', `Kurztext-Schlüssel müssen a–h sein (gefunden: ${ist.join(',')})`);
    if (a.antwort_optionen.length !== 9) err('antwort-optionen', `Lesen Aufgabe 1 braucht 9 Antwortoptionen A–H + I (hat ${a.antwort_optionen.length})`);
    else if (a.antwort_optionen[8].key !== 'i') warn('antwort-optionen-i', 'die neunte Option sollte den Schlüssel "i" (kein Angebot passt) haben');
    const w = a.texte.reduce((s, t) => s + woerter(t.inhalt), 0);
    if (w < 280 || w > 620) warn('wortzahl', `8 Kurztexte haben ${w} Wörter (Richtwert 300–450 + Titel)`);
  }
  if (a.bereich === 'lesen' && a.aufgabe > 1) {
    if (a.material_typ !== 'langtext') err('material', 'Lesen Aufgabe 2/3 braucht material_typ "langtext"');
    if (a.texte.length !== 1) err('langtext', `Lesen Aufgabe ${a.aufgabe} braucht genau 1 Text, hat ${a.texte.length}`);
    if (a.antwort_optionen.length !== 0) err('antwort-optionen', 'Lesen Aufgabe 2/3 darf keine antwort_optionen haben');
    const w = a.texte.length ? woerter(a.texte[0].inhalt) : 0;
    if (a.aufgabe === 2 && (w < 400 || w > 600)) warn('wortzahl', `Aufgabe 2: Text hat ${w} Wörter (Richtwert 450–550)`);
    if (a.aufgabe === 3 && (w < 500 || w > 700)) warn('wortzahl', `Aufgabe 3: Text hat ${w} Wörter (Richtwert 550–600)`);
  }
  if (a.bereich === 'hoeren') {
    if (a.material_typ !== 'keins') err('material', 'Hören-Aufgaben brauchen material_typ "keins"');
    if (a.texte.length !== 0) err('texte', 'Hören-Aufgaben dürfen keine texte haben');
    const w = a.audio ? woerter(a.audio.transcript) : 0;
    if (a.aufgabe === 1 && (w < 300 || w > 500)) warn('wortzahl', `Hören Aufgabe 1: Transkript hat ${w} Wörter (Richtwert 350–400)`);
    if (a.aufgabe === 2 && (w < 450 || w > 700)) warn('wortzahl', `Hören Aufgabe 2: Transkript hat ${w} Wörter (Richtwert 550–580)`);
    if (a.aufgabe === 3 && (w < 500 || w > 750)) warn('wortzahl', `Hören Aufgabe 3: Transkript hat ${w} Wörter (Richtwert ca. 600)`);
  }

  // --- Items ----------------------------------------------------------
  for (const f of a.fragen) {
    if (f.typ !== spec.typ) err('typ', `Aufgabe ${f.nr}: typ "${f.typ}" ≠ Solltyp "${spec.typ}"`);
    const keys = optionKeys(a, f);
    if (f.typ !== 'kurzantwort') {
      for (const l of f.loesung) {
        if (!keys.has(l)) err('loesung-key', `Aufgabe ${f.nr}: Lösung "${l}" verweist auf keine Option`);
      }
    }
    if (f.typ === 'mc3' && (f.optionen ?? []).length !== 3) {
      err('mc3-optionen', `Aufgabe ${f.nr}: Multiple Choice braucht genau 3 Optionen (A/B/C)`);
    }
    if (f.typ === 'richtigfalsch') {
      for (const l of f.loesung) if (l !== 'richtig' && l !== 'falsch') err('rf-loesung', `Aufgabe ${f.nr}: Lösung muss richtig/falsch sein`);
    }
    if (f.typ === 'jn3') {
      for (const l of f.loesung) if (!['ja', 'nein', 'nichts'].includes(l)) err('jn3-loesung', `Aufgabe ${f.nr}: Lösung muss ja/nein/nichts sein`);
    }
    if (f.typ === 'kurzantwort') {
      if (f.loesung.length === 0) err('kurz-loesung', `Aufgabe ${f.nr}: mindestens eine Musterlösung nötig`);
      if (f.schluessel.length === 0) err('kurz-schluessel', `Aufgabe ${f.nr}: kurzantwort braucht mindestens eine Schlüsselgruppe`);
      for (const l of f.loesung) {
        if (woerter(l) > 14) warn('kurz-loesung-lang', `Aufgabe ${f.nr}: Musterlösung "${l.slice(0, 40)}…" ist sehr lang (Stichworte erwartet)`);
      }
      for (const g of f.schluessel) {
        if (g.some((v) => norm(v).length < 3)) warn('kurz-schluessel-kurz', `Aufgabe ${f.nr}: sehr kurzer Schlüsselbegriff in ${JSON.stringify(g)}`);
      }
    }
    if (!evidenceIsVerbatim(a, f.evidence)) {
      err('evidence', `Aufgabe ${f.nr}: evidence ist kein wörtliches Zitat aus Text/Transkript: "${f.evidence.slice(0, 70)}…"`);
    }
  }

  // --- Verteilung / Rubrik-Warnungen ---------------------------------
  if (a.fragen[0]) {
    const typen = new Set(a.fragen.map((f) => f.typ));
    if (typen.size > 1) warn('typ-gemischt', `Aufgabe enthält gemischte Itemtypen: ${[...typen].join(', ')}`);
  }
  if (spec.typ === 'jn3') {
    const n = (k: string) => a.fragen.filter((f) => f.loesung.includes(k)).length;
    for (const [k, label] of [['ja', 'Ja'], ['nein', 'Nein'], ['nichts', 'Text sagt dazu nichts']] as const) {
      if (n(k) === 0) warn('jn3-verteilung', `keine Lösung "${label}" (TestDaF-Standard: alle drei Kategorien kommen vor)`);
      if (n(k) > 5) warn('jn3-verteilung', `${n(k)}× Lösung "${label}" — sehr einseitig`);
    }
  }
  if (spec.typ === 'richtigfalsch') {
    const falsch = a.fragen.filter((f) => f.loesung.includes('falsch')).length;
    if (falsch / a.fragen.length < 0.3) warn('rf-quote', `nur ${falsch}/${a.fragen.length} "Falsch" (Rubrik verlangt ≥30 %)`);
  }
  if (spec.typ === 'zuordnung') {
    const verwendete = new Set(a.fragen.flatMap((f) => f.loesung));
    if (a.fragen.every((f) => f.loesung[0] === a.fragen[0].loesung[0])) warn('zuordnung-einseitig', 'alle Items haben dieselbe Lösung');
    if (verwendete.size < 6) warn('zuordnung-vielfalt', `nur ${verwendete.size} verschiedene Lösungsbuchstaben verwendet`);
  }
  const folge = a.fragen.map((f) => f.loesung.join('+'));
  let streak = 1;
  for (let i = 1; i < folge.length; i++) {
    streak = folge[i] === folge[i - 1] ? streak + 1 : 1;
    if (streak > 3) {
      warn('loesungs-kette', `mehr als 3 gleich lautende Lösungen hintereinander (ab Aufgabe ${i + 1})`);
      break;
    }
  }
  if (a.glossar.length < 8) warn('glossar', `glossar enthält ${a.glossar.length} Einträge (Rubrik: ≥8 pro Aufgabe)`);

  return issues;
}

/** Semua Aufgaben einer Modelltest-Prüfung. */
export function validateTestdafPruefung(aufgaben: TestdafAufgabe[], ctx: { strict?: boolean } = {}): TestdafIssue[] {
  const issues: TestdafIssue[] = [];
  if (aufgaben.length !== 6) {
    issues.push({ level: 'error', code: 'aufgaben-anzahl', message: `Modelltest braucht 6 Aufgaben, hat ${aufgaben.length}` });
    return issues;
  }
  for (const a of aufgaben) {
    issues.push(...validateTestdafAufgabe(a, ctx).map((i) => ({ ...i, message: `[${a.id}] ${i.message}` })));
  }
  const lesen = aufgaben.filter((a) => a.bereich === 'lesen');
  const hoeren = aufgaben.filter((a) => a.bereich === 'hoeren');
  const itemLesen = lesen.reduce((s, a) => s + a.fragen.length, 0);
  const itemHoeren = hoeren.reduce((s, a) => s + a.fragen.length, 0);
  if (itemLesen !== TESTDAF_PRUEFUNG.lesen.items) {
    issues.push({ level: 'error', code: 'items-lesen', message: `Leseverstehen braucht 30 Items, hat ${itemLesen}` });
  }
  if (itemHoeren !== TESTDAF_PRUEFUNG.hoeren.items) {
    issues.push({ level: 'error', code: 'items-hoeren', message: `Hörverstehen braucht 25 Items, hat ${itemHoeren}` });
  }
  const ids = aufgaben.map((a) => a.id);
  if (new Set(ids).size !== ids.length) {
    issues.push({ level: 'error', code: 'id-duplikat', message: 'Aufgaben-ids sind nicht eindeutig' });
  }
  return issues;
}

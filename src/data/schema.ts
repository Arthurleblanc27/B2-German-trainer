/**
 * B2-Trainer — KONTRAK DATA TUNGGAL (src/data/schema.ts)
 * ---------------------------------------------------------------------------
 * SETIAP item bank soal, validator build, mesin skor, dan komponen UI merujuk
 * berkas ini. Jangan mengubah bentuk field tanpa memperbarui validator + test.
 *
 * Satu berkas JSON = satu Unit (berisi semua Teil). Lihat UnitSchema.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

export const SKILLS = ['lesen', 'hoeren'] as const;
export type Skill = (typeof SKILLS)[number];

export const FRAGE_TYPEN = [
  'zuordnung',
  'mc3',
  'richtigfalsch',
  'satz-luecke',
  'ueberschrift',
  'aussagen-person'
] as const;
export type FrageTyp = (typeof FRAGE_TYPEN)[number];

/**
 * Aufgabentypen, die Protokoll und Fehlerheft kennen: die Goethe-B2-Typen plus
 * die beiden TestDaF-eigenen Typen (jn3, kurzantwort). Bewusst NICHT in
 * FRAGE_TYPEN, damit der strenge B2-Item-Vertrag unverändert bleibt.
 */
export type ProtokollFrageTyp = FrageTyp | 'jn3' | 'kurzantwort';

export const THEMENFELDER = [
  'Gesellschaft & Soziales',
  'Umwelt & Klima',
  'Arbeit & Beruf',
  'Medien & Digitalisierung',
  'Kultur & Geschichte',
  'Gesundheit & Sport',
  'Politik & Demokratie',
  'Wissenschaft & Technik',
  'Reisen & Mobilität',
  'Bildung & Studium'
] as const;
export type Themenfeld = (typeof THEMENFELDER)[number];

/** Sumber item yang DIIZINKAN di bank soal inti. */
export const SOURCE_TYPES = ['own', 'ai', 'public-domain'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
/** Hanya boleh dipakai di halaman /quellen, tidak pernah di src/content. */
export const FORBIDDEN_SOURCE_TYPE = 'external-link';

export const LIZENZEN = [
  'CC-BY-NC-SA-4.0',
  'CC-BY-SA-4.0',
  'CC0-1.0',
  'proprietary'
] as const;

/**
 * Tabel format ujian (Goethe-Zertifikat B2) — bagian yang MENGIKAT.
 * Lesen : Teil 1 = 9 / Teil 2 = 6 / Teil 3 = 6 / Teil 4 = 6 / Teil 5 = 3  → 30 item, 60 min kerja + 5 min baca
 * Hören : Teil 1 = 10 (5 teks × 2) / Teil 2 = 6 / Teil 3 = 6 / Teil 4 = 8 → 30 item
 */
export const TEIL_SPEC: Record<Skill, readonly TeilSpecEntry[]> = {
  lesen: [
    { teil: 1, items: 9, minuten: 18, typ: 'zuordnung' },
    { teil: 2, items: 6, minuten: 12, typ: 'satz-luecke' },
    { teil: 3, items: 6, minuten: 12, typ: 'mc3' },
    { teil: 4, items: 6, minuten: 12, typ: 'aussagen-person' },
    { teil: 5, items: 3, minuten: 6, typ: 'ueberschrift' }
  ],
  hoeren: [
    { teil: 1, items: 10, minuten: 10, typ: 'richtigfalsch', playLimit: 1 },
    { teil: 2, items: 6, minuten: 10, typ: 'mc3', playLimit: 2 },
    { teil: 3, items: 6, minuten: 10, typ: 'aussagen-person', playLimit: 2 },
    { teil: 4, items: 8, minuten: 10, typ: 'mc3', playLimit: 2 }
  ]
};

export interface TeilSpecEntry {
  teil: number;
  items: number;
  minuten: number;
  typ: FrageTyp;
  playLimit?: number;
}

export function teilSpec(skill: Skill, teil: number): TeilSpecEntry {
  const found = TEIL_SPEC[skill].find((s) => s.teil === teil);
  if (!found) throw new Error(`Kein Teil ${teil} für Skill ${skill}`);
  return found;
}

export const BESTEHENSGRENZE = 60;

/* ------------------------------------------------------------------ *
 * Skema Zod
 * ------------------------------------------------------------------ */

const keyText = z.object({
  key: z.string().min(1),
  text: z.string().min(1)
});

export const AudioSchema = z.object({
  src: z.string().min(1),
  dauer_sekunden: z.number().nonnegative().default(0),
  stimme: z.string().default('de-DE-KatjaNeural'),
  play_limit_pruefung: z.union([z.literal(1), z.literal(2)]),
  transcript: z.string().min(1),
  sprecher: z.array(z.string()).optional(),
  wort_timestamps: z.array(z.tuple([z.number(), z.number(), z.string()])).default([])
});
export type Audio = z.infer<typeof AudioSchema>;

export const TextblockSchema = z.object({
  key: z.string().min(1),
  titel: z.string().min(1),
  inhalt: z.string().min(1)
});
export type Textblock = z.infer<typeof TextblockSchema>;

export const FrageSchema = z.object({
  nr: z.number().int().positive(),
  typ: z.enum(FRAGE_TYPEN),
  stamm_de: z.string().min(3),
  stamm_id: z.string().min(3),
  optionen: z.array(keyText).nullable().optional(),
  loesung: z.array(z.string().min(1)).min(1),
  punkte: z.number().int().positive().default(1),
  explain_de: z.string().min(3),
  explain_id: z.string().min(3),
  evidence: z.string().min(3)
});
export type Frage = z.infer<typeof FrageSchema>;

export const GlossarSchema = z.object({
  wort: z.string().min(1),
  artikel: z.enum(['der', 'die', 'das', '']).default(''),
  plural: z.string().nullable().default(null),
  wortart: z.string().nullable().default(null),
  bedeutung_id: z.string().min(1),
  bedeutung_de: z.string().nullable().default(null),
  beispiel: z.string().nullable().default(null)
});
export type Glossar = z.infer<typeof GlossarSchema>;

export const TeilSchema = z.object({
  id: z.string().min(3),
  skill: z.enum(SKILLS),
  teil: z.number().int().min(1).max(5),
  themenfeld: z.enum(THEMENFELDER),
  titel: z.string().min(3),
  instruktion_de: z.string().min(3),
  instruktion_id: z.string().min(3),
  zeit_minuten: z.number().int().positive(),
  source_type: z.enum(SOURCE_TYPES),
  lizenz: z.string().min(1),
  attribution: z.string().min(1),
  tags: z.array(z.string()).default([]),
  audio: AudioSchema.nullable().default(null),
  texte: z.array(TextblockSchema).nullable().default(null),
  luecken_text: z.string().nullable().default(null),
  optionen_saetze: z.array(keyText).nullable().default(null),
  ueberschriften: z.array(keyText).nullable().default(null),
  fragen: z.array(FrageSchema).min(1),
  punkte_max: z.number().int().positive(),
  glossar: z.array(GlossarSchema).default([])
});
export type Teil = z.infer<typeof TeilSchema>;

export const UnitSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(3),
  skill: z.enum(SKILLS),
  unit: z.number().int().positive(),
  level: z.literal('B2'),
  themenfeld: z.enum(THEMENFELDER),
  titel: z.string().min(3),
  titel_id: z.string().min(3),
  beschreibung_id: z.string().default(''),
  teile: z.array(TeilSchema).min(4).max(5) // lesen 1-5, hoeren 1-4; exakte Anzahl prüft validateUnit
});
export type Unit = z.infer<typeof UnitSchema>;

export const PruefungSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(3),
  titel: z.string().min(3),
  titel_id: z.string().default(''),
  beschreibung_id: z.string().default(''),
  lesen: z.array(TeilSchema).length(5),
  hoeren: z.array(TeilSchema).length(4)
});
export type Pruefung = z.infer<typeof PruefungSchema>;

/* ------------------------------------------------------------------ *
 * Validasi semantik (dipakai validator build + unit test)
 * ------------------------------------------------------------------ */

export interface Issue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[„“”»«"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Semua teks sumber dari satu Teil, untuk memeriksa bukti (`evidence`). */
export function quelltexte(teil: Teil): string {
  const parts: string[] = [];
  if (teil.texte) parts.push(...teil.texte.map((t) => `${t.titel}\n${t.inhalt}`));
  if (teil.luecken_text) parts.push(teil.luecken_text.replace(/\[\[\d+\]\]/g, ' '));
  if (teil.ueberschriften) parts.push(...teil.ueberschriften.map((u) => u.text));
  if (teil.optionen_saetze) parts.push(...teil.optionen_saetze.map((o) => o.text));
  if (teil.audio) parts.push(teil.audio.transcript);
  return parts.join('\n');
}

export function evidenceIsVerbatim(teil: Teil, evidence: string): boolean {
  return norm(quelltexte(teil)).includes(norm(evidence));
}

export function optionKeys(teil: Teil, frage: Frage): Set<string> {
  const keys = new Set<string>();
  if (frage.typ === 'richtigfalsch') {
    keys.add('richtig');
    keys.add('falsch');
  }
  for (const o of frage.optionen ?? []) keys.add(o.key);
  for (const o of teil.optionen_saetze ?? []) keys.add(o.key);
  for (const o of teil.ueberschriften ?? []) keys.add(o.key);
  return keys;
}

/** Aturan lintas-field untuk satu Teil. */
export function validateTeil(teil: Teil, ctx: { strict?: boolean } = {}): Issue[] {
  const issues: Issue[] = [];
  const spec = TEIL_SPEC[teil.skill].find((s) => s.teil === teil.teil);
  if (!spec) {
    issues.push({ level: 'error', code: 'teil-unknown', message: `Teil ${teil.teil} existiert nicht für ${teil.skill}` });
    return issues;
  }
  const err = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });

  if (teil.fragen.length !== spec.items) {
    err('item-count', `Teil ${teil.teil} (${teil.skill}) muss ${spec.items} Aufgaben haben, hat ${teil.fragen.length}`);
  }
  if (teil.zeit_minuten !== spec.minuten) {
    warn('zeit', `zeit_minuten ${teil.zeit_minuten} ≠ tabel ${spec.minuten}`);
  }

  const summe = teil.fragen.reduce((a, f) => a + (f.punkte ?? 1), 0);
  if (summe !== teil.punkte_max) {
    err('punkte-max', `punkte_max ${teil.punkte_max} ≠ Summe der Punkte ${summe}`);
  }

  const nums = teil.fragen.map((f) => f.nr);
  if (new Set(nums).size !== nums.length) err('nr-duplikat', 'Aufgabennummern sind nicht eindeutig');
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== i + 1) {
      err('nr-luecke', `Aufgabennummern müssen lückenlos 1..${nums.length} sein (gefunden: ${nums.join(',')})`);
      break;
    }
  }

  for (const f of teil.fragen) {
    if (f.typ !== spec.typ && !(teil.skill === 'hoeren' && teil.teil === 1 && f.typ === 'mc3')) {
      warn('typ', `Aufgabe ${f.nr}: typ "${f.typ}" weicht von Solltyp "${spec.typ}" ab`);
    }
    const keys = optionKeys(teil, f);
    for (const l of f.loesung) {
      if (!keys.has(l)) err('loesung-key', `Aufgabe ${f.nr}: Lösung "${l}" verweist auf keine Option`);
    }
    if (f.typ === 'richtigfalsch') {
      for (const l of f.loesung) {
        if (l !== 'richtig' && l !== 'falsch') err('rf-loesung', `Aufgabe ${f.nr}: Richtig/Falsch-Lösung muss "richtig" oder "falsch" sein`);
      }
    }
    if (f.optionen && f.optionen.length > 1 && f.loesung.length > 1 && teil.teil !== 5) {
      warn('multi-loesung', `Aufgabe ${f.nr}: mehrere Lösungen — nur Teil 5 erlaubt Mehrfachlösungen`);
    }
    if (!evidenceIsVerbatim(teil, f.evidence)) {
      err('evidence', `Aufgabe ${f.nr}: evidence ist kein wörtliches Zitat aus Text/Transkript: "${f.evidence.slice(0, 60)}…"`);
    }
  }

  // pengecoh / opsi sesuai format
  if (teil.teil === 2 && teil.skill === 'lesen') {
    if (!teil.luecken_text) err('luecken', 'Lesen Teil 2 braucht luecken_text');
    else
      for (let i = 1; i <= 6; i++) {
        if (!teil.luecken_text.includes(`[[${i}]]`)) err('luecken', `luecken_text: Platzhalter [[${i}]] fehlt`);
      }
    if ((teil.optionen_saetze ?? []).length !== 8) err('saetze', 'Lesen Teil 2 braucht genau 8 Satzoptionen a–h');
  }
  if (teil.teil === 5 && teil.skill === 'lesen') {
    if ((teil.ueberschriften ?? []).length !== 8) err('ueberschriften', 'Lesen Teil 5 braucht genau 8 Überschriften a–h');
    if (!teil.texte || teil.texte.length !== 4) warn('texte', 'Lesen Teil 5: 4 nummerierte Absätze erwartet');
  }
  if (teil.skill === 'lesen' && (teil.teil === 1 || teil.teil === 4)) {
    if (!teil.texte || teil.texte.length !== 4) err('personen', `Lesen Teil ${teil.teil}: genau 4 Personen/Texte erwartet`);
    if (teil.teil === 1 && (teil.texte ?? []).length === 4) {
      for (const f of teil.fragen) {
        const opts = f.optionen ?? [];
        if (opts.length !== 4) warn('optionen', `Aufgabe ${f.nr}: Zuordnung mit ${opts.length} Optionen (erwartet 4)`);
      }
    }
  }
  if (teil.skill === 'lesen' && teil.audio !== null) {
    err('audio-lesen', 'Lesen-Teil darf kein audio haben');
  }

  // Hören: audio wajib + transcript verbatim
  if (teil.skill === 'hoeren') {
    if (!teil.audio) err('audio-fehlt', `Hören Teil ${teil.teil}: audio-Objekt fehlt`);
    else {
      if (!teil.audio.transcript.trim()) err('transcript', 'Hören: Transkript darf nicht leer sein');
      if (teil.audio.dauer_sekunden === 0) {
        const msg = 'Hören: dauer_sekunden = 0 (Audio noch nicht produziert)';
        if (ctx.strict) err('audio-todo', msg);
        else warn('audio-todo', msg);
      }
      if (teil.audio.wort_timestamps.length === 0) warn('timestamps', 'Hören: wort_timestamps ist leer (Alignment fehlt noch)');
      if (spec.playLimit && teil.audio.play_limit_pruefung !== spec.playLimit) {
        warn('play-limit', `Hören Teil ${teil.teil}: play_limit_pruefung ${teil.audio.play_limit_pruefung} ≠ tabel ${spec.playLimit}`);
      }
    }
  }

  // Lisensi
  if (!LIZENZEN.includes(teil.lizenz as (typeof LIZENZEN)[number])) {
    err('lizenz', `lizenz "${teil.lizenz}" nicht in der Whitelist`);
  }
  if (teil.source_type !== 'own' && (!teil.attribution || teil.attribution.trim().length < 3)) {
    err('attribution', 'attribution ist für Items mit source_type != "own" Pflicht');
  }

  // Rubrik-Mindestanforderungen (Warnungen)
  const typSet = new Set(teil.fragen.map((f) => f.typ));
  if (typSet.has('richtigfalsch')) {
    const falsch = teil.fragen.filter((f) => f.typ === 'richtigfalsch' && f.loesung.includes('falsch')).length;
    const total = teil.fragen.filter((f) => f.typ === 'richtigfalsch').length;
    if (total > 0 && falsch / total < 0.4) {
      warn('rf-quote', `Richtig/Falsch: nur ${falsch}/${total} "Falsch" (Rubrik verlangt ≥40%)`);
    }
  }
  const keysfolge = teil.fragen.map((f) => f.loesung.join('+'));
  let streak = 1;
  for (let i = 1; i < keysfolge.length; i++) {
    streak = keysfolge[i] === keysfolge[i - 1] ? streak + 1 : 1;
    if (streak > 3) {
      warn('loesungs-kette', `mehr als 3 gleich lautende Lösungen hintereinander (ab Aufgabe ${i + 1})`);
      break;
    }
  }
  if (teil.glossar.length < 8) warn('glossar', `glossar enthält ${teil.glossar.length} Einträge (Rubrik: ≥8 pro Lesetext) → Gesamtunit prüfen`);

  return issues;
}

/** Aturan lintas-Teil für eine Unit. */
export function validateUnit(unit: Unit, ctx: { strict?: boolean } = {}): Issue[] {
  const issues: Issue[] = [];
  const specs = TEIL_SPEC[unit.skill];
  if (!TEIL_SPEC[unit.skill]) {
    issues.push({ level: 'error', code: 'skill', message: `Unbekannter Skill ${unit.skill}` });
    return issues;
  }
  const teile = unit.teile.map((t) => t.teil).sort((a, b) => a - b);
  const expected = specs.map((s) => s.teil);
  if (teile.join(',') !== expected.join(',')) {
    issues.push({
      level: 'error',
      code: 'teile-vollstaendig',
      message: `${unit.skill}-Unit braucht genau die Teile ${expected.join(',')} (gefunden ${teile.join(',')})`
    });
  }
  for (const teil of unit.teile) {
    if (teil.skill !== unit.skill) {
      issues.push({ level: 'error', code: 'skill-konsistenz', message: `Teil ${teil.teil}: skill "${teil.skill}" ≠ unit.skill "${unit.skill}"` });
    }
    // Teil-Ids beginnen entweder mit dem Unit-Id ("lesen-unit-01-teil1") oder mit dem Skill
    // ("lesen-…"); für einen Modelltest lautet das Unit-Id "pruefung-01-lesen".
    if (!teil.id.startsWith(`${unit.id}-`) && !teil.id.startsWith(`${unit.skill}-`)) {
      issues.push({
        level: 'error',
        code: 'id-prefix',
        message: `Teil-id "${teil.id}" muss mit "${unit.id}-" oder "${unit.skill}-" beginnen`
      });
    }
    issues.push(...validateTeil(teil, ctx).map((i) => ({ ...i, message: `[${teil.id}] ${i.message}` })));
  }
  const ids = unit.teile.map((t) => t.id);
  if (new Set(ids).size !== ids.length) {
    issues.push({ level: 'error', code: 'teil-id-duplikat', message: 'Teil-ids sind innerhalb der Unit nicht eindeutig' });
  }
  const punkte = unit.teile.reduce((a, t) => a + t.punkte_max, 0);
  if (punkte !== 30) {
    issues.push({ level: 'warning', code: 'punkte-total', message: `Unit hat ${punkte} Punkte (Soll 30)` });
  }
  return issues;
}

export function validatePruefung(pr: Pruefung, ctx: { strict?: boolean } = {}): Issue[] {
  const issues: Issue[] = [];
  const lesenUnit: Unit = {
    schemaVersion: 1,
    id: `${pr.id}-lesen`,
    skill: 'lesen',
    unit: 1,
    level: 'B2',
    themenfeld: pr.lesen[0]?.themenfeld ?? 'Gesellschaft & Soziales',
    titel: pr.titel,
    titel_id: pr.titel_id || pr.titel,
    beschreibung_id: pr.beschreibung_id ?? '',
    teile: pr.lesen
  };
  const hoerenUnit: Unit = { ...lesenUnit, id: `${pr.id}-hoeren`, skill: 'hoeren', teile: pr.hoeren };
  issues.push(...validateUnit(lesenUnit, ctx).map((i) => ({ ...i, message: `[Lesen] ${i.message}` })));
  issues.push(...validateUnit(hoerenUnit, ctx).map((i) => ({ ...i, message: `[Hören] ${i.message}` })));
  return issues;
}

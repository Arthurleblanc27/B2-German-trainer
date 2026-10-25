/**
 * B2-Trainer — pemuat bank soal (build-time, via Vite glob).
 * Semua konten 100% JSON lokal di src/content/**.
 */
import type { Pruefung, Skill, Teil, Unit } from '../data/schema';

// Relativer Glob: absolute '/src/...'-Globs brechen, wenn das Projekt über einen
// Symlink-Pfad (C:) geöffnet wird, Vite aber den realen Pfad (D:) auflöst.
const module_ = import.meta.glob('../content/**/*.json', { eager: true, import: 'default' }) as Record<
  string,
  unknown
>;

const eintraege = Object.entries(module_).filter(([pfad]) => !/(^|\/)_/.test(pfad));
const rohdaten = eintraege.map(([, wert]) => wert as Record<string, unknown> | null | undefined);

const istUnit = (v: Record<string, unknown> | null | undefined): boolean =>
  !!v && typeof v['skill'] === 'string' && Array.isArray(v['teile']);

const istPruefung = (v: Record<string, unknown> | null | undefined): boolean =>
  !!v && typeof v['id'] === 'string' && Array.isArray(v['lesen']) && Array.isArray(v['hoeren']);

export const alleUnits: Unit[] = (rohdaten.filter(istUnit) as unknown as Unit[]).sort(
  (a, b) => String(a.skill).localeCompare(String(b.skill)) || Number(a.unit) - Number(b.unit)
);

export const allePruefungen: Pruefung[] = (rohdaten.filter(istPruefung) as unknown as Pruefung[]).sort((a, b) =>
  String(a.id).localeCompare(String(b.id))
);

export function unitsVon(skill: Skill): Unit[] {
  return alleUnits.filter((u) => u.skill === skill);
}

export function findeUnit(skill: Skill, unit: number): Unit | undefined {
  return alleUnits.find((u) => u.skill === skill && u.unit === unit);
}

export function findeTeil(skill: Skill, unit: number, teil: number): Teil | undefined {
  return findeUnit(skill, unit)?.teile.find((t) => t.teil === teil);
}

export function findePruefung(id: string): Pruefung | undefined {
  return allePruefungen.find((p) => p.id === id);
}

/** Mencari Teil sumber berdasarkan itemId (dipakai Fehlerheft untuk sesi mini). */
export function findeTeilNachId(teilId: string): { unit: Unit; teil: Teil } | undefined {
  for (const unit of alleUnits) {
    const teil = unit.teile.find((t) => t.id === teilId);
    if (teil) return { unit, teil };
  }
  for (const p of allePruefungen) {
    const teil = [...p.lesen, ...p.hoeren].find((t) => t.id === teilId);
    if (teil) {
      return {
        unit: {
          schemaVersion: 1,
          id: p.id,
          skill: teil.skill,
          unit: 1,
          level: 'B2',
          themenfeld: teil.themenfeld,
          titel: p.titel,
          titel_id: p.titel_id || p.titel,
          beschreibung_id: p.beschreibung_id ?? '',
          teile: teil.skill === 'lesen' ? p.lesen : p.hoeren
        },
        teil
      };
    }
  }
  return undefined;
}

/** Semua Einträge des Glossars einer Unit (für Wortschatz-Sammler). */
export function glossarVon(unit: Unit, teil?: number) {
  return unit.teile
    .filter((t) => (teil ? t.teil === teil : true))
    .flatMap((t) => t.glossar.map((g) => ({ ...g, quelle: t.id, themenfeld: unit.themenfeld, unit: unit.unit })));
}

/** Seluruh glosarium dari semua unit. */
export function alleGlossare() {
  return alleUnits.flatMap((u) => glossarVon(u));
}

/** Penamaan route util. */
export const unitPfad = (skill: Skill, unit: number) => `/${skill}/${unit}/`;

/**
 * Kontrakt-Test für den gesamten Bank soal: jedes JSON in src/content muss das Schema
 * erfüllen und die Formatregeln (Item-Zahlen, Punkte, Belegzitate, Lizenz) einhalten.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PruefungSchema, UnitSchema, validatePruefung, validateUnit } from '../src/data/schema';

const ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (e.endsWith('.json')) out.push(p);
  }
  return out;
}

const dateien = walk(join(ROOT, 'src/content'));

describe('Bank soal (src/content)', () => {
  it('enthält mindestens einen Modelltest, 6 Lesen- und 4 Hören-Übungen', () => {
    const buckets = dateien.map((f) => relative(join(ROOT, 'src/content'), f).split(/[\\/]/)[0]);
    expect(buckets.filter((b) => b === 'lesen').length).toBeGreaterThanOrEqual(6);
    expect(buckets.filter((b) => b === 'hoeren').length).toBeGreaterThanOrEqual(4);
    expect(buckets.filter((b) => b === 'modelltest').length).toBeGreaterThanOrEqual(1);
  });

  it('enthält keine Datei-Fragmente (nur unit-*.json / pruefung-*.json)', () => {
    const verdaechtig = dateien.filter((f) => /[\\/]_/.test(f));
    expect(verdaechtig).toEqual([]);
  });

  for (const datei of dateien) {
    const rel = relative(ROOT, datei);
    const istPruefung = rel.includes('modelltest');

    it(`${rel} erfüllt Schema und Format`, () => {
      const raw = readFileSync(datei, 'utf8');
      const data = JSON.parse(raw);
      const parsed = (istPruefung ? PruefungSchema : UnitSchema).safeParse(data);
      if (!parsed.success) {
        throw new Error(
          JSON.stringify(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
            null,
            2
          )
        );
      }
      const issues = istPruefung
        ? validatePruefung(parsed.data as never, { strict: false })
        : validateUnit(parsed.data as never, { strict: false });
      const fehler = issues.filter((i) => i.level === 'error');
      expect(fehler.map((f) => `[${f.code}] ${f.message}`)).toEqual([]);
      expect(raw).not.toContain('"external-link"');
    });
  }
});

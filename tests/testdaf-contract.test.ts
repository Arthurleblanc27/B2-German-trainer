/**
 * TestDaF-Modul — Kontrakt-Test für den TestDaF-Aufgabenbank.
 *
 * Läuft NICHT gegen src/content/ (Goethe-B2-Bank) — die beiden Bänke sind
 * bewusst getrennt. Akzeptanzkriterien:
 *   · jede Datei erfüllt TestdafAufgabeSchema / TestdafPruefungSchema
 *   · keine Fragmentdateien (kein "_"-Präfix)
 *   · je Modelltest 6 Aufgaben: 3 Lesen (10/10/10) + 3 Hören (8/10/7) = 30/25 Items
 *   · je Aufgabe die Formatregeln aus validateTestdafAufgabe (ohne Fehler)
 *   · jede Prüfungsdatei verweist auf vorhandene Aufgaben-ids
 *   · kein Fremdmaterial in den attribution-Feldern
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TestdafAufgabeSchema,
  TestdafPruefungSchema,
  validateTestdafAufgabe,
  validateTestdafPruefung,
  TESTDAF_PRUEFUNG,
  TESTDAF_SPEC,
  type TestdafAufgabe,
  type TestdafPruefung
} from '../src/data/testdaf';
import { kurzantwortRichtig, scoreTestdafAufgabe, normAntwort } from '../src/lib/testdaf-scoring';

const ROOT = join(__dirname, '..');
const BANK = join(ROOT, 'src', 'content-testdaf');

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
  return out.sort();
}

const dateien = walk(BANK);
if (dateien.length === 0) throw new Error(`Kein TestDaF-Aufgabenbank gefunden unter ${BANK}`);

const aufgaben: TestdafAufgabe[] = [];
const pruefungen: TestdafPruefung[] = [];
const rohdaten = new Map<string, string>();

for (const datei of dateien) {
  const raw = readFileSync(datei, 'utf8');
  rohdaten.set(relative(BANK, datei).replace(/\\/g, '/'), raw);
  const data = JSON.parse(raw);
  if (Array.isArray(data.aufgaben)) pruefungen.push(TestdafPruefungSchema.parse(data));
  else aufgaben.push(TestdafAufgabeSchema.parse(data));
}

describe('TestDaF-Aufgabenbank (src/content-testdaf)', () => {
  it('enthält 2 Modelltests mit je 6 Aufgaben (3 Lesen + 3 Hören)', () => {
    const modelltests = [...new Set(aufgaben.map((a) => Number(a.modelltest)))].sort((x, y) => x - y);
    expect(modelltests.length).toBeGreaterThanOrEqual(2);
    for (const mt of modelltests) {
      const rel = aufgaben.filter((a) => Number(a.modelltest) === mt);
      expect(rel.filter((a) => a.bereich === 'lesen')).toHaveLength(3);
      expect(rel.filter((a) => a.bereich === 'hoeren')).toHaveLength(3);
    }
  });

  it('enthält pro Modelltest 30 Lesen-Items und 25 Hören-Items', () => {
    for (const mt of [...new Set(aufgaben.map((a) => Number(a.modelltest)))]) {
      const rel = aufgaben.filter((a) => Number(a.modelltest) === mt);
      const lesen = rel.filter((a) => a.bereich === 'lesen').reduce((s, a) => s + a.fragen.length, 0);
      const hoeren = rel.filter((a) => a.bereich === 'hoeren').reduce((s, a) => s + a.fragen.length, 0);
      expect(lesen).toBe(TESTDAF_PRUEFUNG.lesen.items);
      expect(hoeren).toBe(TESTDAF_PRUEFUNG.hoeren.items);
    }
  });

  it('enthält keine Fragmentdateien und kein Fremdmaterial', () => {
    expect(dateien.filter((f) => /[\\/]_/.test(f))).toEqual([]);
    for (const [rel, raw] of rohdaten) {
      expect(raw, `${rel}: external-link verboten`).not.toContain('"external-link"');
      expect(raw.toLowerCase(), `${rel}: darf Klett/Kommerz nicht als Itemquelle nennen`).not.toMatch(
        /"attribution"\s*:\s*"[^"]*(mit erfolg|klett)/
      );
    }
  });

  for (const a of aufgaben) {
    it(`${a.id} erfüllt Format und Rubrik`, () => {
      const fehler = validateTestdafAufgabe(a, { strict: false }).filter((i) => i.level === 'error');
      expect(fehler.map((f) => `[${f.code}] ${f.message}`)).toEqual([]);
    });

    it(`${a.id} hat die vorgeschriebene Itemzahl, Itemtypen und Zeit`, () => {
      const spec = TESTDAF_SPEC[a.bereich].find((s) => s.aufgabe === a.aufgabe)!;
      expect(a.fragen).toHaveLength(spec.items);
      expect(a.fragen.map((f) => f.typ)).toEqual(Array(spec.items).fill(spec.typ));
      expect(a.zeit_minuten).toBe(spec.minuten);
      expect(a.tdn).toBe(spec.tdn);
      if (a.audio) expect(a.audio.play_limit_pruefung).toBe(spec.playLimit);
    });

    it(`${a.id} hat ein wörtliches Belegzitat je Item`, () => {
      const quell = [
        ...a.texte.map((t) => `${t.titel} ${t.inhalt}`),
        a.audio?.transcript ?? '',
        ...a.antwort_optionen.map((o) => o.text)
      ]
        .join('\n')
        .toLowerCase();
      for (const f of a.fragen) {
        expect(quell, `Aufgabe ${f.nr}: evidence nicht im Text`).toContain(f.evidence.toLowerCase());
      }
    });
  }

  for (const p of pruefungen) {
    it(`${p.id} verweist auf 6 vorhandene Aufgaben`, () => {
      expect(p.aufgaben).toHaveLength(6);
      const ids = new Set(aufgaben.map((a) => a.id));
      for (const id of p.aufgaben) expect(ids.has(id), `unbekannte id ${id}`).toBe(true);
    });

    it(`${p.id} besteht die Prüfungsvalidierung`, () => {
      const rel = p.aufgaben.map((id) => aufgaben.find((a) => a.id === id)!).filter(Boolean);
      const fehler = validateTestdafPruefung(rel, { strict: false }).filter((i) => i.level === 'error');
      expect(fehler.map((f) => `[${f.code}] ${f.message}`)).toEqual([]);
    });
  }

  it('jede Hören-Aufgabe hat Audio und Transkript', () => {
    for (const a of aufgaben.filter((x) => x.bereich === 'hoeren')) {
      expect(a.audio, `${a.id}: audio fehlt`).not.toBeNull();
      expect(a.audio!.transcript.length, `${a.id}: Transkript zu kurz`).toBeGreaterThan(200);
      expect(a.audio!.src, `${a.id}: src fehlt`).toMatch(/^\/audio\/.+\.mp3$/);
    }
  });

  it('jede Aufgabe hat mindestens 8 Glossareinträge mit indonesischer Bedeutung', () => {
    for (const a of aufgaben) {
      expect(a.glossar.length, `${a.id}: Glossar zu klein`).toBeGreaterThanOrEqual(8);
      for (const g of a.glossar) expect(g.bedeutung_id.length, `${a.id}/${g.wort}`).toBeGreaterThan(1);
    }
  });
});

describe('Bewertung offener Aufgaben (kurzantwort)', () => {
  const offene = aufgaben.flatMap((a) => a.fragen.filter((f) => f.typ === 'kurzantwort').map((f) => ({ a, f })));

  it('enthält offene Items (TestDaF Hören 1 und 3)', () => {
    expect(offene.length).toBeGreaterThanOrEqual(30);
  });

  it('erkennt jede hinterlegte Musterlösung als richtig', () => {
    for (const { a, f } of offene) {
      for (const l of f.loesung) {
        expect(kurzantwortRichtig(l, f), `${a.id} Item ${f.nr}: Musterlösung "${l}" nicht erkannt`).toBe(true);
      }
    }
  });

  it('ignoriert Groß-/Kleinschreibung und Umlautschreibung', () => {
    for (const { a, f } of offene) {
      const l = f.loesung[0];
      expect(kurzantwortRichtig(l.toUpperCase(), f), `${a.id} Item ${f.nr}: Großschreibung`).toBe(true);
      expect(
        kurzantwortRichtig(normAntwort(l).replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü'), f),
        `${a.id} Item ${f.nr}: Umlautvariante`
      ).toBe(true);
    }
  });

  it('akzeptiert eine freie Antwort aus den Schlüsselwörtern', () => {
    for (const { a, f } of offene) {
      const frei = f.schluessel.map((g) => g[0]).join(' ');
      expect(kurzantwortRichtig(frei, f), `${a.id} Item ${f.nr}: Schlüsselwortantwort "${frei}" nicht erkannt`).toBe(true);
    }
  });

  it('lässt keine offensichtlichen Falschantworten durch', () => {
    for (const { a, f } of offene) {
      for (const mist of ['Ich weiß es nicht', 'keine Ahnung', 'das steht nicht im Text']) {
        expect(kurzantwortRichtig(mist, f), `${a.id} Item ${f.nr}: "${mist}" gilt als richtig`).toBe(false);
      }
    }
  });

  it('bewertet eine vollständige Aufgabe korrekt (alle richtig → 100 %)', () => {
    for (const a of aufgaben) {
      const alleRichtig: Record<number, string[]> = {};
      for (const f of a.fragen) alleRichtig[f.nr] = [f.loesung[0]];
      const e = scoreTestdafAufgabe(a, alleRichtig);
      expect(e.benar, `${a.id}`).toBe(a.fragen.length);
      expect(e.prozent).toBe(100);
      expect(e.punkte).toBe(a.punkte_max);
    }
  });

  it('wertet Selbstkorrektur einer offenen Antwort korrekt', () => {
    const a = aufgaben.find((x) => x.fragen.some((f) => f.typ === 'kurzantwort'))!;
    const f = a.fragen.find((x) => x.typ === 'kurzantwort')!;
    const antwort = { [f.nr]: ['eine völlig abweichende Formulierung'] };
    const ohne = scoreTestdafAufgabe(a, antwort);
    const mit = scoreTestdafAufgabe(a, antwort, { selbstkorrektur: { [f.nr]: true } });
    expect(mit.punkte).toBeGreaterThan(ohne.punkte);
    const item = mit.items.find((i) => i.nr === f.nr)!;
    expect(item.selbst).toBe(true);
    expect(item.richtig).toBe(true);
  });
});

describe('Hören: Audio und Transkript sind verzahnt', () => {
  const hoeren = aufgaben.filter((a) => a.bereich === 'hoeren' && a.audio);

  it('hat für jede Hören-Aufgabe eine vorhandene Audiodatei mit Dauer', () => {
    expect(hoeren.length).toBeGreaterThanOrEqual(6);
    for (const a of hoeren) {
      expect(a.audio!.dauer_sekunden, `${a.id}: dauer_sekunden fehlt`).toBeGreaterThan(30);
      const pfad = join(ROOT, 'public', a.audio!.src.replace(/^\//, ''));
      expect(existsSync(pfad), `${a.id}: Audiodatei ${a.audio!.src} fehlt`).toBe(true);
    }
  });

  it('hat für jede Hören-Aufgabe Wort-Timestamps, die zum Audio passen', () => {
    for (const a of hoeren) {
      const ts = a.audio!.wort_timestamps;
      expect(
        ts.length,
        `${a.id}: wort_timestamps leer — 'python3 scripts/align.py --testdaf' ausführen`
      ).toBeGreaterThan(50);

      let letzterStart = -1;
      for (const [start, end, wort] of ts) {
        expect(start, `${a.id}: Startzeit läuft rückwärts`).toBeGreaterThanOrEqual(letzterStart - 0.001);
        expect(end, `${a.id}: Ende vor Start`).toBeGreaterThanOrEqual(start);
        expect(wort.trim().length, `${a.id}: leerer Wort-Token`).toBeGreaterThan(0);
        letzterStart = start;
      }

      const letztesEnde = ts[ts.length - 1][1];
      expect(letztesEnde, `${a.id}: Alignment überschreitet das Audio-Ende`).toBeLessThanOrEqual(
        a.audio!.dauer_sekunden + 1
      );
      expect(letztesEnde, `${a.id}: Alignment deckt nur ${letztesEnde}s von ${a.audio!.dauer_sekunden}s ab`).toBeGreaterThan(
        a.audio!.dauer_sekunden * 0.85
      );
      expect(ts[0][0], `${a.id}: Alignment startet zu spät`).toBeLessThan(3);
    }
  });

  it('behält die Sprechermarken im Transkript (Sprecher-Zuordnung sichtbar)', () => {
    for (const a of hoeren) {
      expect(a.audio!.transcript, `${a.id}: keine Sprechermarke [..] im Transkript`).toMatch(/\[[^\]]+\]/);
      expect(a.audio!.sprecher.length, `${a.id}: keine Sprecher gelistet`).toBeGreaterThanOrEqual(1);
    }
  });
});

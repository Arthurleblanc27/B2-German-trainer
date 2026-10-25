import { describe, expect, it } from 'vitest';
import { aggregiere, bereiteProzent, formatDauer, streakTage } from '../src/lib/analyse';
import type { ItemLogRow, SesiRow } from '../src/lib/storage';

const sesi = (datum: string, benar: number, punkteMax = 30, modus: 'uebung' | 'pruefung' = 'uebung', skalierung?: number): SesiRow => ({
  datum,
  skill: 'lesen',
  unitId: 'lesen-unit-01',
  teilId: 'lesen-unit-01-teil1',
  teil: 1,
  modus,
  benar,
  salah: punkteMax - benar,
  offen: 0,
  punkte: benar,
  punkteMax,
  skalierung: skalierung ?? Math.round((benar / punkteMax) * 100),
  dauer_sekunden: 600
});

const log = (datum: string, richtig: boolean, typ = 'mc3', themenfeld = 'Umwelt & Klima'): ItemLogRow => ({
  datum,
  itemId: 'lesen-unit-01-teil3',
  frageNr: 1,
  teil: 3,
  typ: typ as ItemLogRow['typ'],
  themenfeld,
  skill: 'lesen',
  richtig,
  offen: false,
  gegeben: ['b'],
  loesung: ['b'],
  stamm_de: 'stamm',
  stamm_id: 'soal',
  explain_de: 'explain',
  explain_id: 'penjelasan',
  evidence: 'beleg',
  teilTitel: 'Test'
});

describe('streakTage', () => {
  const heute = new Date('2026-10-10T12:00:00Z');
  it('zählt aufeinanderfolgende Tage', () => {
    const s = [sesi('2026-10-10T08:00:00Z', 20), sesi('2026-10-09T08:00:00Z', 20), sesi('2026-10-08T08:00:00Z', 20)];
    expect(streakTage(s, heute)).toBe(3);
  });
  it('bricht bei einer Lücke ab', () => {
    const s = [sesi('2026-10-10T08:00:00Z', 20), sesi('2026-10-08T08:00:00Z', 20)];
    expect(streakTage(s, heute)).toBe(1);
  });
  it('erlaubt heute ohne Aktivität, wenn gestern aktiv war', () => {
    const s = [sesi('2026-10-09T08:00:00Z', 20), sesi('2026-10-08T08:00:00Z', 20)];
    expect(streakTage(s, heute)).toBe(2);
  });
  it('ist 0 ohne Sitzungen', () => {
    expect(streakTage([], heute)).toBe(0);
  });
});

describe('bereiteProzent', () => {
  it('gewichtet Prüfungssitzungen doppelt und nimmt die letzten 5', () => {
    const s = [
      sesi('2026-10-10T08:00:00Z', 30, 30, 'pruefung'),
      sesi('2026-10-09T08:00:00Z', 0, 30, 'uebung'),
      sesi('2026-10-01T08:00:00Z', 0, 30, 'uebung')
    ];
    // (100*2 + 0*1 + 0*1) / 4 = 50
    expect(bereiteProzent(s)).toBe(50);
  });
  it('ist 0 ohne Sitzungen', () => {
    expect(bereiteProzent([])).toBe(0);
  });
});

describe('aggregiere', () => {
  const heute = new Date('2026-10-10T12:00:00Z');
  it('zählt richtig/falsch/offen und gruppiert nach Typ', () => {
    const logs = [log('2026-10-10T08:00:00Z', true), log('2026-10-10T08:05:00Z', false), log('2026-10-10T08:10:00Z', true, 'richtigfalsch'), { ...log('2026-10-10T08:15:00Z', false, 'richtigfalsch'), offen: true, richtig: false }];
    const a = aggregiere([sesi('2026-10-10T08:00:00Z', 20)], logs, heute);
    expect(a.aufgaben).toBe(4);
    expect(a.richtig).toBe(2);
    expect(a.offen).toBe(1);
    expect(a.perTyp.find((t) => t.typ === 'richtigfalsch')?.total).toBe(2);
  });

  it('liefert immer eine 84-Tage-Heatmap', () => {
    const a = aggregiere([], [], heute);
    expect(a.heatmap).toHaveLength(84);
    expect(a.heatmap[a.heatmap.length - 1].tag).toBe('2026-10-10');
  });

  it('ermittelt die drei schwächsten Aufgabentypen (ab 3 Aufgaben)', () => {
    const logs = [
      log('2026-10-10T08:00:00Z', false, 'satz-luecke'),
      log('2026-10-10T08:01:00Z', false, 'satz-luecke'),
      log('2026-10-10T08:02:00Z', false, 'satz-luecke'),
      log('2026-10-10T08:03:00Z', true, 'mc3'),
      log('2026-10-10T08:04:00Z', true, 'mc3'),
      log('2026-10-10T08:05:00Z', true, 'mc3')
    ];
    const a = aggregiere([], logs, heute);
    expect(a.schwaechen[0].label).toBe('satz-luecke');
    expect(a.schwaechen[0].akkuratProzent).toBe(0);
  });

  it('leere Datenbasis liefert Nullen statt Fehler', () => {
    const a = aggregiere([], [], heute);
    expect(a.sesionen).toBe(0);
    expect(a.akkuratProzent).toBe(0);
    expect(a.trend).toEqual([]);
  });
});

describe('formatDauer', () => {
  it.each([
    [30, '30 Sek'],
    [90, '1 Min'],
    [3600, '1 Std 0 Min'],
    [7500, '2 Std 5 Min']
  ])('%i s → %s', (s, erwartet) => {
    expect(formatDauer(s as number)).toBe(erwartet);
  });
});

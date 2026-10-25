import { describe, expect, it } from 'vitest';
import { antwort, faellig, neueKarte, statistik, SRS_INTERVALLE } from '../src/lib/srs';

const t0 = new Date('2026-10-10T09:00:00Z');

describe('SM-2 (leicht)', () => {
  it('neue Karte ist sofort fällig', () => {
    const k = neueKarte('a#1', t0);
    expect(k.stufe).toBe(0);
    expect(k.faellig).toBe('2026-10-10');
    expect(k.archiviert).toBe(false);
    expect(faellig([k], t0)).toHaveLength(1);
  });

  it('falsche Antwort setzt auf Stufe 0 und plant 1 Tag', () => {
    const k = antwort(neueKarte('a#1', t0), false, t0);
    expect(k.stufe).toBe(0);
    expect(k.streak).toBe(0);
    expect(k.faellig).toBe('2026-10-11');
    expect(k.letzteAntwort).toBe('falsch');
  });

  it('richtige Antworten steigern die Intervalle 1 → 3 → 7 → 21 Tage', () => {
    let k = neueKarte('a#1', t0);
    const tage: string[] = [];
    for (let i = 0; i < SRS_INTERVALLE.length; i++) {
      k = antwort(k, true, t0);
      tage.push(k.faellig);
    }
    expect(tage).toEqual(['2026-10-11', '2026-10-13', '2026-10-17', '2026-10-31']);
  });

  it('falsche Antwort nach Fortschritt setzt zurück', () => {
    let k = antwort(neueKarte('a#1', t0), true, t0);
    k = antwort(k, true, t0);
    k = antwort(k, false, t0);
    expect(k.stufe).toBe(0);
    expect(k.streak).toBe(0);
    expect(k.faellig).toBe('2026-10-11');
  });

  it('nach 3 richtigen Antworten in Folge wird der Eintrag archiviert', () => {
    let k = neueKarte('a#1', t0);
    k = antwort(k, true, t0);
    k = antwort(k, true, t0);
    k = antwort(k, true, t0);
    expect(k.streak).toBe(3);
    expect(k.stufe).toBe(SRS_INTERVALLE.length - 1);
    expect(k.archiviert).toBe(true);
  });

  it('archivierte Karten sind nicht mehr fällig', () => {
    let k = neueKarte('a#1', t0);
    k = antwort(k, true, t0);
    k = antwort(k, true, t0);
    k = antwort(k, true, t0);
    expect(faellig([k], new Date('2026-12-31T00:00:00Z'))).toHaveLength(0);
  });

  it('falsche Antwort nach Archivierung reaktiviert die Karte', () => {
    let k = neueKarte('a#1', t0);
    k = antwort(k, true, t0);
    k = antwort(k, true, t0);
    k = antwort(k, true, t0);
    k = antwort(k, false, t0);
    expect(k.archiviert).toBe(false);
    expect(faellig([k], new Date('2026-10-11T00:00:00Z'))).toHaveLength(1);
  });

  it('faellig sortiert nach Datum und filtert die Zukunft heraus', () => {
    const a = { ...neueKarte('a', t0), faellig: '2026-10-10' };
    const b = { ...neueKarte('b', t0), faellig: '2026-10-09' };
    const c = { ...neueKarte('c', t0), faellig: '2026-11-01' };
    const f = faellig([a, b, c], t0);
    expect(f.map((k) => k.itemId)).toEqual(['b', 'a']);
  });

  it('statistik zählt Gesamt, Fällige und Archivierte', () => {
    const karten = [
      neueKarte('a', t0),
      { ...neueKarte('b', t0), archiviert: true },
      { ...neueKarte('c', t0), faellig: '2026-12-01' }
    ];
    const s = statistik(karten);
    expect(s.total).toBe(3);
    expect(s.faellig).toBe(1);
    expect(s.archiviert).toBe(1);
    expect(s.lernend).toBe(2);
  });

  it('lange Intervalle wachsen nicht über die letzte Stufe hinaus', () => {
    let k = neueKarte('a#1', t0);
    for (let i = 0; i < 10; i++) k = antwort(k, true, t0);
    expect(k.stufe).toBe(SRS_INTERVALLE.length - 1);
    expect(k.archiviert).toBe(true);
  });
});

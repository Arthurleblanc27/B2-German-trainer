import { describe, expect, it } from 'vitest';
import type { Frage, Teil } from '../src/data/schema';
import { BESTEHENSGRENZE } from '../src/data/schema';
import { labelFuer, scoreModul, scoreTeil } from '../src/lib/scoring';

function frage(nr: number, loesung = 'b', punkte = 1): Frage {
  return {
    nr,
    typ: 'mc3',
    stamm_de: `Aufgabe ${nr}`,
    stamm_id: `Soal ${nr}`,
    optionen: [
      { key: 'a', text: 'A' },
      { key: 'b', text: 'B' },
      { key: 'c', text: 'C' }
    ],
    loesung: [loesung],
    punkte,
    explain_de: 'Weil der Text es so sagt.',
    explain_id: 'Karena teksnya menyebutkan demikian.',
    evidence: 'Text'
  };
}

function teil(anzahl: number, skill: 'lesen' | 'hoeren' = 'lesen', punktProFrage = 1): Teil {
  const fragen = Array.from({ length: anzahl }, (_, i) => frage(i + 1, 'b', punktProFrage));
  return {
    id: `${skill}-test-teil1`,
    skill,
    teil: 1,
    themenfeld: 'Gesellschaft & Soziales',
    titel: 'Testteil',
    instruktion_de: 'Wähle die richtige Option.',
    instruktion_id: 'Pilih opsi yang benar.',
    zeit_minuten: 18,
    source_type: 'own',
    lizenz: 'CC-BY-NC-SA-4.0',
    attribution: 'Test',
    tags: [],
    audio: null,
    texte: null,
    luecken_text: null,
    optionen_saetze: null,
    ueberschriften: null,
    fragen,
    punkte_max: anzahl * punktProFrage,
    glossar: []
  };
}

function antworten(n: number, richtig: number, offen = 0): Record<number, string[]> {
  const a: Record<number, string[]> = {};
  for (let i = 1; i <= n; i++) {
    if (i > richtig && i <= richtig + offen) a[i] = [];
    else a[i] = i <= richtig ? ['b'] : ['a'];
  }
  return a;
}

describe('scoreTeil', () => {
  it('alle richtig → volle Punktzahl', () => {
    const t = teil(9);
    const e = scoreTeil(t, antworten(9, 9));
    expect(e.punkte).toBe(9);
    expect(e.punkteMax).toBe(9);
    expect(e.benar).toBe(9);
    expect(e.salah).toBe(0);
    expect(e.offen).toBe(0);
  });

  it('alle falsch → 0 Punkte', () => {
    const e = scoreTeil(teil(6), antworten(6, 0));
    expect(e.punkte).toBe(0);
    expect(e.salah).toBe(6);
    expect(e.benar).toBe(0);
  });

  it('teilweise richtig', () => {
    const e = scoreTeil(teil(9), antworten(9, 5));
    expect(e.punkte).toBe(5);
    expect(e.benar).toBe(5);
    expect(e.salah).toBe(4);
  });

  it('unbeantwortet wird als offen gezählt (nicht als falsch)', () => {
    const e = scoreTeil(teil(9), antworten(9, 4, 3));
    expect(e.benar).toBe(4);
    expect(e.salah).toBe(2);
    expect(e.offen).toBe(3);
    expect(e.punkte).toBe(4);
  });

  it('gewichtet Punkte pro Aufgabe', () => {
    const e = scoreTeil(teil(4, 'lesen', 2), antworten(4, 3));
    expect(e.punkte).toBe(6);
    expect(e.punkteMax).toBe(8);
  });

  it('vergleicht Mehrfachlösungen ohne Reihenfolge-Abhängigkeit', () => {
    const t = teil(1);
    t.fragen[0].loesung = ['a', 'c'];
    const e = scoreTeil(t, { 1: ['c', 'a'] });
    expect(e.benar).toBe(1);
  });

  it('ist tolerant gegenüber Groß-/Kleinschreibung und Leerzeichen', () => {
    const t = teil(1);
    t.fragen[0].loesung = ['richtig'];
    const e = scoreTeil(t, { 1: [' Richtig '] });
    expect(e.benar).toBe(1);
  });
});

describe('scoreModul — Skala 100 und Bestehensgrenze', () => {
  const dreissig = (richtig: number) => scoreTeil(teil(30), antworten(30, richtig));

  it('17/30 = 57 % → nicht bestanden', () => {
    const m = scoreModul([dreissig(17)]);
    expect(m.skalierung0bis100).toBe(57);
    expect(m.bestanden).toBe(false);
    expect(m.label).toBe('nicht bestanden');
  });

  it('18/30 = 60 % → bestanden (Grenzfall)', () => {
    const m = scoreModul([dreissig(18)]);
    expect(m.skalierung0bis100).toBe(BESTEHENSGRENZE);
    expect(m.bestanden).toBe(true);
    expect(m.label).toBe('bestanden');
  });

  it('59 % → nicht bestanden', () => {
    const m = scoreModul([scoreTeil(teil(100), antworten(100, 59))]);
    expect(m.skalierung0bis100).toBe(59);
    expect(m.bestanden).toBe(false);
  });

  it('100 % → sehr gut', () => {
    const m = scoreModul([dreissig(30)]);
    expect(m.skalierung0bis100).toBe(100);
    expect(m.label).toBe('sehr gut');
  });

  it('aggregiert mehrere Teile', () => {
    const m = scoreModul([scoreTeil(teil(9), antworten(9, 9)), scoreTeil(teil(6), antworten(6, 0))]);
    expect(m.punkteMax).toBe(15);
    expect(m.punkte).toBe(9);
    expect(m.skalierung0bis100).toBe(60);
  });

  it('weist unbeantwortete Aufgaben im Prüfungsmodus separat aus', () => {
    const m = scoreModul([scoreTeil(teil(30), antworten(30, 15, 5))], 'pruefung');
    expect(m.offen).toBe(5);
    expect(m.salah).toBe(10);
    expect(m.skalierung0bis100).toBe(50);
  });
});

describe('labelFuer', () => {
  it.each([
    [0, 'nicht bestanden'],
    [59, 'nicht bestanden'],
    [60, 'bestanden'],
    [79, 'bestanden'],
    [80, 'gut'],
    [89, 'gut'],
    [90, 'sehr gut'],
    [100, 'sehr gut']
  ])('%i → %s', (prozent, label) => {
    expect(labelFuer(prozent as number)).toBe(label);
  });
});

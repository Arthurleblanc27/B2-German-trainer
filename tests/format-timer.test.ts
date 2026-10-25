import { describe, expect, it } from 'vitest';
import { formatUhrzeit, jahrAlsWort, zahlAlsWort } from '../src/lib/format';
import { modulDauer, teilDauer, tick, warnstufe } from '../src/lib/timer';

describe('zahlAlsWort (TTS-taugliche Zahlwörter)', () => {
  it.each([
    [0, 'null'],
    [7, 'sieben'],
    [11, 'elf'],
    [12, 'zwölf'],
    [16, 'sechzehn'],
    [30, 'dreißig'],
    [42, 'zweiundvierzig'],
    [100, 'einhundert'],
    [365, 'dreihundertfünfundsechzig'],
    [1000, 'eintausend'],
    [2026, 'zweitausendsechsundzwanzig'],
    [1989, 'eintausendneunhundertneunundachtzig'],
    [9999, 'neuntausendneunhundertneunundneunzig']
  ])('%i → %s', (n, wort) => {
    expect(zahlAlsWort(n as number)).toBe(wort);
  });

  it('jahrAlsWort nutzt dieselbe Regel', () => {
    expect(jahrAlsWort(2026)).toBe('zweitausendsechsundzwanzig');
  });
});

describe('formatUhrzeit', () => {
  it('zeigt mm:ss standardmäßig', () => {
    expect(formatUhrzeit(75)).toBe('01:15');
  });
  it('zeigt h:mm:ss wenn nötig', () => {
    expect(formatUhrzeit(3725)).toBe('1:02:05');
    expect(formatUhrzeit(3725, true)).toBe('1:02:05');
  });
  it('rundet negative Werte auf 0', () => {
    expect(formatUhrzeit(-5)).toBe('00:00');
  });
});

describe('timer', () => {
  it('Teil-Dauer entspricht der Goethe-Tabelle', () => {
    expect(teilDauer('lesen', 1)).toBe(18 * 60);
    expect(teilDauer('lesen', 5)).toBe(6 * 60);
    expect(teilDauer('hoeren', 4)).toBe(10 * 60);
  });

  it('Moduldauer: Lesen 60 Minuten, Hören 40 Minuten', () => {
    expect(modulDauer('lesen') / 60).toBe(60);
    expect(modulDauer('hoeren') / 60).toBe(40);
  });

  it('tick zählt herunter und stoppt bei 0', () => {
    let z = { laeuft: true, restSekunden: 2, gesamtSekunden: 2 };
    z = tick(z, 1);
    expect(z.restSekunden).toBe(1);
    z = tick(z, 5);
    expect(z.restSekunden).toBe(0);
    expect(z.laeuft).toBe(false);
  });

  it('warnstufe meldet 5 Minuten, 1 Minute und Ablauf', () => {
    expect(warnstufe(600)).toBe('ok');
    expect(warnstufe(300)).toBe('fuenf');
    expect(warnstufe(60)).toBe('eine');
    expect(warnstufe(0)).toBe('abgelaufen');
  });
});

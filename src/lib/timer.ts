/** B2-Trainer — logika timer ujian (logika murni, mudah diuji). */
import { TEIL_SPEC, type Skill } from '../data/schema';

export interface TimerZustand {
  laeuft: boolean;
  restSekunden: number;
  gesamtSekunden: number;
}

export function teilDauer(skill: Skill, teil: number, faktor = 1): number {
  const spec = TEIL_SPEC[skill].find((s) => s.teil === teil);
  if (!spec) return 0;
  return Math.round(spec.minuten * 60 * faktor);
}

export function modulDauer(skill: Skill, faktor = 1): number {
  return TEIL_SPEC[skill].reduce((a, s) => a + s.minuten, 0) * 60 * faktor;
}

export function tick(z: TimerZustand, delta = 1): TimerZustand {
  const rest = Math.max(0, z.restSekunden - delta);
  return { ...z, restSekunden: rest, laeuft: rest > 0 && z.laeuft };
}

export function warnstufe(restSekunden: number): 'ok' | 'fuenf' | 'eine' | 'abgelaufen' {
  if (restSekunden <= 0) return 'abgelaufen';
  if (restSekunden <= 60) return 'eine';
  if (restSekunden <= 300) return 'fuenf';
  return 'ok';
}

/**
 * Verbleibende Bedenkzeit nach den Goethe-Regeln für Hören:
 * Lesen der Aufgaben (15s Teil 1 / 90s Teil 2–4), Wiedergabe, Antwortzeit.
 */
export function antwortzeitSekunden(teil: number, items: number): number {
  return Math.max(60, items * 20 - (teil === 1 ? 0 : 30));
}

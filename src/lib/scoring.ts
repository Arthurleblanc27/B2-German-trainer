/**
 * B2-Trainer — mesin penilaian (pure, ohne DOM).
 * Skala 0–100, Bestehensgrenze 60 (Goethe-Zertifikat B2).
 */
import { BESTEHENSGRENZE, type Frage, type ProtokollFrageTyp, type Teil } from '../data/schema';

export type Modus = 'uebung' | 'pruefung';

export interface TeilErgebnis {
  teilId: string;
  skill: 'lesen' | 'hoeren';
  teil: number;
  benar: number;
  salah: number;
  offen: number;
  punkte: number;
  punkteMax: number;
  /** jawaban pengguna per Aufgabennummer */
  antworten: Record<number, string[]>;
  /** detail per Aufgabennummer für Fehlerheft */
  items: ItemAuswertung[];
}

export interface ItemAuswertung {
  frageNr: number;
  richtig: boolean;
  offen: boolean;
  gegeben: string[];
  loesung: string[];
  typ: ProtokollFrageTyp;
}

export interface ModulErgebnis {
  punkte: number;
  punkteMax: number;
  skalierung0bis100: number;
  bestanden: boolean;
  label: ScoreLabel;
  benar: number;
  salah: number;
  offen: number;
}

export type ScoreLabel = 'nicht bestanden' | 'bestanden' | 'gut' | 'sehr gut';

/** Vergleich zweier Antwortmengen (Reihenfolge unerheblich). */
function gleich(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].map((s) => s.trim().toLowerCase()).sort();
  const y = [...b].map((s) => s.trim().toLowerCase()).sort();
  return x.every((v, i) => v === y[i]);
}

export function scoreTeil(teil: Pick<Teil, 'id' | 'skill' | 'teil' | 'fragen'>, antworten: Record<number, string[]>): TeilErgebnis {
  let benar = 0;
  let salah = 0;
  let offen = 0;
  let punkte = 0;
  let punkteMax = 0;
  const items: ItemAuswertung[] = [];

  for (const frage of teil.fragen) {
    const gewicht = frage.punkte ?? 1;
    punkteMax += gewicht;
    const gegeben = (antworten?.[frage.nr] ?? []).filter((s) => s !== '');
    const istOffen = gegeben.length === 0;
    const istRichtig = !istOffen && gleich(gegeben, frage.loesung);
    if (istOffen) offen += 1;
    else if (istRichtig) {
      benar += 1;
      punkte += gewicht;
    } else salah += 1;
    items.push({ frageNr: frage.nr, richtig: istRichtig, offen: istOffen, gegeben, loesung: frage.loesung, typ: frage.typ });
  }

  return {
    teilId: teil.id,
    skill: teil.skill,
    teil: teil.teil,
    benar,
    salah,
    offen,
    punkte,
    punkteMax,
    antworten: { ...antworten },
    items
  };
}

export function labelFuer(skalierung: number): ScoreLabel {
  if (skalierung >= 90) return 'sehr gut';
  if (skalierung >= 80) return 'gut';
  if (skalierung >= BESTEHENSGRENZE) return 'bestanden';
  return 'nicht bestanden';
}

/**
 * Modul-Score. Unbeantwortete Aufgaben:
 *  – Modus Übung   → nicht als falsch gewertet (nur separat als "offen" gemeldet)
 *  – Modus Prüfung → zählen als falsch (Zeit abgelaufen), aber separat ausgewiesen
 */
export function scoreModul(teile: TeilErgebnis[], modus: Modus = 'pruefung'): ModulErgebnis & { offen: number } {
  const punkteMax = teile.reduce((a, t) => a + t.punkteMax, 0);
  const punkteRoh = teile.reduce((a, t) => a + t.punkte, 0);
  const offen = teile.reduce((a, t) => a + t.offen, 0);
  const jawabbar = punkteMax;
  const skalierung = jawabbar === 0 ? 0 : Math.round((punkteRoh / jawabbar) * 100);
  const benar = teile.reduce((a, t) => a + t.benar, 0);
  const salah = teile.reduce((a, t) => a + t.salah, 0);
  const label = labelFuer(skalierung);

  const offenAlsFalsch = modus === 'pruefung';
  const benarEffektiv = benar;
  const salahEffektiv = salah + (offenAlsFalsch ? offen : 0);
  void benarEffektiv;
  void salahEffektiv;

  return {
    punkte: punkteRoh,
    punkteMax,
    skalierung0bis100: skalierung,
    bestanden: skalierung >= BESTEHENSGRENZE,
    label,
    benar,
    salah,
    offen
  };
}

export function modusHinweis(modus: Modus, offen: number): string {
  if (modus === 'uebung') return offen > 0 ? `${offen} Aufgabe(n) nicht bearbeitet (Übungsmodus: nicht als Fehler gewertet).` : '';
  return offen > 0 ? `${offen} Aufgabe(n) unbeantwortet — im Prüfungsmodus als Fehler gewertet.` : '';
}

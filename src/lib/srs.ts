/**
 * B2-Trainer — SM-2 ringan untuk Fehlerheft / Wiederholung.
 * Intervalle: 1 Tag → 3 Tage → 7 Tage → 21 Tage; 3× richtig hintereinander → archiviert.
 */
export interface SrsKarte {
  itemId: string;
  /** Wiederholungsstufe 0..4 */
  stufe: number;
  /** Anzahl richtiger Antworten in Folge */
  streak: number;
  /** ISO-Datum (yyyy-mm-dd) der nächsten Fälligkeit */
  faellig: string;
  letzteAntwort: 'richtig' | 'falsch' | null;
  archiviert: boolean;
}

export const SRS_INTERVALLE = [1, 3, 7, 21] as const;

export function heute(now: Date = new Date()): string {
  return isoDate(now);
}

export function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function plusTage(tage: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + tage * 24 * 60 * 60 * 1000);
  return isoDate(d);
}

export function neueKarte(itemId: string, now: Date = new Date()): SrsKarte {
  return { itemId, stufe: 0, streak: 0, faellig: heute(now), letzteAntwort: null, archiviert: false };
}

export function naechsteStufe(stufe: number): number {
  return Math.min(stufe + 1, SRS_INTERVALLE.length - 1);
}

/** Wendet eine Antwort an und liefert die neue Karte (rein funktional). */
export function antwort(karte: SrsKarte, richtig: boolean, now: Date = new Date()): SrsKarte {
  if (!richtig) {
    return { ...karte, stufe: 0, streak: 0, faellig: plusTage(SRS_INTERVALLE[0], now), letzteAntwort: 'falsch', archiviert: false };
  }
  const streak = karte.streak + 1;
  const stufe = naechsteStufe(karte.stufe);
  // Das Intervall der AKTUELLEN Stufe wird verwendet, danach steigt die Stufe.
  const intervall =
    SRS_INTERVALLE[karte.stufe] ?? SRS_INTERVALLE[SRS_INTERVALLE.length - 1];
  const archiviert = streak >= 3 && stufe >= SRS_INTERVALLE.length - 1;
  return {
    ...karte,
    stufe,
    streak,
    faellig: plusTage(intervall, now),
    letzteAntwort: 'richtig',
    archiviert
  };
}

export function faellig(karten: SrsKarte[], now: Date = new Date()): SrsKarte[] {
  const d = heute(now);
  return karten.filter((k) => !k.archiviert && k.faellig <= d).sort((a, b) => a.faellig.localeCompare(b.faellig));
}

export function statistik(karten: SrsKarte[]): { total: number; faellig: number; archiviert: number; lernend: number } {
  const f = faellig(karten).length;
  const a = karten.filter((k) => k.archiviert).length;
  return { total: karten.length, faellig: f, archiviert: a, lernend: karten.length - a };
}

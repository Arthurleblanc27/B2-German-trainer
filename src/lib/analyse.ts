/**
 * B2-Trainer — agregasi statistik (pure functions, ohne Dexie → in Vitest testbar).
 */
import type { SesiRow, ItemLogRow } from './storage';

export interface Aggregat {
  sesionen: number;
  aufgaben: number;
  richtig: number;
  falsch: number;
  offen: number;
  akkuratProzent: number;
  streak: number;
  sekundenGesamt: number;
  perTeil: { teil: number; richtig: number; total: number; akkuratProzent: number }[];
  perTyp: { typ: string; richtig: number; total: number; akkuratProzent: number }[];
  perThema: { thema: string; richtig: number; total: number; akkuratProzent: number }[];
  heatmap: { tag: string; richtig: number; total: number; akkuratProzent: number }[];
  bereitProzent: number;
  schwaechen: { label: string; akkuratProzent: number; total: number }[];
  trend: { tag: string; akkuratProzent: number; sesionen: number }[];
}

const tag = (iso: string) => iso.slice(0, 10);
const proz = (r: number, t: number) => (t === 0 ? 0 : Math.round((r / t) * 100));

export function streakTage(sesionen: SesiRow[], now: Date = new Date()): number {
  const tage = new Set(sesionen.map((s) => tag(s.datum)));
  let streak = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < 400; i++) {
    const d = cursor.toISOString().slice(0, 10);
    const aktiv = tage.has(d);
    if (aktiv) streak += 1;
    else if (i > 0 || !aktiv) {
      // heute darf leer sein, gestern nicht
      if (i === 0) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        continue;
      }
      break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function bereiteProzent(sesionen: SesiRow[]): number {
  // Die letzten 5 Sessions, Prüfungsmodus doppelt gewichtet.
  const letzte = [...sesionen].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 5);
  if (!letzte.length) return 0;
  let summe = 0;
  let gewicht = 0;
  for (const s of letzte) {
    const w = s.modus === 'pruefung' ? 2 : 1;
    summe += s.skalierung * w;
    gewicht += w;
  }
  return Math.round(summe / (gewicht || 1));
}

function gruppiere<T extends string | number>(
  logs: ItemLogRow[],
  key: (l: ItemLogRow) => T
): { key: T; richtig: number; total: number; akkuratProzent: number }[] {
  const map = new Map<T, { richtig: number; total: number }>();
  for (const l of logs) {
    const k = key(l);
    const cur = map.get(k) ?? { richtig: 0, total: 0 };
    cur.total += 1;
    if (l.richtig) cur.richtig += 1;
    map.set(k, cur);
  }
  return [...map.entries()]
    .map(([k, v]) => ({ key: k, richtig: v.richtig, total: v.total, akkuratProzent: proz(v.richtig, v.total) }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

export function aggregiere(sesionen: SesiRow[], logs: ItemLogRow[], now: Date = new Date()): Aggregat {
  const richtig = logs.filter((l) => l.richtig).length;
  const offen = logs.filter((l) => l.offen).length;
  const falsch = logs.length - richtig - offen;
  const perTeil = gruppiere(logs, (l) => l.teil ?? 0).map((g) => ({
    teil: Number(g.key),
    richtig: g.richtig,
    total: g.total,
    akkuratProzent: g.akkuratProzent
  }));
  const perTyp = gruppiere(logs, (l) => l.typ).map((g) => ({
    typ: String(g.key),
    richtig: g.richtig,
    total: g.total,
    akkuratProzent: g.akkuratProzent
  }));
  const perThema = gruppiere(logs, (l) => l.themenfeld).map((g) => ({
    thema: String(g.key),
    richtig: g.richtig,
    total: g.total,
    akkuratProzent: g.akkuratProzent
  }));

  // Heatmap: letzte 84 Tage (12 Wochen)
  const proTag = new Map<string, { richtig: number; total: number }>();
  for (const l of logs) {
    const d = tag(l.datum);
    const cur = proTag.get(d) ?? { richtig: 0, total: 0 };
    cur.total += 1;
    if (l.richtig) cur.richtig += 1;
    proTag.set(d, cur);
  }
  const heatmap: Aggregat['heatmap'] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    const v = proTag.get(d) ?? { richtig: 0, total: 0 };
    heatmap.push({ tag: d, richtig: v.richtig, total: v.total, akkuratProzent: proz(v.richtig, v.total) });
  }

  const trendMap = new Map<string, { richtig: number; total: number; sesionen: number }>();
  for (const s of sesionen) {
    const d = tag(s.datum);
    const cur = trendMap.get(d) ?? { richtig: 0, total: 0, sesionen: 0 };
    cur.richtig += s.benar;
    cur.total += s.punkteMax;
    cur.sesionen += 1;
    trendMap.set(d, cur);
  }
  const trend = [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30)
    .map(([d, v]) => ({ tag: d, akkuratProzent: proz(v.richtig, v.total), sesionen: v.sesionen }));

  const schwaechen = [...perTyp]
    .filter((g) => g.total >= 3)
    .sort((a, b) => a.akkuratProzent - b.akkuratProzent)
    .slice(0, 3)
    .map((g) => ({ label: g.typ, akkuratProzent: g.akkuratProzent, total: g.total }));

  return {
    sesionen: sesionen.length,
    aufgaben: logs.length,
    richtig,
    falsch,
    offen,
    akkuratProzent: proz(richtig, logs.length),
    streak: streakTage(sesionen, now),
    sekundenGesamt: sesionen.reduce((a, s) => a + (s.dauer_sekunden ?? 0), 0),
    perTeil,
    perTyp: perTyp.map((p: any) => ({ typ: p.typ, richtig: p.richtig, total: p.total, akkuratProzent: p.akkuratProzent })),
    perThema,
    heatmap,
    bereitProzent: bereiteProzent(sesionen),
    schwaechen,
    trend
  };
}

export function formatDauer(sekunden: number): string {
  const h = Math.floor(sekunden / 3600);
  const m = Math.floor((sekunden % 3600) / 60);
  if (h > 0) return `${h} Std ${m} Min`;
  if (m > 0) return `${m} Min`;
  return `${sekunden} Sek`;
}

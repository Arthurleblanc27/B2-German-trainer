/**
 * B2-Trainer — penyimpanan progres pengguna (IndexedDB via Dexie).
 * Tidak ada backend. Semua I/O dibungkus try/catch agar aman saat SSR/prerender.
 */
import Dexie, { type Table } from 'dexie';
import type { Modus, TeilErgebnis } from './scoring';
import { type ProtokollFrageTyp, type Skill } from '../data/schema';
import { antwort as srsAntwort, neueKarte, type SrsKarte } from './srs';

export interface SesiRow {
  id?: number;
  datum: string; // ISO datetime
  skill: Skill | 'pruefung';
  unitId: string;
  teilId: string;
  teil: number;
  modus: Modus;
  benar: number;
  salah: number;
  offen: number;
  punkte: number;
  punkteMax: number;
  skalierung: number;
  dauer_sekunden: number;
}

export interface ItemLogRow {
  id?: number;
  datum: string;
  sesiId?: number;
  itemId: string;
  frageNr: number;
  teil: number;
  typ: ProtokollFrageTyp;
  themenfeld: string;
  skill: Skill | 'pruefung';
  richtig: boolean;
  offen: boolean;
  gegeben: string[];
  loesung: string[];
  stamm_de: string;
  stamm_id: string;
  explain_de: string;
  explain_id: string;
  evidence: string;
  teilTitel: string;
}

export interface FehlerRow extends SrsKarte {
  typ: ProtokollFrageTyp;
  themenfeld: string;
  stamm_de: string;
  stamm_id: string;
  explain_de: string;
  explain_id: string;
  evidence: string;
  loesung: string[];
  treffer: number;
  fehlversuche: number;
  zuletzt: string;
}

export interface WortRow {
  wort: string; // Primärschlüssel
  artikel: string;
  plural: string | null;
  wortart: string | null;
  bedeutung_id: string;
  bedeutung_de: string | null;
  beispiel: string | null;
  quelle: string; // z.B. "lesen-unit-01-teil3"
  tags: string[];
  gespeichert: string;
  sicher?: boolean; // vom Nutzer als "kann ich" markiert
}

export class B2DB extends Dexie {
  sesi!: Table<SesiRow, number>;
  item_log!: Table<ItemLogRow, number>;
  fehler!: Table<FehlerRow, string>;
  wortschatz!: Table<WortRow, string>;

  constructor() {
    super('b2trainer');
    this.version(1).stores({
      sesi: '++id, datum, skill, unitId, teilId, modus',
      item_log: '++id, datum, itemId, richtig, typ, themenfeld, sesiId',
      fehler: 'itemId, faellig, archiviert, typ, themenfeld, zuletzt',
      wortschatz: 'wort, quelle, gespeichert, tags'
    });
  }
}

let _db: B2DB | null = null;
export function db(): B2DB {
  if (!_db) _db = new B2DB();
  return _db;
}

export function verfuegbar(): boolean {
  return typeof indexedDB !== 'undefined';
}

const jetzt = () => new Date().toISOString();

export interface ItemMeta {
  itemId: string;
  frageNr: number;
  typ: ProtokollFrageTyp;
  themenfeld: string;
  stamm_de: string;
  stamm_id: string;
  explain_de: string;
  explain_id: string;
  evidence: string;
  teilTitel: string;
}

/**
 * Baut die Aufgabenprotokolle einer Session. Ausgelagert, weil die
 * TestDaF-Selbstkorrektur eine bereits gespeicherte Session aktualisiert und
 * dafür dieselben Zeilen erneut erzeugen muss.
 */
export function baueItemLogs(opts: {
  skill: Skill | 'pruefung';
  teilId: string;
  teil: number;
  sesiId: number;
  ergebnis: TeilErgebnis;
  meta: ItemMeta[];
}): ItemLogRow[] {
  const metaMap = new Map(opts.meta.map((m) => [m.frageNr, m]));
  return opts.ergebnis.items.map((item) => {
    const m = metaMap.get(item.frageNr);
    return {
      datum: jetzt(),
      sesiId: opts.sesiId,
      itemId: m?.itemId ?? opts.teilId,
      frageNr: item.frageNr,
      teil: opts.teil,
      typ: m?.typ ?? item.typ,
      themenfeld: m?.themenfeld ?? '',
      skill: opts.skill,
      richtig: item.richtig,
      offen: item.offen,
      gegeben: item.gegeben,
      loesung: item.loesung,
      stamm_de: m?.stamm_de ?? '',
      stamm_id: m?.stamm_id ?? '',
      explain_de: m?.explain_de ?? '',
      explain_id: m?.explain_id ?? '',
      evidence: m?.evidence ?? '',
      teilTitel: m?.teilTitel ?? ''
    };
  });
}

/** Speichert eine abgeschlossene Teil-Session + Item-Logs + aktualisiert das Fehlerheft. */
export async function speichereSesi(opts: {
  skill: Skill | 'pruefung';
  unitId: string;
  teilId: string;
  teil: number;
  modus: Modus;
  ergebnis: TeilErgebnis;
  dauerSekunden: number;
  meta: ItemMeta[];
}): Promise<number | null> {
  if (!verfuegbar()) return null;
  const { ergebnis } = opts;
  try {
    const d = db();
    const sesi: SesiRow = {
      datum: jetzt(),
      skill: opts.skill,
      unitId: opts.unitId,
      teilId: opts.teilId,
      teil: opts.teil,
      modus: opts.modus,
      benar: ergebnis.benar,
      salah: ergebnis.salah,
      offen: ergebnis.offen,
      punkte: ergebnis.punkte,
      punkteMax: ergebnis.punkteMax,
      skalierung: ergebnis.punkteMax ? Math.round((ergebnis.punkte / ergebnis.punkteMax) * 100) : 0,
      dauer_sekunden: Math.max(0, Math.round(opts.dauerSekunden))
    };
    const sesiId = await d.sesi.add(sesi);

    await d.item_log.bulkAdd(
      baueItemLogs({
        skill: opts.skill,
        teilId: opts.teilId,
        teil: opts.teil,
        sesiId,
        ergebnis: opts.ergebnis,
        meta: opts.meta
      })
    );
    await verbucheFehler(opts.ergebnis, opts.meta);
    return sesiId;
  } catch (e) {
    console.warn('B2-Trainer: Speichern fehlgeschlagen', e);
    return null;
  }
}

/**
 * Überschreibt eine bereits gespeicherte Session (nachträgliche Selbstkorrektur
 * offener TestDaF-Aufgaben). Session-Zeile und Item-Logs werden auf den neuen
 * Stand gebracht, damit die Statistik exakt die Zahlen zeigt, die auf dem
 * Ergebnisbildschirm stehen.
 *
 * Das Fehlerheft wird hier bewusst NICHT erneut gebucht: es kennt die Erst-
 * bewertung dieses Versuchs, und ein zweiter Durchlauf würde Treffer/Fehlversuche
 * doppelt zählen.
 */
export async function aktualisiereSesi(opts: {
  sesiId: number;
  skill: Skill | 'pruefung';
  unitId: string;
  teilId: string;
  teil: number;
  modus: Modus;
  ergebnis: TeilErgebnis;
  dauerSekunden: number;
  meta: ItemMeta[];
}): Promise<boolean> {
  if (!verfuegbar() || !Number.isFinite(opts.sesiId)) return false;
  const { ergebnis } = opts;
  try {
    const d = db();
    const vorhanden = await d.sesi.get(opts.sesiId);
    if (!vorhanden) return false;
    await d.sesi.update(opts.sesiId, {
      skill: opts.skill,
      unitId: opts.unitId,
      teilId: opts.teilId,
      teil: opts.teil,
      modus: opts.modus,
      benar: ergebnis.benar,
      salah: ergebnis.salah,
      offen: ergebnis.offen,
      punkte: ergebnis.punkte,
      punkteMax: ergebnis.punkteMax,
      skalierung: ergebnis.punkteMax ? Math.round((ergebnis.punkte / ergebnis.punkteMax) * 100) : 0,
      dauer_sekunden: Math.max(0, Math.round(opts.dauerSekunden))
    });
    await d.item_log.where('sesiId').equals(opts.sesiId).delete();
    await d.item_log.bulkAdd(
      baueItemLogs({
        skill: opts.skill,
        teilId: opts.teilId,
        teil: opts.teil,
        sesiId: opts.sesiId,
        ergebnis: opts.ergebnis,
        meta: opts.meta
      })
    );
    return true;
  } catch (e) {
    console.warn('B2-Trainer: Aktualisieren fehlgeschlagen', e);
    return false;
  }
}

/** Aktualisiert das Fehlerheft nach einer Session (SRS-Regeln aus srs.ts). */
export async function verbucheFehler(ergebnis: TeilErgebnis, meta: ItemMeta[]): Promise<void> {
  if (!verfuegbar()) return;
  const d = db();
  const metaMap = new Map(meta.map((m) => [m.frageNr, m]));
  for (const item of ergebnis.items) {
    const m = metaMap.get(item.frageNr);
    if (!m) continue;
    const key = `${m.itemId}#${m.frageNr}`;
    const vorhanden = await d.fehler.get(key);
    if (item.richtig && !vorhanden) continue; // richtig und nie falsch → kein Eintrag
    const karte: SrsKarte = vorhanden
      ? srsAntwort(vorhanden as SrsKarte, item.richtig)
      : srsAntwort(neueKarte(key), item.richtig);
    const row: FehlerRow = {
      ...karte,
      itemId: key,
      typ: m.typ,
      themenfeld: m.themenfeld,
      stamm_de: m.stamm_de,
      stamm_id: m.stamm_id,
      explain_de: m.explain_de,
      explain_id: m.explain_id,
      evidence: m.evidence,
      loesung: item.loesung,
      treffer: (vorhanden?.treffer ?? 0) + (item.richtig ? 1 : 0),
      fehlversuche: (vorhanden?.fehlversuche ?? 0) + (item.richtig ? 0 : 1),
      zuletzt: jetzt()
    };
    await d.fehler.put(row);
  }
}

export async function ladeFehler(): Promise<FehlerRow[]> {
  if (!verfuegbar()) return [];
  return db().fehler.toArray();
}

export async function markiereGelernt(itemId: string, gelernt = true): Promise<void> {
  if (!verfuegbar()) return;
  await db().fehler.update(itemId, { archiviert: gelernt, zuletzt: jetzt() });
}

export async function loescheFehler(itemId: string): Promise<void> {
  if (!verfuegbar()) return;
  await db().fehler.delete(itemId);
}

export async function ladeSesionen(): Promise<SesiRow[]> {
  if (!verfuegbar()) return [];
  return db().sesi.toArray();
}

export async function ladeLogs(): Promise<ItemLogRow[]> {
  if (!verfuegbar()) return [];
  return db().item_log.toArray();
}

export async function loescheAlles(): Promise<void> {
  if (!verfuegbar()) return;
  await db().delete();
  _db = null;
}

/* ---------------------------- Wortschatz ---------------------------- */

export async function speichereWort(row: Omit<WortRow, 'gespeichert'> & { gespeichert?: string }): Promise<void> {
  if (!verfuegbar()) return;
  await db().wortschatz.put({ gespeichert: jetzt(), ...row } as WortRow);
}

export async function ladeWortschatz(): Promise<WortRow[]> {
  if (!verfuegbar()) return [];
  return db().wortschatz.toArray();
}

export async function loescheWort(wort: string): Promise<void> {
  if (!verfuegbar()) return;
  await db().wortschatz.delete(wort);
}

/** CSV siap impor Anki (kolom Front;Back;Tags). */
export function wortschatzAlsCsv(rows: WortRow[]): string {
  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const kopf = ['#separator:Semicolon', '#html:false', 'Front;Back;Tags', ...rows.map((r) => {
    const front = [r.artikel, r.wort].filter(Boolean).join(' ');
    const plural = r.plural ? ` (Plural: ${r.plural})` : '';
    const back = [r.bedeutung_id, r.bedeutung_de ?? '', r.beispiel ? `Beispiel: ${r.beispiel}` : '']
      .filter(Boolean)
      .join(' — ');
    return [esc(front), esc(back + plural), esc(['B2-Trainer', ...(r.tags ?? [])].join(' '))].join(';');
  })];
  return kopf.join('\n') + '\n';
}

export function csvAlsWortschatz(csv: string, quelle = 'import'): WortRow[] {
  const zeilen = csv.split(/\r?\n/).filter((z) => z.trim() && !z.startsWith('#'));
  const rows: WortRow[] = [];
  for (const zeile of zeilen) {
    const zellen = zeile.split(';').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
    if (zellen[0]?.toLowerCase() === 'front') continue;
    const [front, back, tags] = zellen;
    if (!front) continue;
    const teile = front.split(' ');
    const artikel = ['der', 'die', 'das'].includes(teile[0]?.toLowerCase()) ? teile.shift()!.toLowerCase() : '';
    rows.push({
      wort: teile.join(' '),
      artikel,
      plural: null,
      wortart: null,
      bedeutung_id: back ?? '',
      bedeutung_de: null,
      beispiel: null,
      quelle,
      tags: (tags ?? '').split(/\s+/).filter(Boolean),
      gespeichert: jetzt()
    });
  }
  return rows;
}

/**
 * TestDaF-Modul — jembatan ke penyimpanan progres B2-Trainer.
 *
 * Modul TestDaF memakai tabel yang sama dengan modul Goethe B2 (sesi,
 * item_log, fehler di IndexedDB), supaya hasilnya langsung masuk ke halaman
 * Statistik, Fehlerheft, dan Ergebnis. Tanpa jembatan ini nilai TestDaF hanya
 * hidup di layar dan tidak pernah tercatat.
 *
 * Pemetaan:
 *   skill  → bereich der Aufgabe ('lesen' | 'hoeren')
 *   teil   → Aufgabennummer 1–3
 *   unitId → 'testdaf-mt01' (Präfix „testdaf“ wird in der Statistik als
 *            Modulkennzeichnung gelesen)
 */
import type { TestdafAufgabe } from '../data/testdaf';
import type { TestdafAufgabeErgebnis } from './testdaf-scoring';
import type { Modus, TeilErgebnis } from './scoring';
import { aktualisiereSesi, speichereSesi, verfuegbar, type ItemMeta } from './storage';

export const testdafUnitId = (a: TestdafAufgabe) => `testdaf-mt${String(a.modelltest).padStart(2, '0')}`;

export const testdafTeilId = (a: TestdafAufgabe) => `${a.id}`;

/** Metadaten je Item — dieselbe Form wie im B2-Modul (UnitRunner). */
export function testdafMeta(a: TestdafAufgabe): ItemMeta[] {
  const bereichLabel = a.bereich === 'lesen' ? 'Leseverstehen' : 'Hörverstehen';
  return a.fragen.map((f) => ({
    itemId: `${a.id}-f${f.nr}`,
    frageNr: f.nr,
    typ: f.typ,
    themenfeld: a.themenfeld,
    stamm_de: f.stamm_de,
    stamm_id: f.stamm_id,
    explain_de: f.explain_de,
    explain_id: f.explain_id,
    evidence: f.evidence,
    teilTitel: `${bereichLabel} Aufgabe ${a.aufgabe} — ${a.titel}`
  }));
}

/** TestDaF-Ergebnis in die Form bringen, die die Speicherschicht erwartet. */
export function alsTeilErgebnis(e: TestdafAufgabeErgebnis): TeilErgebnis {
  return {
    teilId: e.aufgabeId,
    skill: e.bereich,
    teil: e.aufgabe,
    benar: e.benar,
    salah: e.salah,
    offen: e.offen,
    punkte: e.punkte,
    punkteMax: e.punkteMax,
    antworten: e.antworten,
    items: e.items.map((i) => ({
      frageNr: i.nr,
      richtig: i.richtig,
      offen: i.offen,
      gegeben: i.gegeben,
      loesung: i.loesung,
      typ: i.typ
    }))
  };
}

export interface TestdafSpeicherOptionen {
  modus: Modus;
  dauerSekunden: number;
}

/**
 * Legt für eine abgeschlossene TestDaF-Aufgabe eine Sitzung an.
 * @returns Sitzungs-ID (für spätere Aktualisierungen) oder null bei Fehler
 */
export async function speichereTestdafErgebnis(
  aufgabe: TestdafAufgabe,
  ergebnis: TestdafAufgabeErgebnis,
  opt: TestdafSpeicherOptionen
): Promise<number | null> {
  if (!verfuegbar()) return null;
  return speichereSesi({
    skill: aufgabe.bereich,
    unitId: testdafUnitId(aufgabe),
    teilId: testdafTeilId(aufgabe),
    teil: aufgabe.aufgabe,
    modus: opt.modus,
    ergebnis: alsTeilErgebnis(ergebnis),
    dauerSekunden: opt.dauerSekunden,
    meta: testdafMeta(aufgabe)
  });
}

/**
 * Nach der Selbstkorrektur offener Antworten: dieselbe Sitzung überschreiben,
 * damit die Statistik dieselben Zahlen zeigt wie der Ergebnisbildschirm.
 */
export async function aktualisiereTestdafErgebnis(
  sesiId: number,
  aufgabe: TestdafAufgabe,
  ergebnis: TestdafAufgabeErgebnis,
  opt: TestdafSpeicherOptionen
): Promise<boolean> {
  return aktualisiereSesi({
    sesiId,
    skill: aufgabe.bereich,
    unitId: testdafUnitId(aufgabe),
    teilId: testdafTeilId(aufgabe),
    teil: aufgabe.aufgabe,
    modus: opt.modus,
    ergebnis: alsTeilErgebnis(ergebnis),
    dauerSekunden: opt.dauerSekunden,
    meta: testdafMeta(aufgabe)
  });
}

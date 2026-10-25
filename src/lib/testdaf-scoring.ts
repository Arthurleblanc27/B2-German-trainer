/**
 * TestDaF-Modul — mesin penilaian (pure, tanpa DOM).
 *
 * Geschlossene Aufgaben (zuordnung, mc3, jn3, richtigfalsch) werden exakt bewertet.
 * Offene Aufgaben (kurzantwort, Hörverstehen 1 und 3 im echten TestDaF) werden
 * automatisch vorbewertet: Musterlösungen + Schlüsselwortgruppen. Weil TestDaF
 * hier auch sinngemäße Antworten akzeptiert, kann der Lernende jedes Item nach
 * Einsicht der Musterlösung selbst korrigieren (`selbstkorrektur`).
 */
import type { TestdafAufgabe, TestdafFrage } from '../data/testdaf';
import { tdnFuerProzent } from '../data/testdaf';

export type Modus = 'uebung' | 'pruefung';

export interface TestdafItemAuswertung {
  nr: number;
  typ: TestdafFrage['typ'];
  punkte: number;
  erreicht: number;
  richtig: boolean;
  offen: boolean;
  /** automatische Vorbewertung, bevor eine Selbstkorrektur greift */
  auto: boolean;
  /** true, wenn der Lernende das Item selbst bewertet hat */
  selbst: boolean;
  gegeben: string[];
  loesung: string[];
  musterloesungen: string[];
  schluessel: string[][];
  hinweis: string;
  halbautomatisch: boolean;
}

export interface TestdafAufgabeErgebnis {
  aufgabeId: string;
  bereich: 'lesen' | 'hoeren';
  aufgabe: number;
  items: TestdafItemAuswertung[];
  punkte: number;
  punkteMax: number;
  benar: number;
  salah: number;
  offen: number;
  prozent: number;
  tdn: number;
  antworten: Record<number, string[]>;
}

export const normAntwort = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[„“”»«"']/g, '')
    .replace(/[.,;:!?()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function gleich(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].map((s) => s.trim().toLowerCase()).sort();
  const y = [...b].map((s) => s.trim().toLowerCase()).sort();
  return x.every((v, i) => v === y[i]);
}

function stammform(w: string): string {
  let s = normAntwort(w);
  // sehr grobe deutsche Flexionsreduktion — bewusst konservativ, damit nicht
  // versehentlich falsche Antworten als richtig gelten.
  s = s.replace(/(ung|ungen|keit|heiten|heit|lich|isch|enden|ende|end|est|ete|ten|tet|en|er|es|em|e|n|s|t)$/, '');
  return s.length >= 4 ? s : normAntwort(w);
}

/** Wortstamm-Prüfung: kommt irgendein Wort der Antwort im Zieltext vor? */
function enthaelt(g: string, ziel: string): boolean {
  const z = normAntwort(ziel);
  if (!z) return false;
  if (g.includes(z)) return true;
  if (z.length >= 6) {
    const sto = stammform(z);
    return sto.length >= 4 && g.split(' ').some((w) => stammform(w) === sto);
  }
  return false;
}

/**
 * Offene Antwort bewerten.
 * 1. Vollvergleich mit einer Musterlösung (normalisiert, Richtung beliebig).
 * 2. Alle Schlüsselwortgruppen müssen erfüllt sein (je Gruppe genügt ein Synonym).
 */
export function kurzantwortRichtig(gegeben: string, frage: TestdafFrage): boolean {
  const g = normAntwort(gegeben);
  if (!g) return false;
  for (const l of frage.loesung) {
    const n = normAntwort(l);
    if (!n) continue;
    if (g === n) return true;
    if (n.length >= 6 && g.includes(n)) return true;
    if (g.length >= 6 && n.includes(g)) return true;
  }
  if (frage.schluessel.length === 0) return false;
  return frage.schluessel.every((gruppe) => gruppe.some((syn) => enthaelt(g, syn)));
}

export interface ScoreOptionen {
  /** pro Item: true = vom Lernenden als richtig markiert, false = als falsch */
  selbstkorrektur?: Record<number, boolean>;
}

export function scoreTestdafAufgabe(
  aufgabe: TestdafAufgabe,
  antworten: Record<number, string[]>,
  opt: ScoreOptionen = {}
): TestdafAufgabeErgebnis {
  const items: TestdafItemAuswertung[] = [];
  let punkte = 0;
  let punkteMax = 0;
  let benar = 0;
  let salah = 0;
  let offen = 0;

  for (const frage of aufgabe.fragen) {
    const gewicht = frage.punkte ?? 1;
    punkteMax += gewicht;
    const gegeben = (antworten?.[frage.nr] ?? []).filter((s) => s.trim() !== '');
    const istOffen = gegeben.length === 0;
    const halbautomatisch = frage.typ === 'kurzantwort';
    let auto = false;
    if (!istOffen) {
      auto =
        frage.typ === 'kurzantwort'
          ? kurzantwortRichtig(gegeben.join(' '), frage)
          : gleich(gegeben, frage.loesung);
    }
    const override = opt.selbstkorrektur?.[frage.nr];
    const selbst = typeof override === 'boolean' && halbautomatisch && !istOffen;
    const richtig = selbst ? override === true : auto;

    let hinweis = '';
    if (halbautomatisch && !istOffen) {
      if (selbst) hinweis = richtig ? 'selbst als richtig bewertet' : 'selbst als falsch bewertet';
      else hinweis = auto ? 'automatisch erkannt (Musterlösung/Schlüsselwörter)' : 'automatisch nicht erkannt — bitte Musterlösung prüfen';
    }

    if (istOffen) offen += 1;
    else if (richtig) {
      benar += 1;
      punkte += gewicht;
    } else salah += 1;

    items.push({
      nr: frage.nr,
      typ: frage.typ,
      punkte: gewicht,
      erreicht: !istOffen && richtig ? gewicht : 0,
      richtig,
      offen: istOffen,
      auto,
      selbst,
      gegeben,
      loesung: frage.loesung,
      musterloesungen: frage.loesung,
      schluessel: frage.schluessel,
      hinweis,
      halbautomatisch
    });
  }

  const prozent = punkteMax === 0 ? 0 : Math.round((punkte / punkteMax) * 100);
  return {
    aufgabeId: aufgabe.id,
    bereich: aufgabe.bereich,
    aufgabe: aufgabe.aufgabe,
    items,
    punkte,
    punkteMax,
    benar,
    salah,
    offen,
    prozent,
    tdn: tdnFuerProzent(prozent),
    antworten: { ...antworten }
  };
}

export interface TestdafBereichErgebnis {
  bereich: 'lesen' | 'hoeren';
  punktzahl: number;
  punkteMax: number;
  prozent: number;
  tdn: number;
  benar: number;
  salah: number;
  offen: number;
  aufgabenFertig: number;
}

/** Gesamtergebnis eines Prüfungsteils (3 Aufgaben → TDN). */
export function scoreTestdafBereich(
  ergebnisse: TestdafAufgabeErgebnis[],
  bereich: 'lesen' | 'hoeren'
): TestdafBereichErgebnis {
  const rel = ergebnisse.filter((e) => e.bereich === bereich);
  const punktzahl = rel.reduce((s, e) => s + e.punkte, 0);
  const punkteMax = rel.reduce((s, e) => s + e.punkteMax, 0);
  const prozent = punkteMax === 0 ? 0 : Math.round((punktzahl / punkteMax) * 100);
  return {
    bereich,
    punktzahl,
    punkteMax,
    prozent,
    tdn: tdnFuerProzent(prozent),
    benar: rel.reduce((s, e) => s + e.benar, 0),
    salah: rel.reduce((s, e) => s + e.salah, 0),
    offen: rel.reduce((s, e) => s + e.offen, 0),
    aufgabenFertig: rel.length
  };
}

export function musterloesungText(frage: TestdafFrage): string {
  return frage.loesung.join(' · ');
}

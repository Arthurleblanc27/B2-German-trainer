#!/usr/bin/env node
/**
 * TestDaF-Modul — Validator bank soal TestDaF (tanpa dependensi).
 *
 *   node scripts/validate-testdaf.mjs                 # Standardprüfung
 *   node scripts/validate-testdaf.mjs --strict        # Audio muss produziert sein
 *   node scripts/validate-testdaf.mjs --dir <pfad>    # anderer Bank-Ordner
 *
 * Prüft jede Datei in src/content-testdaf/ gegen die TestDaF-Formatregeln
 * (Itemzahlen, Itemtypen, Zeiten, TDN, Lösungsschlüssel, wörtliche Belege,
 * Lizenz, Audio, Glossar). Exit 1 bei Fehlern — als prebuild-Schritt nutzbar.
 *
 * Wenn zod + die TypeScript-Schemadatei auffindbar sind (also nach der
 * Integration in b2-trainer), wird zusätzlich gegen src/data/testdaf.ts
 * gegengeprüft. Weichen die beiden Prüfungen voneinander ab, wird das als
 * Fehler gemeldet — so kann die JS-Regel nicht still von der Zod-Wahrheit
 * abdriften.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BEREICHE, FRAGETYPEN as FRAgetypen, LIZENZEN } from './spec.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const STRICT = process.argv.includes('--strict');
const dirArgIdx = process.argv.indexOf('--dir');
const fileArgIdx = process.argv.indexOf('--file');
const PROJEKT = path.resolve(HIER, '..');

/* Format-Tabelle, Lizenz-Whitelist und Itemtypen kommen aus scripts/spec.mjs —
   eine Quelle für alle Werkzeuge. Die App nutzt src/data/testdaf.ts; die
   Gegenprüfung weiter unten (zodGegenprobe) stellt sicher, dass beide passen. */

function bankOrdner() {
  if (dirArgIdx > -1 && process.argv[dirArgIdx + 1]) return path.resolve(process.argv[dirArgIdx + 1]);
  const kandidaten = [path.join(PROJEKT, 'src/content-testdaf'), path.join(PROJEKT, 'content-testdaf')];
  for (const k of kandidaten) if (existsSync(k)) return k;
  return kandidaten[0];
}

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[„“”»«"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const woerter = (s) => String(s).split(/\s+/).filter((w) => /[a-zA-ZäöüÄÖÜß]/.test(w)).length;
const isStr = (v, min = 1) => typeof v === 'string' && v.trim().length >= min;

function spez(bereich, aufgabe) {
  return (BEREICHE[bereich] ?? []).find((s) => s.aufgabe === Number(aufgabe));
}

/** Alle Regeln für eine Aufgabe. Gibt {errors:[], warnings:[]} zurück. */
function pruefeAufgabe(a) {
  const E = [];
  const W = [];
  const e = (code, msg) => E.push({ code, msg });
  const w = (code, msg) => W.push({ code, msg });

  for (const feld of [
    'id',
    'bereich',
    'level',
    'themenfeld',
    'titel',
    'titel_id',
    'instruktion_de',
    'instruktion_id',
    'source_type',
    'lizenz',
    'attribution',
    'material_typ'
  ]) {
    if (!isStr(a[feld], 2)) e('feld', `Feld "${feld}" fehlt oder ist leer`);
  }
  if (a.schemaVersion !== 2) e('schemaversion', `schemaVersion muss 2 sein (ist ${JSON.stringify(a.schemaVersion)})`);
  if (a.format !== 'testdaf') e('format', 'format muss "testdaf" sein');
  if (!BEREICHE[a.bereich]) e('bereich', `bereich "${a.bereich}" unbekannt (erwartet lesen|hoeren)`);
  if (!Number.isInteger(a.modelltest) || a.modelltest < 1) e('modelltest', 'modelltest muss eine positive Ganzzahl sein');
  const spec = spez(a.bereich, a.aufgabe);
  if (!spec) {
    e('aufgabe', `aufgabe ${a.aufgabe} existiert für ${a.bereich} nicht`);
    return { errors: E, warnings: W };
  }
  if (!Array.isArray(a.fragen)) {
    e('fragen', 'fragen muss ein Array sein');
    return { errors: E, warnings: W };
  }

  // --- Struktur -------------------------------------------------------
  if (a.fragen.length !== spec.items) {
    e('item-count', `${a.bereich} Aufgabe ${a.aufgabe}: ${a.fragen.length} Items statt ${spec.items}`);
  }
  if (a.zeit_minuten !== spec.minuten) w('zeit', `zeit_minuten ${a.zeit_minuten} ≠ Tabelle ${spec.minuten}`);
  if (a.tdn !== spec.tdn) e('tdn', `tdn ${a.tdn} ≠ Tabelle ${spec.tdn}`);
  const summe = a.fragen.reduce((s, f) => s + (f.punkte ?? 1), 0);
  if (a.punkte_max !== summe) e('punkte-max', `punkte_max ${a.punkte_max} ≠ Summe der Punkte ${summe}`);
  a.fragen.forEach((f, i) => {
    if (f.nr !== i + 1) e('nr-folge', `Aufgaben müssen lückenlos 1..${a.fragen.length} sein (Position ${i + 1} hat nr=${f.nr})`);
  });
  const praefix = `testdaf-mt${String(a.modelltest).padStart(2, '0')}-`;
  if (isStr(a.id) && !a.id.startsWith(praefix)) e('id-prefix', `id "${a.id}" muss mit "${praefix}" beginnen`);

  // --- Lizenz ---------------------------------------------------------
  if (!LIZENZEN.includes(a.lizenz)) e('lizenz', `lizenz "${a.lizenz}" nicht in der Whitelist (${LIZENZEN.join(', ')})`);
  if (a.source_type !== 'own' && !isStr(a.attribution, 3)) e('attribution', 'attribution ist für source_type != "own" Pflicht');
  if (isStr(a.attribution) && /mit erfolg|klett/i.test(a.attribution)) {
    e('fremdquelle', 'attribution darf kein Fremdwerk als Quelle der Items nennen');
  }
  if (isStr(a.attribution) && !/testdaf|eigener text/i.test(a.attribution)) {
    w('attribution-format', 'attribution sollte auf eigenes Material + TestDaF-Format hinweisen');
  }

  // --- Material -------------------------------------------------------
  const texte = Array.isArray(a.texte) ? a.texte : [];
  const optionen = Array.isArray(a.antwort_optionen) ? a.antwort_optionen : [];
  if (a.bereich === 'lesen' && a.aufgabe === 1) {
    if (a.material_typ !== 'kurztexte') e('material', 'material_typ muss "kurztexte" sein');
    if (texte.length !== 8) e('kurztexte', `${texte.length} Kurztexte statt 8`);
    const soll = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    if (texte.map((t) => t.key).join(',') !== soll.join(',')) {
      e('kurztext-keys', `Kurztext-Schlüssel müssen a–h sein (ist: ${texte.map((t) => t.key).join(',')})`);
    }
    if (optionen.length !== 9) e('antwort-optionen', `${optionen.length} Antwortoptionen statt 9 (A–H + I)`);
    else if (optionen[8]?.key?.toLowerCase() !== 'i') w('antwort-optionen-i', 'die neunte Option sollte den Schlüssel "i" haben');
    const wc = texte.reduce((s, t) => s + woerter(t.inhalt ?? ''), 0);
    if (wc < 280 || wc > 620) w('wortzahl', `8 Kurztexte: ${wc} Wörter (Richtwert 300–450 + Titel)`);
  }
  if (a.bereich === 'lesen' && a.aufgabe > 1) {
    if (a.material_typ !== 'langtext') e('material', 'material_typ muss "langtext" sein');
    if (texte.length !== 1) e('langtext', `${texte.length} Texte statt 1`);
    if (optionen.length !== 0) e('antwort-optionen', 'antwort_optionen ist hier nicht erlaubt (Optionen stehen am Item)');
    const wc = texte.length ? woerter(texte[0].inhalt ?? '') : 0;
    if (a.aufgabe === 2 && (wc < 400 || wc > 600)) w('wortzahl', `Aufgabe 2: ${wc} Wörter (Richtwert 450–550)`);
    if (a.aufgabe === 3 && (wc < 500 || wc > 700)) w('wortzahl', `Aufgabe 3: ${wc} Wörter (Richtwert 550–600)`);
  }
  if (a.bereich === 'hoeren') {
    if (a.material_typ !== 'keins') e('material', 'material_typ muss "keins" sein');
    if (texte.length !== 0) e('texte', 'Hören-Aufgaben dürfen keine texte haben');
    if (optionen.length !== 0) e('antwort-optionen', 'Hören-Aufgaben dürfen keine antwort_optionen haben');
  }

  // --- Audio ----------------------------------------------------------
  if (a.bereich === 'hoeren') {
    const au = a.audio;
    if (!au || typeof au !== 'object') e('audio', 'audio-Objekt fehlt');
    else {
      if (!isStr(au.src, 4)) e('audio-src', 'audio.src fehlt');
      if (!isStr(au.transcript, 40)) e('transcript', 'Transkript fehlt oder ist zu kurz');
      if (spec.playLimit && au.play_limit_pruefung !== spec.playLimit) {
        e('play-limit', `play_limit_pruefung ${au.play_limit_pruefung} ≠ Tabelle ${spec.playLimit}`);
      }
      if (typeof au.dauer_sekunden !== 'number') e('dauer', 'dauer_sekunden muss eine Zahl sein');
      else if (au.dauer_sekunden <= 0) {
        if (STRICT) e('audio-todo', 'dauer_sekunden = 0 — Audio noch nicht produziert (STRICT)');
        else w('audio-todo', 'dauer_sekunden = 0 — Audio noch nicht produziert');
      } else if (isStr(au.src)) {
        const datei = path.join(PROJEKT, 'public', au.src.replace(/^\//, ''));
        if (!existsSync(datei)) e('audio-datei', `Audiodatei fehlt: ${path.relative(PROJEKT, datei)}`);
      }
      const wc = woerter(au.transcript ?? '');
      const [min, max] = spec.woerter ?? [0, 9999];
      if (wc < min || wc > max) w('wortzahl', `Transkript: ${wc} Wörter (Richtwert ${min}–${max})`);
      if (!/\[[^\]]+\]/.test(au.transcript ?? '')) {
        w('sprecher-format', 'Transkript sollte Sprechermarken in eckigen Klammern enthalten, z. B. [Moderatorin]');
      }
      if (!Array.isArray(au.wort_timestamps) || au.wort_timestamps.length === 0) {
        w('timestamps', 'wort_timestamps leer');
      }
    }
  } else if (a.audio !== null && a.audio !== undefined) {
    e('audio-lesen', 'Lesen-Aufgaben dürfen kein audio haben (null setzen)');
  }

  // --- Items ----------------------------------------------------------
  const quelltext = norm(
    [
      ...texte.map((t) => `${t.titel ?? ''} ${t.inhalt ?? ''}`),
      a.audio?.transcript ?? '',
      ...optionen.map((o) => o.text ?? '')
    ].join('\n')
  );

  const gemischteTypen = new Set();
  for (const f of a.fragen) {
    if (!Number.isInteger(f.nr)) e('nr', 'fragen[].nr fehlt');
    if (!FRAgetypen.includes(f.typ)) e('typ', `Aufgabe ${f.nr}: unbekannter typ "${f.typ}"`);
    else if (f.typ !== spec.typ) e('typ', `Aufgabe ${f.nr}: typ "${f.typ}" ≠ Solltyp "${spec.typ}"`);
    gemischteTypen.add(f.typ);
    if (!isStr(f.stamm_de, 3)) e('stamm_de', `Aufgabe ${f.nr}: stamm_de fehlt`);
    if (!isStr(f.stamm_id, 3)) e('stamm_id', `Aufgabe ${f.nr}: stamm_id fehlt`);
    if (!isStr(f.explain_de, 3)) e('explain_de', `Aufgabe ${f.nr}: explain_de fehlt`);
    if (!isStr(f.explain_id, 3)) e('explain_id', `Aufgabe ${f.nr}: explain_id fehlt`);
    if (!Array.isArray(f.loesung) || f.loesung.length === 0) e('loesung', `Aufgabe ${f.nr}: loesung fehlt`);

    const keys = new Set([
      ...(Array.isArray(f.optionen) ? f.optionen.map((o) => o.key) : []),
      ...optionen.map((o) => o.key)
    ]);
    if (f.typ === 'richtigfalsch') ['richtig', 'falsch'].forEach((k) => keys.add(k));
    if (f.typ === 'jn3') ['ja', 'nein', 'nichts'].forEach((k) => keys.add(k));

    if (f.typ !== 'kurzantwort' && Array.isArray(f.loesung)) {
      for (const l of f.loesung) {
        if (!keys.has(l)) e('loesung-key', `Aufgabe ${f.nr}: Lösung "${l}" verweist auf keine Option (${[...keys].join(', ') || 'keine'})`);
      }
    }
    if (f.typ === 'mc3') {
      if (!Array.isArray(f.optionen) || f.optionen.length !== 3) {
        e('mc3-optionen', `Aufgabe ${f.nr}: genau 3 Optionen A/B/C nötig (ist ${(f.optionen ?? []).length})`);
      }
    }
    if (f.typ === 'richtigfalsch') {
      for (const l of f.loesung ?? []) if (!['richtig', 'falsch'].includes(l)) e('rf-loesung', `Aufgabe ${f.nr}: "${l}" ist nicht richtig/falsch`);
    }
    if (f.typ === 'jn3') {
      for (const l of f.loesung ?? []) if (!['ja', 'nein', 'nichts'].includes(l)) e('jn3-loesung', `Aufgabe ${f.nr}: "${l}" ist nicht ja/nein/nichts`);
    }
    if (f.typ === 'kurzantwort') {
      if (!Array.isArray(f.schluessel) || f.schluessel.length === 0) {
        e('kurz-schluessel', `Aufgabe ${f.nr}: kurzantwort braucht mindestens eine Schlüsselgruppe`);
      } else {
        for (const g of f.schluessel) {
          if (!Array.isArray(g) || g.length === 0 || g.some((x) => !isStr(x, 2))) {
            e('kurz-schluessel', `Aufgabe ${f.nr}: Schlüsselgruppe leer oder mit leerem Begriff`);
          }
        }
      }
      for (const l of f.loesung ?? []) {
        if (woerter(l) > 14) w('kurz-loesung-lang', `Aufgabe ${f.nr}: Musterlösung sehr lang ("${String(l).slice(0, 40)}…")`);
      }
    }
    if (isStr(f.evidence, 3)) {
      if (!quelltext.includes(norm(f.evidence))) {
        e('evidence', `Aufgabe ${f.nr}: evidence ist kein wörtliches Zitat: "${String(f.evidence).slice(0, 70)}…"`);
      }
    } else {
      e('evidence', `Aufgabe ${f.nr}: evidence fehlt`);
    }
  }

  // --- Verteilung -----------------------------------------------------
  if (gemischteTypen.size > 1) w('typ-gemischt', `gemischte Itemtypen: ${[...gemischteTypen].join(', ')}`);
  if (spec.typ === 'jn3') {
    for (const [k, label] of [['ja', 'Ja'], ['nein', 'Nein'], ['nichts', 'Text sagt dazu nichts']]) {
      const n = a.fragen.filter((f) => (f.loesung ?? []).includes(k)).length;
      if (n === 0) w('jn3-verteilung', `keine Lösung "${label}"`);
      if (n > 5) w('jn3-verteilung', `${n}× Lösung "${label}" — einseitig`);
    }
  }
  if (spec.typ === 'richtigfalsch') {
    const falsch = a.fragen.filter((f) => (f.loesung ?? []).includes('falsch')).length;
    if (a.fragen.length && falsch / a.fragen.length < 0.3) w('rf-quote', `nur ${falsch}/${a.fragen.length} "Falsch" (Rubrik ≥30 %)`);
  }
  if (spec.typ === 'zuordnung') {
    const verwendet = new Set(a.fragen.flatMap((f) => f.loesung ?? []));
    if (verwendet.size < 6) w('zuordnung-vielfalt', `nur ${verwendet.size} verschiedene Lösungsbuchstaben`);
    if (a.fragen.length && a.fragen.every((f) => (f.loesung ?? [])[0] === (a.fragen[0].loesung ?? [])[0])) {
      w('zuordnung-einseitig', 'alle Items haben dieselbe Lösung');
    }
  }
  let streak = 1;
  for (let i = 1; i < a.fragen.length; i++) {
    const x = (a.fragen[i].loesung ?? []).join('+');
    const y = (a.fragen[i - 1].loesung ?? []).join('+');
    streak = x === y ? streak + 1 : 1;
    if (streak > 3) {
      w('loesungs-kette', `mehr als 3 gleich lautende Lösungen hintereinander (ab Aufgabe ${i + 1})`);
      break;
    }
  }
  if (!Array.isArray(a.glossar) || a.glossar.length < 8) {
    w('glossar', `glossar hat ${(a.glossar ?? []).length} Einträge (Rubrik ≥8)`);
  } else {
    for (const g of a.glossar) {
      if (!isStr(g.wort)) e('glossar-wort', 'glossar[].wort fehlt');
      if (!isStr(g.bedeutung_id)) e('glossar-bedeutung', `glossar "${g.wort}": bedeutung_id fehlt`);
      if (!['der', 'die', 'das', ''].includes(g.artikel ?? '')) e('glossar-artikel', `glossar "${g.wort}": artikel "${g.artikel}"`);
    }
  }
  if (!Array.isArray(a.tags) || a.tags.length < 2) w('tags', 'tags sollte mindestens 2 Einträge haben');
  if (!isStr(a.beschreibung_id, 10)) w('beschreibung_id', 'beschreibung_id fehlt (wird auf der Übersicht angezeigt)');

  return { errors: E, warnings: W };
}

function pruefePruefung(p, ids, aufgaben) {
  const E = [];
  const W = [];
  if (p.schemaVersion !== 2) E.push({ code: 'schemaversion', msg: 'schemaVersion muss 2 sein' });
  if (p.format !== 'testdaf') E.push({ code: 'format', msg: 'format muss "testdaf" sein' });
  for (const feld of ['id', 'titel', 'titel_id']) {
    if (!isStr(p[feld], 3)) E.push({ code: 'feld', msg: `Feld "${feld}" fehlt` });
  }
  if (!Array.isArray(p.aufgaben) || p.aufgaben.length !== 6) {
    E.push({ code: 'aufgaben-anzahl', msg: `genau 6 Aufgaben-ids nötig (ist ${(p.aufgaben ?? []).length})` });
  } else {
    for (const id of p.aufgaben) {
      if (!ids.has(id)) E.push({ code: 'verweis', msg: `Aufgabe "${id}" existiert nicht` });
    }
    const rel = p.aufgaben.map((id) => aufgaben.get(id)).filter(Boolean);
    const l = rel.filter((a) => a.bereich === 'lesen').length;
    const h = rel.filter((a) => a.bereich === 'hoeren').length;
    if (l !== 3 || h !== 3) E.push({ code: 'verteilung', msg: `3 Lesen + 3 Hören nötig (ist ${l} + ${h})` });
    const itemL = rel.filter((a) => a.bereich === 'lesen').reduce((s, a) => s + a.fragen.length, 0);
    const itemH = rel.filter((a) => a.bereich === 'hoeren').reduce((s, a) => s + a.fragen.length, 0);
    if (itemL !== 30) E.push({ code: 'items-lesen', msg: `Leseverstehen: ${itemL} Items statt 30` });
    if (itemH !== 25) E.push({ code: 'items-hoeren', msg: `Hörverstehen: ${itemH} Items statt 25` });
    const mt = new Set(rel.map((a) => a.modelltest));
    if (mt.size !== 1 || [...mt][0] !== p.modelltest) E.push({ code: 'modelltest', msg: 'Aufgaben gehören nicht alle zu diesem modelltest' });
  }
  return { errors: E, warnings: W };
}

/** Gegenprüfung gegen die Zod-Wahrheit, falls zod + TS-Modul erreichbar sind. */
async function zodGegenprobe(data, rel) {
  try {
    const kandidaten = [
      path.join(PROJEKT, 'src/data/testdaf.ts'),
      path.join(PROJEKT, '..', 'b2-trainer', 'src/data/testdaf.ts'),
      path.join(PROJEKT, 'b2-trainer', 'src/data/testdaf.ts')
    ];
    const modPath = kandidaten.find((k) => existsSync(k));
    if (!modPath) return null;
    const mod = await import(pathToFileURL(modPath).href);
    const aufgabe = data.aufgaben ? null : mod.TestdafAufgabeSchema.safeParse(data);
    if (aufgabe && !aufgabe.success) {
      return aufgabe.error.issues.map((i) => ({ code: 'zod', msg: `${i.path.join('.') || '(root)'}: ${i.message}` }));
    }
    if (aufgabe && aufgabe.success) {
      return mod
        .validateTestdafAufgabe(aufgabe.data, { strict: STRICT })
        .filter((i) => i.level === 'error')
        .map((i) => ({ code: `zod-${i.code}`, msg: i.message }));
    }
    return null;
  } catch {
    return null;
  }
}

const BANK = bankOrdner();
let dateien = walk(BANK);

/* --file <teilstring>: nur passende Datei(prüfen). Für Autoren im Batch:
   ein Kind prüft damit SEINE Datei, ohne dass halbfertige Geschwisterdateien
   als Fehler auftauchen. Verweise einer Prüfungsdatei auf noch fehlende
   Aufgaben werden dabei bewusst nicht geprüft. */
let gefiltert = false;
if (fileArgIdx > -1 && process.argv[fileArgIdx + 1]) {
  const muster = process.argv[fileArgIdx + 1].toLowerCase();
  const vorher = dateien.length;
  dateien = dateien.filter((f) => path.relative(BANK, f).replace(/\\/g, '/').toLowerCase().includes(muster));
  gefiltert = true;
  if (dateien.length === 0) {
    console.log(c.red(`\n  ✗ Keine Datei passt auf --file "${process.argv[fileArgIdx + 1]}" (${vorher} Dateien im Bank).\n`));
    process.exit(1);
  }
}

console.log(c.bold('\nTestDaF-Modul — Validierung des Aufgabenbank'));
console.log(c.dim(`  Ordner: ${path.relative(process.cwd(), BANK) || BANK}`));
console.log(
  c.dim(
    `  ${dateien.length} von ${gefiltert ? walk(BANK).length : dateien.length} Datei(en) · ${
      STRICT ? 'STRICT (Audio Pflicht)' : 'Standard'
    }${gefiltert ? ' · Teillauf (--file)' : ''}`
  )
);
console.log('');

if (dateien.length === 0) {
  console.log(c.yellow('  ⚠  Keine JSON-Dateien gefunden — Bank noch leer.'));
  console.log(c.dim('     Erwartet: src/content-testdaf/mt<NN>/<bereich>-aufgabe-0N.json\n'));
  process.exit(STRICT ? 1 : 0);
}

let fehler = 0;
let warnungen = 0;
const details = [];
const ids = new Map();
const aufgaben = new Map();
const roh = new Map();

for (const datei of dateien) {
  const rel = path.relative(BANK, datei).replace(/\\/g, '/');
  let data = null;
  const E = [];
  const W = [];
  try {
    data = JSON.parse(readFileSync(datei, 'utf8'));
  } catch (err) {
    E.push({ code: 'json', msg: `JSON nicht lesbar: ${err.message}` });
  }
  roh.set(rel, data);

  if (data) {
    if (Array.isArray(data.aufgaben)) {
      // Prüfungsdatei — wird nach den Aufgaben geprüft
      aufgaben.set(`__pruefung__${rel}`, data);
    } else {
      const r = pruefeAufgabe(data);
      E.push(...r.errors);
      W.push(...r.warnings);
      if (isStr(data.id)) {
        if (ids.has(data.id)) E.push({ code: 'id-duplikat', msg: `id "${data.id}" bereits in ${ids.get(data.id)}` });
        else ids.set(data.id, rel);
        aufgaben.set(data.id, data);
      }
    }
  }

  const gegen = data && !Array.isArray(data.aufgaben) ? await zodGegenprobe(data, rel) : null;
  if (gegen && gegen.length) {
    // Zod meldet, was die JS-Prüfung nicht sieht: das ist ein Fehler (Divergenz).
    for (const g of gegen) E.push({ code: `divergenz:${g.code}`, msg: g.msg });
  }

  fehler += E.length;
  warnungen += W.length;
  details.push({ rel, E, W });
}

// Prüfungsdateien (nach der id-Registrierung, damit Verweise auflösbar sind)
for (const [key, p] of aufgaben) {
  if (!key.startsWith('__pruefung__')) continue;
  const rel = key.replace('__pruefung__', '');
  const r = pruefePruefung(p, ids, aufgaben);
  const d = details.find((x) => x.rel === rel);
  if (d) {
    d.E.push(...r.errors);
    d.W.push(...r.warnings);
    fehler += r.errors.length;
    warnungen += r.warnings.length;
  }
}

const pad = (s, n) => String(s).padEnd(n);
for (const d of details) {
  const status = d.E.length ? c.red(`✗ ${d.E.length} error`) : c.green('✓ OK');
  const w = d.W.length ? c.yellow(` (${d.W.length} warning)`) : '';
  console.log(`  ${status}  ${pad(d.rel, 46)}${w}`);
}

if (details.some((d) => d.E.length || d.W.length)) {
  console.log('');
  for (const d of details) {
    if (!d.E.length && !d.W.length) continue;
    console.log(c.bold(`  ${d.rel}`));
    for (const x of d.E) console.log(`    ${c.red('ERROR  ')} [${x.code}] ${x.msg}`);
    for (const x of d.W) console.log(`    ${c.yellow('WARNUNG')} [${x.code}] ${x.msg}`);
    console.log('');
  }
}

console.log(
  `${c.bold('  Total')}: ${fehler ? c.red(fehler + ' error') : c.green('0 error')}, ${
    warnungen ? c.yellow(warnungen + ' warning') : '0 warning'
  }\n`
);
process.exit(fehler ? 1 : 0);

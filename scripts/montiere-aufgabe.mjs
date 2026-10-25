#!/usr/bin/env node
/**
 * TestDaF-Modul — Inhalts-Fragment in ein Gerüst einsetzen und prüfen.
 *
 *   node scripts/montiere-aufgabe.mjs --vorlage src/content-testdaf/mt03/lesen-aufgabe-01.json \
 *                                    --inhalt /tmp/fragment-lesen-a1.json [--out <pfad>] [--no-check]
 *
 * Ein Autor (Mensch oder KI) liefert NUR die Inhaltsfelder; Struktur, IDs,
 * Zeiten, TDN, Itemtypen und das audio-Objekt kommen aus dem Gerüst
 * (`vorlage-erzeugen.mjs`). Unbekannte Felder werden abgelehnt — so fällt ein
 * Tippfehler sofort auf, statt still im JSON zu landen.
 *
 * Erlaubte Fragment-Felder:
 *   themenfeld · titel · titel_id · beschreibung_id · instruktion_de · instruktion_id
 *   tags · texte · antwort_optionen · transcript · sprecher · fragen · glossar
 *   punkte_max · attribution · zeit_minuten · tdn · level · source_type · lizenz
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spez } from './spec.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const ERLAUBT = new Set([
  'themenfeld', 'titel', 'titel_id', 'beschreibung_id', 'instruktion_de', 'instruktion_id', 'tags',
  'texte', 'antwort_optionen', 'transcript', 'sprecher', 'fragen', 'glossar', 'punkte_max',
  'attribution', 'zeit_minuten', 'tdn', 'level', 'source_type', 'lizenz'
]);

const vorlagePfad = arg('vorlage');
const inhaltPfad = arg('inhalt');
if (!vorlagePfad || !inhaltPfad) {
  console.error('Aufruf: node scripts/montiere-aufgabe.mjs --vorlage <geruest.json> --inhalt <fragment.json> [--out <ziel.json>] [--no-check]');
  process.exit(2);
}
if (!existsSync(vorlagePfad)) {
  console.error(`Gerüst nicht gefunden: ${vorlagePfad}\nErst erzeugen: node scripts/vorlage-erzeugen.mjs --modelltest <N>`);
  process.exit(2);
}

const aufgabe = JSON.parse(readFileSync(vorlagePfad, 'utf8'));
const fragment = JSON.parse(readFileSync(inhaltPfad, 'utf8'));
const spezifikation = spez(aufgabe.bereich, aufgabe.aufgabe);

const unbekannt = Object.keys(fragment).filter((k) => !ERLAUBT.has(k));
if (unbekannt.length) {
  console.error(`Unbekannte Feld(er) im Fragment: ${unbekannt.join(', ')}\nErlaubt sind: ${[...ERLAUBT].join(', ')}`);
  process.exit(1);
}

const zusammen = { ...aufgabe };
for (const [k, v] of Object.entries(fragment)) {
  if (k === 'transcript') {
    zusammen.audio = { ...(zusammen.audio ?? {}), transcript: v };
  } else if (k === 'sprecher') {
    zusammen.audio = { ...(zusammen.audio ?? {}), sprecher: v };
  } else {
    zusammen[k] = v;
  }
}

/* Struktur vor dem Schreiben prüfen — spart den Validator-Lauf bei groben Fehlern. */
const fehler = [];
if (!Array.isArray(zusammen.fragen) || zusammen.fragen.length !== spezifikation.items) {
  fehler.push(`fragen: ${(zusammen.fragen ?? []).length} statt ${spezifikation.items}`);
} else {
  zusammen.fragen.forEach((f, i) => {
    if (f.nr !== i + 1) fehler.push(`Aufgabe ${i + 1}: nr ist ${f.nr}`);
    if (f.typ !== spezifikation.typ) fehler.push(`Aufgabe ${f.nr}: typ "${f.typ}" statt "${spezifikation.typ}"`);
    if (!Array.isArray(f.loesung) || f.loesung.length === 0) fehler.push(`Aufgabe ${f.nr}: loesung fehlt`);
    if (f.typ === 'kurzantwort' && (!Array.isArray(f.schluessel) || f.schluessel.length === 0)) {
      fehler.push(`Aufgabe ${f.nr}: schluessel fehlt`);
    }
    if (typeof f.loesung?.[0] === 'string' && /⟨|⟩/.test(f.loesung[0])) fehler.push(`Aufgabe ${f.nr}: loesung ist noch Platzhalter`);
  });
}
for (const feld of ['titel', 'titel_id', 'themenfeld', 'instruktion_de', 'instruktion_id']) {
  if (typeof zusammen[feld] === 'string' && /⟨|⟩/.test(zusammen[feld])) fehler.push(`${feld} ist noch Platzhalter`);
}
if (Array.isArray(zusammen.texte)) {
  for (const t of zusammen.texte) {
    if (/⟨|⟩/.test(t.titel ?? '') || /⟨|⟩/.test(t.inhalt ?? '')) fehler.push(`texte[${t.key}]: noch Platzhalter`);
  }
}
if (zusammen.audio && /⟨|⟩/.test(zusammen.audio.transcript ?? '')) fehler.push('audio.transcript ist noch Platzhalter');
if ((zusammen.glossar ?? []).length < 8) fehler.push(`glossar: ${(zusammen.glossar ?? []).length} Einträge (mindestens 8)`);

if (fehler.length) {
  console.error(`\nFragment unvollständig — ${fehler.length} Problem(e):`);
  for (const f of fehler) console.error(`  ✗ ${f}`);
  process.exit(1);
}

const ziel = arg('out') ?? vorlagePfad;
writeFileSync(ziel, JSON.stringify(zusammen, null, 2) + '\n', 'utf8');
console.log(`✓ Inhalte eingesetzt: ${path.relative(process.cwd(), ziel)}`);

if (process.argv.includes('--no-check')) process.exit(0);

const rel = path.relative(path.resolve(HIER, '..', 'src', 'content-testdaf'), ziel).replace(/\\/g, '/');
const lauf = spawnSync(process.execPath, [path.join(HIER, 'validate-testdaf.mjs'), '--file', rel], {
  stdio: 'inherit',
  cwd: path.resolve(HIER, '..')
});
process.exit(lauf.status ?? 1);

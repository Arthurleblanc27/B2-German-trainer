#!/usr/bin/env node
/**
 * TestDaF-Modul — Gerüst für einen neuen Modelltest erzeugen.
 *
 *   node scripts/vorlage-erzeugen.mjs --modelltest 3
 *   node scripts/vorlage-erzeugen.mjs --modelltest 3 --themenfeld "Technik & Gesellschaft" --force
 *
 * Warum: Im ersten Batch musste jedes schreibende Kind den ganzen Vertrag
 * (Schema + Musterdatei ≈ 36.800 Zeichen ≈ 11.000 Tokens) lesen und die
 * JSON-Struktur selbst bauen. Dieses Skript legt die komplette Struktur
 * (IDs, Zeiten, TDN, Itemzahl, Itemtypen, audio-Objekt, Platzhalter) vor —
 * ein Kind füllt danach nur noch Inhalte ein. Ergebnis: ~84 % weniger
 * Kontext je Kind und strukturelle Fehler sind ausgeschlossen.
 *
 * Die Platzhalter sind absichtlich ungültig (evidence ⟨…⟩ steht in keinem Text),
 * damit ein unfertiges Gerüst niemals als "gültig" durchgeht.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aufgabenListe, attributionFuer, audioPfad, BEREICHE, LIZENZEN } from './spec.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.resolve(HIER, '..');
const BANK = path.join(PROJEKT, 'src', 'content-testdaf');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const modelltest = Number(arg('modelltest', '0'));
if (!Number.isInteger(modelltest) || modelltest < 1) {
  console.error('Aufruf: node scripts/vorlage-erzeugen.mjs --modelltest <N> [--themenfeld "..."] [--force]');
  process.exit(2);
}
const themenfeld = arg('themenfeld', '⟨Themenfeld eintragen⟩');
const force = flag('force');

const P = '⟨'; // Platzhalter-Klammern, damit klar ist: hier fehlt Inhalt
const PH = (was) => `${P}${was} eintragen⟩`;

function frage(nr, typ) {
  const basis = {
    nr,
    typ,
    stamm_de: PH('Aufgabenstellung/Stamm'),
    stamm_id: PH('Übersetzung des Stamms'),
    optionen: null,
    loesung: [],
    punkte: 1,
    explain_de: PH('Begründung, warum die Lösung richtig ist'),
    explain_id: PH('Übersetzung der Begründung'),
    evidence: PH('wörtliches Zitat aus deinem Text/Transkript')
  };
  if (typ === 'mc3') {
    basis.optionen = [
      { key: 'a', text: PH('Option A') },
      { key: 'b', text: PH('Option B') },
      { key: 'c', text: PH('Option C') }
    ];
  }
  if (typ === 'kurzantwort') basis.schluessel = [[PH('Schlüsselwort-Gruppe 1')]];
  return basis;
}

function geruest(eintrag) {
  const { spec, bereich, aufgabe } = eintrag;
  const a = {
    schemaVersion: 2,
    format: 'testdaf',
    id: eintrag.id,
    bereich,
    aufgabe,
    modelltest: eintrag.modelltest,
    tdn: spec.tdn,
    level: 'B2',
    themenfeld,
    titel: PH('deutscher Titel'),
    titel_id: PH('indonesischer Titel'),
    beschreibung_id: PH('ein Satz Indonesisch für die Übersichtsseite'),
    instruktion_de: PH(`Instruktion (Aufgabe ${aufgabe} ${bereich})`),
    instruktion_id: PH('Übersetzung der Instruktion'),
    zeit_minuten: spec.minuten,
    source_type: 'ai',
    lizenz: LIZENZEN[0],
    attribution: attributionFuer(eintrag.modelltest, bereich, aufgabe),
    tags: [PH('Tag1'), PH('Tag2')],
    material_typ: bereich === 'hoeren' ? 'keins' : aufgabe === 1 ? 'kurztexte' : 'langtext',
    texte: [],
    antwort_optionen: [],
    audio:
      bereich === 'hoeren'
        ? {
            src: audioPfad(eintrag.modelltest, bereich, aufgabe),
            dauer_sekunden: 0,
            stimme: 'de-DE-KatjaNeural+de-DE-ConradNeural',
            play_limit_pruefung: spec.playLimit,
            transcript: '',
            sprecher: [],
            wort_timestamps: []
          }
        : null,
    fragen: Array.from({ length: spec.items }, (_, i) => frage(i + 1, spec.typ)),
    punkte_max: spec.items,
    glossar: [
      { wort: PH('Wort'), artikel: 'der', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: 'die', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: 'das', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: '', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: '', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: '', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: '', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null },
      { wort: PH('Wort'), artikel: '', bedeutung_id: PH('Bedeutung'), bedeutung_de: null, beispiel: null }
    ]
  };

  if (bereich === 'lesen' && aufgabe === 1) {
    a.texte = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => ({
      key,
      titel: PH(`Kurztext ${key.toUpperCase()} — Titel`),
      inhalt: PH(`Inhalt Kurztext ${key.toUpperCase()} (ca. 45–60 Wörter)`)
    }));
    a.antwort_optionen = [
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => ({ key, text: PH(`Kurztitel ${key.toUpperCase()}`) })),
      { key: 'i', text: 'Kein Angebot passt (Text I)' }
    ];
  }
  if (bereich === 'lesen' && aufgabe > 1) {
    a.texte = [
      {
        key: 'l',
        titel: PH('Titel des Textes'),
        inhalt: PH(`Text (${aufgabe === 2 ? '450–550' : '550–600'} Wörter)`)
      }
    ];
  }
  if (bereich === 'hoeren') {
    a.audio.transcript = PH('Transkript mit Sprechermarken, z. B. [Moderatorin] … / [Professorin …] …');
  }
  return a;
}

const liste = aufgabenListe(modelltest);
mkdirSync(path.join(BANK, `mt${String(modelltest).padStart(2, '0')}`), { recursive: true });
mkdirSync(path.join(BANK, 'modelltest'), { recursive: true });

const erzeugt = [];
const uebersprungen = [];
for (const e of liste) {
  const ziel = path.join(BANK, e.datei);
  if (existsSync(ziel) && !force) {
    uebersprungen.push(e.datei);
    continue;
  }
  writeFileSync(ziel, JSON.stringify(geruest(e), null, 2) + '\n', 'utf8');
  erzeugt.push(e.datei);
}

// Prüfungsdatei
const pruefungZiel = path.join(BANK, 'modelltest', `modelltest-${String(modelltest).padStart(2, '0')}.json`);
if (!existsSync(pruefungZiel) || force) {
  writeFileSync(
    pruefungZiel,
    JSON.stringify(
      {
        schemaVersion: 2,
        format: 'testdaf',
        id: `testdaf-modelltest-${String(modelltest).padStart(2, '0')}`,
        modelltest,
        titel: PH('Titel des Modelltests'),
        titel_id: PH('indonesischer Titel'),
        beschreibung_id: PH('ein Satz Indonesisch'),
        aufgaben: liste.map((e) => e.id)
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  erzeugt.push(`modelltest/modelltest-${String(modelltest).padStart(2, '0')}.json`);
}

const zwoelf = (n) => String(n).padStart(2, '0');
console.log(`\nGerüst für Modelltest ${modelltest} — ${erzeugt.length} Datei(en) geschrieben, ${uebersprungen.length} übersprungen.`);
for (const e of liste) {
  const spec = e.spec;
  console.log(
    `  ${e.datei.padEnd(34)} ${spec.typ.padEnd(13)} ${String(spec.items).padStart(2)} Items · ${spec.minuten}′ · TDN ${spec.tdn}` +
      (bereichHinweis(e) ?? '')
  );
}

function bereichHinweis(e) {
  if (e.bereich === 'hoeren') return ` · ${e.spec.playLimit}× hören`;
  if (e.bereich === 'lesen' && e.aufgabe === 1) return ' · 8 Kurztexte a–h + Text I';
  return e.bereich === 'lesen' ? ` · Langtext ${e.aufgabe === 2 ? '450–550' : '550–600'} Wörter` : '';
}

console.log(`\nNächster Schritt — Inhalte einsetzen und nach jedem Entwurf prüfen:`);
console.log(`  node scripts/validate-testdaf.mjs --file mt${zwoelf(modelltest)}/${'<bereich>'}-aufgabe-<NN>`);
console.log(`  node scripts/validate-testdaf.mjs            # Gesamtlauf, wenn alle Geschwisterdateien fertig sind`);
console.log(`  python3 scripts/tts_testdaf.py --nur mt${zwoelf(modelltest)}`);
console.log(`\nRegeln für die Autoren: scripts/AUFTRAG-KIND.md`);

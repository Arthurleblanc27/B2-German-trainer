/**
 * TestDaF-Modul — runner untuk satu Aufgabe TestDaF.
 *
 * Layout dua kolom seperti komponen Goethe: bahan (teks / audio + transkrip) di
 * kiri, soal di kanan; pada layar kecil jadi tab. Mode:
 *   übung    — transkrip + seek + kecepatan bebas, boleh mengulang audio
 *   prüfung  — batas pemutaran ala ujian, tanpa seek/transkrip sampai dinilai
 *
 * Hasil muncul di bawah daftar soal: per item benar/salah, kunci, penjelasan,
 * kutipan bukti, dan koreksi mandiri untuk soal terbuka (kurzantwort).
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { TestdafAufgabe } from '../data/testdaf';
import { TDN_LABEL, testdafSpec, tdnLabel } from '../data/testdaf';
import { frageOptionen } from '../lib/testdaf-content';
import type { Modus, TestdafAufgabeErgebnis, TestdafItemAuswertung } from '../lib/testdaf-scoring';
import { formatUhrzeit } from '../lib/format';
import TestdafQuestionItem from './TestdafQuestionItem';
import AudioPlayer from './AudioPlayer';
import Transcript from './Transcript';

export interface TestdafRunnerProps {
  aufgabe: TestdafAufgabe;
  modus: Modus;
  onModusChange?: (m: Modus) => void;
  antworten: Record<number, string[]>;
  setAntwort: (nr: number, keys: string[]) => void;
  abgegeben: boolean;
  auswertung?: TestdafAufgabeErgebnis | null;
  onAbgeben: () => void;
  onSelbstkorrektur?: (nr: number, richtig: boolean) => void;
  onWeiter?: () => void;
  weiterLabel?: string;
  onWiederholen?: () => void;
  /** Restzeit der gesamten Prüfung (nur Prüfungsmodus, Sekunden) */
  restzeit?: number | null;
  hinweis?: string;
}

function optionenProFrage(a: TestdafAufgabe) {
  return a.fragen.map((f) => frageOptionen(a, f));
}

export default function TestdafRunner({
  aufgabe,
  modus,
  onModusChange,
  antworten,
  setAntwort,
  abgegeben,
  auswertung = null,
  onAbgeben,
  onSelbstkorrektur,
  onWeiter,
  weiterLabel = 'Weiter',
  onWiederholen,
  restzeit = null,
  hinweis = ''
}: TestdafRunnerProps) {
  const [tab, setTab] = useState<'material' | 'aufgaben'>('material');
  const [frageIdx, setFrageIdx] = useState(0);
  const [zeit, setZeit] = useState(0);
  const [seek, setSeek] = useState<number | null>(null);
  const [transkriptAuf, setTranskriptAuf] = useState(modus === 'uebung');
  const [zeigeInstruktion, setZeigeInstruktion] = useState(true);

  const spec = testdafSpec(aufgabe.bereich, aufgabe.aufgabe);
  /** Hinweis zur Vorbereitungszeit im Prüfungsmodus — erinnert nur, sperrt nichts. */
  const [vorbereitungTipp, setVorbereitungTipp] = useState(true);

  const offen = aufgabe.fragen.filter((f) => !(antworten[f.nr]?.filter((w) => w.trim() !== '').length > 0)).length;
  const opt = useMemo(() => optionenProFrage(aufgabe), [aufgabe]);

  /* Tastatur: A–I / 1–9 = Option, R/F = Richtig/Falsch, J/N/T = Ja/Nein/nichts,
     Enter = nächste Aufgabe, Pfeile = navigieren. In Eingabefeldern nicht eingreifen. */
  useEffect(() => {
    if (abgegeben) return;
    const handler = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && (['INPUT', 'SELECT', 'TEXTAREA'].includes(ziel.tagName) || ziel.isContentEditable)) return;
      const frage = aufgabe.fragen[frageIdx];
      if (!frage) return;
      const key = e.key.toLowerCase();
      const opts = opt[frageIdx] ?? [];
      if (frage.typ === 'kurzantwort') {
        if (e.key === 'ArrowDown') stop(e, () => springe(1));
        if (e.key === 'ArrowUp') stop(e, () => springe(-1));
        return;
      }
      if (frage.typ === 'richtigfalsch' && (key === 'r' || key === 'f')) {
        setAntwort(frage.nr, [key === 'r' ? 'richtig' : 'falsch']);
        springe(1);
        e.preventDefault();
        return;
      }
      if (frage.typ === 'jn3' && (key === 'j' || key === 'n' || key === 't')) {
        setAntwort(frage.nr, [key === 'j' ? 'ja' : key === 'n' ? 'nein' : 'nichts']);
        springe(1);
        e.preventDefault();
        return;
      }
      const ziffer = /^[1-9]$/.test(key) ? Number(key) - 1 : null;
      const buchstabe = /^[a-i]$/.test(key) ? key.charCodeAt(0) - 97 : null;
      const idx = ziffer ?? buchstabe;
      if (idx !== null && opts[idx]) {
        setAntwort(frage.nr, [opts[idx].key]);
        springe(1);
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        if (ziel && (ziel.tagName === 'BUTTON' || ziel.getAttribute('role') === 'radio')) return;
        e.preventDefault();
        springe(1);
      }
      if (e.key === 'ArrowDown') stop(e, () => springe(1));
      if (e.key === 'ArrowUp') stop(e, () => springe(-1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abgegeben, frageIdx, aufgabe, antworten, opt]);

  const stop = (e: KeyboardEvent, fn: () => void) => {
    e.preventDefault();
    fn();
  };

  const fokussiere = (idx: number) => {
    setFrageIdx(idx);
    const el = document.getElementById(`frage-${aufgabe.fragen[idx]?.nr}`);
    el?.focus();
    el?.scrollIntoView({ block: 'center' });
  };
  const springe = (d: number) => fokussiere(Math.max(0, Math.min(aufgabe.fragen.length - 1, frageIdx + d)));

  const auswertungMap = useMemo(() => {
    const m = new Map<number, TestdafItemAuswertung>();
    for (const i of auswertung?.items ?? []) m.set(i.nr, i);
    return m;
  }, [auswertung]);

  const bereichLabel = aufgabe.bereich === 'lesen' ? 'Leseverstehen' : 'Hörverstehen';

  return (
    <div class="flex flex-col gap-4" data-testid="testdaf-runner" data-aufgabe={aufgabe.aufgabe}>
      {/* ---------- Kopf ---------- */}
      <div class="karte">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="augenbraue">
              {bereichLabel} · Aufgabe {aufgabe.aufgabe} · {spec.kurz} · {aufgabe.zeit_minuten} Minuten
            </p>
            <h2 class="m-0 text-lg font-bold">{aufgabe.titel}</h2>
            <p class="ruhig m-0 text-sm">{aufgabe.titel_id}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="chip">{tdnLabel(aufgabe.tdn)}</span>
            <span class="chip" data-testid="modus-chip">
              {modus === 'pruefung' ? 'Prüfungsmodus' : 'Übungsmodus'}
            </span>
            <span class="chip">
              {aufgabe.fragen.length} Aufgaben · {aufgabe.punkte_max} Punkte
            </span>
            {aufgabe.audio ? <span class="chip">{aufgabe.audio.play_limit_pruefung}× hören</span> : null}
          </div>
        </div>

        {onModusChange ? (
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="ruhig text-sm">Modus:</span>
            <button
              class={`btn btn-klein ${modus === 'uebung' ? 'btn-primaer' : ''}`}
              aria-pressed={modus === 'uebung'}
              onClick={() => onModusChange('uebung')}
              data-testid="modus-uebung"
            >
              Übung
            </button>
            <button
              class={`btn btn-klein ${modus === 'pruefung' ? 'btn-primaer' : ''}`}
              aria-pressed={modus === 'pruefung'}
              onClick={() => onModusChange('pruefung')}
              data-testid="modus-pruefung"
            >
              Prüfung
            </button>
            {restzeit !== null ? (
              <span class="chip" data-testid="pruefung-restzeit">
                Prüfungszeit: {formatUhrzeit(restzeit, true)}
              </span>
            ) : null}
          </div>
        ) : null}

        <details
          class="aufklapp mt-2"
          open={zeigeInstruktion}
          onToggle={(e) => setZeigeInstruktion((e.target as HTMLDetailsElement).open)}
        >
          <summary class="text-sm">
            Aufgabenstellung / Instruksi
          </summary>
          <p class="prosa m-0 mt-2 text-[0.97rem]">{aufgabe.instruktion_de}</p>
          <p class="prosa m-0 ruhig">{aufgabe.instruktion_id}</p>
          <p class="ruhig m-0 mt-1 text-xs">
            Schwierigkeitsgrad: {TDN_LABEL[aufgabe.tdn]} · Themenfeld: {aufgabe.themenfeld} ·{' '}
            {aufgabe.source_type === 'ai' ? 'KI-generiert, manuell geprüft' : aufgabe.source_type === 'own' ? 'Eigener Text' : 'Gemeinfrei'}
          </p>
        </details>
      </div>

      {hinweis ? (
        <p class="meldung meldung-ok text-sm" role="status">
          {hinweis}
        </p>
      ) : null}

      {modus === 'pruefung' && aufgabe.bereich === 'hoeren' && vorbereitungTipp ? (
        <p class="meldung meldung-warn" role="status" data-testid="vorbereitung">
          Im Original gibt es vor dem Hören rund 1 Minute Vorbereitungszeit — hier ist die Wiedergabe aber{' '}
          <strong>nicht gesperrt</strong>: lies die Aufgaben in deinem Tempo und starte, wann du willst.{' '}
          <button class="btn btn-klein ml-2" onClick={() => setVorbereitungTipp(false)}>
            Ausblenden
          </button>
        </p>
      ) : null}

      {/* ---------- Tabs (nur klein) ---------- */}
      <div class="pille-gruppe w-full lg:hidden" role="tablist" aria-label="Ansicht wählen">
        <button
          role="tab"
          aria-selected={tab === 'material'}
          class={`btn grow ${tab === 'material' ? 'btn-primaer' : ''}`}
          onClick={() => setTab('material')}
        >
          {aufgabe.bereich === 'lesen' ? 'Text' : 'Audio'}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'aufgaben'}
          class={`btn grow ${tab === 'aufgaben' ? 'btn-primaer' : ''}`}
          onClick={() => setTab('aufgaben')}
        >
          Aufgaben ({aufgabe.fragen.length - offen}/{aufgabe.fragen.length})
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        {/* ---------- Material ---------- */}
        <section class={`${tab === 'material' ? '' : 'hidden'} lg:block`} aria-label="Material">
          <div class="lg:sticky lg:top-20 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-2">
            {aufgabe.audio ? (
              <div class="mb-3 flex flex-col gap-3">
                <AudioPlayer
                  audio={aufgabe.audio}
                  modus={modus}
                  zeit={zeit}
                  onZeit={setZeit}
                  seekAnfrage={seek}
                  testId={`testdaf-player-a${aufgabe.aufgabe}`}
                />
                {modus === 'uebung' ? (
                  <label class="ruhig flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={transkriptAuf}
                      onChange={(e) => setTranskriptAuf((e.target as HTMLInputElement).checked)}
                    />
                    Transkript anzeigen
                  </label>
                ) : null}
                {abgegeben || (modus === 'uebung' && transkriptAuf) ? (
                  <Transcript
                    text={aufgabe.audio.transcript}
                    timestamps={aufgabe.audio.wort_timestamps}
                    zeit={zeit}
                    versteckt={modus === 'pruefung' && !abgegeben}
                    onSeek={modus === 'uebung' ? (t) => setSeek(t) : undefined}
                  />
                ) : (
                  <p class="ruhig m-0 text-sm">Transkript ist im Prüfungsmodus erst nach der Bewertung sichtbar.</p>
                )}
                {aufgabe.audio.sprecher.length ? (
                  <p class="ruhig m-0 text-xs">Sprecher: {aufgabe.audio.sprecher.join(' · ')}</p>
                ) : null}
              </div>
            ) : null}

            {/* Antwortoptionen A–I (Zuordnung) */}
            {aufgabe.antwort_optionen.length ? (
              <div class="karte mb-3">
                <h3 class="m-0 mb-2 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">
                  Angebote A–I / Pilihan A–I
                </h3>
                <ul class="m-0 list-none p-0 text-sm">
                  {aufgabe.antwort_optionen.map((o) => (
                    <li key={o.key} class="py-0.5">
                      <strong class="mr-1 uppercase">{o.key})</strong>
                      {o.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {aufgabe.texte.length ? (
              <div class="flex flex-col gap-3">
                {aufgabe.texte.map((t) => (
                  <article class="karte" key={t.key} data-textkey={t.key}>
                    <h3 class="m-0 mb-1 font-bold">
                      <span class="mr-2 uppercase">{t.key})</span>
                      {t.titel}
                    </h3>
                    <p class="prosa m-0 whitespace-pre-wrap">{t.inhalt}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* ---------- Aufgaben ---------- */}
        <section class={`${tab === 'aufgaben' ? '' : 'hidden'} lg:block`} aria-label="Aufgaben">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAbgeben();
            }}
          >
            <ol class="m-0 flex list-none flex-col gap-3 p-0" data-testid="fragen-liste">
              {aufgabe.fragen.map((f) => (
                <TestdafQuestionItem
                  key={f.nr}
                  frage={f}
                  aufgabe={aufgabe}
                  wert={antworten[f.nr] ?? []}
                  onChange={(keys) => setAntwort(f.nr, keys)}
                  abgegeben={abgegeben}
                  auswertung={auswertungMap.get(f.nr) ?? null}
                  onSelbstkorrektur={onSelbstkorrektur ? (r) => onSelbstkorrektur(f.nr, r) : undefined}
                />
              ))}
            </ol>

            {!abgegeben ? (
              <div class="aktionsleiste mt-4">
                <button
                  type="submit"
                  class="btn btn-primaer"
                  data-testid="abgeben"
                  onClick={(e) => {
                    if (offen > 0 && !window.confirm(`${offen} Aufgabe(n) sind noch offen — trotzdem abgeben?`)) {
                      e.preventDefault();
                    }
                  }}
                >
                  Abgeben &amp; auswerten
                </button>
                <span class="ruhig" aria-live="polite">
                  {aufgabe.fragen.length - offen} von {aufgabe.fragen.length} beantwortet
                  {offen > 0 ? ` · ${offen} offen` : ''}
                </span>
                <span class="ruhig hidden text-xs md:inline">
                  Tastatur: A–I = Option · R/F = Richtig/Falsch · J/N/T = Ja/Nein/Text sagt nichts · Enter = nächste
                </span>
              </div>
            ) : (
              <div class="aktionsleiste mt-4">
                {onWiederholen ? (
                  <button type="button" class="btn" onClick={onWiederholen} data-testid="wiederholen">
                    Noch einmal
                  </button>
                ) : null}
                {onWeiter ? (
                  <button type="button" class="btn btn-primaer" onClick={onWeiter} data-testid="weiter">
                    {weiterLabel} →
                  </button>
                ) : null}
              </div>
            )}
          </form>
        </section>
      </div>

      {/* ---------- Ergebnis ---------- */}
      {abgegeben && auswertung ? <TestdafErgebnisBlock auswertung={auswertung} aufgabe={aufgabe} /> : null}
    </div>
  );
}

export function TestdafErgebnisBlock({
  auswertung,
  aufgabe
}: {
  auswertung: TestdafAufgabeErgebnis;
  aufgabe: TestdafAufgabe;
}) {
  const prozent = auswertung.prozent;
  const farbe = prozent >= 80 ? 'var(--success)' : prozent >= 60 ? 'var(--accent)' : prozent >= 40 ? 'var(--warn)' : 'var(--danger)';
  return (
    <section class="karte" data-testid="ergebnis" aria-live="polite">
      <div class="flex flex-wrap items-center gap-4">
        <div
          class="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4"
          style={{ borderColor: farbe }}
        >
          <strong class="text-xl" style={{ color: farbe }}>
            {prozent}%
          </strong>
          <span class="ruhig text-xs">{auswertung.punkte}/{auswertung.punkteMax}</span>
        </div>
        <div class="grow">
          <h2 class="m-0 text-lg font-bold">
            Ergebnis Aufgabe {aufgabe.aufgabe} — {tdnLabel(auswertung.tdn)}
          </h2>
          <p class="m-0">
            {auswertung.benar} richtig · {auswertung.salah} falsch
            {auswertung.offen ? ` · ${auswertung.offen} unbeantwortet` : ''} · {prozent} von 100
          </p>
          <p class="ruhig m-0 text-sm">
            {aufgabe.bereich === 'hoeren' && aufgabe.fragen.some((f) => f.typ === 'kurzantwort')
              ? 'Offene Aufgaben (Stichworte) werden automatisch vorbewertet — prüfe die Musterlösung und korrigiere bei Bedarf selbst.'
              : 'Geschlossene Aufgaben — exakte Bewertung.'}
          </p>
        </div>
      </div>
      <details class="aufklapp mt-3">
        <summary class="text-sm">Alle Items im Überblick</summary>
        <ul class="m-0 mt-2 list-none p-0 text-sm">
          {auswertung.items.map((i) => (
            <li key={i.nr} class="flex flex-wrap gap-2 border-b border-[var(--border)] py-1">
              <span class="min-w-8 font-bold">{i.nr}</span>
              <span style={{ color: i.richtig ? 'var(--success)' : i.offen ? 'var(--muted)' : 'var(--danger)' }}>
                {i.richtig ? '✓' : i.offen ? '○' : '✗'}
              </span>
              <span class="grow">
                {i.typ === 'kurzantwort' ? `Musterlösung: ${i.musterloesungen.join(' · ')}` : `Lösung: ${i.loesung.join(' · ')}`}
                {i.gegeben.length ? ` — deine Antwort: ${i.gegeben.join(' · ')}` : ''}
              </span>
              {i.selbst ? <span class="chip">selbst bewertet</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** B2-Trainer — menjalankan satu Teil: materi teks/audio + daftar soal + keyboard penuh. */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Teil } from '../data/schema';
import type { Modus } from '../lib/scoring';
import { formatUhrzeit } from '../lib/format';
import QuestionItem from './QuestionItem';
import AudioPlayer from './AudioPlayer';
import Transcript from './Transcript';

export interface TeilRunnerProps {
  teil: Teil;
  modus: Modus;
  antworten: Record<number, string[]>;
  setAntwort: (nr: number, keys: string[]) => void;
  abgegeben: boolean;
  onAbgeben: () => void;
  onWort?: (wort: string, teilId: string) => void;
  /** injiziert in E2E-Tests, um die Vorbereitungszeit zu verkürzen */
  vorbereitungsSekunden?: number;
}

export default function TeilRunner({
  teil,
  modus,
  antworten,
  setAntwort,
  abgegeben,
  onAbgeben,
  onWort,
  vorbereitungsSekunden
}: TeilRunnerProps) {
  const [tab, setTab] = useState<'text' | 'aufgaben'>('text');
  const [frageIdx, setFrageIdx] = useState(0);
  // Ref zusätzlich zum State: schnelle Tastendrücke (A, A, B …) müssen die
  // AKTUELLE Aufgabe weiterzählen. Mit dem Closure-State beantworten mehrere
  // Drücke in einem Render-Zyklus dieselbe Aufgabe (realer Bug, per E2E gefunden).
  const frageIdxRef = useRef(0);
  const [zeit, setZeit] = useState(0);
  const [seek, setSeek] = useState<number | null>(null);
  const [transkriptAuf, setTranskriptAuf] = useState(modus === 'uebung');
  const [zeigeInstruktion, setZeigeInstruktion] = useState(true);
  const vorbereitung = vorbereitungsSekunden ?? (teil.teil === 1 ? 15 : 90);
  const [rest, setRest] = useState(modus === 'pruefung' && teil.skill === 'hoeren' ? vorbereitung : 0);
  const [vorbereitungFertig, setVorbereitungFertig] = useState(!(modus === 'pruefung' && teil.skill === 'hoeren'));
  const containerRef = useRef<HTMLDivElement | null>(null);

  const offen = teil.fragen.filter((f) => !(antworten[f.nr]?.length > 0)).length;
  const beantwortet = teil.fragen.length - offen;
  const prozent = teil.fragen.length ? Math.round((beantwortet / teil.fragen.length) * 100) : 0;
  const optionenProFrage = useMemo(() => {
    return teil.fragen.map((f) => {
      if (f.optionen?.length) return f.optionen;
      if (f.typ === 'satz-luecke') return teil.optionen_saetze ?? [];
      if (f.typ === 'ueberschrift') return teil.ueberschriften ?? [];
      if (f.typ === 'richtigfalsch')
        return [
          { key: 'richtig', text: 'Richtig' },
          { key: 'falsch', text: 'Falsch' }
        ];
      return [];
    });
  }, [teil]);

  useEffect(() => {
    if (vorbereitungFertig) return;
    const id = window.setInterval(() => {
      setRest((r) => {
        if (r <= 1) {
          setVorbereitungFertig(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [vorbereitungFertig]);

  /* Keyboard: R/F, 1–9 bzw. A–H, Enter = nächste Aufgabe, Pfeile = navigieren */
  useEffect(() => {
    if (abgegeben) return;
    const handler = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement;
      // In Formularelementen und Links NICHT eingreifen (dort gehört Enter/Space dem Element).
      if (
        ziel &&
        (['INPUT', 'SELECT', 'TEXTAREA'].includes(ziel.tagName) || ziel.isContentEditable || ziel.tagName === 'A')
      ) {
        return;
      }
      const frage = teil.fragen[frageIdxRef.current];
      if (!frage) return;
      const opts = optionenProFrage[frageIdxRef.current] ?? [];
      const key = e.key.toLowerCase();
      if (frage.typ === 'richtigfalsch' && (key === 'r' || key === 'f')) {
        setAntwort(frage.nr, [key === 'r' ? 'richtig' : 'falsch']);
        naechste();
        e.preventDefault();
        return;
      }
      const ziffer = /^[1-9]$/.test(key) ? Number(key) - 1 : null;
      const buchstabe = /^[a-h]$/.test(key) ? key.charCodeAt(0) - 97 : null;
      const idx = ziffer ?? buchstabe;
      if (idx !== null && idx < opts.length && opts.length > 0 && !(frage.typ === 'richtigfalsch')) {
        setAntwort(frage.nr, [opts[idx].key]);
        naechste();
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        // Enter auf einem fokussierten Button/Radiobutton gehört dem Element
        // (sonst wäre "Abgeben" per Tastatur nicht erreichbar).
        if (ziel && (ziel.tagName === 'BUTTON' || ziel.getAttribute('role') === 'radio' || ziel.getAttribute('role') === 'checkbox')) {
          return;
        }
        e.preventDefault();
        naechste();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        springe(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        springe(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abgegeben, frageIdx, teil, antworten]);

  const fokussiere = (idx: number) => {
    const begrenzt = Math.max(0, Math.min(teil.fragen.length - 1, idx));
    frageIdxRef.current = begrenzt;
    setFrageIdx(begrenzt);
    const el = document.getElementById(`frage-${teil.fragen[begrenzt]?.nr}`);
    el?.focus();
    el?.scrollIntoView({ block: 'center' });
  };
  const springe = (d: number) => fokussiere(frageIdxRef.current + d);
  const naechste = () => springe(1);

  const gruppenLabel = (nr: number): string | null => {
    if (teil.skill === 'hoeren' && teil.teil === 1 && teil.texte?.length) {
      const idx = Math.floor((nr - 1) / 2);
      const t = teil.texte[idx];
      return t ? `Text ${idx + 1} — ${t.titel}` : null;
    }
    return null;
  };

  return (
    <div ref={containerRef} class="flex flex-col gap-4" data-testid="teil-runner" data-teil={teil.teil}>
      <div class="karte">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="augenbraue">
              {teil.skill === 'lesen' ? 'Leseverstehen' : 'Hörenverstehen'} · Teil {teil.teil} · {teil.zeit_minuten}{' '}
              Minuten
            </p>
            <h2 class="m-0 text-lg font-bold">{teil.titel}</h2>
          </div>
          <div class="flex items-center gap-2">
            <span class="chip chip-akzent" data-testid="modus-chip">
              {modus === 'pruefung' ? 'Prüfungsmodus' : 'Übungsmodus'}
            </span>
            <span class="chip">
              {teil.fragen.length} Aufgaben · {teil.punkte_max} Punkte
            </span>
          </div>
        </div>
        <details
          class="aufklapp mt-2.5"
          open={zeigeInstruktion}
          onToggle={(e) => setZeigeInstruktion((e.target as HTMLDetailsElement).open)}
        >
          <summary class="text-sm">Aufgabenstellung / Instruksi</summary>
          <p class="prosa m-0 mt-2 text-[0.97rem]">{teil.instruktion_de}</p>
          <p class="prosa m-0 ruhig">{teil.instruktion_id}</p>
        </details>
      </div>

      {modus === 'pruefung' && teil.skill === 'hoeren' && !vorbereitungFertig ? (
        <p class="meldung meldung-warn" role="status" data-testid="vorbereitung">
          Vorbereitungszeit: <strong>{formatUhrzeit(rest)}</strong> — lies jetzt die Aufgaben. Danach wird die Wiedergabe
          freigeschaltet.{' '}
          <button class="btn btn-klein ml-2" onClick={() => setVorbereitungFertig(true)}>
            Überspringen
          </button>
        </p>
      ) : null}

      <div class="pille-gruppe w-full lg:hidden" role="tablist" aria-label="Ansicht wählen">
        <button
          role="tab"
          aria-selected={tab === 'text'}
          class={`btn grow ${tab === 'text' ? 'btn-primaer' : ''}`}
          onClick={() => setTab('text')}
        >
          {teil.skill === 'lesen' ? 'Text' : 'Audio'}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'aufgaben'}
          class={`btn grow ${tab === 'aufgaben' ? 'btn-primaer' : ''}`}
          onClick={() => setTab('aufgaben')}
        >
          Aufgaben ({beantwortet}/{teil.fragen.length})
        </button>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class={`${tab === 'text' ? '' : 'hidden'} lg:block`} aria-label="Material">
          <div class="lg:sticky lg:top-20 lg:max-h-[85vh] lg:overflow-y-auto lg:pr-2">
            {teil.skill === 'hoeren' && teil.audio ? (
              <div class="mb-3 flex flex-col gap-3">
                <AudioPlayer
                  audio={teil.audio}
                  modus={modus}
                  zeit={zeit}
                  onZeit={setZeit}
                  seekAnfrage={seek}
                  testId={`player-teil${teil.teil}`}
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
                    text={teil.audio.transcript}
                    timestamps={teil.audio.wort_timestamps}
                    zeit={zeit}
                    versteckt={modus === 'pruefung' && !abgegeben}
                    onSeek={modus === 'uebung' ? (t) => setSeek(t) : undefined}
                  />
                ) : (
                  <p class="ruhig m-0 text-sm">
                    Transkript ist im Prüfungsmodus erst nach der Bewertung sichtbar.
                  </p>
                )}
              </div>
            ) : null}

            {/* Lesen Teil 2: Lückentext mit Dropdowns direkt im Text */}
            {teil.skill === 'lesen' && teil.teil === 2 && teil.luecken_text ? (
              <LueckenText teil={teil} antworten={antworten} setAntwort={setAntwort} abgegeben={abgegeben} />
            ) : null}

            {teil.skill === 'lesen' && teil.teil === 5 && teil.ueberschriften ? (
              <div class="karte mb-3">
                <h3 class="m-0 mb-2 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Überschriften a–h</h3>
                <ul class="m-0 list-none p-0 text-sm">
                  {teil.ueberschriften.map((u) => (
                    <li key={u.key} class="py-0.5">
                      <strong class="mr-1">{u.key})</strong>
                      {u.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {teil.texte?.length ? (
              <div class="flex flex-col gap-3">
                {teil.texte.map((t) => (
                  <article class="karte" key={t.key}>
                    <h3 class="m-0 mb-1 font-bold">{t.titel}</h3>
                    <p class="prosa m-0 whitespace-pre-wrap" data-textkey={t.key}>
                      {t.inhalt}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}

            {teil.skill === 'hoeren' && teil.teil === 1 && teil.texte?.length && modus === 'uebung' && !transkriptAuf ? (
              <p class="ruhig text-sm">Fünf kurze Gespräche — jedes Gespräch wird im Prüfungsmodus einmal abgespielt.</p>
            ) : null}
          </div>
        </section>

        <section class={`${tab === 'aufgaben' ? '' : 'hidden'} lg:block`} aria-label="Aufgaben">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAbgeben();
            }}
          >
            <ol class="m-0 flex list-none flex-col gap-3 p-0" data-testid="fragen-liste">
              {teil.fragen.map((f, i) => {
                const label = gruppenLabel(f.nr);
                const vorher = i > 0 ? gruppenLabel(teil.fragen[i - 1].nr) : null;
                return (
                  <div key={f.nr}>
                    {label && label !== vorher ? (
                      <h3 class="mt-2 mb-1 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">{label}</h3>
                    ) : null}
                    <QuestionItem
                      frage={f}
                      teil={teil}
                      wert={antworten[f.nr] ?? []}
                      onChange={(keys) => setAntwort(f.nr, keys)}
                      abgegeben={abgegeben}
                      onWort={onWort ? (w) => onWort(w, teil.id) : undefined}
                    />
                  </div>
                );
              })}
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
                  {beantwortet} von {teil.fragen.length} beantwortet
                  {offen > 0 ? ` · ${offen} offen` : ''}
                </span>
                <span class="ruhig hidden text-xs md:inline">
                  Tastatur: R/F = Richtig/Falsch · A–H oder 1–9 = Option · Enter = nächste Aufgabe
                </span>
                <div class="fortschritt w-full" aria-hidden="true">
                  <span style={{ width: `${prozent}%` }} />
                </div>
              </div>
            ) : null}
          </form>
        </section>
      </div>
    </div>
  );
}

function LueckenText({
  teil,
  antworten,
  setAntwort,
  abgegeben
}: {
  teil: Teil;
  antworten: Record<number, string[]>;
  setAntwort: (nr: number, keys: string[]) => void;
  abgegeben: boolean;
}) {
  const saetze = teil.optionen_saetze ?? [];
  const teile = (teil.luecken_text ?? '').split(/(\[\[\d+\]\])/g);
  return (
    <div class="karte">
      <p class="prosa m-0 whitespace-pre-wrap text-[0.98rem]">
        {teile.map((stueck, i) => {
          const treffer = stueck.match(/^\[\[(\d+)\]\]$/);
          if (!treffer) return <span key={i}>{stueck}</span>;
          const nr = Number(treffer[1]);
          const wert = antworten[nr]?.[0] ?? '';
          const richtig = teil.fragen.find((f) => f.nr === nr)?.loesung?.[0];
          const farbe = abgegeben ? (wert === richtig ? 'var(--success)' : 'var(--danger)') : 'var(--border)';
          return (
            <select
              key={i}
              class="feld mx-1 my-1 inline-block align-middle text-sm"
              style={{ borderColor: farbe, borderWidth: '2px', width: 'auto', minWidth: '6.5rem' }}
              aria-label={`Lücke ${nr}`}
              data-luecke={nr}
              disabled={abgegeben}
              value={wert}
              onChange={(e) => setAntwort(nr, [(e.target as HTMLSelectElement).value])}
            >
              <option value="">— {nr} —</option>
              {saetze.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.key}) {s.text.slice(0, 60)}
                </option>
              ))}
            </select>
          );
        })}
      </p>
      <details class="aufklapp mt-3">
        <summary class="text-sm">Satzoptionen a–h</summary>
        <ul class="m-0 mt-2 list-none p-0 text-sm">
          {saetze.map((s) => (
            <li key={s.key} class="py-0.5">
              <strong class="mr-1">{s.key})</strong>
              {s.text}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * TestDaF-Modul — merender satu soal TestDaF.
 * Typen: zuordnung (A–I) · mc3 (A/B/C) · jn3 (Ja/Nein/Text sagt dazu nichts)
 *        · richtigfalsch · kurzantwort (offen, halbautomatisch bewertet)
 */
import type { TestdafAufgabe, TestdafFrage } from '../data/testdaf';
import { frageOptionen } from '../lib/testdaf-content';
import type { TestdafItemAuswertung } from '../lib/testdaf-scoring';

export interface TestdafQuestionItemProps {
  frage: TestdafFrage;
  aufgabe: TestdafAufgabe;
  wert: string[];
  onChange: (keys: string[]) => void;
  abgegeben?: boolean;
  auswertung?: TestdafItemAuswertung | null;
  /** nur für kurzantwort: Selbstkorrektur nach Einsicht der Musterlösung */
  onSelbstkorrektur?: (richtig: boolean) => void;
}

const kurzLabel = (s: string) => (s.length > 42 ? s.slice(0, 40).trimEnd() + '…' : s);

export default function TestdafQuestionItem({
  frage,
  aufgabe,
  wert,
  onChange,
  abgegeben = false,
  auswertung = null,
  onSelbstkorrektur
}: TestdafQuestionItemProps) {
  const optionen = frageOptionen(aufgabe, frage);
  const gegeben = wert.filter((w) => w.trim() !== '');
  const offen = abgegeben && gegeben.length === 0;
  const richtig = abgegeben && auswertung ? auswertung.richtig && !offen : false;
  const falsch = abgegeben && auswertung ? !auswertung.richtig && !offen : false;

  const rand = richtig
    ? 'border-l-4 border-l-[var(--success)]'
    : falsch
      ? 'border-l-4 border-l-[var(--danger)]'
      : offen
        ? 'border-l-4 border-l-[var(--warn)] border-dashed'
        : 'border-l-4 border-l-transparent';

  const selbstWahl = auswertung?.selbst ? (auswertung.richtig ? 'richtig' : 'falsch') : '';

  /** Nach der Abgabe: Lösung grün, eigene falsche Wahl rot (wie im B2-Modul). */
  const optionKlasse = (key: string, aktiv: boolean) => {
    if (!abgegeben) return aktiv ? 'option option-aktiv' : 'option';
    if (frage.loesung.some((l) => l.toLowerCase() === key.toLowerCase())) return 'option option-richtig';
    if (aktiv) return 'option option-falsch';
    return 'option';
  };

  return (
    <li
      class={`karte ${rand}`}
      id={`frage-${frage.nr}`}
      tabindex={-1}
      data-frage={frage.nr}
      data-typ={frage.typ}
      aria-label={`Aufgabe ${frage.nr}`}
    >
      <div class="mb-2 flex flex-wrap items-baseline gap-2">
        <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] px-1.5 text-xs font-bold text-[var(--accent)]">
          {frage.nr}
        </span>
        <p class="m-0 grow text-[0.98rem] font-semibold">{frage.stamm_de}</p>
        {abgegeben ? (
          <span class={richtig ? 'chip chip-erfolg' : falsch ? 'chip chip-gefahr' : 'chip chip-warn'}>
            {richtig ? '✓ richtig' : falsch ? '✗ falsch' : '○ offen'}
          </span>
        ) : (
          <span class="chip">{frage.punkte ?? 1} Punkt</span>
        )}
      </div>
      <p class="ruhig m-0 mb-2.5">{frage.stamm_id}</p>

      {frage.typ === 'kurzantwort' ? (
        <label class="block">
          <span class="ruhig mb-1 block text-xs font-bold tracking-wide uppercase">
            Antwort in Stichworten / Jawaban kata kunci
          </span>
          <input
            type="text"
            class="feld"
            style={abgegeben ? { borderColor: richtig ? 'var(--success)' : offen ? 'var(--border)' : 'var(--danger)' } : undefined}
            value={gegeben.join(' ')}
            disabled={abgegeben}
            data-frage={frage.nr}
            placeholder="Stichwörter …"
            onInput={(e) => onChange([(e.target as HTMLInputElement).value])}
          />
        </label>
      ) : frage.typ === 'zuordnung' ? (
        <div class="flex flex-wrap items-center gap-2">
          <span class="ruhig text-sm">Buchstabe:</span>
          <select
            class="feld"
            style={{
              width: 'auto',
              minWidth: '15rem',
              borderColor: abgegeben ? (richtig ? 'var(--success)' : offen ? 'var(--border)' : 'var(--danger)') : undefined
            }}
            disabled={abgegeben}
            data-frage={frage.nr}
            aria-label={`Antwort zu Aufgabe ${frage.nr}`}
            value={wert[0] ?? ''}
            onChange={(e) => onChange([(e.target as HTMLSelectElement).value])}
          >
            <option value="">— bitte wählen —</option>
            {optionen.map((o) => (
              <option key={o.key} value={o.key}>
                {o.key.toUpperCase()}) {kurzLabel(o.text)}
              </option>
            ))}
          </select>
        </div>
      ) : frage.typ === 'richtigfalsch' || frage.typ === 'jn3' ? (
        <div class="flex flex-wrap gap-2" role="group" aria-label={`Antwort zu Aufgabe ${frage.nr}`}>
          {optionen.map((o) => {
            const aktiv = wert.includes(o.key);
            const istLoesung = abgegeben && frage.loesung.some((l) => l.toLowerCase() === o.key.toLowerCase());
            const klasse = abgegeben
              ? istLoesung
                ? 'btn grow border-[var(--success)] bg-[var(--success-soft)]'
                : aktiv
                  ? 'btn grow border-[var(--danger)] bg-[var(--danger-soft)]'
                  : 'btn grow'
              : `btn grow ${aktiv ? 'btn-primaer' : ''}`;
            return (
              <button
                type="button"
                class={klasse}
                aria-pressed={aktiv}
                disabled={abgegeben}
                data-option={o.key}
                data-frage={frage.nr}
                onClick={() => onChange([o.key])}
              >
                {o.text}
              </button>
            );
          })}
        </div>
      ) : (
        <ul
          class="m-0 flex list-none flex-col gap-1.5 p-0"
          role="radiogroup"
          aria-label={`Optionen zu Aufgabe ${frage.nr}`}
        >
          {optionen.map((o) => {
            const aktiv = wert.includes(o.key);
            const marke = !abgegeben ? null : frage.loesung.some((l) => l.toLowerCase() === o.key.toLowerCase()) ? '✓' : aktiv ? '✗' : null;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  class={optionKlasse(o.key, aktiv)}
                  role="radio"
                  aria-checked={aktiv}
                  disabled={abgegeben}
                  data-option={o.key}
                  data-frage={frage.nr}
                  onClick={() => onChange([o.key])}
                >
                  <span class="option-taste" aria-hidden="true">
                    {o.key.toUpperCase()}
                  </span>
                  <span class="option-text">{o.text}</span>
                  {marke ? (
                    <span
                      class={`option-marke ${marke === '✓' ? 'option-marke-richtig' : 'option-marke-falsch'}`}
                      aria-hidden="true"
                    >
                      {marke}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {abgegeben && auswertung ? (
        <div class="mt-2.5 border-t border-[var(--border)] pt-2">
          <p
            class={`m-0 text-sm font-semibold ${
              richtig ? 'text-[var(--success)]' : offen ? 'text-[var(--muted)]' : 'text-[var(--danger)]'
            }`}
          >
            {richtig ? '✓ Richtig' : offen ? '○ Unbeantwortet' : '✗ Falsch'} —{' '}
            {frage.typ === 'kurzantwort' ? 'Musterlösung' : 'Lösung'}:{' '}
            <strong>{frage.loesung.join(' · ')}</strong>
            {gegeben.length > 0 && !richtig ? ` (deine Antwort: ${gegeben.join(' · ')})` : ''}
          </p>
          {auswertung.hinweis ? <p class="ruhig m-0 text-xs">{auswertung.hinweis}</p> : null}

          {auswertung.halbautomatisch && !offen ? (
            <div
              class="mt-2 flex flex-wrap items-center gap-2"
              role="group"
              aria-label={`Selbstkorrektur Aufgabe ${frage.nr}`}
            >
              <span class="ruhig text-xs">
                Offene Aufgabe — automatisch vorbewertet. Sinngemäße Antwort? Selbst bewerten:
              </span>
              <button
                type="button"
                class={`btn btn-klein ${selbstWahl === 'richtig' ? 'btn-primaer' : ''}`}
                onClick={() => onSelbstkorrektur?.(true)}
              >
                richtig
              </button>
              <button
                type="button"
                class={`btn btn-klein ${selbstWahl === 'falsch' ? 'btn-primaer' : ''}`}
                onClick={() => onSelbstkorrektur?.(false)}
              >
                falsch
              </button>
            </div>
          ) : null}

          <details class="aufklapp mt-2">
            <summary class="text-sm">Erklärung / Penjelasan</summary>
            <div class="prosa mt-2 text-sm">
              <p class="m-0">{frage.explain_de}</p>
              <p class="m-0 ruhig">{frage.explain_id}</p>
              <p class="m-0 mt-1.5 flex flex-wrap items-baseline gap-1.5">
                <span class="chip">Beleg {aufgabe.bereich === 'hoeren' ? 'im Transkript' : 'im Text'}</span>{' '}
                <em>„{frage.evidence}“</em>
              </p>
              {frage.schluessel?.length ? (
                <p class="ruhig m-0 mt-1 text-xs">
                  Schlüsselwörter: {(frage.schluessel ?? []).map((g) => g.join(' / ')).join(' · ')}
                </p>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </li>
  );
}

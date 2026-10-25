/** B2-Trainer — merender satu soal sesuai tipe (zuordnung | mc3 | richtigfalsch | satz-luecke | ueberschrift). */
import type { Frage, Teil } from '../data/schema';

export interface QuestionItemProps {
  frage: Frage;
  teil: Teil;
  wert: string[];
  onChange: (keys: string[]) => void;
  /** setelah Abgeben: input dikunci + kunci jawaban tampil */
  abgegeben?: boolean;
  onWort?: (wort: string) => void;
  kompakt?: boolean;
}

function optionenFuer(teil: Teil, frage: Frage) {
  if (frage.optionen && frage.optionen.length) return frage.optionen;
  if (frage.typ === 'satz-luecke') return teil.optionen_saetze ?? [];
  if (frage.typ === 'ueberschrift') return teil.ueberschriften ?? [];
  if (frage.typ === 'richtigfalsch')
    return [
      { key: 'richtig', text: 'Richtig' },
      { key: 'falsch', text: 'Falsch' }
    ];
  return [];
}

export default function QuestionItem({
  frage,
  teil,
  wert,
  onChange,
  abgegeben = false,
  kompakt = false
}: QuestionItemProps) {
  const optionen = optionenFuer(teil, frage);
  const loesung = frage.loesung ?? [];
  const mehrfach = (loesung.length ?? 1) > 1 && teil.teil === 5;
  const istRichtig = abgegeben && wert.length > 0 && gleich(wert, loesung);
  const istFalsch = abgegeben && wert.length > 0 && !gleich(wert, loesung);
  const istOffen = abgegeben && wert.length === 0;

  const waehle = (key: string) => {
    if (abgegeben) return;
    if (mehrfach) onChange(wert.includes(key) ? wert.filter((k) => k !== key) : [...wert, key]);
    else onChange([key]);
  };

  /** Zustand einer Option nach der Abgabe: grün = Lösung, rot = eigener Fehler. */
  const optionKlasse = (key: string, aktiv: boolean) => {
    if (!abgegeben) return aktiv ? 'option option-aktiv' : 'option';
    if (loesung.includes(key)) return 'option option-richtig';
    if (aktiv) return 'option option-falsch';
    return 'option';
  };

  const rand = istRichtig
    ? 'border-l-4 border-l-[var(--success)]'
    : istFalsch
      ? 'border-l-4 border-l-[var(--danger)]'
      : istOffen
        ? 'border-l-4 border-l-[var(--warn)] border-dashed'
        : 'border-l-4 border-l-transparent';

  return (
    <li
      class={`karte ${rand} ${kompakt ? 'karte-kompakt' : ''}`}
      id={`frage-${frage.nr}`}
      tabindex={-1}
      data-frage={frage.nr}
      aria-label={`Aufgabe ${frage.nr}`}
    >
      <div class="mb-2 flex flex-wrap items-baseline gap-2">
        <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] px-1.5 text-xs font-bold text-[var(--accent)]">
          {frage.nr}
        </span>
        <p class="m-0 grow text-[0.98rem] font-semibold">{frage.stamm_de}</p>
        {abgegeben ? (
          <span class={istRichtig ? 'chip chip-erfolg' : istFalsch ? 'chip chip-gefahr' : 'chip chip-warn'}>
            {istRichtig ? '✓ richtig' : istFalsch ? '✗ falsch' : '○ offen'}
          </span>
        ) : (
          <span class="chip">{frage.punkte ?? 1} Punkt</span>
        )}
      </div>
      <p class="ruhig m-0 mb-2.5">{frage.stamm_id}</p>

      {frage.typ === 'richtigfalsch' ? (
        <div class="flex gap-2" role="group" aria-label={`Antwort zu Aufgabe ${frage.nr}`}>
          {optionen.map((o) => {
            const aktiv = wert.includes(o.key);
            const nachAbgabe = abgegeben && frage.loesung.includes(o.key) ? 'border-[var(--success)] bg-[var(--success-soft)]' : '';
            return (
              <button
                type="button"
                class={`btn grow ${aktiv ? 'btn-primaer' : ''} ${nachAbgabe}`}
                aria-pressed={aktiv}
                disabled={abgegeben}
                data-option={o.key}
                data-frage={frage.nr}
                onClick={() => waehle(o.key)}
              >
                {o.text}
              </button>
            );
          })}
        </div>
      ) : (
        <ul
          class="m-0 flex list-none flex-col gap-1.5 p-0"
          role={mehrfach ? 'group' : 'radiogroup'}
          aria-label={`Optionen zu Aufgabe ${frage.nr}`}
        >
          {optionen.map((o) => {
            const aktiv = wert.includes(o.key);
            const marke = !abgegeben ? null : frage.loesung.includes(o.key) ? '✓' : aktiv ? '✗' : null;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  class={optionKlasse(o.key, aktiv)}
                  role={mehrfach ? 'checkbox' : 'radio'}
                  aria-checked={aktiv}
                  disabled={abgegeben}
                  data-option={o.key}
                  data-frage={frage.nr}
                  onClick={() => waehle(o.key)}
                >
                  <span class="option-taste" aria-hidden="true">
                    {o.key}
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

      {abgegeben ? (
        <div class="mt-2.5 border-t border-[var(--border)] pt-2">
          <p
            class={`m-0 text-sm font-semibold ${istRichtig ? 'text-[var(--success)]' : istOffen ? 'text-[var(--muted)]' : 'text-[var(--danger)]'}`}
          >
            {istRichtig ? '✓ Richtig' : istOffen ? '○ Unbeantwortet' : '✗ Falsch'} — Lösung:{' '}
            <strong>{frage.loesung.join(', ')}</strong>
            {wert.length > 0 && !istRichtig ? ` (deine Antwort: ${wert.join(', ')})` : ''}
          </p>
          <details class="aufklapp mt-1.5">
            <summary class="text-sm">Erklärung / Penjelasan</summary>
            <div class="prosa mt-2 text-sm">
              <p class="m-0">{frage.explain_de}</p>
              <p class="m-0 ruhig">{frage.explain_id}</p>
              <p class="m-0 mt-1.5 flex flex-wrap items-baseline gap-1.5">
                <span class="chip">Beleg im Text</span> <em>„{frage.evidence}“</em>
              </p>
            </div>
          </details>
        </div>
      ) : null}
    </li>
  );
}

function gleich(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].map((s) => s.trim().toLowerCase()).sort();
  const y = [...b].map((s) => s.trim().toLowerCase()).sort();
  return x.every((v, i) => v === y[i]);
}

/** B2-Trainer — ringkasan progres di Dashboard (membaca IndexedDB di klien). */
import { useEffect, useState } from 'preact/hooks';
import { aggregiere, formatDauer, type Aggregat } from '../lib/analyse';
import { ladeLogs, ladeSesionen, verfuegbar } from '../lib/storage';
import { TYP_LABEL } from '../lib/format';

export default function DashboardStats() {
  const [agg, setAgg] = useState<Aggregat | null>(null);
  const [fehler, setFehler] = useState<string>('');

  useEffect(() => {
    (async () => {
      if (!verfuegbar()) {
        setFehler('IndexedDB nicht verfügbar — Fortschritt wird nicht gespeichert.');
        return;
      }
      try {
        const [s, l] = await Promise.all([ladeSesionen(), ladeLogs()]);
        setAgg(aggregiere(s, l));
      } catch (e) {
        setFehler('Fortschritt konnte nicht gelesen werden.');
      }
    })();
  }, []);

  if (fehler) return <p class="meldung meldung-warn text-sm">{fehler}</p>;
  if (!agg) return <p class="ruhig text-sm">Fortschritt wird geladen …</p>;

  if (agg.sesionen === 0) {
    return (
      <div class="karte">
        <h2 class="m-0 text-lg font-bold">Dein Fortschritt</h2>
        <p class="m-0 ruhig">
          Noch keine Sitzung gespeichert. Starte eine Unit unter <a href="/lesen/">Lesen</a> oder{' '}
          <a href="/hoeren/">Hören</a> — die Auswertung erscheint danach hier und unter{' '}
          <a href="/statistik/">Statistik</a>.
        </p>
      </div>
    );
  }

  return (
    <div class="karte" data-testid="dashboard-stats">
      <h2 class="m-0 text-lg font-bold">Dein Fortschritt</h2>
      <div class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Kennzahl label="Sitzungen" wert={String(agg.sesionen)} />
        <Kennzahl label="Trefferquote" wert={`${agg.akkuratProzent}%`} />
        <Kennzahl label="Serie" wert={`${agg.streak} Tag(e)`} />
        <Kennzahl label="Übungszeit" wert={formatDauer(agg.sekundenGesamt)} />
      </div>
      <p class="ruhig m-0 mt-3 text-sm">
        {agg.richtig} richtig · {agg.falsch} falsch · {agg.offen} unbeantwortet von {agg.aufgaben} Aufgaben · geschätzte
        Prüfungsreife (letzte 5 Sitzungen): <strong>{agg.bereitProzent} von 100</strong>
      </p>
      {agg.schwaechen.length ? (
        <p class="m-0 mt-2 text-sm">
          Größte Baustellen:{' '}
          {agg.schwaechen
            .map((s) => `${TYP_LABEL[s.label] ?? s.label} (${s.akkuratProzent}%)`)
            .join(' · ')}{' '}
          — gezielt üben im <a href="/fehlerheft/">Fehlerheft</a>.
        </p>
      ) : null}
    </div>
  );
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div class="kennzahl">
      <div class="kennzahl-label">{label}</div>
      <div class="kennzahl-wert">{wert}</div>
    </div>
  );
}

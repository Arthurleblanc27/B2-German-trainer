/** B2-Trainer — menampilkan kembali sesi terakhir / sesi tertentu dari IndexedDB. */
import { useEffect, useState } from 'preact/hooks';
import type { ItemLogRow, SesiRow } from '../lib/storage';
import { ladeLogs, ladeSesionen, verfuegbar } from '../lib/storage';
import { TYP_LABEL, formatDatumDe } from '../lib/format';
import { ScoreRing } from './Ergebnis';

export default function ErgebnisView() {
  const [sesi, setSesi] = useState<SesiRow | null>(null);
  const [logs, setLogs] = useState<ItemLogRow[]>([]);
  const [status, setStatus] = useState('Sitzung wird geladen …');

  useEffect(() => {
    (async () => {
      if (!verfuegbar()) {
        setStatus('IndexedDB nicht verfügbar.');
        return;
      }
      const id = Number(new URLSearchParams(window.location.search).get('sesi'));
      const alle = await ladeSesionen();
      const alleLogs = await ladeLogs();
      const gewaehlt = id ? alle.find((s) => s.id === id) : [...alle].sort((a, b) => b.datum.localeCompare(a.datum))[0];
      if (!gewaehlt) {
        setStatus('Keine gespeicherte Sitzung gefunden. Starte eine Unit unter Lesen oder Hören.');
        return;
      }
      setSesi(gewaehlt);
      setLogs(alleLogs.filter((l) => l.sesiId === gewaehlt.id));
      setStatus('');
    })();
  }, []);

  if (!sesi) return <p class="karte">{status}</p>;

  const istTestdaf = typeof sesi.unitId === 'string' && sesi.unitId.startsWith('testdaf');
  const falsche = logs.filter((l) => !l.richtig && !l.offen);
  const offene = logs.filter((l) => l.offen);
  return (
    <div class="flex flex-col gap-4" data-testid="ergebnis-view">
      <section class="karte flex flex-wrap items-center gap-5">
        <ScoreRing prozent={sesi.skalierung} />
        <div>
          <h1 class="m-0 text-xl font-bold">
            {istTestdaf ? 'TestDaF · ' : ''}
            {sesi.skill === 'lesen' ? 'Leseverstehen' : sesi.skill === 'hoeren' ? 'Hörenverstehen' : 'Modelltest'} ·{' '}
            {istTestdaf ? 'Aufgabe' : 'Teil'} {sesi.teil}
          </h1>
          <p class="m-0 ruhig">
            {formatDatumDe(sesi.datum)} · {sesi.modus === 'pruefung' ? 'Prüfungsmodus' : 'Übungsmodus'}
          </p>
          <p class="m-0 mt-2">
            <strong>
              {sesi.punkte} von {sesi.punkteMax} Punkten
            </strong>{' '}
            · {sesi.benar} richtig · {sesi.salah} falsch · {sesi.offen} unbeantwortet
          </p>
        </div>
      </section>

      {logs.length ? (
        <section class="karte">
          <h2 class="m-0 text-lg font-bold">Aufgaben im Detail</h2>
          <ol class="m-0 mt-2 flex list-none flex-col gap-3 p-0">
            {logs.map((l) => (
              <li class="border-b border-[var(--border)] pb-2 text-sm" key={`${l.itemId}-${l.frageNr}`}>
                <div class="flex flex-wrap items-baseline gap-2">
                  <strong>Aufgabe {l.frageNr}</strong>
                  <span class="chip">{TYP_LABEL[l.typ] ?? l.typ}</span>
                  <span class={l.richtig ? 'text-[var(--success)]' : l.offen ? 'text-[var(--muted)]' : 'text-[var(--danger)]'}>
                    {l.richtig ? '✓ richtig' : l.offen ? '○ unbeantwortet' : '✗ falsch'}
                  </span>
                </div>
                <p class="m-0">{l.stamm_de}</p>
                <p class="ruhig m-0">{l.stamm_id}</p>
                <p class="m-0">
                  Deine Antwort: {l.gegeben.join(', ') || '—'} · Lösung: {l.loesung.join(', ')}
                </p>
                <details>
                  <summary class="cursor-pointer text-[var(--accent)]">Erklärung &amp; Beleg</summary>
                  <p class="m-0">{l.explain_de}</p>
                  <p class="ruhig m-0">{l.explain_id}</p>
                  <p class="m-0">
                    <em>„{l.evidence}“</em>
                  </p>
                </details>
              </li>
            ))}
          </ol>
          <p class="ruhig mt-2 text-sm">
            {falsche.length} falsch · {offene.length} unbeantwortet (getrennt ausgewiesen).
          </p>
        </section>
      ) : (
        <p class="meldung meldung-warn">Für diese Sitzung liegen keine Aufgabenprotokolle vor.</p>
      )}
    </div>
  );
}

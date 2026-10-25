/** B2-Trainer — halaman/kartu hasil penilaian satu Teil. */
import type { Teil } from '../data/schema';
import type { Modus, TeilErgebnis } from '../lib/scoring';
import { TYP_LABEL, scoreFarbe } from '../lib/format';

export interface ErgebnisProps {
  teil: Teil;
  ergebnis: TeilErgebnis;
  modus: Modus;
  onWiederholen: () => void;
  onNurFehler: () => void;
  onWeiter?: () => void;
  naechsterTeilLabel?: string;
}

export function ScoreRing({ prozent, groesse = 132 }: { prozent: number; groesse?: number }) {
  const r = groesse / 2 - 10;
  const umfang = 2 * Math.PI * r;
  const anteil = Math.max(0, Math.min(100, prozent)) / 100;
  const farbe = scoreFarbe(prozent);
  return (
    <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} role="img" aria-label={`${prozent} von 100 Punkten`}>
      <circle cx={groesse / 2} cy={groesse / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle
        cx={groesse / 2}
        cy={groesse / 2}
        r={r}
        fill="none"
        stroke={farbe}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${umfang * anteil} ${umfang}`}
        transform={`rotate(-90 ${groesse / 2} ${groesse / 2})`}
      />
      <text
        x="50%"
        y="50%"
        text-anchor="middle"
        dominant-baseline="central"
        font-size={groesse / 4}
        font-weight="800"
        fill="var(--ink)"
      >
        {prozent}
      </text>
      <text x="50%" y="68%" text-anchor="middle" font-size="11" fill="var(--muted)">
        von 100
      </text>
    </svg>
  );
}

export default function Ergebnis({
  teil,
  ergebnis,
  modus,
  onWiederholen,
  onNurFehler,
  onWeiter,
  naechsterTeilLabel
}: ErgebnisProps) {
  const prozent = ergebnis.punkteMax ? Math.round((ergebnis.punkte / ergebnis.punkteMax) * 100) : 0;
  const farbe = scoreFarbe(prozent);
  const label =
    prozent >= 90 ? 'sehr gut' : prozent >= 80 ? 'gut' : prozent >= 60 ? 'bestanden' : 'nicht bestanden';
  const fehler = ergebnis.items.filter((i) => !i.richtig && !i.offen);
  const offene = ergebnis.items.filter((i) => i.offen);

  return (
    <section class="flex flex-col gap-4" aria-labelledby="ergebnis-titel" data-testid="ergebnis">
      <div class="karte flex flex-wrap items-center gap-5">
        <ScoreRing prozent={prozent} />
        <div class="grow">
          <h2 id="ergebnis-titel" class="m-0 text-xl font-bold">
            Ergebnis · Teil {teil.teil}
          </h2>
          <p class="m-0 ruhig">{teil.titel}</p>
          <div class="mt-2.5 flex flex-wrap items-center gap-2" aria-live="polite">
            <span class="chip chip-akzent">
              <strong>
                {ergebnis.punkte} von {ergebnis.punkteMax} Punkten
              </strong>
            </span>
            <span class="chip chip-erfolg">{ergebnis.benar} richtig</span>
            <span class={ergebnis.salah ? 'chip chip-gefahr' : 'chip'}>{ergebnis.salah} falsch</span>
            {ergebnis.offen ? <span class="chip chip-warn">{ergebnis.offen} unbeantwortet</span> : null}
            <span class="chip" style={{ color: farbe, borderColor: farbe }}>
              Bewertung: <em>{label}</em>
            </span>
          </div>
          <p class="ruhig m-0 text-sm">
            {modus === 'pruefung'
              ? 'Prüfungsmodus: unbeantwortete Aufgaben zählen als Fehler (separat ausgewiesen).'
              : 'Übungsmodus: unbeantwortete Aufgaben werden nicht als Fehler gewertet.'}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="btn btn-primaer" onClick={onWiederholen} data-testid="wiederholen">
              Teil wiederholen
            </button>
            <button class="btn" onClick={onNurFehler} disabled={fehler.length === 0} data-testid="nur-fehler">
              Nur Fehler wiederholen ({fehler.length})
            </button>
            {onWeiter ? (
              <button class="btn" onClick={onWeiter} data-testid="weiter">
                Weiter: {naechsterTeilLabel ?? 'nächster Teil'} →
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {ergebnis.items.length ? (
        <div class="karte">
          <h3 class="m-0 mb-2 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Auswertung je Aufgabe</h3>
          <table class="tabelle">
            <thead>
              <tr>
                <th scope="col">Nr.</th>
                <th scope="col">Typ</th>
                <th scope="col">Status</th>
                <th scope="col">Deine Antwort</th>
                <th scope="col">Lösung</th>
              </tr>
            </thead>
            <tbody>
              {ergebnis.items.map((i) => (
                <tr key={i.frageNr}>
                  <td>{i.frageNr}</td>
                  <td>{TYP_LABEL[i.typ] ?? i.typ}</td>
                  <td>
                    <span
                      class={
                        i.richtig ? 'chip chip-erfolg' : i.offen ? 'chip chip-warn' : 'chip chip-gefahr'
                      }
                    >
                      {i.richtig ? '✓ richtig' : i.offen ? '○ offen' : '✗ falsch'}
                    </span>
                  </td>
                  <td>{i.gegeben.join(', ') || '—'}</td>
                  <td>{i.loesung.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="ruhig mt-2 text-sm">
            {fehler.length} falsch · {offene.length} unbeantwortet — beides getrennt ausgewiesen, damit du den Unterschied
            siehst.
          </p>
        </div>
      ) : null}
    </section>
  );
}

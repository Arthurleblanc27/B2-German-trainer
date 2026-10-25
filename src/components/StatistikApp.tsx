/** B2-Trainer — Statistik-Island: liest IndexedDB, aggregiert und rendert alle Auswertungen. */
import { useEffect, useState } from 'preact/hooks';
import { aggregiere, formatDauer, type Aggregat } from '../lib/analyse';
import { ladeLogs, ladeSesionen, loescheAlles, verfuegbar, type SesiRow } from '../lib/storage';
import { TYP_LABEL, formatDatumDe, scoreFarbe } from '../lib/format';
import StatsChart from './StatsChart';
import Heatmap from './Heatmap';

const MODUL_LABEL: Record<string, string> = {
  lesen: 'Leseverstehen',
  hoeren: 'Hörenverstehen',
  pruefung: 'Modelltest'
};

/** Modulspalte: TestDaF-Sitzungen werden als solche gekennzeichnet. */
const modulLabel = (s: SesiRow) =>
  typeof s.unitId === 'string' && s.unitId.startsWith('testdaf')
    ? `TestDaF ${s.skill === 'hoeren' ? 'Hören' : 'Lesen'}`
    : MODUL_LABEL[s.skill] ?? s.skill;

/** Hinweis + Zielseite je Aufgabentyp für konkrete Übungsempfehlungen. */
const TYP_HINWEIS: Record<string, { seite: string; label: string; text: string }> = {
  zuordnung: { seite: '/lesen/', label: 'Lesen', text: 'Lesen Teil 1 – Aussagen zuordnen' },
  'satz-luecke': { seite: '/lesen/', label: 'Lesen', text: 'Lesen Teil 2 – Sätze in Lücken' },
  mc3: {
    seite: '/hoeren/',
    label: 'Hören',
    text: 'Multiple Choice – Lesen Teil 3 / Hören Teil 2 und 4'
  },
  'aussagen-person': { seite: '/hoeren/', label: 'Hören', text: 'Aussagen zu Personen – Lesen Teil 4 / Hören Teil 3' },
  ueberschrift: { seite: '/lesen/', label: 'Lesen', text: 'Lesen Teil 5 – Überschriften zuordnen' },
  richtigfalsch: { seite: '/hoeren/', label: 'Hören', text: 'Hören Teil 1 – Richtig/Falsch zu Gesprächen' },
  jn3: {
    seite: '/testdaf/',
    label: 'TestDaF',
    text: 'TestDaF Leseverstehen Aufgabe 3 – „Ja / Nein / Text sagt dazu nichts“'
  },
  kurzantwort: {
    seite: '/testdaf/',
    label: 'TestDaF',
    text: 'TestDaF Hörverstehen Aufgabe 1 und 3 – Kurzantworten im TestDaF-Modul'
  }
};

const themaLabel = (thema: string) => (thema && thema.trim() ? thema : 'Ohne Themenfeld');

export default function StatistikApp() {
  const [agg, setAgg] = useState<Aggregat | null>(null);
  const [sesionen, setSesionen] = useState<SesiRow[]>([]);
  const [fehler, setFehler] = useState('');
  const [status, setStatus] = useState('Daten werden geladen …');
  const [busy, setBusy] = useState(false);

  async function laden() {
    if (!verfuegbar()) {
      setFehler('IndexedDB ist in diesem Browser nicht verfügbar — es kann keine Statistik gespeichert werden.');
      setStatus('');
      return;
    }
    try {
      const [s, l] = await Promise.all([ladeSesionen(), ladeLogs()]);
      setSesionen(s);
      setAgg(aggregiere(s, l));
      setStatus(s.length ? `${s.length} Sitzung(en) geladen.` : 'Noch keine Sitzung gespeichert.');
    } catch {
      setFehler('Die gespeicherten Daten konnten nicht gelesen werden.');
      setStatus('');
    }
  }

  useEffect(() => {
    void laden();
  }, []);

  async function zuruecksetzen() {
    const ok = window.confirm(
      'Wirklich alle gespeicherten Sitzungen, Aufgabenprotokolle, Fehler und Vokabeln löschen? Diese Aktion kann nicht rückgängig gemacht werden.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      await loescheAlles();
      window.location.reload();
    } catch {
      setBusy(false);
      setStatus('Zurücksetzen ist fehlgeschlagen.');
    }
  }

  return (
    <div class="flex flex-col gap-5" data-testid="statistik-app">
      <p class="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {fehler ? (
        <p class="meldung meldung-warn m-0" role="alert">
          {fehler}
        </p>
      ) : null}

      {!agg ? (
        <p class="karte ruhig m-0">Statistik wird geladen …</p>
      ) : agg.sesionen === 0 ? (
        <LeerZustand />
      ) : (
        <Inhalt agg={agg} sesionen={sesionen} />
      )}

      {agg && agg.sesionen > 0 ? (
        <section class="karte" aria-labelledby="daten-titel">
          <h2 id="daten-titel" class="m-0 text-lg font-bold">
            Daten verwalten
          </h2>
          <p class="ruhig m-0 mt-2 text-sm">
            Alle Fortschrittsdaten liegen ausschließlich lokal in diesem Browser (IndexedDB). Das Zurücksetzen löscht
            Sitzungen, Aufgabenprotokolle, Fehlerheft und Vokabelliste unwiderruflich.
          </p>
          <button class="btn mt-3" type="button" onClick={zuruecksetzen} disabled={busy} data-testid="reset">
            {busy ? 'Wird gelöscht …' : 'Daten zurücksetzen'}
          </button>
        </section>
      ) : null}
    </div>
  );
}

function LeerZustand() {
  return (
    <section class="karte" data-testid="statistik-leer">
      <h2 class="m-0 text-lg font-bold">Noch keine Statistik</h2>
      <p class="m-0 mt-2">
        Sobald du eine Unit abschließt, erscheinen hier deine Auswertungen: Trefferquote je Teil, Aufgabentyp und
        Themenfeld, eine Aktivitätskarte der letzten 12 Wochen, der 30-Tage-Trend und deine größten Baustellen.
      </p>
      <p class="m-0 mt-2">Starte jetzt mit einer Übung — die Zahlen füllen sich automatisch:</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <a class="btn btn-primaer" href="/lesen/">
          Leseverstehen üben
        </a>
        <a class="btn" href="/hoeren/">
          Hörenverstehen üben
        </a>
        <a class="btn" href="/pruefung/">
          Modelltest simulieren
        </a>
      </div>
    </section>
  );
}

function Inhalt({ agg, sesionen }: { agg: Aggregat; sesionen: SesiRow[] }) {
  const letzte = [...sesionen].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 15);

  return (
    <>
      <section class="karte" aria-labelledby="ueberblick-titel">
        <h2 id="ueberblick-titel" class="m-0 text-lg font-bold">
          Überblick
        </h2>
        <div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kennzahl label="Sitzungen" wert={String(agg.sesionen)} />
          <Kennzahl label="Trefferquote" wert={`${agg.akkuratProzent}%`} farbe={scoreFarbe(agg.akkuratProzent)} />
          <Kennzahl label="Serie" wert={`${agg.streak} Tag(e)`} />
          <Kennzahl label="Übungszeit" wert={formatDauer(agg.sekundenGesamt)} />
        </div>
        <div class="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <span class="text-xs uppercase tracking-wide text-[var(--muted)]">Geschätzte Prüfungsreife</span>
          <div class="text-2xl font-bold" style={{ color: scoreFarbe(agg.bereitProzent) }}>
            {agg.bereitProzent} / 100
          </div>
          <p class="ruhig m-0 text-xs">
            Formel: gerundeter Mittelwert der Skalierung (0–100) der letzten 5 Sitzungen; Sitzungen im Prüfungsmodus
            zählen doppelt. Bestehensgrenze liegt bei 60.
          </p>
        </div>
        <p class="ruhig m-0 mt-3 text-sm">
          {agg.richtig} richtig · {agg.falsch} falsch · {agg.offen} unbeantwortet von {agg.aufgaben} Aufgaben.
        </p>
      </section>

      <section class="karte" aria-labelledby="teil-titel">
        <h2 id="teil-titel" class="m-0 text-lg font-bold">
          Trefferquote je Teil
        </h2>
        <p class="ruhig m-0 mt-1 mb-3 text-sm">
          Alle Sitzungen zusammengefasst; Lesen und Hören werden je Teilnummer gebündelt (Teil 1–5).
        </p>
        {agg.perTeil.length ? (
          <div class="flex flex-col gap-3">
            <StatsChart
              daten={agg.perTeil.map((t) => ({ label: `Teil ${t.teil}`, wert: t.akkuratProzent, anzahl: t.total }))}
              titel="Trefferquote je Teil"
            />
            <div class="overflow-x-auto">
              <table class="tabelle">
                <thead>
                  <tr>
                    <th scope="col">Teil</th>
                    <th scope="col">Richtig</th>
                    <th scope="col">Aufgaben</th>
                    <th scope="col">Trefferquote</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.perTeil.map((t) => (
                    <tr key={t.teil}>
                      <td>Teil {t.teil}</td>
                      <td>{t.richtig}</td>
                      <td>{t.total}</td>
                      <td style={{ color: scoreFarbe(t.akkuratProzent) }}>{t.akkuratProzent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p class="ruhig m-0">Noch keine Aufgaben protokolliert.</p>
        )}
      </section>

      <section class="karte" aria-labelledby="typ-titel">
        <h2 id="typ-titel" class="m-0 text-lg font-bold">
          Trefferquote je Aufgabentyp
        </h2>
        {agg.perTyp.length ? (
          <div class="mt-3 flex flex-col gap-3">
            <StatsChart
              daten={agg.perTyp.map((t) => ({
                label: TYP_LABEL[t.typ] ?? t.typ,
                wert: t.akkuratProzent,
                anzahl: t.total
              }))}
              titel="Trefferquote je Aufgabentyp"
            />
            <div class="overflow-x-auto">
              <table class="tabelle">
                <thead>
                  <tr>
                    <th scope="col">Aufgabentyp</th>
                    <th scope="col">Richtig</th>
                    <th scope="col">Aufgaben</th>
                    <th scope="col">Trefferquote</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.perTyp.map((t) => (
                    <tr key={t.typ}>
                      <td>{TYP_LABEL[t.typ] ?? t.typ}</td>
                      <td>{t.richtig}</td>
                      <td>{t.total}</td>
                      <td style={{ color: scoreFarbe(t.akkuratProzent) }}>{t.akkuratProzent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p class="ruhig m-0">Noch keine Aufgaben protokolliert.</p>
        )}
      </section>

      <section class="karte" aria-labelledby="thema-titel">
        <h2 id="thema-titel" class="m-0 text-lg font-bold">
          Trefferquote je Themenfeld
        </h2>
        {agg.perThema.length ? (
          <div class="mt-3 flex flex-col gap-3">
            <StatsChart
              daten={agg.perThema.map((t) => ({
                label: themaLabel(t.thema),
                wert: t.akkuratProzent,
                anzahl: t.total
              }))}
              titel="Trefferquote je Themenfeld"
            />
          </div>
        ) : (
          <p class="ruhig m-0">Noch keine Aufgaben protokolliert.</p>
        )}
      </section>

      <section class="karte" aria-labelledby="heatmap-titel">
        <h2 id="heatmap-titel" class="m-0 text-lg font-bold">
          Aktivität der letzten 12 Wochen
        </h2>
        <p class="ruhig m-0 mt-1 mb-3 text-sm">
          Jede Zelle ist ein Tag; die Farbintensität zeigt die Zahl der bearbeiteten Aufgaben. Details per Tooltip.
        </p>
        <Heatmap daten={agg.heatmap} />
      </section>

      <section class="karte" aria-labelledby="trend-titel">
        <h2 id="trend-titel" class="m-0 text-lg font-bold">
          Trend der letzten 30 Tage
        </h2>
        <p class="ruhig m-0 mt-1 mb-3 text-sm">
          Trefferquote je Tag (Balkenhöhe = Prozent richtig, Tooltip nennt die Zahl der Sitzungen).
        </p>
        {agg.trend.length ? (
          <StatsChart
            daten={agg.trend.map((t) => ({ label: t.tag.slice(5), wert: t.akkuratProzent, anzahl: t.sesionen }))}
            titel="Trefferquote der letzten 30 Tage"
            vertikal
          />
        ) : (
          <p class="ruhig m-0">Noch keine Sitzungen für einen Trend vorhanden.</p>
        )}
      </section>

      <section class="karte" aria-labelledby="baustellen-titel">
        <h2 id="baustellen-titel" class="m-0 text-lg font-bold">
          Deine drei größten Baustellen
        </h2>
        {agg.schwaechen.length ? (
          <ol class="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {agg.schwaechen.map((s, i) => {
              const hinweis = TYP_HINWEIS[s.label];
              return (
                <li class="rounded-[var(--radius)] border border-[var(--border)] p-3">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <strong>
                      {i + 1}. {TYP_LABEL[s.label] ?? s.label}
                    </strong>
                    <span class="font-bold" style={{ color: scoreFarbe(s.akkuratProzent) }}>
                      {s.akkuratProzent}% richtig
                    </span>
                  </div>
                  <p class="ruhig m-0 text-sm">{s.total} bearbeitete Aufgaben mit diesem Typ.</p>
                  <p class="m-0 mt-1 text-sm">
                    Empfehlung: {hinweis ? hinweis.text : 'diesen Aufgabentyp gezielt wiederholen'} — arbeite zuerst deine
                    Fehler im <a href="/fehlerheft/">Fehlerheft</a> ab
                    {hinweis ? (
                      <>
                        {' '}
                        und übe dann weiter unter <a href={hinweis.seite}>{hinweis.label}</a>.
                      </>
                    ) : (
                      '.'
                    )}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p class="ruhig m-0 mt-2 text-sm">
            Noch keine Baustelle erkannt — dafür sind mindestens 3 bearbeitete Aufgaben je Aufgabentyp nötig.
          </p>
        )}
      </section>

      <section class="karte" aria-labelledby="sitztitel">
        <h2 id="sitztitel" class="m-0 text-lg font-bold">
          Letzte Sitzungen
        </h2>
        {letzte.length ? (
          <div class="mt-3 overflow-x-auto">
            <table class="tabelle">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Datum</th>
                  <th scope="col">Modul</th>
                  <th scope="col">Teil</th>
                  <th scope="col">Modus</th>
                  <th scope="col">Punkte</th>
                  <th scope="col">Skalierung</th>
                  <th scope="col">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {letzte.map((s, i) => (
                  <tr key={s.id ?? `${s.datum}-${i}`}>
                    <td>{s.id ?? '—'}</td>
                    <td>{formatDatumDe(s.datum)}</td>
                    <td>{modulLabel(s)}</td>
                    <td>{s.teil}</td>
                    <td>{s.modus === 'pruefung' ? 'Prüfung' : 'Übung'}</td>
                    <td>
                      {s.punkte} / {s.punkteMax}
                    </td>
                    <td style={{ color: scoreFarbe(s.skalierung) }}>{s.skalierung}%</td>
                    <td>{s.id != null ? <a href={`/ergebnis/?sesi=${s.id}`}>Ansehen</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="ruhig m-0 mt-2">Noch keine Sitzungen gespeichert.</p>
        )}
      </section>
    </>
  );
}

function Kennzahl({ label, wert, farbe }: { label: string; wert: string; farbe?: string }) {
  return (
    <div class="rounded-[var(--radius)] border border-[var(--border)] p-3">
      <div class="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div class="text-xl font-bold" style={farbe ? { color: farbe } : undefined}>
        {wert}
      </div>
    </div>
  );
}

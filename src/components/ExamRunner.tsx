/**
 * B2-Trainer — Modelltest-Simulator: alle Teile hintereinander, Zeit läuft,
 * Audio im Prüfungsmodus, Abschlussbericht mit Skala 100 + Druckfunktion.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Pruefung, Teil } from '../data/schema';
import { BESTEHENSGRENZE } from '../data/schema';
import { scoreModul, scoreTeil, type Modus, type TeilErgebnis } from '../lib/scoring';
import { speichereSesi, verfuegbar, type ItemMeta } from '../lib/storage';
import { formatUhrzeit } from '../lib/format';
import { teilDauer, warnstufe } from '../lib/timer';
import TeilRunner from './TeilRunner';
import Ergebnis, { ScoreRing } from './Ergebnis';

export interface ExamRunnerProps {
  pruefung: Pruefung;
  /** Zeitfaktor <1 verkürzt alle Timer (nur für automatisierte Tests) */
  zeitFaktor?: number;
}

interface Schritt {
  skill: 'lesen' | 'hoeren';
  teil: Teil;
  dauerSekunden: number;
}

export default function ExamRunner({ pruefung, zeitFaktor = 1 }: ExamRunnerProps) {
  const [gestartet, setGestartet] = useState(false);
  const [modulWahl, setModulWahl] = useState<'lesen' | 'hoeren' | 'beide'>('beide');
  const [faktor, setFaktor] = useState(zeitFaktor);
  const [idx, setIdx] = useState(0);
  const [antworten, setAntworten] = useState<Record<string, Record<number, string[]>>>({});
  const [ergebnisse, setErgebnisse] = useState<Record<string, TeilErgebnis>>({});
  const [abgegebenMap, setAbgegebenMap] = useState<Record<string, boolean>>({});
  const [restSekunden, setRestSekunden] = useState(0);
  const [gesperrt, setGesperrt] = useState(false);
  const [fertig, setFertig] = useState(false);
  const [zeiten, setZeiten] = useState<Record<string, number>>({});
  const startRef = useRef<number>(Date.now());

  const schritte: Schritt[] = useMemo(() => {
    const lesen: Schritt[] = pruefung.lesen.map((t) => ({ skill: 'lesen' as const, teil: t, dauerSekunden: teilDauer('lesen', t.teil, faktor) }));
    const hoeren: Schritt[] = pruefung.hoeren.map((t) => ({ skill: 'hoeren' as const, teil: t, dauerSekunden: teilDauer('hoeren', t.teil, faktor) }));
    if (modulWahl === 'lesen') return lesen;
    if (modulWahl === 'hoeren') return hoeren;
    return [...lesen, ...hoeren];
  }, [pruefung, modulWahl, faktor]);

  const aktuell = schritte[idx];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = Number(p.get('faktor'));
    if (f > 0 && f < 1) setFaktor(f);
    if (p.get('autostart') === '1') setGestartet(true);
  }, []);

  useEffect(() => {
    if (!gestartet || !aktuell || fertig) return;
    const dauer = aktuell.dauerSekunden;
    setRestSekunden(dauer);
    setGesperrt(false);
    startRef.current = Date.now();

    // Dauer 0 (z. B. stark verkürzte Testkonfiguration) darf die Prüfung nicht
    // blockieren: ein Interval würde nie ein Zustandsänderung auslösen, der
    // Sperr-Effekt nie erneut feuern.
    if (dauer <= 0) {
      setGesperrt(true);
      const sofort = window.setTimeout(() => naechster(true), 400);
      return () => window.clearTimeout(sofort);
    }

    const id = window.setInterval(() => {
      setRestSekunden((r) => Math.max(0, r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [idx, gestartet, fertig, aktuell?.teil.id]);

  useEffect(() => {
    if (!gestartet || fertig) return;
    if (restSekunden === 0 && aktuell) {
      setGesperrt(true);
      const t = window.setTimeout(() => naechster(true), 1500);
      return () => window.clearTimeout(t);
    }
  }, [restSekunden, idx, gesperrt, gestartet, fertig]);

  const modus: Modus = 'pruefung';

  const schliesseTeilAb = async (zeitablauf: boolean) => {
    if (!aktuell) return;
    const teil = aktuell.teil;
    const ergebnis = scoreTeil(teil, antworten[teil.id] ?? {});
    setErgebnisse((p) => ({ ...p, [teil.id]: ergebnis }));
    setAbgegebenMap((p) => ({ ...p, [teil.id]: true }));
    setZeiten((p) => ({ ...p, [teil.id]: Math.round((Date.now() - startRef.current) / 1000) }));
    const meta: ItemMeta[] = teil.fragen.map((f) => ({
      itemId: teil.id,
      frageNr: f.nr,
      typ: f.typ,
      themenfeld: teil.themenfeld,
      stamm_de: f.stamm_de,
      stamm_id: f.stamm_id,
      explain_de: f.explain_de,
      explain_id: f.explain_id,
      evidence: f.evidence,
      teilTitel: teil.titel
    }));
    await speichereSesi({
      skill: 'pruefung',
      unitId: pruefung.id,
      teilId: teil.id,
      teil: teil.teil,
      modus,
      ergebnis,
      dauerSekunden: (Date.now() - startRef.current) / 1000,
      meta
    });
    void zeitablauf;
  };

  const naechster = (automatisch = false) => {
    void schliesseTeilAb(automatisch);
    if (idx + 1 < schritte.length) {
      setIdx(idx + 1);
      window.scrollTo({ top: 0 });
    } else {
      setFertig(true);
    }
  };

  if (!gestartet) {
    return (
      <div class="flex flex-col gap-4">
        <section class="karte">
          <h1 class="m-0 text-2xl font-bold">{pruefung.titel}</h1>
          <p class="prosa m-0 mt-2">
            Modelltest-Simulation mit echten Zeitlimits: Lesen 65 Minuten (davon 5 Minuten Lesezeit vor Teil 1), Hören
            ca. 40 Minuten. Im Prüfungsmodus läuft die Zeit weiter, Audio darf nur so oft wie vorgesehen gehört werden,
            das Transkript bleibt bis zur Auswertung verborgen.
          </p>
          <ul class="prosa m-0 mt-2 text-sm">
            <li>Gesamtwertung: Skala 0–100 pro Modul (Lesen und Hören getrennt bewertet).</li>
            <li>Bestehensgrenze {BESTEHENSGRENZE} Punkte je Modul.</li>
            <li>Nach Zeitablauf wird der Teil automatisch abgeschlossen und gesperrt.</li>
            <li>Der Bericht lässt sich drucken („Ergebnis als PDF drucken“) und verrät keine Lösungen vor der Abgabe.</li>
          </ul>
          {!verfuegbar() ? (
            <p class="meldung meldung-warn m-0 mt-2 text-sm">
              IndexedDB nicht verfügbar: Ergebnisse werden in dieser Sitzung nicht dauerhaft gespeichert.
            </p>
          ) : null}
        </section>

        <section class="karte">
          <h2 class="m-0 text-lg font-bold">Prüfung konfigurieren</h2>
          <div class="mt-2 flex flex-wrap gap-2">
            {(['beide', 'lesen', 'hoeren'] as const).map((m) => (
              <button
                class={`btn ${modulWahl === m ? 'btn-primaer' : ''}`}
                aria-pressed={modulWahl === m}
                onClick={() => setModulWahl(m)}
                data-testid={`modul-${m}`}
              >
                {m === 'beide' ? 'Lesen + Hören' : m === 'lesen' ? 'Nur Lesen' : 'Nur Hören'}
              </button>
            ))}
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span class="ruhig">
              {modulWahl === 'beide' ? '9 Teile' : modulWahl === 'lesen' ? '5 Teile' : '4 Teile'} ·
              Gesamtzeit {formatUhrzeit(schritte.reduce((a, s) => a + s.dauerSekunden, 0))}
              {faktor !== 1 ? ` · Testmodus mit Zeitfaktor ${faktor}` : ''}
            </span>
            <button class="btn btn-primaer" onClick={() => setGestartet(true)} data-testid="pruefung-starten">
              Prüfung starten
            </button>
            <a class="btn" href="/pruefung/">Regeln &amp; Übersicht</a>
          </div>
        </section>
      </div>
    );
  }

  if (fertig) {
    const lesenTeile = Object.values(ergebnisse).filter((e) => e.skill === 'lesen');
    const hoerenTeile = Object.values(ergebnisse).filter((e) => e.skill === 'hoeren');
    const lesenScore = lesenTeile.length ? scoreModul(lesenTeile, modus) : null;
    const hoerenScore = hoerenTeile.length ? scoreModul(hoerenTeile, modus) : null;
    const alle = Object.values(ergebnisse);
    const gesamt = scoreModul(alle, modus);
    // Für Lösungsbelege den Aufgabentext im Bank nachschlagen (ItemAuswertung kennt nur Keys).
    const alleTeileDef = [...pruefung.lesen, ...pruefung.hoeren];
    const falsche = alle
      .flatMap((e) => {
        const teilDef = alleTeileDef.find((t) => t.id === e.teilId);
        return e.items
          .filter((i) => !i.richtig)
          .map((i) => {
            const frage = teilDef?.fragen.find((f) => f.nr === i.frageNr);
            return {
              teilId: e.teilId,
              teil: e.teil,
              ...i,
              stamm_de: frage?.stamm_de ?? '',
              explain_de: frage?.explain_de ?? '',
              evidence: frage?.evidence ?? ''
            };
          });
      })
      .slice(0, 60);

    return (
      <div class="flex flex-col gap-4" data-testid="pruefung-bericht">
        <section class="karte">
          <h1 class="m-0 text-2xl font-bold">Prüfungsbericht — {pruefung.titel}</h1>
          <p class="ruhig m-0">
            Bearbeitet: {alle.length} Teile · {gesamt.benar} richtig · {gesamt.salah} falsch · {gesamt.offen}{' '}
            unbeantwortet
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-6">
            {lesenScore ? (
              <div class="flex items-center gap-3">
                <ScoreRing prozent={lesenScore.skalierung0bis100} />
                <div>
                  <h2 class="m-0 text-lg font-bold">Leseverstehen</h2>
                  <p class="m-0">
                    {lesenScore.punkte}/{lesenScore.punkteMax} Punkte · <strong>{lesenScore.label}</strong>
                  </p>
                </div>
              </div>
            ) : null}
            {hoerenScore ? (
              <div class="flex items-center gap-3">
                <ScoreRing prozent={hoerenScore.skalierung0bis100} />
                <div>
                  <h2 class="m-0 text-lg font-bold">Hörenverstehen</h2>
                  <p class="m-0">
                    {hoerenScore.punkte}/{hoerenScore.punkteMax} Punkte · <strong>{hoerenScore.label}</strong>
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <div class="mt-3 flex flex-wrap gap-2 kein-druck">
            <button class="btn btn-primaer" onClick={() => window.print()} data-testid="drucken">
              Ergebnis als PDF drucken
            </button>
            <button
              class="btn"
              onClick={() => {
                setGestartet(false);
                setFertig(false);
                setIdx(0);
                setErgebnisse({});
                setAntworten({});
                setAbgegebenMap({});
              }}
            >
              Neue Prüfung
            </button>
          </div>
        </section>

        <section class="karte">
          <h2 class="m-0 text-lg font-bold">Rohdaten pro Teil</h2>
          <table class="tabelle mt-2">
            <thead>
              <tr>
                <th scope="col">Modul</th>
                <th scope="col">Teil</th>
                <th scope="col">Punkte</th>
                <th scope="col">Richtig</th>
                <th scope="col">Falsch</th>
                <th scope="col">Unbeantwortet</th>
                <th scope="col">Zeit</th>
              </tr>
            </thead>
            <tbody>
              {alle.map((e) => (
                <tr key={e.teilId}>
                  <td>{e.skill === 'lesen' ? 'Lesen' : 'Hören'}</td>
                  <td>{e.teil}</td>
                  <td>{e.punkte}/{e.punkteMax}</td>
                  <td>{e.benar}</td>
                  <td>{e.salah}</td>
                  <td>{e.offen}</td>
                  <td>{formatUhrzeit(zeiten[e.teilId] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section class="karte">
          <h2 class="m-0 text-lg font-bold">Empfohlene nächste Schritte</h2>
          <ul class="prosa m-0 mt-2 text-sm">
            {gesamt.skalierung0bis100 < BESTEHENSGRENZE ? (
              <li>
                Unter der Bestehensgrenze: wiederhole die betroffenen Teile im Übungsmodus mit Transkript und
                A–B-Schleife und arbeite die Fehler im <a href="/fehlerheft/">Fehlerheft</a> ab.
              </li>
            ) : (
              <li>
                Bestanden: sichere das Ergebnis mit weiteren Units ({' '}
                <a href="/lesen/">Lesen</a> · <a href="/hoeren/">Hören</a>) und prüfe deine Trefferquote unter{' '}
                <a href="/statistik/">Statistik</a>.
              </li>
            )}
            {falsche.length ? (
              <li>
                {falsche.length} Aufgaben mit Fehlern —{' '}
                <a href="/fehlerheft/">Fehlerheft öffnen</a> (Wiederholung nach 1 / 3 / 7 Tagen, Archiv nach 3 Treffern).
              </li>
            ) : null}
            <li>
              Zusätzliche Hörerfahrung mit Muttersprachlern über die Links auf der <a href="/quellen/">Quellen-Seite</a>.
            </li>
          </ul>
        </section>

        {falsche.length ? (
          <section class="karte">
            <h2 class="m-0 text-lg font-bold">Fehler mit Beleg</h2>
            <ol class="m-0 mt-2 flex list-none flex-col gap-3 p-0 text-sm">
              {falsche.slice(0, 20).map((f) => (
                <li class="border-b border-[var(--border)] pb-2">
                  <strong>
                    Teil {f.teil}, Aufgabe {f.frageNr}
                  </strong>{' '}
                  (deine Antwort: {f.gegeben.join(', ') || '—'} · Lösung: {f.loesung.join(', ')})
                  {f.stamm_de ? <p class="m-0">{f.stamm_de}</p> : null}
                  {f.explain_de ? <p class="ruhig m-0">{f.explain_de}</p> : null}
                  {f.evidence ? <div class="ruhig">Beleg: „{f.evidence}“</div> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    );
  }

  const dauer = aktuell.dauerSekunden;
  const stufe = warnstufe(restSekunden);
  return (
    <div class="flex flex-col gap-4">
      <div
        class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
        data-testid="pruefung-kopf"
      >
        <div class="flex items-center gap-2 text-sm">
          <strong>{aktuell.skill === 'lesen' ? 'Lesen' : 'Hören'} Teil {aktuell.teil.teil}</strong>
          <span class="chip">
            Teil {idx + 1} von {schritte.length}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <div class="h-2 w-40 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden="true">
            <div
              class="h-full"
              style={{
                width: `${dauer ? (restSekunden / dauer) * 100 : 0}%`,
                background: stufe === 'ok' ? 'var(--accent)' : stufe === 'fuenf' ? 'var(--warn)' : 'var(--danger)'
              }}
            />
          </div>
          <span
            class="font-mono font-bold"
            style={{ color: stufe === 'eine' || stufe === 'abgelaufen' ? 'var(--danger)' : 'var(--ink)' }}
            aria-live="polite"
            data-testid="pruefung-timer"
          >
            {formatUhrzeit(restSekunden, true)}
          </span>
        </div>
      </div>

      {stufe === 'fuenf' ? (
        <p class="meldung meldung-warn text-sm" role="status">
          Noch 5 Minuten für diesen Teil.
        </p>
      ) : null}
      {stufe === 'eine' ? (
        <p class="meldung meldung-warn text-sm" role="status">
          Noch 1 Minute — der Teil wird danach automatisch abgeschlossen.
        </p>
      ) : null}
      {gesperrt ? (
        <p class="meldung meldung-fehler text-sm" role="status" data-testid="zeit-gesperrt">
          Zeit abgelaufen — Bearbeitung gesperrt, der Teil wird abgeschlossen.
        </p>
      ) : null}

      <div class={gesperrt ? 'pointer-events-none opacity-60' : ''} aria-disabled={gesperrt}>
        <TeilRunner
          teil={aktuell.teil}
          modus="pruefung"
          antworten={antworten[aktuell.teil.id] ?? {}}
          setAntwort={(nr, keys) =>
            !gesperrt &&
            setAntworten((p) => ({ ...p, [aktuell.teil.id]: { ...(p[aktuell.teil.id] ?? {}), [nr]: keys } }))
          }
          abgegeben={false}
          onAbgeben={() => naechster(false)}
          vorbereitungsSekunden={Math.max(3, Math.round((aktuell.teil.teil === 1 ? 15 : 90) * faktor))}
        />
      </div>

      <div class="flex flex-wrap items-center gap-3 kein-druck">
        <button class="btn btn-primaer" disabled={gesperrt} onClick={() => naechster(false)} data-testid="teil-abschliessen">
          Teil abschließen und weiter
        </button>
        <span class="ruhig text-xs">
          Die Zeit läuft beim Wechsel weiter. Bewertung erst nach Abschluss aller Teile.
        </span>
      </div>
    </div>
  );
}

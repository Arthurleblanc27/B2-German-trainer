/**
 * TestDaF-Modul — island untuk halaman satu Aufgabe (state: jawaban, koreksi
 * mandiri, penilaian). Navigasi ke Aufgabe berikut/sebelumnya dalam satu
 * Modelltest.
 *
 * Setiap penilaian disimpan ke IndexedDB yang sama dengan modul Goethe B2 —
 * tanpa itu nilai TestDaF hanya hidup di layar dan tidak pernah muncul di
 * halaman Statistik.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { TestdafAufgabe } from '../data/testdaf';
import { scoreTestdafAufgabe, type Modus } from '../lib/testdaf-scoring';
import { testdafPfad, pruefungPfad } from '../lib/testdaf-content';
import { aktualisiereTestdafErgebnis, speichereTestdafErgebnis } from '../lib/testdaf-progress';
import { verfuegbar } from '../lib/storage';
import TestdafRunner from './TestdafRunner';

export interface TestdafAufgabeAppProps {
  aufgabe: TestdafAufgabe;
  /** Aufgabe derselben Reihe (für Weiter/Zurück) */
  vorgaenger?: TestdafAufgabe | null;
  nachfolger?: TestdafAufgabe | null;
  pruefungId?: string | null;
  modusStart?: Modus;
}

export default function TestdafAufgabeApp({
  aufgabe,
  vorgaenger = null,
  nachfolger = null,
  pruefungId = null,
  modusStart = 'uebung'
}: TestdafAufgabeAppProps) {
  const [modus, setModus] = useState<Modus>(modusStart);
  const [antworten, setAntworten] = useState<Record<number, string[]>>({});
  const [abgegeben, setAbgegeben] = useState(false);
  const [selbst, setSelbst] = useState<Record<number, boolean>>({});
  const [hinweis, setHinweis] = useState('');
  const [speicherHinweis, setSpeicherHinweis] = useState('');

  const startRef = useRef(Date.now());
  /** Sitzungs-ID dieser Aufgabe; -1 bedeutet: Speichervorgang läuft gerade */
  const sesiRef = useRef<number | null>(null);
  const dauerRef = useRef(0);

  const auswertung = useMemo(
    () => (abgegeben ? scoreTestdafAufgabe(aufgabe, antworten, { selbstkorrektur: selbst }) : null),
    [abgegeben, aufgabe, antworten, selbst]
  );

  /* Erster Abgabeklick legt die Sitzung an; jede spätere Änderung (Selbstkorrektur
     offener Antworten) überschreibt dieselbe Sitzung, damit Statistik und
     Ergebnisbildschirm dieselben Zahlen zeigen. */
  useEffect(() => {
    if (!abgegeben || !auswertung) return;
    let abgebrochen = false;
    if (sesiRef.current === null) {
      sesiRef.current = -1;
      dauerRef.current = (Date.now() - startRef.current) / 1000;
      void speichereTestdafErgebnis(aufgabe, auswertung, { modus, dauerSekunden: dauerRef.current }).then((id) => {
        if (abgebrochen) return;
        sesiRef.current = id;
        setSpeicherHinweis(
          id
            ? 'Ergebnis gespeichert — es erscheint in der Statistik.'
            : 'Speichern nicht möglich (Browser-Speicher gesperrt) — das Ergebnis gilt nur für diese Sitzung.'
        );
      });
    } else if (sesiRef.current > 0) {
      void aktualisiereTestdafErgebnis(sesiRef.current, aufgabe, auswertung, {
        modus,
        dauerSekunden: dauerRef.current
      });
    }
    return () => {
      abgebrochen = true;
    };
  }, [abgegeben, auswertung, aufgabe, modus]);

  const neu = () => {
    setAntworten({});
    setSelbst({});
    setAbgegeben(false);
    setHinweis('');
    setSpeicherHinweis('');
    sesiRef.current = null;
    startRef.current = Date.now();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const offenAnzahl = () =>
    aufgabe.fragen.filter((f) => !(antworten[f.nr]?.some((w) => w.trim() !== '') ?? false)).length;

  return (
    <div class="flex flex-col gap-3">
      <TestdafRunner
        aufgabe={aufgabe}
        modus={modus}
        onModusChange={(m) => {
          setModus(m);
          setAbgegeben(false);
          setSpeicherHinweis('');
          sesiRef.current = null;
          startRef.current = Date.now();
        }}
        antworten={antworten}
        setAntwort={(nr, keys) => {
          setAntworten((p) => ({ ...p, [nr]: keys }));
          setHinweis('');
        }}
        abgegeben={abgegeben}
        auswertung={auswertung}
        onAbgeben={() => {
          setAbgegeben(true);
          const offenAnz = offenAnzahl();
          setHinweis(
            offenAnz > 0 ? `${offenAnz} Aufgabe(n) wurden nicht beantwortet.` : 'Bewertung abgeschlossen.'
          );
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onSelbstkorrektur={(nr, richtig) => setSelbst((p) => ({ ...p, [nr]: richtig }))}
        onWiederholen={neu}
        onWeiter={nachfolger ? () => (window.location.href = testdafPfad(nachfolger)) : undefined}
        weiterLabel={nachfolger ? `Aufgabe ${nachfolger.aufgabe}` : undefined}
        hinweis={hinweis}
      />

      {abgegeben ? (
        <p
          class="meldung meldung-info m-0 flex flex-wrap items-center gap-2 text-sm"
          role="status"
          data-testid="testdaf-speicherhinweis"
        >
          <span>{speicherHinweis || 'Ergebnis wird gespeichert …'}</span>
          <a class="btn btn-klein" href="/statistik/">
            Zur Statistik
          </a>
          {!verfuegbar() ? <span class="ruhig">IndexedDB ist in diesem Browser nicht verfügbar.</span> : null}
        </p>
      ) : null}

      <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Aufgabennavigation">
        {vorgaenger ? (
          <a class="btn btn-klein" href={testdafPfad(vorgaenger)}>
            ← Aufgabe {vorgaenger.aufgabe} ({vorgaenger.bereich === 'lesen' ? 'Lesen' : 'Hören'})
          </a>
        ) : null}
        <a class="btn btn-klein" href="/testdaf/">
          TestDaF-Übersicht
        </a>
        {pruefungId ? (
          <a class="btn btn-klein" href={pruefungPfad(aufgabe.modelltest)}>
            Modelltest {aufgabe.modelltest} als Ganzes
          </a>
        ) : null}
        {nachfolger ? (
          <a class="btn btn-klein" href={testdafPfad(nachfolger)}>
            Aufgabe {nachfolger.aufgabe} ({nachfolger.bereich === 'lesen' ? 'Lesen' : 'Hören'}) →
          </a>
        ) : null}
      </nav>

      {aufgabe.glossar.length ? (
        <section class="karte">
          <h2 class="m-0 text-lg font-bold">Glossar dieser Aufgabe</h2>
          <p class="ruhig m-0 text-sm">Wortschatz zum Nachschlagen — Deutsch → Bahasa Indonesia.</p>
          <ul class="m-0 mt-2 list-none p-0 text-sm">
            {aufgabe.glossar.map((g) => (
              <li key={g.wort} class="border-b border-[var(--border)] py-1">
                <strong>
                  {g.artikel ? `${g.artikel} ` : ''}
                  {g.wort}
                </strong>
                {' — '}
                {g.bedeutung_id}
                {g.beispiel ? <em class="ruhig"> (z. B. {g.beispiel})</em> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

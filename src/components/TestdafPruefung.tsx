/**
 * TestDaF-Modul — simulasi ujian penuh (Modelltest).
 *
 * Alur mengikuti Durchführungsbestimmungen TestDaF:
 *   1. Leseverstehen  3 Aufgaben · 45 menit (termasuk 5 menit mengalihkan jawaban)
 *   2. jeda singkat
 *   3. Hörverstehen   3 Aufgaben · 30 menit (termasuk 5 menit mengalihkan jawaban)
 * Penghitung waktu hanya orientasi: tidak mengunci apa pun dan tidak mengakhiri
 * bagian secara otomatis. Tiap bagian bisa diakhiri kapan saja lewat tombol
 * „Weiter" — tidak perlu menunggu waktu habis; item yang belum dijawab dihitung
 * sebagai unbeantwortet. Hasil akhir melaporkan TDN untuk tiap bagian.
 * (Audio mengikuti batas pemutaran ujian.)
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { TestdafAufgabe, TestdafPruefung } from '../data/testdaf';
import { TESTDAF_PRUEFUNG, tdnLabel } from '../data/testdaf';
import {
  scoreTestdafAufgabe,
  scoreTestdafBereich,
  type Modus,
  type TestdafAufgabeErgebnis
} from '../lib/testdaf-scoring';
import { aktualisiereTestdafErgebnis, speichereTestdafErgebnis } from '../lib/testdaf-progress';
import { formatUhrzeit } from '../lib/format';
import { testdafPfad } from '../lib/testdaf-content';
import TestdafRunner from './TestdafRunner';

export interface TestdafPruefungProps {
  pruefung: TestdafPruefung;
  aufgaben: TestdafAufgabe[];
}

type Phase = 'start' | 'lesen' | 'pause' | 'hoeren' | 'fertig';

export default function TestdafPruefung({ pruefung, aufgaben }: TestdafPruefungProps) {
  const lesen = useMemo(() => aufgaben.filter((a) => a.bereich === 'lesen').sort((x, y) => x.aufgabe - y.aufgabe), [aufgaben]);
  const hoeren = useMemo(() => aufgaben.filter((a) => a.bereich === 'hoeren').sort((x, y) => x.aufgabe - y.aufgabe), [aufgaben]);

  const [phase, setPhase] = useState<Phase>('start');
  const [lesenIdx, setLesenIdx] = useState(0);
  const [hoerenIdx, setHoerenIdx] = useState(0);
  const [antworten, setAntworten] = useState<Record<string, Record<number, string[]>>>({});
  const [selbst, setSelbst] = useState<Record<string, Record<number, boolean>>>({});
  const [fertig, setFertig] = useState<Record<string, boolean>>({});
  const [rest, setRest] = useState(0);
  /** Zeitfaktor <1 verkürzt alle Timer (nur für automatisierte Tests, wie im Goethe-ExamRunner) */
  const [faktor, setFaktor] = useState(1);

  const modus: Modus = 'pruefung';
  const aktuelleListe = phase === 'lesen' ? lesen : hoeren;
  const aktuelle: TestdafAufgabe | undefined = phase === 'lesen' ? lesen[lesenIdx] : phase === 'hoeren' ? hoeren[hoerenIdx] : undefined;

  useEffect(() => {
    const f = Number(new URLSearchParams(window.location.search).get('faktor') ?? '');
    if (Number.isFinite(f) && f > 0 && f !== 1) setFaktor(f);
  }, []);

  /** Aktuellen Prüfungsteil sofort beenden — ohne auf die Uhr zu warten.
   *  Offene Items werden als abgegeben markiert und zählen als unbeantwortet. */
  const beendeTeil = (p: 'lesen' | 'hoeren') => {
    const ids = (p === 'lesen' ? lesen : hoeren).map((a) => a.id);
    setFertig((prev) => {
      const neu = { ...prev };
      for (const id of ids) neu[id] = true;
      return neu;
    });
    setPhase(p === 'lesen' ? 'pause' : 'fertig');
  };

  /* --- Timer je Prüfungsteil ------------------------------------------
     Zählt nur mit und zeigt den Stand an: er sperrt nichts und beendet den
     Teil nicht von selbst — weiter geht es immer per Klick. ------------- */
  useEffect(() => {
    if (phase !== 'lesen' && phase !== 'hoeren') return;
    const teil = phase === 'lesen' ? TESTDAF_PRUEFUNG.lesen : TESTDAF_PRUEFUNG.hoeren;
    const dauer = Math.max(1, Math.round(teil.minuten * 60 * faktor));
    const bis = Date.now() + dauer * 1000;
    setRest(dauer);
    const tick = () => setRest(Math.max(0, Math.ceil((bis - Date.now()) / 1000)));
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, faktor]);

  const setAntwortFuer = (aufgabeId: string) => (nr: number, keys: string[]) =>
    setAntworten((p) => ({ ...p, [aufgabeId]: { ...(p[aufgabeId] ?? {}), [nr]: keys } }));

  const abgeben = (a: TestdafAufgabe) => {
    setFertig((p) => ({ ...p, [a.id]: true }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const auswertungFuer = (a: TestdafAufgabe): TestdafAufgabeErgebnis | null => {
    if (!fertig[a.id]) return null;
    return scoreTestdafAufgabe(a, antworten[a.id] ?? {}, { selbstkorrektur: selbst[a.id] ?? {} });
  };

  const alleErgebnisse: TestdafAufgabeErgebnis[] = useMemo(
    () =>
      aufgaben
        .filter((a) => fertig[a.id])
        .map((a) => scoreTestdafAufgabe(a, antworten[a.id] ?? {}, { selbstkorrektur: selbst[a.id] ?? {} })),
    [aufgaben, fertig, antworten, selbst]
  );

  const lesenErg = scoreTestdafBereich(alleErgebnisse, 'lesen');
  const hoerenErg = scoreTestdafBereich(alleErgebnisse, 'hoeren');

  const selbstkorrektur = (a: TestdafAufgabe) => (nr: number, richtig: boolean) =>
    setSelbst((p) => ({ ...p, [a.id]: { ...(p[a.id] ?? {}), [nr]: richtig } }));

  /* --- Fortschritt sichern -------------------------------------------
     Jede abgeschlossene Aufgabe wird als eigene Sitzung gespeichert (wie im
     B2-Modul: eine Sitzung je Teil/Aufgabe), sonst taucht die Prüfung nie in
     der Statistik auf. */
  const sesiIds = useRef<Map<string, number>>(new Map());
  const sekundenProAufgabe = useRef<Record<string, number>>({});
  const laufend = useRef<{ id: string; seit: number } | null>(null);
  const [speicherHinweis, setSpeicherHinweis] = useState('');

  /* Bearbeitungszeit je Aufgabe mitzählen (Basis der Übungszeit in der Statistik). */
  useEffect(() => {
    const jetzt = Date.now();
    const vor = laufend.current;
    if (vor) {
      sekundenProAufgabe.current[vor.id] = (sekundenProAufgabe.current[vor.id] ?? 0) + (jetzt - vor.seit) / 1000;
    }
    laufend.current = aktuelle ? { id: aktuelle.id, seit: jetzt } : null;
  }, [aktuelle?.id]);

  /* Neue Aufgabe → Sitzung anlegen; Selbstkorrektur danach → Sitzung überschreiben. */
  useEffect(() => {
    for (const a of aufgaben) {
      const e = auswertungFuer(a);
      if (!e) continue;
      const dauer = sekundenProAufgabe.current[a.id] ?? 0;
      const bekannt = sesiIds.current.get(a.id);
      if (bekannt === undefined) {
        sesiIds.current.set(a.id, -1);
        void speichereTestdafErgebnis(a, e, { modus: 'pruefung', dauerSekunden: dauer }).then((id) => {
          sesiIds.current.set(a.id, id ?? 0);
          setSpeicherHinweis(
            id
              ? 'Ergebnisse gespeichert — sie erscheinen in der Statistik.'
              : 'Speichern nicht möglich (Browser-Speicher gesperrt) — Ergebnis gilt nur für diese Sitzung.'
          );
        });
      } else if (bekannt > 0) {
        void aktualisiereTestdafErgebnis(bekannt, a, e, { modus: 'pruefung', dauerSekunden: dauer });
      }
    }
  }, [fertig, antworten, selbst, aufgaben]);

  /* --- Startbildschirm ------------------------------------------------ */
  if (phase === 'start') {
    return (
      <div class="flex flex-col gap-4">
        <div class="karte">
          <h1 class="m-0 text-2xl font-bold">{pruefung.titel}</h1>
          <p class="ruhig m-0">{pruefung.titel_id}</p>
          <p class="prosa m-0 mt-2">{pruefung.beschreibung_id}</p>
        </div>

        <div class="karte">
          <h2 class="m-0 text-lg font-bold">Ablauf der Prüfung / Alur ujian</h2>
          <ol class="prosa mt-2">
            <li>
              <strong>Leseverstehen</strong> — {lesen.length} Aufgaben ({lesen.reduce((s, a) => s + a.fragen.length, 0)} Items)
              in {TESTDAF_PRUEFUNG.lesen.minuten} Minuten (davon {TESTDAF_PRUEFUNG.lesen.uebertragen_minuten}′ zum Übertragen).
            </li>
            <li>Kurze Pause.</li>
            <li>
              <strong>Hörverstehen</strong> — {hoeren.length} Aufgaben ({hoeren.reduce((s, a) => s + a.fragen.length, 0)} Items)
              in {TESTDAF_PRUEFUNG.hoeren.minuten} Minuten (davon {TESTDAF_PRUEFUNG.hoeren.uebertragen_minuten}′ zum Übertragen).
            </li>
          </ol>
          <p class="ruhig m-0 text-sm">
            Audio läuft im Prüfungsmodus nur so oft, wie es die Durchführungsbestimmungen vorsehen; Transkripte erscheinen
            erst nach der Bewertung.
          </p>
          <p class="ruhig m-0 mt-1 text-sm">
            Kein Warten nötig: Die Uhr wird angezeigt, sperrt aber nichts und beendet keinen Teil von selbst. Mit dem
            Knopf <strong>„Weiter"</strong> kannst du jeden Prüfungsteil jederzeit selbst abschließen und sofort zum
            nächsten Teil gehen; offene Items zählen dabei als unbeantwortet.{' '}
            <em>(Tanpa batas waktu — bisa lanjut ke bagian berikutnya kapan saja.)</em>
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="btn btn-primaer" onClick={() => setPhase('lesen')} data-testid="pruefung-starten">
              Prüfung starten
            </button>
            <a class="btn" href="/testdaf/">
              ← Übersicht
            </a>
          </div>
        </div>

        <div class="karte">
          <h2 class="m-0 text-lg font-bold">Aufgaben dieses Modelltests</h2>
          <ul class="m-0 mt-2 list-none p-0">
            {aufgaben.map((a) => (
              <li key={a.id} class="flex flex-wrap items-baseline gap-2 border-b border-[var(--border)] py-1">
                <span class="chip">{a.bereich === 'lesen' ? 'Lesen' : 'Hören'} {a.aufgabe}</span>
                <a href={testdafPfad(a)}>{a.titel}</a>
                <span class="ruhig text-sm">
                  {a.fragen.length} Items · {a.zeit_minuten}′ · {tdnLabel(a.tdn)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  /* --- Pause zwischen den Teilen -------------------------------------- */
  if (phase === 'pause') {
    return (
      <div class="flex flex-col gap-4">
        <div class="karte">
          <h1 class="m-0 text-xl font-bold">Leseverstehen beendet</h1>
          <p class="m-0">
            {lesenErg.punktzahl} von {lesenErg.punkteMax} Punkten · {lesenErg.prozent} von 100 ·{' '}
            <strong>{tdnLabel(lesenErg.tdn)}</strong>
          </p>
          <p class="ruhig m-0 text-sm">
            Teil abgeschlossen — nach Ablauf der Zeit oder auf deinen Klick.
            {lesenErg.offen ? ` ${lesenErg.offen} Item(s) ohne Antwort zählen als unbeantwortet.` : ' Alle Items beantwortet.'}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="btn btn-primaer" onClick={() => setPhase('hoeren')} data-testid="hoeren-starten">
              Hörverstehen starten
            </button>
            <a class="btn" href="/testdaf/">
              Prüfung abbrechen
            </a>
          </div>
        </div>
      </div>
    );
  }

  /* --- Endergebnis ---------------------------------------------------- */
  if (phase === 'fertig') {
    return (
      <div class="flex flex-col gap-4">
        <div class="karte">
          <h1 class="m-0 text-2xl font-bold">Prüfung beendet — Ergebnis</h1>
          <p class="ruhig m-0">{pruefung.titel}</p>
          <div class="mt-3 grid gap-3 md:grid-cols-2">
            <ErgebnisKarte label="Leseverstehen" e={lesenErg} />
            <ErgebnisKarte label="Hörverstehen" e={hoerenErg} />
          </div>
          <p class="ruhig m-0 mt-3 text-sm">
            TestDaF bewertet die Teile unabhängig und meldet TDN 3, 4 oder 5 je Teil. Diese Simulation nutzt eine
            Prozentgrenze (≥40 % TDN 3, ≥60 % TDN 4, ≥80 % TDN 5) — die offizielle Einstufung erfolgt durch den TestDaF.
          </p>
        </div>

        <div class="karte">
          <h2 class="m-0 text-lg font-bold">Alle Aufgaben</h2>
          <table class="mt-2 w-full text-sm">
            <thead>
              <tr class="text-left">
                <th class="py-1">Aufgabe</th>
                <th class="py-1">Items</th>
                <th class="py-1">Punkte</th>
                <th class="py-1">%</th>
                <th class="py-1">TDN</th>
                <th class="py-1" />
              </tr>
            </thead>
            <tbody>
              {aufgaben.map((a) => {
                const e = alleErgebnisse.find((x) => x.aufgabeId === a.id);
                return (
                  <tr key={a.id} class="border-t border-[var(--border)]">
                    <td class="py-1">
                      {a.bereich === 'lesen' ? 'Lesen' : 'Hören'} {a.aufgabe}
                    </td>
                    <td class="py-1">{a.fragen.length}</td>
                    <td class="py-1">
                      {e ? `${e.punkte}/${e.punkteMax}` : `–/${a.punkte_max}`}
                    </td>
                    <td class="py-1">{e ? `${e.prozent}%` : '—'}</td>
                    <td class="py-1">{e ? tdnLabel(e.tdn) : '—'}</td>
                    <td class="py-1">
                      <a href={testdafPfad(a)}>Details</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p
          class="meldung meldung-info m-0 flex flex-wrap items-center gap-2 text-sm"
          role="status"
          data-testid="testdaf-speicherhinweis"
        >
          <span>{speicherHinweis || 'Ergebnisse werden gespeichert …'}</span>
          <a class="btn btn-klein" href="/statistik/">
            Zur Statistik
          </a>
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            class="btn"
            onClick={() => {
              setAntworten({});
              setSelbst({});
              setFertig({});
              setLesenIdx(0);
              setHoerenIdx(0);
              setPhase('start');
              sesiIds.current.clear();
              sekundenProAufgabe.current = {};
              laufend.current = null;
              setSpeicherHinweis('');
            }}
          >
            Prüfung wiederholen
          </button>
          <a class="btn" href="/testdaf/">
            ← Übersicht
          </a>
        </div>
      </div>
    );
  }

  /* --- Laufende Aufgabe ---------------------------------------------- */
  if (!aktuelle) return null;
  const idx = phase === 'lesen' ? lesenIdx : hoerenIdx;
  const liste = aktuelleListe;
  const weiter = () => {
    if (idx + 1 < liste.length) {
      if (phase === 'lesen') setLesenIdx(idx + 1);
      else setHoerenIdx(idx + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // letzte Aufgabe des Teils: Teil beenden (offene Items zählen als unbeantwortet)
    beendeTeil(phase);
  };

  const zeitAbgelaufen = rest <= 0;
  const naechsterTeil = phase === 'lesen' ? 'Weiter: Hörverstehen starten' : 'Weiter: Ergebnis ansehen';
  return (
    <div class="flex flex-col gap-3">
      <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Prüfungsnavigation">
        <span class="chip">
          {phase === 'lesen' ? 'Leseverstehen' : 'Hörverstehen'} · Aufgabe {aktuelle.aufgabe} von {liste.length}
        </span>
        <span class={zeitAbgelaufen ? 'chip chip-warn' : 'chip'} data-testid="testdaf-timer">
          {zeitAbgelaufen ? '⏱ Zeit abgelaufen' : `⏱ ${formatUhrzeit(rest, true)}`}
        </span>
        <span class="ruhig text-xs">Modelltest {pruefung.modelltest} · Prüfungsmodus (nicht umschaltbar)</span>
        <button
          type="button"
          class="btn btn-klein btn-primaer kein-druck ml-auto"
          onClick={() => beendeTeil(phase)}
          data-testid="teil-beenden"
        >
          {naechsterTeil} →
        </button>
      </nav>

      {zeitAbgelaufen ? (
        <p class="meldung meldung-warn text-sm" role="status" data-testid="zeit-ueberzogen">
          Prüfungszeit abgelaufen — nichts ist gesperrt und beendet wird nichts von selbst: arbeite weiter oder geh mit
          „Weiter" sofort zum nächsten Teil. <em>(Waktu habis — tetap bisa lanjut kapan saja.)</em>
        </p>
      ) : null}

      <TestdafRunner
        aufgabe={aktuelle}
        modus={modus}
        antworten={antworten[aktuelle.id] ?? {}}
        setAntwort={setAntwortFuer(aktuelle.id)}
        abgegeben={!!fertig[aktuelle.id]}
        auswertung={auswertungFuer(aktuelle)}
        onAbgeben={() => abgeben(aktuelle)}
        onSelbstkorrektur={selbstkorrektur(aktuelle)}
        onWeiter={weiter}
        weiterLabel={idx + 1 < liste.length ? `Aufgabe ${liste[idx + 1].aufgabe}` : phase === 'lesen' ? 'Teil beenden' : 'Prüfung beenden'}
        restzeit={zeitAbgelaufen ? null : rest}
      />

      <div class="flex flex-wrap items-center gap-3 kein-druck">
        <button type="button" class="btn btn-primaer" onClick={() => beendeTeil(phase)} data-testid="teil-beenden-unten">
          {naechsterTeil} →
        </button>
        <span class="ruhig text-xs">
          Jederzeit möglich — kein Warten auf die Prüfungszeit nötig (tanpa menunggu waktu habis). Offene Aufgaben
          zählen als unbeantwortet.
        </span>
      </div>
    </div>
  );
}

function ErgebnisKarte({ label, e }: { label: string; e: ReturnType<typeof scoreTestdafBereich> }) {
  const farbe =
    e.prozent >= 80 ? 'var(--success)' : e.prozent >= 60 ? 'var(--accent)' : e.prozent >= 40 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div class="karte" style={{ borderColor: farbe }}>
      <h3 class="m-0 text-base font-bold">{label}</h3>
      <p class="m-0 text-2xl font-black" style={{ color: farbe }}>
        {tdnLabel(e.tdn)}
      </p>
      <p class="m-0 text-sm">
        {e.punktzahl} von {e.punkteMax} Punkten ({e.prozent} von 100)
      </p>
      <p class="ruhig m-0 text-xs">
        {e.benar} richtig · {e.salah} falsch
        {e.offen ? ` · ${e.offen} unbeantwortet` : ''}
      </p>
    </div>
  );
}

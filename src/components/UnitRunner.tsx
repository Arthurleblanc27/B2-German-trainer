/** B2-Trainer — mengelola satu unit (Übersicht → Teil → Ergebnis) + menyimpan progres. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Teil, Unit } from '../data/schema';
import { scoreModul, scoreTeil, type Modus, type TeilErgebnis } from '../lib/scoring';
import { speichereSesi, verfuegbar, type ItemMeta } from '../lib/storage';
import { BESTEHENSGRENZE } from '../data/schema';
import TeilRunner from './TeilRunner';
import Ergebnis, { ScoreRing } from './Ergebnis';
import { TYP_LABEL } from '../lib/format';

export interface UnitRunnerProps {
  unit: Unit;
  vorbereitungsSekunden?: number;
}

type Ansicht = 'uebersicht' | 'teil' | 'ergebnis';

export default function UnitRunner({ unit, vorbereitungsSekunden }: UnitRunnerProps) {
  const [modus, setModus] = useState<Modus>('uebung');
  const [ansicht, setAnsicht] = useState<Ansicht>('uebersicht');
  const [aktiverIdx, setAktiverIdx] = useState(0);
  const [antworten, setAntworten] = useState<Record<string, Record<number, string[]>>>({});
  const [ergebnisse, setErgebnisse] = useState<Record<string, TeilErgebnis>>({});
  const [abgegebenMap, setAbgegebenMap] = useState<Record<string, boolean>>({});
  const [fehlerFilter, setFehlerFilter] = useState<Record<string, number[] | null>>({});
  const [startZeit, setStartZeit] = useState<number>(Date.now());
  const [hinweis, setHinweis] = useState('');

  const aktiverTeil: Teil = unit.teile[aktiverIdx];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = Number(p.get('teil'));
    if (t && unit.teile.some((x) => x.teil === t)) {
      const idx = unit.teile.findIndex((x) => x.teil === t);
      setAktiverIdx(idx);
      setAnsicht('teil');
      setStartZeit(Date.now());
    }
    const m = p.get('modus');
    if (m === 'pruefung' || m === 'uebung') setModus(m);
  }, []);

  const teilMitFilter = (teil: Teil): Teil => {
    const filter = fehlerFilter[teil.id];
    if (!filter || filter.length === 0) return teil;
    const fragen = teil.fragen.filter((f) => filter.includes(f.nr));
    return { ...teil, fragen, punkte_max: fragen.reduce((a, f) => a + (f.punkte ?? 1), 0) };
  };

  const aktuellerTeilEffektiv = useMemo(() => teilMitFilter(aktiverTeil), [aktiverTeil, fehlerFilter]);

  const setAntwort = (nr: number, keys: string[]) => {
    setAntworten((prev) => ({
      ...prev,
      [aktiverTeil.id]: { ...(prev[aktiverTeil.id] ?? {}), [nr]: keys }
    }));
    setHinweis('');
  };

  const abgeben = async () => {
    const teil = aktuellerTeilEffektiv;
    const ergebnis = scoreTeil(teil, antworten[teil.id] ?? {});
    setErgebnisse((p) => ({ ...p, [aktiverTeil.id]: ergebnis }));
    setAbgegebenMap((p) => ({ ...p, [aktiverTeil.id]: true }));
    setAnsicht('ergebnis');

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
    const id = await speichereSesi({
      skill: unit.skill,
      unitId: unit.id,
      teilId: teil.id,
      teil: teil.teil,
      modus,
      ergebnis,
      dauerSekunden: (Date.now() - startZeit) / 1000,
      meta
    });
    setHinweis(
      id && verfuegbar()
        ? 'Ergebnis lokal gespeichert (IndexedDB auf diesem Gerät).'
        : 'Hinweis: Speicherung im Browser nicht verfügbar — Ergebnis nur in dieser Sitzung.'
    );
  };

  const starteTeil = (idx: number, nurFehler?: number[] | null) => {
    const teil = unit.teile[idx];
    setAktiverIdx(idx);
    if (nurFehler !== undefined) setFehlerFilter((p) => ({ ...p, [teil.id]: nurFehler }));
    setAntworten((p) => ({ ...p, [teil.id]: {} }));
    setAbgegebenMap((p) => ({ ...p, [teil.id]: false }));
    setAnsicht('teil');
    setStartZeit(Date.now());
    setHinweis('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nurFehlerStarten = () => {
    const e = ergebnisse[aktiverTeil.id];
    if (!e) return;
    const nrs = e.items.filter((i) => !i.richtig).map((i) => i.frageNr);
    starteTeil(aktiverIdx, nrs.length ? nrs : []);
  };

  const gesamt = useMemo(() => {
    const fertig = unit.teile.map((t) => ergebnisse[t.id]).filter(Boolean) as TeilErgebnis[];
    if (!fertig.length) return null;
    const m = scoreModul(fertig, modus);
    return { ...m, teileFertig: fertig.length };
  }, [ergebnisse, modus, unit]);

  if (ansicht === 'teil' && aktiverTeil) {
    return (
      <div class="flex flex-col gap-4">
        <Navigation
          unit={unit}
          modus={modus}
          setModus={(m) => setModus(m)}
          ansicht={ansicht}
          zurueck={() => setAnsicht('uebersicht')}
          aktiverIdx={aktiverIdx}
        />
        <TeilRunner
          teil={aktuellerTeilEffektiv}
          modus={modus}
          antworten={antworten[aktiverTeil.id] ?? {}}
          setAntwort={setAntwort}
          abgegeben={!!abgegebenMap[aktiverTeil.id]}
          onAbgeben={abgeben}
          vorbereitungsSekunden={vorbereitungsSekunden}
        />
      </div>
    );
  }

  if (ansicht === 'ergebnis' && ergebnisse[aktiverTeil.id]) {
    const naechster = aktiverIdx + 1 < unit.teile.length ? unit.teile[aktiverIdx + 1] : null;
    return (
      <div class="flex flex-col gap-4">
        <Navigation
          unit={unit}
          modus={modus}
          setModus={setModus}
          ansicht={ansicht}
          zurueck={() => setAnsicht('uebersicht')}
          aktiverIdx={aktiverIdx}
        />
        {hinweis ? (
          <p class="meldung meldung-ok text-sm" role="status">
            {hinweis}
          </p>
        ) : null}
        <Ergebnis
          teil={aktuellerTeilEffektiv}
          ergebnis={ergebnisse[aktiverTeil.id]}
          modus={modus}
          onWiederholen={() => starteTeil(aktiverIdx, null)}
          onNurFehler={nurFehlerStarten}
          onWeiter={naechster ? () => starteTeil(aktiverIdx + 1, null) : undefined}
          naechsterTeilLabel={naechster ? `Teil ${naechster.teil}` : undefined}
        />
        <p class="ruhig text-sm">
          Vollständige Auswertung aller Teile: <a href="/statistik/">Statistik</a> · Fehler sammeln im{' '}
          <a href="/fehlerheft/">Fehlerheft</a>.
        </p>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-5">
      <div class="karte flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="m-0 text-2xl font-bold">{unit.titel}</h1>
          <p class="m-0 ruhig">
            {unit.titel_id} · {unit.skill === 'lesen' ? 'Leseverstehen' : 'Hörenverstehen'} · Niveau B2 ·{' '}
            {unit.teile.reduce((a, t) => a + t.fragen.length, 0)} Aufgaben
          </p>
          <p class="m-0 ruhig text-xs">
            {unit.beschreibung_id} · Themenfeld: {unit.themenfeld}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="ruhig text-sm">Modus:</span>
          <button
            class={`btn ${modus === 'uebung' ? 'btn-primaer' : ''}`}
            aria-pressed={modus === 'uebung'}
            onClick={() => setModus('uebung')}
            data-testid="modus-uebung"
          >
            Übung
          </button>
          <button
            class={`btn ${modus === 'pruefung' ? 'btn-primaer' : ''}`}
            aria-pressed={modus === 'pruefung'}
            onClick={() => setModus('pruefung')}
            data-testid="modus-pruefung"
          >
            Prüfung
          </button>
        </div>
      </div>

      {gesamt ? (
        <div class="karte flex flex-wrap items-center gap-4">
          <ScoreRing prozent={gesamt.skalierung0bis100} groesse={112} />
          <div>
            <h2 class="m-0 text-lg font-bold">Zwischenstand der Unit</h2>
            <p class="m-0">
              {gesamt.teileFertig} von {unit.teile.length} Teilen bearbeitet · {gesamt.punkte} von {gesamt.punkteMax}{' '}
              Punkten ({gesamt.skalierung0bis100} von 100) · <strong>{gesamt.label}</strong>
            </p>
            <p class="ruhig m-0 text-sm">
              Bestehensgrenze {BESTEHENSGRENZE} Punkte. {gesamt.offen > 0 ? `${gesamt.offen} Aufgabe(n) unbeantwortet.` : ''}
            </p>
          </div>
        </div>
      ) : null}

      <ol class="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
        {unit.teile.map((t, i) => {
          const e = ergebnisse[t.id];
          const proz = e ? Math.round((e.punkte / e.punkteMax) * 100) : null;
          return (
            <li key={t.id} class="karte flex flex-col gap-2">
              <div class="flex items-baseline justify-between gap-2">
                <h2 class="m-0 text-base font-bold">
                  Teil {t.teil}: {t.titel}
                </h2>
                {proz !== null ? (
                  <span class="chip" style={{ borderColor: 'var(--accent)' }}>
                    {e!.punkte}/{e!.punkteMax} Punkte · {proz}%
                  </span>
                ) : (
                  <span class="chip">noch nicht bearbeitet</span>
                )}
              </div>
              <p class="ruhig m-0 text-sm">
                {t.fragen.length} Aufgaben · {t.zeit_minuten} Minuten ·{' '}
                {[...new Set(t.fragen.map((f) => TYP_LABEL[f.typ] ?? f.typ))].join(' / ')}
                {t.audio ? ` · Wiedergabe ${t.audio.play_limit_pruefung}×` : ''}
              </p>
              <p class="m-0 text-sm">{t.instruktion_id}</p>
              <div class="flex flex-wrap gap-2">
                <button class="btn btn-primaer" onClick={() => starteTeil(i, null)} data-testid={`start-teil-${t.teil}`}>
                  {e ? 'Noch einmal' : 'Starten'}
                </button>
                {e && e.items.some((x) => !x.richtig) ? (
                  <button
                    class="btn"
                    onClick={() => {
                      const nrs = e.items.filter((x) => !x.richtig).map((x) => x.frageNr);
                      starteTeil(i, nrs);
                    }}
                  >
                    Nur Fehler ({e.items.filter((x) => !x.richtig).length})
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p class="ruhig text-xs">
        Audio dieser Unit: {unit.teile.filter((t) => t.audio).length} Teil(e) mit Audio ·{' '}
        {unit.teile.filter((t) => t.audio && t.audio.dauer_sekunden === 0).length} noch ohne produzierte Datei
        (Transkript verfügbar).
      </p>
    </div>
  );
}

function Navigation({
  unit,
  modus,
  setModus,
  zurueck,
  aktiverIdx
}: {
  unit: Unit;
  modus: Modus;
  setModus: (m: Modus) => void;
  ansicht: Ansicht;
  zurueck: () => void;
  aktiverIdx: number;
}) {
  return (
    <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Unit-Navigation">
      <button class="btn px-2 py-1 text-xs" onClick={zurueck} data-testid="zurueck">
        ← {unit.titel}
      </button>
      <span class="chip">Teil {unit.teile[aktiverIdx].teil} von {unit.teile.length}</span>
      <button
        class={`btn px-2 py-1 text-xs ${modus === 'uebung' ? 'btn-primaer' : ''}`}
        onClick={() => setModus('uebung')}
        aria-pressed={modus === 'uebung'}
      >
        Übungsmodus
      </button>
      <button
        class={`btn px-2 py-1 text-xs ${modus === 'pruefung' ? 'btn-primaer' : ''}`}
        onClick={() => setModus('pruefung')}
        aria-pressed={modus === 'pruefung'}
      >
        Prüfungsmodus
      </button>
    </nav>
  );
}

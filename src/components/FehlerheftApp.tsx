/**
 * B2-Trainer — Fehlerheft: gesammelte Fehler (SRS/SM-2) ansehen, gruppieren,
 * filtern und in Mini-Sessions gezielt üben.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Teil } from '../data/schema';
import { alleUnits } from '../lib/content';
import {
  ladeFehler,
  markiereGelernt,
  loescheFehler,
  verbucheFehler,
  verfuegbar
} from '../lib/storage';
import type { FehlerRow, ItemMeta } from '../lib/storage';
import { faellig, statistik } from '../lib/srs';
import { scoreTeil } from '../lib/scoring';
import type { TeilErgebnis } from '../lib/scoring';
import { formatDatumDe, TYP_LABEL } from '../lib/format';
import TeilRunner from './TeilRunner';
import Ergebnis from './Ergebnis';

type Ansicht = 'liste' | 'ueben' | 'ergebnis';
type Status = 'laden' | 'bereit' | 'leer' | 'kein-idb' | 'fehler';

/** FehlerRow.itemId ist der zusammengesetzte Schlüssel `${teilId}#${frageNr}`. */
function zerlegeItemId(itemId: string): { teilId: string; frageNr: number } {
  const hash = itemId.indexOf('#');
  if (hash < 0) return { teilId: itemId, frageNr: 0 };
  return { teilId: itemId.slice(0, hash), frageNr: Number(itemId.slice(hash + 1)) || 0 };
}

function findeTeil(teilId: string): Teil | undefined {
  for (const unit of alleUnits) {
    const teil = unit.teile.find((t) => t.id === teilId);
    if (teil) return teil;
  }
  return undefined;
}

function gruppiere(
  rows: FehlerRow[],
  keyFn: (r: FehlerRow) => string
): Array<[string, FehlerRow[]]> {
  const map = new Map<string, FehlerRow[]>();
  for (const r of rows) {
    const key = keyFn(r) || '—';
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

export default function FehlerheftApp() {
  const [rows, setRows] = useState<FehlerRow[]>([]);
  const [status, setStatus] = useState<Status>('laden');
  const [suche, setSuche] = useState('');
  const [nurFaellig, setNurFaellig] = useState(false);
  const [meldung, setMeldung] = useState('');

  const [ansicht, setAnsicht] = useState<Ansicht>('liste');
  const [aktivesItem, setAktivesItem] = useState<{ teilId: string; fragen: number[] } | null>(null);
  const [antworten, setAntworten] = useState<Record<number, string[]>>({});
  const [abgegeben, setAbgegeben] = useState(false);
  const [ergebnis, setErgebnis] = useState<TeilErgebnis | null>(null);

  const laden = async () => {
    if (!verfuegbar()) {
      setStatus('kein-idb');
      return;
    }
    try {
      const data = await ladeFehler();
      setRows(data);
      setStatus(data.length ? 'bereit' : 'leer');
    } catch {
      setStatus('fehler');
    }
  };

  useEffect(() => {
    void laden();
  }, []);

  const faellige = useMemo(() => faellig(rows), [rows]);
  const stats = useMemo(() => statistik(rows), [rows]);
  const faelligSet = useMemo(() => new Set(faellige.map((f) => f.itemId)), [faellige]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return rows.filter((r) => {
      if (nurFaellig && !faelligSet.has(r.itemId)) return false;
      if (!q) return true;
      return [
        r.stamm_de,
        r.stamm_id,
        r.explain_de,
        r.explain_id,
        r.evidence,
        r.loesung.join(' '),
        TYP_LABEL[r.typ] ?? r.typ,
        r.themenfeld
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, suche, nurFaellig, faelligSet]);

  const nachTyp = useMemo(() => gruppiere(gefiltert, (r) => r.typ), [gefiltert]);
  const nachFeld = useMemo(() => gruppiere(gefiltert, (r) => r.themenfeld), [gefiltert]);

  const miniTeil = useMemo<Teil | null>(() => {
    if (!aktivesItem) return null;
    const teil = findeTeil(aktivesItem.teilId);
    if (!teil) return null;
    const fragen = teil.fragen.filter((f) => aktivesItem.fragen.includes(f.nr));
    if (!fragen.length) return null;
    return { ...teil, fragen, punkte_max: fragen.reduce((a, f) => a + (f.punkte ?? 1), 0) };
  }, [aktivesItem]);

  const starteUeben = (row: FehlerRow) => {
    const { teilId, frageNr } = zerlegeItemId(row.itemId);
    const teil = findeTeil(teilId);
    if (!teil) {
      setMeldung(
        `Der Quell-Teil „${teilId}“ ist im aktuellen Inhalt nicht (mehr) vorhanden — diese Aufgabe kann nicht geübt werden.`
      );
      setAnsicht('liste');
      return;
    }
    if (!teil.fragen.some((f) => f.nr === frageNr)) {
      setMeldung(`Aufgabe ${frageNr} existiert in „${teil.titel}“ nicht mehr.`);
      setAnsicht('liste');
      return;
    }
    setMeldung('');
    setAktivesItem({ teilId, fragen: [frageNr] });
    setAntworten({});
    setAbgegeben(false);
    setErgebnis(null);
    setAnsicht('ueben');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const abgeben = async () => {
    if (!miniTeil) return;
    const e = scoreTeil(miniTeil, antworten);
    const meta: ItemMeta[] = miniTeil.fragen.map((f) => ({
      itemId: miniTeil.id,
      frageNr: f.nr,
      typ: f.typ,
      themenfeld: miniTeil.themenfeld,
      stamm_de: f.stamm_de,
      stamm_id: f.stamm_id,
      explain_de: f.explain_de,
      explain_id: f.explain_id,
      evidence: f.evidence,
      teilTitel: miniTeil.titel
    }));
    try {
      await verbucheFehler(e, meta);
    } catch {
      /* Speichern optional — Auswertung bleibt gültig. */
    }
    setErgebnis(e);
    setAbgegeben(true);
    setAnsicht('ergebnis');
    await laden();
  };

  const wiederholen = () => {
    setAntworten({});
    setAbgegeben(false);
    setErgebnis(null);
    setAnsicht('ueben');
  };

  const nurFehlerUeben = () => {
    if (!ergebnis || !aktivesItem) return;
    const nrs = ergebnis.items.filter((i) => !i.richtig).map((i) => i.frageNr);
    if (!nrs.length) return;
    setAktivesItem({ ...aktivesItem, fragen: nrs });
    setAntworten({});
    setAbgegeben(false);
    setErgebnis(null);
    setAnsicht('ueben');
  };

  const zurueckZurListe = () => {
    setAnsicht('liste');
    setErgebnis(null);
    setAntworten({});
    setAbgegeben(false);
  };

  const alsGelernt = async (itemId: string) => {
    await markiereGelernt(itemId, true);
    await laden();
  };

  const loeschen = async (itemId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Diesen Fehlerheft-Eintrag wirklich löschen?')) return;
    await loescheFehler(itemId);
    await laden();
  };

  /* --------------------------- Mini-Session --------------------------- */
  if (ansicht === 'ueben' && miniTeil) {
    return (
      <div class="flex flex-col gap-4">
        <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Fehlerheft-Navigation">
          <button class="btn px-2 py-1 text-xs" onClick={zurueckZurListe} data-testid="zurueck-liste">
            ← Fehlerheft
          </button>
          <span class="chip">Mini-Übung · Teil {miniTeil.teil}</span>
          <span class="chip">{miniTeil.titel}</span>
        </nav>
        <TeilRunner
          teil={miniTeil}
          modus="uebung"
          antworten={antworten}
          setAntwort={(nr, keys) => setAntworten((p) => ({ ...p, [nr]: keys }))}
          abgegeben={abgegeben}
          onAbgeben={abgeben}
        />
      </div>
    );
  }

  if (ansicht === 'ergebnis' && miniTeil && ergebnis) {
    return (
      <div class="flex flex-col gap-4">
        <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Fehlerheft-Navigation">
          <button class="btn px-2 py-1 text-xs" onClick={zurueckZurListe} data-testid="zurueck-liste">
            ← Fehlerheft
          </button>
          <span class="chip">Mini-Übung · Teil {miniTeil.teil}</span>
        </nav>
        <Ergebnis
          teil={miniTeil}
          ergebnis={ergebnis}
          modus="uebung"
          onWiederholen={wiederholen}
          onNurFehler={nurFehlerUeben}
          onWeiter={zurueckZurListe}
          naechsterTeilLabel="Fehlerheft"
        />
      </div>
    );
  }

  /* ----------------------------- Liste ----------------------------- */
  if (status === 'kein-idb') {
    return (
      <p class="meldung meldung-warn" role="status">
        IndexedDB ist in diesem Browser nicht verfügbar — das Fehlerheft kann keine Einträge laden oder speichern.
      </p>
    );
  }

  if (status === 'fehler') {
    return (
      <p class="meldung meldung-warn" role="alert">
        Das Fehlerheft konnte nicht gelesen werden. Bitte Seite neu laden.
      </p>
    );
  }

  if (status === 'laden') {
    return <p class="ruhig" role="status">Fehlerheft wird geladen …</p>;
  }

  const prozentArchiv = stats.total ? Math.round((stats.archiviert / stats.total) * 100) : 0;

  return (
    <div class="flex flex-col gap-4" data-testid="fehlerheft-app">
      {status === 'leer' ? (
        <div class="karte">
          <h2 class="m-0 text-lg font-bold">Noch keine Fehler gesammelt</h2>
          <p class="m-0 ruhig">
            Bearbeite eine Unit unter <a href="/lesen/">Lesen</a> oder <a href="/hoeren/">Hören</a> — falsch beantwortete
            Aufgaben erscheinen danach automatisch hier und werden nach dem SM-2-Prinzip wiederholt.
          </p>
        </div>
      ) : null}

      {status === 'bereit' ? (
        <section class="karte" aria-labelledby="fh-summary">
          <h2 id="fh-summary" class="m-0 text-lg font-bold">Überblick</h2>
          <div class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Kennzahl label="Einträge gesamt" wert={String(stats.total)} />
            <Kennzahl label="Fällig heute" wert={String(stats.faellig)} />
            <Kennzahl label="Archiviert" wert={String(stats.archiviert)} />
            <Kennzahl label="In Übung" wert={String(stats.lernend)} />
          </div>
          <div
            class="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
            role="progressbar"
            aria-label="Anteil archivierter Fehler"
            aria-valuemin={0}
            aria-valuemax={stats.total}
            aria-valuenow={stats.archiviert}
          >
            <div class="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${prozentArchiv}%` }} />
          </div>
          <p class="ruhig m-0 mt-1 text-xs">
            {stats.archiviert} von {stats.total} archiviert ({prozentArchiv} %)
          </p>
        </section>
      ) : null}

      {meldung ? (
        <p class="meldung meldung-warn" role="alert">
          {meldung}
        </p>
      ) : null}

      {status === 'bereit' ? (
        <section class="karte flex flex-col gap-3" aria-label="Filter und Gruppierung">
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex grow flex-col gap-1">
              <label class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]" for="fh-suche">
                Suche
              </label>
              <input
                id="fh-suche"
                type="search"
                class="feld"
                placeholder="Stamm, Erklärung, Lösung, Typ …"
                value={suche}
                onInput={(e) => setSuche((e.target as HTMLInputElement).value)}
              />
            </div>
            <label class="flex items-center gap-2 text-sm" for="fh-nur-faellig">
              <input
                id="fh-nur-faellig"
                type="checkbox"
                checked={nurFaellig}
                onChange={(e) => setNurFaellig((e.target as HTMLInputElement).checked)}
              />
              Nur heute fällige
            </label>
          </div>

          <div class="flex flex-wrap gap-2 text-xs">
            <span class="ruhig">Nach Typ:</span>
            {nachTyp.length ? (
              nachTyp.map(([typ, list]) => (
                <span class="chip" key={typ}>
                  {TYP_LABEL[typ] ?? typ} · {list.length}
                </span>
              ))
            ) : (
              <span class="ruhig">—</span>
            )}
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="ruhig">Nach Themenfeld:</span>
            {nachFeld.length ? (
              nachFeld.map(([feld, list]) => (
                <span class="chip" key={feld}>
                  {feld} · {list.length}
                </span>
              ))
            ) : (
              <span class="ruhig">—</span>
            )}
          </div>
        </section>
      ) : null}

      {status === 'bereit' && gefiltert.length === 0 ? (
        <p class="karte ruhig m-0">Keine Einträge passen zu Suche/Filter.</p>
      ) : null}

      {status === 'bereit'
        ? nachTyp.map(([typ, list]) => (
            <section class="flex flex-col gap-3" key={typ} aria-label={`Gruppe ${TYP_LABEL[typ] ?? typ}`}>
              <h2 class="m-0 text-base font-bold">
                {TYP_LABEL[typ] ?? typ} <span class="ruhig font-normal">({list.length})</span>
              </h2>
              <ul class="m-0 flex list-none flex-col gap-3 p-0">
                {list.map((r) => {
                  const { frageNr } = zerlegeItemId(r.itemId);
                  const istFaellig = faelligSet.has(r.itemId);
                  return (
                    <li class="karte flex flex-col gap-2" key={r.itemId} data-testid={`fehler-${r.itemId}`}>
                      <div class="flex flex-wrap items-baseline gap-2">
                        <span class="chip">Aufgabe {frageNr}</span>
                        <span class="chip">{TYP_LABEL[r.typ] ?? r.typ}</span>
                        <span class="chip">{r.themenfeld}</span>
                        <span class={`chip ${r.archiviert ? 'text-[var(--success)]' : istFaellig ? 'text-[var(--warn)]' : ''}`}>
                          {r.archiviert ? 'archiviert' : 'lernt'}
                        </span>
                        <span class="chip" title="Nächste Fälligkeit">
                          fällig: {formatDatumDe(r.faellig)}
                        </span>
                      </div>
                      <div>
                        <p class="m-0 text-[0.98rem] font-semibold">{r.stamm_de}</p>
                        <p class="ruhig m-0">{r.stamm_id}</p>
                      </div>
                      <p class="m-0 text-sm">
                        Lösung: <strong>{r.loesung.join(', ')}</strong>
                      </p>
                      <p class="ruhig m-0 text-xs">
                        Treffer: {r.treffer} · Fehlversuche: {r.fehlversuche} · Stufe {r.stufe} · Streak {r.streak}
                      </p>
                      <details>
                        <summary class="cursor-pointer text-sm text-[var(--accent)]">Erklärung / Penjelasan</summary>
                        <div class="prosa mt-2 text-sm">
                          <p class="m-0">{r.explain_de}</p>
                          <p class="ruhig m-0">{r.explain_id}</p>
                          <p class="m-0 mt-1">
                            <span class="chip">Beleg im Text</span> <em>„{r.evidence}“</em>
                          </p>
                        </div>
                      </details>
                      <div class="flex flex-wrap gap-2">
                        <button class="btn btn-primaer" onClick={() => starteUeben(r)} data-testid={`ueben-${r.itemId}`}>
                          Üben
                        </button>
                        <button
                          class="btn"
                          disabled={r.archiviert}
                          onClick={() => alsGelernt(r.itemId)}
                          data-testid={`gelernt-${r.itemId}`}
                        >
                          Als gelernt markieren
                        </button>
                        <button class="btn" onClick={() => loeschen(r.itemId)} data-testid={`loeschen-${r.itemId}`}>
                          Löschen
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        : null}
    </div>
  );
}

function Kennzahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div class="rounded-[var(--radius)] border border-[var(--border)] p-2">
      <div class="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div class="text-lg font-bold">{wert}</div>
    </div>
  );
}

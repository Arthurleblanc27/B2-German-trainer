/**
 * B2-Trainer — Wortschatz: Glossar aller Units durchsuchen, Wörter speichern
 * (IndexedDB), als Anki-CSV exportieren/importieren.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Skill } from '../data/schema';
import { alleUnits, glossarVon } from '../lib/content';
import {
  ladeWortschatz,
  speichereWort,
  loescheWort,
  wortschatzAlsCsv,
  csvAlsWortschatz,
  verfuegbar
} from '../lib/storage';
import type { WortRow } from '../lib/storage';

type Status = 'laden' | 'bereit' | 'kein-idb' | 'fehler';

interface WortEintrag {
  wort: string;
  artikel: string;
  plural: string | null;
  wortart: string | null;
  bedeutung_id: string;
  bedeutung_de: string | null;
  beispiel: string | null;
  quelle: string;
  themenfeld: string;
  skill: Skill;
  unit: number;
}

const MAX_ANZEIGE = 300;

/** `wort` enthält im Glossar oft schon den Artikel (z. B. „das Hochbeet“) — Dopplung vermeiden. */
function anzeigeWort(e: Pick<WortEintrag, 'artikel' | 'wort'>): string {
  const w = (e.wort ?? '').trim();
  const a = (e.artikel ?? '').trim();
  if (!a || w.toLowerCase().startsWith(`${a.toLowerCase()} `)) return w;
  return `${a} ${w}`;
}

export default function WortschatzApp() {
  const [gespeichert, setGespeichert] = useState<WortRow[]>([]);
  const [status, setStatus] = useState<Status>('laden');
  const [suche, setSuche] = useState('');
  const [feldFilter, setFeldFilter] = useState('');
  const [nurGespeichert, setNurGespeichert] = useState(false);
  const [meldung, setMeldung] = useState('');
  const dateiRef = useRef<HTMLInputElement | null>(null);

  const laden = async () => {
    if (!verfuegbar()) {
      setStatus('kein-idb');
      return;
    }
    try {
      const data = await ladeWortschatz();
      setGespeichert(data);
      setStatus('bereit');
    } catch {
      setStatus('fehler');
    }
  };

  useEffect(() => {
    void laden();
  }, []);

  const gespeichertSet = useMemo(() => new Set(gespeichert.map((w) => w.wort)), [gespeichert]);

  const alleEintraege = useMemo<WortEintrag[]>(() => {
    const map = new Map<string, WortEintrag>();
    for (const unit of alleUnits) {
      for (const g of glossarVon(unit)) {
        const key = `${g.artikel}|${g.wort}`;
        if (map.has(key)) continue;
        map.set(key, {
          wort: g.wort,
          artikel: g.artikel,
          plural: g.plural ?? null,
          wortart: g.wortart ?? null,
          bedeutung_id: g.bedeutung_id,
          bedeutung_de: g.bedeutung_de ?? null,
          beispiel: g.beispiel ?? null,
          quelle: g.quelle,
          themenfeld: unit.themenfeld,
          skill: unit.skill,
          unit: unit.unit
        });
      }
    }
    // Gespeicherte Wörter, die nicht im Glossar auftauchen (z. B. CSV-Import).
    const vorhanden = new Set([...map.values()].map((e) => e.wort));
    for (const w of gespeichert) {
      if (vorhanden.has(w.wort)) continue;
      map.set(`saved|${w.wort}`, {
        wort: w.wort,
        artikel: w.artikel,
        plural: w.plural,
        wortart: w.wortart,
        bedeutung_id: w.bedeutung_id,
        bedeutung_de: w.bedeutung_de,
        beispiel: w.beispiel,
        quelle: w.quelle,
        themenfeld: 'Import',
        skill: 'lesen',
        unit: 0
      });
    }
    return [...map.values()];
  }, [gespeichert]);

  const felder = useMemo(() => {
    const s = new Set<string>();
    for (const e of alleEintraege) s.add(e.themenfeld);
    return [...s].sort((a, b) => a.localeCompare(b, 'de'));
  }, [alleEintraege]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return alleEintraege.filter((e) => {
      if (nurGespeichert && !gespeichertSet.has(e.wort)) return false;
      if (feldFilter && e.themenfeld !== feldFilter) return false;
      if (!q) return true;
      return [e.artikel, e.wort, e.plural ?? '', e.bedeutung_id, e.bedeutung_de ?? '', e.beispiel ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [alleEintraege, suche, feldFilter, nurGespeichert, gespeichertSet]);

  const proFeld = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of alleEintraege) m.set(e.themenfeld, (m.get(e.themenfeld) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [alleEintraege]);

  const speichern = async (e: WortEintrag) => {
    await speichereWort({
      wort: e.wort,
      artikel: e.artikel,
      plural: e.plural,
      wortart: e.wortart,
      bedeutung_id: e.bedeutung_id,
      bedeutung_de: e.bedeutung_de,
      beispiel: e.beispiel,
      quelle: e.quelle,
      tags: []
    });
    await laden();
  };

  const entfernen = async (wort: string) => {
    await loescheWort(wort);
    await laden();
  };

  const exportiere = () => {
    if (!gespeichert.length) {
      setMeldung('Keine gespeicherten Wörter zum Export vorhanden.');
      return;
    }
    const csv = wortschatzAlsCsv(gespeichert);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'b2-trainer-wortschatz.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMeldung(`${gespeichert.length} Wort/Wörter als CSV exportiert.`);
  };

  const importiere = async (file: File) => {
    try {
      const text = await file.text();
      const rows = csvAlsWortschatz(text);
      for (const r of rows) await speichereWort(r);
      await laden();
      setMeldung(`${rows.length} Wort/Wörter importiert.`);
    } catch {
      setMeldung('CSV konnte nicht gelesen werden.');
    }
  };

  const allesLoeschen = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Alle gespeicherten Wörter wirklich löschen?')) return;
    for (const w of gespeichert) await loescheWort(w.wort);
    await laden();
    setMeldung('Alle gespeicherten Wörter gelöscht.');
  };

  if (status === 'kein-idb') {
    return (
      <p class="meldung meldung-warn" role="status">
        IndexedDB ist in diesem Browser nicht verfügbar — gespeicherte Wörter können weder geladen noch gesichert
        werden. Das Glossar lässt sich weiterhin ansehen.
      </p>
    );
  }

  if (status === 'fehler') {
    return (
      <p class="meldung meldung-warn" role="alert">
        Der Wortschatz konnte nicht gelesen werden. Bitte Seite neu laden.
      </p>
    );
  }

  const sichtbar = gefiltert.slice(0, MAX_ANZEIGE);

  return (
    <div class="flex flex-col gap-4" data-testid="wortschatz-app">
      <section class="karte flex flex-col gap-3" aria-labelledby="ws-toolbar">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex grow flex-col gap-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]" for="ws-suche">
              Suche
            </label>
            <input
              id="ws-suche"
              type="search"
              class="feld"
              placeholder="Wort, Artikel, Bedeutung, Beispiel …"
              value={suche}
              onInput={(e) => setSuche((e.target as HTMLInputElement).value)}
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]" for="ws-feld">
              Themenfeld
            </label>
            <select
              id="ws-feld"
              class="feld w-auto"
              value={feldFilter}
              onChange={(e) => setFeldFilter((e.target as HTMLSelectElement).value)}
            >
              <option value="">Alle Themenfelder</option>
              {felder.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <label class="flex items-center gap-2 text-sm" for="ws-nur-gespeichert">
            <input
              id="ws-nur-gespeichert"
              type="checkbox"
              checked={nurGespeichert}
              onChange={(e) => setNurGespeichert((e.target as HTMLInputElement).checked)}
            />
            Nur gespeicherte
          </label>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primaer" onClick={exportiere} data-testid="csv-export">
            CSV exportieren
          </button>
          <button class="btn" onClick={() => dateiRef.current?.click()} data-testid="csv-import">
            CSV importieren
          </button>
          <input
            ref={dateiRef}
            type="file"
            accept=".csv,.txt"
            class="sr-only"
            aria-label="CSV-Datei importieren"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              if (file) void importiere(file);
              input.value = '';
            }}
          />
          <button class="btn" onClick={allesLoeschen} disabled={!gespeichert.length} data-testid="alles-loeschen">
            Alles löschen
          </button>
        </div>

        {meldung ? (
          <p class="meldung meldung-ok text-sm" role="status">
            {meldung}
          </p>
        ) : null}
      </section>

      <section class="karte" aria-labelledby="ws-statistik">
        <h2 id="ws-statistik" class="m-0 text-lg font-bold">Statistik</h2>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Kennzahl label="Wörter im Glossar" wert={String(alleEintraege.length)} />
          <Kennzahl label="Gespeichert" wert={String(gespeichert.length)} />
          <Kennzahl label="Themenfelder" wert={String(proFeld.length)} />
        </div>
        <p class="ruhig m-0 mt-2 text-xs">
          {proFeld.map(([f, n]) => `${f} (${n})`).join(' · ')}
        </p>
      </section>

      <p class="ruhig m-0 text-sm" role="status">
        {gefiltert.length} Eintrag/Einträge
        {gefiltert.length > MAX_ANZEIGE ? ` — die ersten ${MAX_ANZEIGE} werden angezeigt (Suche eingrenzen)` : ''}
      </p>

      {gefiltert.length === 0 ? (
        <p class="karte ruhig m-0">Keine Einträge passen zu Suche/Filter.</p>
      ) : (
        <ul class="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
          {sichtbar.map((e) => {
            const gespeichertJa = gespeichertSet.has(e.wort);
            return (
              <li class="karte flex flex-col gap-2" key={`${e.artikel}|${e.wort}|${e.quelle}`}>
                <div class="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 class="m-0 text-base font-bold">
                    {anzeigeWort(e)}
                    {e.plural ? <span class="ruhig"> — Plural: {e.plural}</span> : null}
                  </h3>
                  <span class="chip">{e.quelle}</span>
                </div>
                <p class="m-0 text-sm">
                  <strong>{e.bedeutung_id}</strong>
                  {e.bedeutung_de ? ` · ${e.bedeutung_de}` : ''}
                </p>
                {e.beispiel ? (
                  <p class="ruhig m-0 text-sm">
                    <em>„{e.beispiel}“</em>
                  </p>
                ) : null}
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <span class="chip">{e.themenfeld}</span>
                  {e.wortart ? <span class="chip">{e.wortart}</span> : null}
                  {gespeichertJa ? <span class="chip text-[var(--success)]">gespeichert</span> : null}
                </div>
                <div>
                  {gespeichertJa ? (
                    <button
                      class="btn"
                      onClick={() => entfernen(e.wort)}
                      data-testid={`entfernen-${e.wort}`}
                    >
                      Entfernen
                    </button>
                  ) : (
                    <button
                      class="btn btn-primaer"
                      onClick={() => speichern(e)}
                      data-testid={`speichern-${e.wort}`}
                    >
                      Speichern
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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

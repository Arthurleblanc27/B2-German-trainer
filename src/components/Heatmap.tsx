/** B2-Trainer — Aktivitäts-Heatmap (12 Wochen × 7 Tage) als eigenes SVG. */
import { formatDatumDe } from '../lib/format';

export interface HeatmapTag {
  tag: string;
  richtig: number;
  total: number;
  akkuratProzent: number;
}

export interface HeatmapProps {
  daten: HeatmapTag[];
}

const WOCHENTAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const GUTTER = 26;
const TOP = 16;
const CELL = 16;
const GAP = 3;
/** Farbintensität je Aufgaben-Stufe (0 = leer, 4 = sehr aktiv). */
const STUFEN_OPACITY = [0, 0.32, 0.55, 0.78, 1];

function wochentagMon0(tag: string): number {
  const d = new Date(`${tag}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

function monatKurz(tag: string): string {
  const d = new Date(`${tag}T00:00:00Z`);
  return new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'UTC' }).format(d);
}

function stufe(total: number): number {
  if (total <= 0) return 0;
  if (total <= 4) return 1;
  if (total <= 9) return 2;
  if (total <= 19) return 3;
  return 4;
}

export default function Heatmap({ daten }: HeatmapProps) {
  const n = daten.length;
  const wochen = Math.max(1, Math.ceil(n / 7));
  const breite = GUTTER + wochen * (CELL + GAP);
  const hoehe = TOP + 7 * (CELL + GAP);

  const aktivTage = daten.filter((d) => d.total > 0).length;
  const gesamt = daten.reduce((a, d) => a + d.total, 0);
  const aria = `Aktivitätskarte der letzten ${wochen} Wochen: ${aktivTage} aktive von ${n} Tagen, insgesamt ${gesamt} bearbeitete Aufgaben. Stärker gefärbte Tage bedeuten mehr Aufgaben.`;

  // Monatsbeschriftung über der Spalte des jeweils ersten Montags.
  const monatsLabels: { x: number; text: string }[] = [];
  let letzterMonat = '';
  for (let c = 0; c < wochen; c++) {
    const zelle = daten.find(
      (d, i) => wochen - 1 - Math.floor((n - 1 - i) / 7) === c && wochentagMon0(d.tag) === 0
    );
    if (!zelle) continue;
    const m = monatKurz(zelle.tag);
    if (m !== letzterMonat) {
      monatsLabels.push({ x: GUTTER + c * (CELL + GAP), text: m });
      letzterMonat = m;
    }
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        style={{ width: '100%', maxWidth: `${breite}px`, height: 'auto', display: 'block' }}
        role="img"
        aria-label={aria}
      >
        <title>Aktivität der letzten 12 Wochen</title>
        {WOCHENTAG_KURZ.map((w, r) =>
          r % 2 === 0 ? (
            <text
              key={w}
              x={GUTTER - 6}
              y={TOP + r * (CELL + GAP) + CELL / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={9}
              fill="var(--muted)"
            >
              {w}
            </text>
          ) : null
        )}
        {monatsLabels.map((m) => (
          <text key={`${m.text}-${m.x}`} x={m.x} y={TOP - 5} fontSize={9} fill="var(--muted)">
            {m.text}
          </text>
        ))}
        {daten.map((d, i) => {
          const ds = n - 1 - i;
          const col = wochen - 1 - Math.floor(ds / 7);
          const row = wochentagMon0(d.tag);
          const x = GUTTER + col * (CELL + GAP);
          const y = TOP + row * (CELL + GAP);
          const s = stufe(d.total);
          const label = `${formatDatumDe(d.tag)}: ${d.total} Aufgabe(n), ${d.akkuratProzent}% richtig`;
          return (
            <rect
              key={d.tag}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={3}
              fill={s === 0 ? 'var(--surface-3)' : 'var(--accent)'}
              fillOpacity={s === 0 ? 1 : STUFEN_OPACITY[s]}
              stroke="var(--border)"
              strokeWidth={1}
              aria-label={label}
            >
              <title>{label}</title>
            </rect>
          );
        })}
      </svg>

      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--muted)]">
        <span>Weniger</span>
        <span class="flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((s) => (
            <span
              key={s}
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                border: '1px solid var(--border)',
                background: s === 0 ? 'var(--surface-3)' : 'var(--accent)',
                opacity: s === 0 ? 1 : STUFEN_OPACITY[s]
              }}
            />
          ))}
        </span>
        <span>Mehr</span>
        <span>· Aufgaben pro Tag: 0 · 1–4 · 5–9 · 10–19 · 20+</span>
      </div>
    </div>
  );
}

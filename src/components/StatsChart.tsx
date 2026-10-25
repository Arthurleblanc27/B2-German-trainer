/** B2-Trainer — eigener SVG-Balkenchart (bewusst ohne Chart-Bibliothek). */
import { scoreFarbe } from '../lib/format';

export interface ChartDatum {
  label: string;
  wert: number;
  anzahl?: number;
}

export interface StatsChartProps {
  daten: ChartDatum[];
  titel: string;
  /** Einheit hinter dem Zahlenwert; Standard „%“. */
  einheit?: string;
  /** Feste Farbe oder Funktion je Wert; Standard: scoreFarbe(wert). */
  farbe?: string | ((wert: number) => string);
  /** true → vertikale Säulen (viele Datenpunkte, z. B. 30-Tage-Trend). */
  vertikal?: boolean;
}

type FarbFn = (wert: number) => string;

function ariaText(daten: ChartDatum[], titel: string, einheit: string): string {
  const teile = daten.map(
    (d) => `${d.label} ${d.wert}${einheit}${d.anzahl != null ? ` (${d.anzahl} Aufgaben)` : ''}`
  );
  return `${titel}: ${teile.join(', ')}`;
}

export default function StatsChart({ daten, titel, einheit = '%', farbe, vertikal = false }: StatsChartProps) {
  if (!daten.length) return <p class="ruhig m-0">Für „{titel}“ liegen noch keine Daten vor.</p>;
  const farbeVon: FarbFn = typeof farbe === 'function' ? farbe : (wert) => farbe ?? scoreFarbe(wert);
  const aria = ariaText(daten, titel, einheit);
  return vertikal ? (
    <Saeulen daten={daten} titel={titel} einheit={einheit} farbeVon={farbeVon} aria={aria} />
  ) : (
    <Balken daten={daten} titel={titel} einheit={einheit} farbeVon={farbeVon} aria={aria} />
  );
}

interface DiagrammIntern {
  daten: ChartDatum[];
  titel: string;
  einheit: string;
  farbeVon: FarbFn;
  aria: string;
}

/** Horizontale Balken — gut für benannte Kategorien (Teil, Typ, Themenfeld). */
function Balken({ daten, titel, einheit, farbeVon, aria }: DiagrammIntern) {
  const W = 640;
  const rowH = 30;
  const padY = 8;
  const valueW = 96;
  const maxLen = daten.reduce((m, d) => Math.max(m, d.label.length), 0);
  const labelW = Math.min(260, Math.max(84, Math.round(maxLen * 7.2) + 12));
  const trackX = labelW + 10;
  const trackW = Math.max(60, W - trackX - valueW);
  const H = padY * 2 + daten.length * rowH;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={aria}
    >
      <title>{titel}</title>
      {daten.map((d, i) => {
        const y = padY + i * rowH;
        const barH = rowH - 12;
        const barY = y + 6;
        const breite = (Math.max(0, Math.min(100, d.wert)) / 100) * trackW;
        const text = `${d.wert}${einheit}${d.anzahl != null ? ` · n=${d.anzahl}` : ''}`;
        return (
          <g key={`${d.label}-${i}`}>
            <text
              x={labelW}
              y={y + rowH / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={12}
              fill="var(--ink)"
            >
              {d.label}
            </text>
            <rect x={trackX} y={barY} width={trackW} height={barH} rx={4} fill="var(--surface-3)" />
            <rect x={trackX} y={barY} width={breite} height={barH} rx={4} fill={farbeVon(d.wert)}>
              <title>{`${d.label}: ${d.wert}${einheit}${d.anzahl != null ? ` (${d.anzahl} Aufgaben)` : ''}`}</title>
            </rect>
            <text
              x={W - 6}
              y={y + rowH / 2}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={700}
              fill="var(--ink)"
            >
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Vertikale Säulen — gut für Zeitreihen (z. B. 30-Tage-Trend). */
function Saeulen({ daten, titel, einheit, farbeVon, aria }: DiagrammIntern) {
  const W = 640;
  const H = 220;
  const padT = 12;
  const padB = 34;
  const padL = 30;
  const padR = 10;
  const baseY = H - padB;
  const plotH = baseY - padT;
  const plotW = W - padL - padR;
  const n = daten.length;
  const colW = plotW / n;
  const barW = Math.max(3, Math.min(28, colW * 0.62));
  const step = Math.max(1, Math.ceil(n / 9));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={aria}
    >
      <title>{titel}</title>
      {[0, 50, 100].map((p) => {
        const y = baseY - (p / 100) * plotH;
        return (
          <g key={p}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text x={padL - 5} y={y} textAnchor="end" dominantBaseline="central" fontSize={9} fill="var(--muted)">
              {p}
            </text>
          </g>
        );
      })}
      {daten.map((d, i) => {
        const h = Math.max(1, (Math.max(0, Math.min(100, d.wert)) / 100) * plotH);
        const x = padL + i * colW + (colW - barW) / 2;
        const y = baseY - h;
        const zeige = i % step === 0 || i === n - 1;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill={farbeVon(d.wert)}>
              <title>{`${d.label}: ${d.wert}${einheit}${d.anzahl != null ? ` (${d.anzahl} Sitzungen)` : ''}`}</title>
            </rect>
            {zeige ? (
              <text
                x={x + barW / 2}
                y={baseY + 6}
                textAnchor="end"
                fontSize={9}
                fill="var(--muted)"
                transform={`rotate(-45 ${x + barW / 2} ${baseY + 6})`}
              >
                {d.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

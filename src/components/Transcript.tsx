/** B2-Trainer — transkrip audio: klik kata → lompat ke detik tersebut, kata aktif ter-highlight. */
import { useMemo } from 'preact/hooks';

export interface TranscriptProps {
  text: string;
  /** [[start, end, wort], …] dari forced alignment (boleh kosong) */
  timestamps?: [number, number, string][];
  /** detik pemutaran saat ini */
  zeit?: number;
  onSeek?: (sekunden: number) => void;
  versteckt?: boolean;
}

export default function Transcript({ text, timestamps = [], zeit = 0, onSeek, versteckt = false }: TranscriptProps) {
  const aktiv = useMemo(() => {
    if (!timestamps.length) return -1;
    let idx = -1;
    for (let i = 0; i < timestamps.length; i++) {
      const t = timestamps[i];
      if (zeit >= t[0] && zeit <= t[1] + 0.05) {
        idx = i;
        break;
      }
    }
    return idx;
  }, [zeit, timestamps]);

  if (versteckt) return null;

  if (timestamps.length) {
    return (
      <div class="transkript prosa max-h-80 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[0.95rem]">
        {timestamps.map((t, i) => (
          <span
            key={`${t[0]}-${i}`}
            class={`wort ${i === aktiv ? 'aktiv' : ''}`}
            role={onSeek ? 'button' : undefined}
            tabindex={onSeek ? 0 : undefined}
            title={`${t[0].toFixed(1)}s`}
            onClick={() => onSeek?.(t[0])}
            onKeyDown={(e: KeyboardEvent) => {
              if (onSeek && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSeek(t[0]);
              }
            }}
          >
            {t[2]}{' '}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div class="transkript prosa max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[0.95rem]">
      {text}
    </div>
  );
}

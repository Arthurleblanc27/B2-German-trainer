/**
 * B2-Trainer — pemutar audio dengan dua mode:
 *  PRÜFUNG: hanya Play, jumlah putar terbatas (play_limit_pruefung), tanpa seek & tanpa transkrip.
 *  ÜBUNG:   play/pause, seek, kecepatan 0.75–1.25, loop A–B, −5s/+5s, transkrip.
 */
import type { Audio } from '../data/schema';
import type { Modus } from '../lib/scoring';
import { formatUhrzeit } from '../lib/format';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

export interface AudioPlayerProps {
  audio: Audio;
  modus: Modus;
  zeit: number;
  onZeit: (sekunden: number) => void;
  onWiedergabeEnde?: (anzahl: number) => void;
  seekAnfrage?: number | null;
  /** injizierbar für E2E-Tests mit verkürzter Zeit */
  testId?: string;
}

export default function AudioPlayer({
  audio,
  modus,
  zeit,
  onZeit,
  onWiedergabeEnde,
  seekAnfrage = null,
  testId = 'player'
}: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [dauer, setDauer] = useState(audio.dauer_sekunden || 0);
  const [abspielungen, setAbspielungen] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [fehlt, setFehlt] = useState(false);

  const grenze = modus === 'pruefung' ? audio.play_limit_pruefung : Infinity;
  const gesperrt = abspielungen >= grenze;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.playbackRate = tempo;
  }, [tempo]);

  useEffect(() => {
    const el = ref.current;
    if (!el || seekAnfrage === null || seekAnfrage === undefined) return;
    try {
      el.currentTime = seekAnfrage;
      onZeit(seekAnfrage);
    } catch {
      /* Audio noch nicht geladen */
    }
  }, [seekAnfrage]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const zeitUpdate = () => {
      onZeit(el.currentTime);
      if (loopA !== null && loopB !== null && el.currentTime >= loopB) {
        el.currentTime = loopA;
      }
    };
    const geladen = () => setDauer(el.duration || audio.dauer_sekunden || 0);
    const ende = () => {
      setLaeuft(false);
      if (modus !== 'pruefung') {
        setAbspielungen((n) => {
          const neu = n + 1;
          onWiedergabeEnde?.(neu);
          return neu;
        });
      }
    };
    const fehler = () => setFehlt(true);
    el.addEventListener('timeupdate', zeitUpdate);
    el.addEventListener('loadedmetadata', geladen);
    el.addEventListener('ended', ende);
    el.addEventListener('error', fehler);
    return () => {
      el.removeEventListener('timeupdate', zeitUpdate);
      el.removeEventListener('loadedmetadata', geladen);
      el.removeEventListener('ended', ende);
      el.removeEventListener('error', fehler);
    };
  }, [loopA, loopB]);

  const starte = async () => {
    const el = ref.current;
    if (!el || gesperrt) return;
    // Prüfungsmodus: die Wiedergabe zählt mit dem START (Vorspulen/Pause gibt es dort nicht),
    // sonst wäre "einmal hören" durch Pausieren umgehbar.
    if (modus === 'pruefung') {
      setAbspielungen((n) => {
        const neu = n + 1;
        onWiedergabeEnde?.(neu);
        return neu;
      });
    }
    try {
      await el.play();
      setLaeuft(true);
    } catch {
      setFehlt(true);
    }
  };

  const pausiere = () => {
    ref.current?.pause();
    setLaeuft(false);
  };

  const springe = (delta: number) => {
    const el = ref.current;
    if (!el) return;
    if (modus === 'pruefung') return; // im Prüfungsmodus nicht erlaubt
    el.currentTime = Math.max(0, Math.min((el.duration || dauer) - 0.2, el.currentTime + delta));
    onZeit(el.currentTime);
  };

  const fortschritt = dauer > 0 ? Math.min(100, (zeit / dauer) * 100) : 0;
  const info = useMemo(() => {
    if (modus === 'pruefung') return `Wiedergabe ${Math.min(abspielungen + (laeuft ? 1 : 0), grenze) || 1} von ${grenze}`;
    return `Übungsmodus · ${tempo.toFixed(2)}×`;
  }, [abspielungen, laeuft, grenze, modus, tempo]);

  return (
    <div class="karte" data-testid={testId}>
      <audio ref={ref} src={audio.src} preload="metadata" data-testid={`${testId}-el`} />

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        {laeuft && modus === 'uebung' ? (
          <button class="btn" onClick={pausiere} data-testid="pause">
            <span aria-hidden="true">❙❙</span> Pause
          </button>
        ) : null}
        {!laeuft || modus === 'pruefung' ? (
          <button
            class="btn btn-primaer"
            onClick={starte}
            disabled={gesperrt}
            aria-disabled={gesperrt}
            data-testid="play"
            aria-label="Audio abspielen"
          >
            <span aria-hidden="true">▶</span> {abspielungen === 0 ? 'Abspielen' : 'Noch einmal abspielen'}
          </button>
        ) : null}
        <span class="chip chip-akzent" data-testid="player-status">
          {info}
        </span>
        {modus === 'uebung' ? (
          <span class="ruhig tabular-nums">
            {formatUhrzeit(zeit)} / {formatUhrzeit(dauer)}
          </span>
        ) : null}
      </div>

      {modus === 'uebung' ? (
        <div class="mt-3.5">
          <input
            type="range"
            class="w-full"
            min={0}
            max={Math.max(1, Math.floor(dauer))}
            step={1}
            value={Math.floor(zeit)}
            aria-label="Position im Audio"
            data-testid="seek"
            onInput={(e) => {
              const el = ref.current;
              if (!el) return;
              const v = Number((e.target as HTMLInputElement).value);
              el.currentTime = v;
              onZeit(v);
            }}
          />
          <div class="mt-2.5 flex flex-wrap items-center gap-2">
            <button class="btn btn-klein" onClick={() => springe(-5)} data-testid="minus5">
              −5 s
            </button>
            <button class="btn btn-klein" onClick={() => springe(5)} data-testid="plus5">
              +5 s
            </button>
            <label class="ruhig flex items-center gap-1.5 text-xs">
              Tempo
              <select
                class="feld py-1 text-xs"
                style={{ width: 'auto' }}
                value={tempo}
                data-testid="tempo"
                onChange={(e) => setTempo(Number((e.target as HTMLSelectElement).value))}
              >
                <option value={0.75}>0.75×</option>
                <option value={0.9}>0.90×</option>
                <option value={1}>1.00×</option>
                <option value={1.15}>1.15×</option>
                <option value={1.25}>1.25×</option>
              </select>
            </label>
            <button
              class="btn btn-klein"
              data-testid="loop-a"
              onClick={() => {
                const t = ref.current?.currentTime ?? 0;
                if (loopA === null) setLoopA(t);
                else if (loopB === null && t > loopA) setLoopB(t);
                else {
                  setLoopA(null);
                  setLoopB(null);
                }
              }}
            >
              A–B Schleife {loopA !== null ? `A=${loopA.toFixed(1)}s` : ''} {loopB !== null ? `B=${loopB.toFixed(1)}s` : ''}
            </button>
          </div>
        </div>
      ) : (
        <div class="mt-3.5">
          <div class="fortschritt" aria-hidden="true">
            <span style={{ width: `${fortschritt}%` }} />
          </div>
          <p class="ruhig mt-2 mb-0 text-xs">
            Prüfungsmodus: kein Vorspulen und keine Transkript-Einsicht während der Wiedergabe. Wähle vor dem Start den
            Übungsmodus, wenn du A–B-Schleife und Transkript benötigst.
          </p>
        </div>
      )}

      {gesperrt && modus === 'pruefung' ? (
        <p class="meldung meldung-warn mt-3 text-sm" role="status" data-testid="player-gesperrt">
          Maximale Wiedergabeanzahl ({grenze}×) erreicht — im Prüfungsmodus gesperrt.
        </p>
      ) : null}
      {fehlt ? (
        <p class="meldung meldung-warn mt-3 text-sm" role="status">
          Audiodatei noch nicht vorhanden (<code>{audio.src}</code>). Transkript steht zum Lesen bereit.
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

import { cn } from '@/lib/utils';

interface VoicePlayerProps {
  src: string;
  /** Seeds the pseudo-waveform so each voice note looks distinct but stable. */
  seed: string;
  /** Styled for my (primary) bubble vs partner (muted) bubble. */
  mine: boolean;
}

const BAR_COUNT = 28;

/**
 * Telegram-style voice bubble: round play/pause, pseudo-waveform bars that
 * fill with playback progress, and an elapsed/total time label. The real
 * waveform isn't stored, so bars are deterministic noise from the message id.
 */
export function VoicePlayer({ src, seed, mine }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const bars = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const n = Math.abs(Math.sin(hash + i * 7.13));
      return 0.25 + n * 0.75; // 25%..100% of max height
    });
  }, [seed]);

  useEffect(() => {
    const audio = new Audio(src);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTime = () => {
      setElapsed(audio.currentTime);
      // Some blobs report Infinity duration until fully buffered (webm quirk).
      const total = Number.isFinite(audio.duration) ? audio.duration : null;
      if (total) {
        setDuration(total);
        setProgress(total > 0 ? audio.currentTime / total : 0);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setElapsed(0);
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audioRef.current = null;
    };
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    }
  }

  const filledBars = Math.round(progress * BAR_COUNT);
  const timeLabel = playing || elapsed > 0
    ? formatSeconds(elapsed)
    : duration !== null
      ? formatSeconds(duration)
      : '·:··';

  return (
    <div className="flex items-center gap-2.5 py-1 pr-1">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "To'xtatish" : 'Eshitish'}
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-full transition',
          mine
            ? 'bg-white/25 text-primary-foreground hover:bg-white/35'
            : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {playing ? <Pause className="h-4.5 w-4.5" /> : <Play className="ml-0.5 h-4.5 w-4.5" />}
      </button>
      <div className="flex flex-col gap-1">
        <div className="flex h-6 items-center gap-[2px]" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              style={{ height: `${Math.round(h * 100)}%` }}
              className={cn(
                'w-[3px] rounded-full transition-colors',
                i < filledBars
                  ? mine
                    ? 'bg-primary-foreground'
                    : 'bg-primary'
                  : mine
                    ? 'bg-primary-foreground/40'
                    : 'bg-muted-foreground/40',
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            'text-[10.5px] tabular-nums',
            mine ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {timeLabel}
        </span>
      </div>
    </div>
  );
}

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

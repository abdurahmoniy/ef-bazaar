'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Send, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  disabled?: boolean;
  /** Called with the finished recording; parent uploads it as voice=true. */
  onSend: (file: File) => void;
  onError: (message: string) => void;
  /** Recording state is lifted so the parent can swap the composer UI. */
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
}

/** Longest voice note we accept — matches Telegram's practical UX (and keeps
 *  uploads well under the 10MB attachment cap at opus bitrates). */
const MAX_DURATION_MS = 120_000;

/**
 * Preferred container, or empty string to let the browser pick its default —
 * some WebViews (Telegram in-app, older Safari) report false for every
 * candidate yet record fine with the default constructor.
 */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  for (const candidate of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function describeMicError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "Mikrofonga ruxsat berilmadi — brauzer sozlamalaridan sayt uchun mikrofonni yoqing";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Mikrofon topilmadi';
    case 'NotReadableError':
      return "Mikrofon band — boshqa ilova ishlatayotgan bo'lishi mumkin";
    default:
      return `Ovoz yozib bo'lmadi${name ? ` (${name})` : ''}`;
  }
}

/**
 * Telegram-style voice note recorder. Idle: a mic button (parent renders it
 * in place of Send when the draft is empty). Recording: the parent swaps the
 * composer for the elapsed-time bar; cancel discards, send stops and uploads.
 */
export function VoiceRecorder({
  disabled,
  onSend,
  onError,
  recording,
  onRecordingChange,
}: VoiceRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const stopStream = useCallback(() => {
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    return () => {
      // Unmount while recording (navigation away) — discard silently.
      discardRef.current = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [stopStream]);

  async function start() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError("Brauzeringiz ovoz yozishni qo'llab-quvvatlamaydi");
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      onError("Brauzeringiz ovoz yozishni qo'llab-quvvatlamaydi");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      onError(describeMicError(e));
      return;
    }

    // Empty mimeType → browser default; some WebViews reject every explicit
    // candidate but record fine without one.
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        onError("Brauzeringiz ovoz yozishni qo'llab-quvvatlamaydi");
        return;
      }
    }
    const actualMime = recorder.mimeType || mimeType || 'audio/webm';
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardRef.current = false;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
      onRecordingChange(false);
      if (discardRef.current) return;
      const blob = new Blob(chunksRef.current, { type: actualMime });
      if (blob.size === 0) return;
      const ext = actualMime.includes('mp4') ? 'm4a' : actualMime.includes('ogg') ? 'ogg' : 'webm';
      onSend(new File([blob], `voice-${Date.now()}.${ext}`, { type: actualMime }));
    };

    const startedAt = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_DURATION_MS && recorder.state === 'recording') {
        recorder.stop(); // auto-send at the cap
      }
    }, 250);

    recorder.start();
    onRecordingChange(true);
  }

  function finish(discard: boolean) {
    discardRef.current = discard;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      onRecordingChange(false);
    }
  }

  if (!recording) {
    return (
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="h-11 w-11 shrink-0 p-0"
        onClick={start}
        disabled={disabled}
        title="Ovozli xabar"
        aria-label="Ovozli xabar yozish"
      >
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="flex h-11 flex-1 items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3">
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatElapsed(elapsedMs)}
      </span>
      <span className="hidden text-[11px] text-muted-foreground sm:block">
        Yozilmoqda…
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-muted-foreground"
          onClick={() => finish(true)}
          title="Bekor qilish"
          aria-label="Yozishni bekor qilish"
        >
          <X className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          size="sm"
          className={cn('h-9 w-9 p-0')}
          onClick={() => finish(false)}
          title="Yuborish"
          aria-label="Ovozli xabarni yuborish"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

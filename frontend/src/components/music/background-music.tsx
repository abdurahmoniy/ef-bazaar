'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { listMusicTracks, type MusicTrack } from '@/lib/music';
import { MusicPlayback, musicAllowedOnPath } from './music-playback';
import { loadYouTubeApi, type YouTubePlayer } from './youtube-api';

const EMPTY: MusicTrack[] = [];
interface MusicDiagnostic {
  catalog?: 'loading' | 'ready' | 'error';
  tracks?: number;
  allowed?: boolean;
  api?: 'loading' | 'ready' | 'error';
  iframe?: 'waiting' | 'ready' | 'timeout' | 'error';
  playerState?: number;
  errorCode?: number;
  autoplayBlocked?: boolean;
  interaction?: 'click' | 'keydown';
  muted?: boolean;
}

/** Mounted once in the root layout so client navigation never restarts a song. */
export function BackgroundMusic() {
  return <Suspense fallback={null}><BackgroundMusicPlayer /></Suspense>;
}

function BackgroundMusicPlayer() {
  const pathname = usePathname();
  const diagnosticEnabled = useSearchParams().get('musicDebug') === '1';
  const host = useRef<HTMLDivElement>(null);
  const playback = useRef<MusicPlayback | null>(null);
  const readyPlayer = useRef<YouTubePlayer | null>(null);
  const diagnosticSnapshot = useRef<MusicDiagnostic>({});
  const [diagnostic, setDiagnostic] = useState<MusicDiagnostic | null>(null);
  const report = useCallback((patch: MusicDiagnostic) => {
    diagnosticSnapshot.current = { ...diagnosticSnapshot.current, ...patch };
    // Opt-in, local-only status. Never include credentials or send telemetry.
    if (new URLSearchParams(window.location.search).get('musicDebug') !== '1') return;
    setDiagnostic(diagnosticSnapshot.current);
  }, []);
  useEffect(() => {
    if (diagnosticEnabled) report({});
  }, [diagnosticEnabled, report]);
  const { data, isPending, isError } = useQuery({
    queryKey: ['public', 'music'],
    queryFn: ({ signal }) => listMusicTracks(signal),
    enabled: musicAllowedOnPath(pathname),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const tracks = data ?? EMPTY;
  const hasTracks = tracks.some(track => track.enabled);
  const latest = useRef({ tracks, allowed: false });

  useEffect(() => {
    report({ catalog: isError ? 'error' : isPending ? 'loading' : 'ready', tracks: tracks.filter(track => track.enabled).length });
  }, [isError, isPending, tracks, report]);

  useEffect(() => {
    const removals = new MutationObserver(() => sync());
    const sync = () => {
      const otherAudio = [...document.querySelectorAll<HTMLMediaElement>('audio,video')]
        .some(media => !media.paused && !media.ended && !media.muted && media.volume > 0);
      const active = document.visibilityState === 'visible' && musicAllowedOnPath(pathname) && !otherAudio;
      // Modal videos can disappear without a pause event reaching document.
      if (otherAudio) removals.observe(document.body, { childList: true, subtree: true });
      else removals.disconnect();
      latest.current.allowed = active;
      report({ allowed: active });
      playback.current?.setAllowed(active);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    const mediaEvents = ['play', 'pause', 'ended', 'error', 'emptied', 'volumechange'] as const;
    mediaEvents.forEach(event => document.addEventListener(event, sync, true));
    return () => {
      removals.disconnect();
      document.removeEventListener('visibilitychange', sync);
      mediaEvents.forEach(event => document.removeEventListener(event, sync, true));
    };
  }, [pathname, report]);

  useEffect(() => {
    latest.current.tracks = tracks;
    playback.current?.setTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    if (!hasTracks || !host.current) return;
    const container = host.current;
    let disposed = false;
    let player: YouTubePlayer | null = null;
    let controller: MusicPlayback | null = null;
    let readyTimer: number | undefined;
    report({ api: 'loading' });
    void loadYouTubeApi().then(api => {
      if (disposed) return;
      report({ api: 'ready', iframe: 'waiting' });
      readyTimer = window.setTimeout(() => {
        if (!disposed) report({ iframe: 'timeout' });
      }, 15_000);
      const target = document.createElement('div');
      container.append(target);
      try {
        player = new api.Player(target, {
          width: 200,
          height: 200,
          playerVars: { autoplay: 0, playsinline: 1, controls: 0, disablekb: 1, fs: 0, origin: window.location.origin },
          events: {
            onReady: ({ target: currentPlayer }) => {
              if (disposed) return;
              window.clearTimeout(readyTimer);
              readyPlayer.current = currentPlayer;
              report({ iframe: 'ready', muted: currentPlayer.isMuted() });
              const iframe = currentPlayer.getIframe();
              iframe.tabIndex = -1;
              iframe.setAttribute('aria-hidden', 'true');
              controller?.ready();
            },
            onStateChange: ({ data: state }) => {
              if (disposed) return;
              report({ playerState: state, muted: readyPlayer.current?.isMuted(), ...(state === 1 ? { autoplayBlocked: false } : {}) });
              controller?.stateChanged(state);
            },
            onError: ({ data: code }) => {
              if (disposed) return;
              report({ errorCode: code });
              controller?.failed();
            },
            onAutoplayBlocked: () => {
              if (disposed) return;
              report({ autoplayBlocked: true, muted: readyPlayer.current?.isMuted() });
              controller?.autoplayBlocked();
            },
          },
        });
        controller = new MusicPlayback(player);
        controller.setTracks(latest.current.tracks);
        controller.setAllowed(latest.current.allowed);
        playback.current = controller;
      } catch {
        window.clearTimeout(readyTimer);
        report({ iframe: 'error' });
      }
    }).catch(() => {
      // A blocked third-party script must never interrupt the marketplace.
      if (!disposed) report({ api: 'error' });
    });
    return () => {
      disposed = true;
      window.clearTimeout(readyTimer);
      controller?.setAllowed(false);
      player?.destroy();
      playback.current = null;
      readyPlayer.current = null;
      container.replaceChildren();
    };
  }, [hasTracks, report]);

  useEffect(() => {
    const interact = (event: Event) => {
      playback.current?.interact();
      report({ interaction: event.type as 'click' | 'keydown', muted: readyPlayer.current?.isMuted() });
    };
    // A native click also covers touch taps and Chrome's user-activation path.
    document.addEventListener('click', interact, true);
    document.addEventListener('keydown', interact, true);
    return () => {
      document.removeEventListener('click', interact, true);
      document.removeEventListener('keydown', interact, true);
    };
  }, [report]);

  return <>
    <div ref={host} hidden aria-hidden="true" data-background-music="" />
    {diagnosticEnabled && diagnostic && (
      <aside aria-label="Musiqa tekshiruvi" className="ym-hide-content fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 text-foreground shadow-lg">
        <h2 className="text-sm font-semibold">Musiqa tekshiruvi</h2>
        <pre data-music-diagnostics="" role="status" className="mt-2 text-xs">{JSON.stringify(diagnostic, null, 2)}</pre>
        <p className="mt-2 text-xs text-muted-foreground">Holat faqat shu ekranda ko‘rsatiladi.</p>
      </aside>
    )}
  </>;
}

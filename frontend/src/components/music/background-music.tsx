'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { listMusicTracks, type MusicTrack } from '@/lib/music';
import { MusicPlayback, musicAllowedOnPath } from './music-playback';
import { loadYouTubeApi, type YouTubePlayer } from './youtube-api';

const EMPTY: MusicTrack[] = [];

/** Mounted once in the root layout so client navigation never restarts a song. */
export function BackgroundMusic() {
  const pathname = usePathname();
  const host = useRef<HTMLDivElement>(null);
  const playback = useRef<MusicPlayback | null>(null);
  const { data } = useQuery({
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
    const removals = new MutationObserver(() => sync());
    const sync = () => {
      const otherAudio = [...document.querySelectorAll<HTMLMediaElement>('audio,video')]
        .some(media => !media.paused && !media.ended && !media.muted && media.volume > 0);
      const active = document.visibilityState === 'visible' && musicAllowedOnPath(pathname) && !otherAudio;
      // Modal videos can disappear without a pause event reaching document.
      if (otherAudio) removals.observe(document.body, { childList: true, subtree: true });
      else removals.disconnect();
      latest.current.allowed = active;
      playback.current?.setAllowed(active);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    const mediaEvents = ['play', 'pause', 'ended', 'volumechange'] as const;
    mediaEvents.forEach(event => document.addEventListener(event, sync, true));
    return () => {
      removals.disconnect();
      document.removeEventListener('visibilitychange', sync);
      mediaEvents.forEach(event => document.removeEventListener(event, sync, true));
    };
  }, [pathname]);

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
    void loadYouTubeApi().then(api => {
      if (disposed) return;
      const target = document.createElement('div');
      container.append(target);
      player = new api.Player(target, {
        width: 200,
        height: 200,
        playerVars: { autoplay: 0, playsinline: 1, controls: 0, disablekb: 1, fs: 0, origin: window.location.origin },
        events: {
          onReady: ({ target: readyPlayer }) => {
            if (disposed) return;
            const iframe = readyPlayer.getIframe();
            iframe.tabIndex = -1;
            iframe.setAttribute('aria-hidden', 'true');
            controller?.ready();
          },
          onStateChange: ({ data: state }) => { if (!disposed) controller?.stateChanged(state); },
          onError: () => { if (!disposed) controller?.failed(); },
          onAutoplayBlocked: () => { if (!disposed) controller?.autoplayBlocked(); },
        },
      });
      controller = new MusicPlayback(player);
      controller.setTracks(latest.current.tracks);
      controller.setAllowed(latest.current.allowed);
      playback.current = controller;
    }).catch(() => {
      // A blocked third-party script must never interrupt the marketplace.
    });
    return () => {
      disposed = true;
      controller?.setAllowed(false);
      player?.destroy();
      playback.current = null;
      container.replaceChildren();
    };
  }, [hasTracks]);

  useEffect(() => {
    const interact = () => playback.current?.interact();
    // A native click also covers touch taps and Chrome's user-activation path.
    document.addEventListener('click', interact, true);
    document.addEventListener('keydown', interact, true);
    return () => {
      document.removeEventListener('click', interact, true);
      document.removeEventListener('keydown', interact, true);
    };
  }, []);

  return <div ref={host} hidden aria-hidden="true" data-background-music="" />;
}

import type { MusicPlayer } from './music-playback';

export interface YouTubePlayer extends MusicPlayer {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}

export interface YouTubePlayerOptions {
  width: number;
  height: number;
  playerVars: Record<string, string | number>;
  events: {
    onReady(event: { target: YouTubePlayer }): void;
    onStateChange(event: { data: number }): void;
    onError(event: { data: number }): void;
    onAutoplayBlocked(): void;
  };
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let pending: Promise<YouTubeApi> | null = null;

/** One shared API download, including React Strict Mode's mount/unmount cycle. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const script = existing ?? document.createElement('script');
    const timer = window.setTimeout(() => finish(new Error('YouTube API timed out')), 15_000);

    function finish(error?: Error) {
      window.clearTimeout(timer);
      script.removeEventListener('error', onError);
      if (window.onYouTubeIframeAPIReady === onReady) window.onYouTubeIframeAPIReady = previous;
      if (error) {
        if (!existing) script.remove();
        pending = null;
        reject(error);
      } else if (window.YT?.Player) {
        resolve(window.YT);
      }
    }

    function onReady() {
      try {
        previous?.();
      } finally {
        finish(window.YT?.Player ? undefined : new Error('YouTube API unavailable'));
      }
    }

    function onError() { finish(new Error('YouTube API failed to load')); }

    window.onYouTubeIframeAPIReady = onReady;
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      document.head.append(script);
    }
  });
  return pending;
}

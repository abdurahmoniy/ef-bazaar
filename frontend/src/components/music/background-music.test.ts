// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundMusic } from './background-music';
import type { YouTubePlayer, YouTubePlayerOptions } from './youtube-api';
import { listMusicTracks } from '@/lib/music';

const state = vi.hoisted(() => ({ pathname: '/marketplace' }));
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/music', () => ({ listMusicTracks: vi.fn() }));
vi.mock('./youtube-api', () => ({ loadYouTubeApi: vi.fn() }));
import { loadYouTubeApi } from './youtube-api';

const tracks = [
  { id: 'one', title: 'One', artist: '', youtubeVideoId: 'aaaaaaaaaaa', sortOrder: 0, enabled: true },
  { id: 'two', title: 'Two', artist: '', youtubeVideoId: 'bbbbbbbbbbb', sortOrder: 1, enabled: true },
];

describe('site background music', () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  let player: YouTubePlayer;
  let options: YouTubePlayerOptions;
  let visibility: DocumentVisibilityState;
  let construct: ReturnType<typeof vi.fn>;

  async function render() {
    await act(async () => {
      root.render(createElement(StrictMode, null,
        createElement(QueryClientProvider, { client }, createElement(BackgroundMusic))));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  }

  async function ready() {
    await act(async () => { options.events.onReady({ target: player }); });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    state.pathname = '/marketplace';
    window.history.replaceState({}, '', '/marketplace');
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const iframe = document.createElement('iframe');
    player = {
      loadVideoById: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), stopVideo: vi.fn(),
      setVolume: vi.fn(), unMute: vi.fn(), isMuted: vi.fn().mockReturnValue(false), destroy: vi.fn(), getIframe: () => iframe,
    };
    construct = vi.fn(function (_element: HTMLElement, settings: YouTubePlayerOptions) {
      options = settings;
      return player;
    });
    vi.mocked(loadYouTubeApi).mockResolvedValue({ Player: construct });
    vi.mocked(listMusicTracks).mockResolvedValue(tracks);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders no visitor controls and creates only one player in Strict Mode', async () => {
    await render();
    await ready();
    expect(container.querySelector('button,input,audio,video')).toBeNull();
    expect(container.textContent).toBe('');
    expect(container.firstElementChild?.hasAttribute('hidden')).toBe(true);
    expect(construct).toHaveBeenCalledOnce();
    expect(player.setVolume).toHaveBeenCalledWith(20);
    expect(player.loadVideoById).toHaveBeenCalledOnce();
    expect(player.getIframe().tabIndex).toBe(-1);
  });

  it('does not load YouTube for an empty catalog or on an initial admin page', async () => {
    vi.mocked(listMusicTracks).mockResolvedValue([]);
    await render();
    expect(loadYouTubeApi).not.toHaveBeenCalled();
    state.pathname = '/admin/music';
    await render();
    expect(loadYouTubeApi).not.toHaveBeenCalled();
  });

  it('keeps the same player and track while navigating ordinary pages', async () => {
    await render();
    await ready();
    state.pathname = '/plans';
    await render();
    expect(construct).toHaveBeenCalledOnce();
    expect(player.destroy).not.toHaveBeenCalled();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('pauses in chat and resumes without resetting the song', async () => {
    await render();
    await ready();
    state.pathname = '/chats/42';
    await render();
    expect(player.pauseVideo).toHaveBeenCalled();
    state.pathname = '/marketplace';
    await render();
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('pauses when hidden and retries blocked playback only on interaction', async () => {
    await render();
    await ready();
    await act(async () => {
      options.events.onAutoplayBlocked();
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(player.playVideo).toHaveBeenCalledOnce();
    await act(async () => {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(player.playVideo).toHaveBeenCalledOnce();
  });

  it('restores audible playback synchronously in the native click after mobile autoplay is blocked', async () => {
    await render();
    await ready();
    await act(async () => options.events.onAutoplayBlocked());
    vi.mocked(player.unMute).mockClear();
    vi.mocked(player.setVolume).mockClear();
    let insideClick = false;
    vi.mocked(player.unMute).mockImplementation(() => { expect(insideClick).toBe(true); });
    const control = document.createElement('button');
    container.append(control);

    await act(async () => {
      insideClick = true;
      control.click();
      insideClick = false;
    });

    expect(player.unMute).toHaveBeenCalledOnce();
    expect(player.setVolume).toHaveBeenCalledWith(20);
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('keeps clicks silent on a quiet route even after a blocked start', async () => {
    await render();
    await ready();
    await act(async () => options.events.onAutoplayBlocked());
    state.pathname = '/chats';
    await render();
    vi.mocked(player.unMute).mockClear();
    vi.mocked(player.setVolume).mockClear();
    await act(async () => document.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(player.unMute).not.toHaveBeenCalled();
    expect(player.setVolume).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('refreshes the playlist and removes a disabled current song without remounting', async () => {
    await render();
    await ready();
    // Strict Mode cancels the first signal-aware request and mounts a second.
    const initialRequests = vi.mocked(listMusicTracks).mock.calls.length;
    vi.mocked(listMusicTracks).mockResolvedValue([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(listMusicTracks).toHaveBeenCalledTimes(initialRequests + 1);
    expect(player.destroy).toHaveBeenCalledOnce();
  });

  it('stays silent if the YouTube API is blocked and does not leak a player after unmount', async () => {
    vi.mocked(loadYouTubeApi).mockRejectedValue(new Error('Blocked'));
    await render();
    expect(construct).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');
  });

  it('reports the exact loading boundary only when music diagnostics are requested', async () => {
    window.history.replaceState({}, '', '/marketplace?musicDebug=1');
    await render();
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"iframe": "waiting"');
    expect(container.querySelector('[aria-label="Musiqa tekshiruvi"]')?.classList.contains('ym-hide-content')).toBe(true);
    await ready();
    await act(async () => options.events.onAutoplayBlocked());
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"autoplayBlocked": true');
    await act(async () => document.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"interaction": "click"');
    await act(async () => options.events.onError({ data: 153 }));
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"errorCode": 153');
  });

  it('distinguishes a failed SDK download from an iframe that never becomes ready', async () => {
    window.history.replaceState({}, '', '/marketplace?musicDebug=1');
    vi.mocked(loadYouTubeApi).mockRejectedValue(new Error('Blocked'));
    await render();
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"api": "error"');
  });

  it('reports iframe readiness timeout without claiming an autoplay failure', async () => {
    window.history.replaceState({}, '', '/marketplace?musicDebug=1');
    await render();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"iframe": "timeout"');
    expect(player.playVideo).not.toHaveBeenCalled();
    await ready();
    expect(container.querySelector('[data-music-diagnostics]')?.textContent).toContain('"iframe": "ready"');
  });

  it('hides diagnostics when the opt-in is removed without rebuilding the player', async () => {
    window.history.replaceState({}, '', '/marketplace?musicDebug=1');
    await render();
    await ready();
    expect(container.querySelector('[data-music-diagnostics]')).not.toBeNull();
    state.pathname = '/plans';
    window.history.replaceState({}, '', '/plans');
    await render();
    expect(container.querySelector('[data-music-diagnostics]')).toBeNull();
    expect(construct).toHaveBeenCalledOnce();
    window.history.replaceState({}, '', '/plans?musicDebug=1');
    await render();
    expect(container.querySelector('[data-music-diagnostics]')).not.toBeNull();
    expect(construct).toHaveBeenCalledOnce();
  });

  it('does not start if the iframe becomes ready after navigating to chat', async () => {
    await render();
    state.pathname = '/chats';
    await render();
    await ready();
    expect(player.loadVideoById).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('pauses while another audible media element is playing and resumes after it pauses', async () => {
    await render();
    await ready();
    const video = document.createElement('video');
    container.append(video);
    let paused = false;
    vi.spyOn(video, 'paused', 'get').mockImplementation(() => paused);
    await act(async () => video.dispatchEvent(new Event('play')));
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    await act(async () => {
      paused = true;
      video.dispatchEvent(new Event('pause'));
    });
    expect(player.playVideo).toHaveBeenCalledOnce();
    video.remove();
  });

  it('resumes when a playing guide video is removed without a pause event', async () => {
    await render();
    await ready();
    const video = document.createElement('video');
    container.append(video);
    vi.spyOn(video, 'paused', 'get').mockReturnValue(false);
    await act(async () => video.dispatchEvent(new Event('play')));
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    await act(async () => { video.remove(); });
    expect(player.playVideo).toHaveBeenCalledOnce();
  });
});

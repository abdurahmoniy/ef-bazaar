// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundMusic } from './background-music';
import { VoicePlayer } from '@/components/chat/voice-player';
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

  async function render(voices: string[] = []) {
    await act(async () => {
      root.render(createElement(StrictMode, null,
        createElement(QueryClientProvider, { client }, createElement(BackgroundMusic),
          ...voices.map((src, index) => createElement(VoicePlayer, { key: index, src, seed: String(index), mine: false })))));
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

  it('keeps playing while entering and leaving a chat without resetting the song', async () => {
    await render();
    await ready();
    state.pathname = '/chats/42';
    await render();
    expect(player.pauseVideo).not.toHaveBeenCalled();
    state.pathname = '/marketplace';
    await render();
    expect(player.playVideo).not.toHaveBeenCalled();
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
    state.pathname = '/support';
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

  it('does not start if the iframe becomes ready after navigating to support', async () => {
    await render();
    state.pathname = '/support';
    await render();
    await ready();
    expect(player.loadVideoById).not.toHaveBeenCalled();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  function mockVoiceMedia() {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      Object.defineProperty(this, 'ended', { configurable: true, value: false });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      if (this.paused) return;
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    });
  }

  async function renderChat(voices = ['/voice-one.webm']) {
    mockVoiceMedia();
    state.pathname = '/chats/42';
    await render(voices);
    expect(construct).toHaveBeenCalledOnce();
    await ready();
    await act(async () => options.events.onStateChange({ data: 1 }));
    const audio = container.querySelector('audio');
    expect(audio).toBeInstanceOf(HTMLAudioElement);
    return audio!;
  }

  it.each(['pause', 'ended'] as const)('resumes the same song after a chat voice message emits %s', async (event) => {
    const audio = await renderChat();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    expect(player.playVideo).not.toHaveBeenCalled();

    await act(async () => {
      if (event === 'pause') container.querySelector<HTMLButtonElement>('button')!.click();
      else {
        Object.defineProperty(audio, 'ended', { configurable: true, value: true });
        Object.defineProperty(audio, 'paused', { configurable: true, value: true });
        audio.dispatchEvent(new Event('ended'));
      }
    });
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
    expect(construct).toHaveBeenCalledOnce();
  });

  it('resumes when a playing chat voice message is unmounted', async () => {
    const audio = await renderChat();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    await render();
    expect(audio.paused).toBe(true);
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('waits for every audible chat voice message to stop before resuming', async () => {
    await renderChat(['/voice-one.webm', '/voice-two.webm']);
    const buttons = container.querySelectorAll<HTMLButtonElement>('button');
    await act(async () => buttons[0].click());
    await act(async () => buttons[1].click());
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    await act(async () => buttons[0].click());
    expect(player.playVideo).not.toHaveBeenCalled();
    await act(async () => buttons[1].click());
    expect(player.playVideo).toHaveBeenCalledOnce();
  });

  it('keeps music playing if the voice message cannot start', async () => {
    await renderChat();
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('Media unavailable'));
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(player.pauseVideo).not.toHaveBeenCalled();
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Eshitish');
  });

  it('resumes when a voice source fails after play without emitting pause', async () => {
    await renderChat();
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementationOnce(function (this: HTMLMediaElement) {
      // Chromium emits play, then error with paused=true, but no pause event.
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      this.dispatchEvent(new Event('play'));
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      Object.defineProperty(this, 'error', { configurable: true, value: { code: 4 } });
      this.dispatchEvent(new Event('error'));
      return Promise.reject(new Error('Unsupported voice source'));
    });
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Eshitish');
  });

  it('resumes when replacing a playing voice emits emptied without pause', async () => {
    const audio = await renderChat();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(player.pauseVideo).toHaveBeenCalledOnce();
    // Native src replacement sets paused=true before cleanup, then emits emptied.
    Object.defineProperty(audio, 'paused', { configurable: true, value: true });
    await render(['/voice-replaced.webm']);
    await act(async () => audio.dispatchEvent(new Event('emptied')));
    expect(player.playVideo).toHaveBeenCalledOnce();
    expect(player.loadVideoById).toHaveBeenCalledOnce();
  });

  it('can play a replaced voice source with the same mounted control', async () => {
    await renderChat();
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(player.playVideo).toHaveBeenCalledOnce();
    await render(['/voice-replaced.webm']);
    await act(async () => options.events.onStateChange({ data: 1 }));
    // Source replacement must leave the same mounted control usable.
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(container.querySelector('audio')!.getAttribute('src')).toBe('/voice-replaced.webm');
    expect(container.querySelector('audio')!.paused).toBe(false);
    expect(player.pauseVideo).toHaveBeenCalledTimes(2);
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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('YouTube API loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
  });

  afterEach(() => {
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach(script => script.remove());
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    vi.useRealTimers();
  });

  it('shares one script across concurrent mounts and preserves an existing ready callback', async () => {
    const previous = vi.fn();
    window.onYouTubeIframeAPIReady = previous;
    const { loadYouTubeApi } = await import('./youtube-api');
    const first = loadYouTubeApi();
    const second = loadYouTubeApi();
    expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);
    window.YT = { Player: vi.fn() };
    window.onYouTubeIframeAPIReady?.();
    expect(await first).toBe(window.YT);
    expect(await second).toBe(window.YT);
    expect(previous).toHaveBeenCalledOnce();
    expect(window.onYouTubeIframeAPIReady).toBe(previous);
  });

  it('uses an already loaded API without another script', async () => {
    window.YT = { Player: vi.fn() };
    const { loadYouTubeApi } = await import('./youtube-api');
    expect(await loadYouTubeApi()).toBe(window.YT);
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
  });

  it('rejects script failures and allows a later retry', async () => {
    const { loadYouTubeApi } = await import('./youtube-api');
    const failed = loadYouTubeApi();
    const rejected = expect(failed).rejects.toThrow('YouTube');
    document.querySelector('script')!.dispatchEvent(new Event('error'));
    await rejected;
    const retry = loadYouTubeApi();
    window.YT = { Player: vi.fn() };
    window.onYouTubeIframeAPIReady?.();
    expect(await retry).toBe(window.YT);
  });

  it('times out when a blocker prevents the ready callback', async () => {
    const { loadYouTubeApi } = await import('./youtube-api');
    const rejected = expect(loadYouTubeApi()).rejects.toThrow('YouTube');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(window.onYouTubeIframeAPIReady).toBeUndefined();
  });
});

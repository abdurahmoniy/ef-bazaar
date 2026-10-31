// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindStartupSound } from './startup-sound';

describe('startup sound lifecycle', () => {
  let overlay: HTMLDivElement;
  let audio: HTMLAudioElement;
  let preference: MediaQueryList;
  let elapsed: number;
  let paused: boolean;
  let dispose: () => void;
  let play: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let pause: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    elapsed = 200;
    paused = true;
    dispose = () => {};
    overlay = document.createElement('div');
    audio = document.createElement('audio');
    overlay.append(audio);
    document.body.append(overlay);
    overlay.getAnimations = () => [{ currentTime: elapsed }] as Animation[];
    preference = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.documentElement.dataset.startupIntro = 'playing';
    Object.defineProperty(audio, 'paused', { get: () => paused });
    play = vi.fn(async () => { paused = false; audio.dispatchEvent(new Event('play')); audio.dispatchEvent(new Event('playing')); });
    pause = vi.fn(() => { paused = true; audio.dispatchEvent(new Event('pause')); });
    audio.play = play;
    audio.pause = pause;
  });

  afterEach(() => {
    dispose();
    overlay.remove();
    delete document.documentElement.dataset.startupIntro;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plays quietly from the current animation position and does not restart on taps', async () => {
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    expect(play).toHaveBeenCalledOnce();
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThanOrEqual(0.65);
    expect(audio.currentTime).toBeCloseTo(0.2);
    overlay.click();
    expect(play).toHaveBeenCalledOnce();
  });

  it.each(['returning', 'reduced-motion', 'hidden-tab', 'finished-animation'])('stays silent for %s', (reason) => {
    if (reason === 'returning') delete document.documentElement.dataset.startupIntro;
    if (reason === 'reduced-motion') Object.assign(preference, { matches: true });
    if (reason === 'hidden-tab') vi.mocked(Object.getOwnPropertyDescriptor(document, 'visibilityState')!.get!).mockReturnValue('hidden');
    if (reason === 'finished-animation') elapsed = 6000;
    dispose = bindStartupSound(overlay, audio);
    expect(play).not.toHaveBeenCalled();
  });

  it('retries blocked autoplay only on an intro tap and stays synced to the animation', async () => {
    play.mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError'));
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    elapsed = 1100;
    overlay.click();
    expect(play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBeCloseTo(1.1);
  });

  it('can start the remaining sound during the sixth second of the intro', async () => {
    elapsed = 5200;
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    expect(play).toHaveBeenCalledOnce();
    expect(audio.currentTime).toBeCloseTo(5.2);
  });

  it('does not retry an unavailable sound on every tap', async () => {
    play.mockRejectedValue(new DOMException('Unsupported media', 'NotSupportedError'));
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    overlay.click();
    overlay.click();
    expect(play).toHaveBeenCalledOnce();
  });

  it('stops when any dismissal path removes the intro flag', async () => {
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    delete document.documentElement.dataset.startupIntro;
    await Promise.resolve();
    expect(paused).toBe(true);
    const calls = play.mock.calls.length;
    overlay.click();
    expect(play).toHaveBeenCalledTimes(calls);
  });

  it('stops and removes its listeners when the overlay is removed without React cleanup', async () => {
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    overlay.remove();
    await Promise.resolve();
    expect(paused).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    overlay.click();
    expect(play).toHaveBeenCalledOnce();
  });

  it.each(['hidden-tab', 'reduced-motion'])('stops on %s and does not resume afterward', async (reason) => {
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    if (reason === 'hidden-tab') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    } else {
      Object.assign(preference, { matches: true });
      preference.dispatchEvent(new Event('change'));
      Object.assign(preference, { matches: false });
    }
    expect(paused).toBe(true);
    overlay.click();
    expect(play).toHaveBeenCalledOnce();
  });

  it('stops by the animation deadline even without an animationend event', async () => {
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5799);
    expect(paused).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(paused).toBe(true);
  });

  it('seeks a delayed media load forward instead of playing the opening late', async () => {
    play.mockImplementationOnce(() => new Promise<void>(() => {}));
    dispose = bindStartupSound(overlay, audio);
    elapsed = 1400;
    audio.dispatchEvent(new Event('playing'));
    expect(audio.currentTime).toBeCloseTo(1.4);
  });

  it('silences a play promise that completes after disposal', async () => {
    let finish!: () => void;
    play.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    dispose = bindStartupSound(overlay, audio);
    dispose();
    paused = false;
    finish();
    await Promise.resolve();
    expect(paused).toBe(true);
    overlay.click();
    expect(play).toHaveBeenCalledOnce();
  });

  it('does not let an old effect pause a newer binding on the same audio element', async () => {
    let finish!: () => void;
    play.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const previous = bindStartupSound(overlay, audio);
    previous();
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    expect(paused).toBe(false);
    finish();
    await Promise.resolve();
    expect(paused).toBe(false);
  });

  it('does not replay an ended sound', async () => {
    dispose = bindStartupSound(overlay, audio);
    await Promise.resolve();
    audio.dispatchEvent(new Event('ended'));
    overlay.click();
    expect(play).toHaveBeenCalledOnce();
  });
});

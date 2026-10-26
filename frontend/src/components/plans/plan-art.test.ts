// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlanArt } from './plan-art';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let motionAllowed: boolean;
let preferenceChanged: () => void;

beforeEach(() => {
  motionAllowed = true;
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return motionAllowed; },
    addEventListener: vi.fn((_event, listener) => { preferenceChanged = listener; }),
    removeEventListener: vi.fn(),
  })));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(createElement('article', null, createElement(PlanArt, { code: 'PRO' }))));
}
async function pointer(type: 'pointerenter' | 'pointerleave', pointerType = 'mouse') {
  await act(async () => {
    const event = new Event(type);
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    host.querySelector('article')!.dispatchEvent(event);
  });
}

describe('PlanArt', () => {
  it('has no playback buttons and loads the film only on mouse hover of the card', async () => {
    await mount();
    const video = host.querySelector('video')!;
    expect(host.querySelector('button')).toBeNull();
    expect(video.getAttribute('src')).toBeNull();
    expect(host.querySelector('img')?.alt).toBe('Oltin cho‘ntak soati');
    await pointer('pointerenter');
    expect(video.getAttribute('src')).toBe('/plans/pocket-watch.mp4');
    expect(video.play).toHaveBeenCalledOnce();
    await act(async () => video.dispatchEvent(new Event('loadeddata')));
    expect(video.className).toContain('videoVisible');
    await pointer('pointerleave');
    expect(video.pause).toHaveBeenCalled();
    expect(video.className).not.toContain('videoVisible');
  });

  it.each(['reduced motion', 'touch pointer'])('keeps a still without fetching video for %s', async (mode) => {
    motionAllowed = mode !== 'reduced motion';
    await mount();
    await pointer('pointerenter', mode === 'touch pointer' ? 'touch' : 'mouse');
    expect(host.querySelector('video')?.getAttribute('src')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('retains the still if playback fails', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('unsupported'));
    await mount();
    await pointer('pointerenter');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(host.querySelector('img')?.alt).toBe('Oltin cho‘ntak soati');
    expect(host.querySelector('video')?.className).not.toContain('videoVisible');
    expect(host.querySelector('button')).toBeNull();
  });

  it('does not reveal a delayed playback after the pointer has left', async () => {
    let finish!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    await mount();
    await pointer('pointerenter');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    await pointer('pointerleave');
    await act(async () => finish());
    await act(async () => host.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
    expect(host.querySelector('video')?.className).not.toContain('videoVisible');
  });

  it('stops playback when the visitor enables reduced motion', async () => {
    await mount();
    await pointer('pointerenter');
    await act(async () => host.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
    expect(host.querySelector('video')?.className).toContain('videoVisible');
    motionAllowed = false;
    await act(async () => preferenceChanged());
    expect(host.querySelector('video')?.className).not.toContain('videoVisible');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom lacks AnimationEvent; without it React selects WebKit-prefixed events.
vi.hoisted(() => vi.stubGlobal('AnimationEvent', Event));

import { StartupIntro } from './startup-intro';
import { StartupIntroScript } from './startup-intro-script';

describe('startup intro', () => {
  let container: HTMLDivElement;
  let root: Root;
  let preference: MediaQueryList;

  const isPlaying = () => document.documentElement.dataset.startupIntro === 'playing';

  // Execute the actual pre-paint script, as the browser does before hydration.
  function bootstrap() {
    const markup = document.createElement('div');
    markup.innerHTML = renderToStaticMarkup(createElement(StartupIntroScript));
    const script = markup.querySelector('script');
    expect(script).not.toBeNull();
    new Function(script!.textContent!)();
  }

  async function render(autoFocus = false) {
    await act(async () => root.render(createElement(StrictMode, null,
      createElement(StartupIntro),
      createElement('a', { href: '/marketplace', id: 'page-link' }, 'Market'),
      autoFocus ? createElement('input', { autoFocus: true, 'aria-label': 'Search' }) : null,
    )));
    container.firstElementChild!.dispatchEvent(new Event('animationstart', { bubbles: true }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    preference = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => preference));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('Autoplay blocked', 'NotAllowedError'));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    sessionStorage.clear();
    delete document.documentElement.dataset.startupIntro;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    sessionStorage.clear();
    delete document.documentElement.dataset.startupIntro;
    await vi.advanceTimersByTimeAsync(6400);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('plays on first entry, including React Strict Mode, while the page stays mounted', async () => {
    bootstrap();
    expect(isPlaying()).toBe(true);
    await render();
    expect(isPlaying()).toBe(true);
    expect(container.textContent).toContain('eFBazaar');
    expect(container.querySelector('#page-link')?.textContent).toBe('Market');
    const link = container.querySelector('#page-link');
    await act(async () => vi.advanceTimersByTime(5800));
    expect(isPlaying()).toBe(true);
    await act(async () => vi.advanceTimersByTime(600));
    expect(isPlaying()).toBe(false);
    expect(container.querySelector('#page-link')).toBe(link);
  });

  it('does not replay on a route render or a document reload in the same tab session', async () => {
    bootstrap();
    await render();
    await act(async () => vi.advanceTimersByTime(6400));
    await render();
    expect(isPlaying()).toBe(false);
    bootstrap();
    expect(isPlaying()).toBe(false);
  });

  it('plays again in a new tab session', () => {
    bootstrap();
    vi.advanceTimersByTime(6400);
    sessionStorage.clear();
    bootstrap();
    expect(isPlaying()).toBe(true);
  });

  it('keeps the page available if JavaScript is disabled or the bootstrap never runs', async () => {
    await render();
    expect(isPlaying()).toBe(false);
    expect(container.querySelector('#page-link')).not.toBeNull();
  });

  it('allows the full six-second intro, then fails open within 6.4 seconds without hydration', () => {
    bootstrap();
    vi.advanceTimersByTime(5999);
    expect(isPlaying()).toBe(true);
    vi.advanceTimersByTime(401);
    expect(isPlaying()).toBe(false);
  });

  it('starts sound with the server-rendered animation before React hydrates', async () => {
    bootstrap();
    container.innerHTML = renderToStaticMarkup(createElement(StartupIntro));
    container.firstElementChild!.dispatchEvent(new Event('animationstart', { bubbles: true }));
    await Promise.resolve();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('ignores child animation starts and never restarts the startup sound', async () => {
    bootstrap();
    container.innerHTML = renderToStaticMarkup(createElement(StartupIntro));
    container.querySelector('svg')!.dispatchEvent(new Event('animationstart', { bubbles: true }));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    container.firstElementChild!.dispatchEvent(new Event('animationstart', { bubbles: true }));
    await Promise.resolve();
    container.firstElementChild!.dispatchEvent(new Event('animationstart', { bubbles: true }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
  });

  it('skips the intro when reduced motion is requested', async () => {
    Object.assign(preference, { matches: true });
    bootstrap();
    await render();
    expect(isPlaying()).toBe(false);
  });

  it.each(['getItem', 'setItem'] as const)('fails open when session storage %s is blocked', (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(bootstrap).not.toThrow();
    expect(isPlaying()).toBe(false);
  });

  it('dismisses immediately when reduced motion is enabled during playback', async () => {
    bootstrap();
    await render();
    Object.assign(preference, { matches: true });
    await act(async () => preference.dispatchEvent(new Event('change')));
    expect(isPlaying()).toBe(false);
  });

  it('does not render a separate skip button', async () => {
    bootstrap();
    await render();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('O‘tkazib yuborish');
  });

  it('mounts the local intro sound without controls, looping, or eager downloads', async () => {
    bootstrap();
    await render();
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('src')).toBe('/sounds/startup.m4a');
    expect(audio!.preload).toBe('none');
    expect(audio!.controls).toBe(false);
    expect(audio!.loop).toBe(false);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('stops the sound when the existing half-second tap delay finishes', async () => {
    bootstrap();
    await render();
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    await act(async () => container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(499));
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it.each(['background', 'logo'])('dismisses 500ms after one tap on the %s, without replaying', async (area) => {
    bootstrap();
    await render();
    const overlay = container.firstElementChild!;
    const target = area === 'logo' ? overlay.querySelector('svg')! : overlay;
    // Keep the overlay present until the completed click so pointer-up cannot
    // land on a link underneath it.
    await act(async () => target.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(isPlaying()).toBe(true);
    await act(async () => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(isPlaying()).toBe(true);
    await act(async () => vi.advanceTimersByTime(499));
    expect(isPlaying()).toBe(true);
    await act(async () => vi.advanceTimersByTime(1));
    expect(isPlaying()).toBe(false);
    bootstrap();
    expect(isPlaying()).toBe(false);
  });

  it('does not forward the dismissal tap to page click handlers', async () => {
    bootstrap();
    await render();
    const onPageClick = vi.fn();
    document.body.addEventListener('click', onPageClick);
    try {
      await act(async () => container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      expect(isPlaying()).toBe(true);
      expect(onPageClick).not.toHaveBeenCalled();
      await act(async () => vi.advanceTimersByTime(500));
      expect(isPlaying()).toBe(false);
    } finally {
      document.body.removeEventListener('click', onPageClick);
    }
  });

  it('does not restart the half-second delay on repeated taps', async () => {
    bootstrap();
    await render();
    const overlay = container.firstElementChild!;
    await act(async () => overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(250));
    await act(async () => overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(249));
    expect(isPlaying()).toBe(true);
    await act(async () => vi.advanceTimersByTime(1));
    expect(isPlaying()).toBe(false);
  });

  it('still completes normally when the six-second animation ends during the tap delay', async () => {
    bootstrap();
    await render();
    await act(async () => vi.advanceTimersByTime(5800));
    const overlay = container.firstElementChild!;
    await act(async () => overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(isPlaying()).toBe(true);
    await act(async () => vi.advanceTimersByTime(200));
    await act(async () => overlay.dispatchEvent(new Event('animationend', { bubbles: true })));
    expect(isPlaying()).toBe(false);
  });

  it('cancels a pending tap dismissal when unmounted', async () => {
    bootstrap();
    await render();
    await act(async () => container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await act(async () => root.render(null));
    document.documentElement.dataset.startupIntro = 'playing';
    await act(async () => vi.advanceTimersByTime(500));
    expect(isPlaying()).toBe(true);
  });

  it('dismisses on Escape and when keyboard focus moves onto the page', async () => {
    bootstrap();
    await render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isPlaying()).toBe(false);
    sessionStorage.clear();
    bootstrap();
    container.querySelector<HTMLAnchorElement>('#page-link')!.focus();
    expect(isPlaying()).toBe(false);
  });

  it('waits for the overlay animation, ignoring its child animations', async () => {
    bootstrap();
    await render();
    const overlay = container.firstElementChild!;
    await act(async () => overlay.querySelector('svg')!.dispatchEvent(new Event('animationend', { bubbles: true })));
    expect(isPlaying()).toBe(true);
    await act(async () => overlay.dispatchEvent(new Event('animationend', { bubbles: true })));
    expect(isPlaying()).toBe(false);
  });

  it('does not cover page focus acquired before hydration', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    try {
      bootstrap();
      input.focus();
      expect(isPlaying()).toBe(true);
      await render();
      expect(document.activeElement).toBe(input);
      expect(isPlaying()).toBe(false);
    } finally {
      input.remove();
    }
  });

  it('does not cover an autofocused page control during mounting', async () => {
    bootstrap();
    await render(true);
    expect(document.activeElement).toBe(container.querySelector('input'));
    expect(isPlaying()).toBe(false);
  });

  it('dismisses when restoring a document from the back-forward cache', async () => {
    bootstrap();
    await render();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(isPlaying()).toBe(false);
  });

  it('removes preference and document listeners when unmounted', async () => {
    bootstrap();
    await render();
    await act(async () => root.render(null));
    // Simulate a later document; listeners from the old component must not affect it.
    document.documentElement.dataset.startupIntro = 'playing';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    Object.assign(preference, { matches: true });
    preference.dispatchEvent(new Event('change'));
    expect(isPlaying()).toBe(true);
  });
});

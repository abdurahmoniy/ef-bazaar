// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatViewport } from './use-chat-viewport';

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe('useChatViewport', () => {
  let container: HTMLDivElement;
  let root: Root;
  let viewport: EventTarget & { height: number; offsetTop: number; scale: number };
  const originalWidth = window.innerWidth;
  const originalViewport = window.visualViewport;

  function Harness() {
    const visible = useChatViewport();
    return createElement('output', null, JSON.stringify(visible));
  }

  const read = () => JSON.parse(container.textContent || 'null');

  beforeEach(() => {
    reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: originalViewport });
    delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
  });

  it('follows the visible height as the keyboard opens and closes', async () => {
    await act(async () => root.render(createElement(Harness)));
    expect(read()).toEqual({ height: 800, offsetTop: 0 });

    await act(async () => {
      viewport.height = 430;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(read()).toEqual({ height: 430, offsetTop: 0 });

    await act(async () => {
      viewport.height = 800;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(read()).toEqual({ height: 800, offsetTop: 0 });
  });

  it('follows viewport panning when iOS brings the focused composer into view', async () => {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      viewport.height = 430;
      viewport.offsetTop = 60;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(read()).toEqual({ height: 430, offsetTop: 60 });
  });

  it('keeps the current layout during pinch zoom and resumes after zoom resets', async () => {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      viewport.scale = 2;
      viewport.height = 400;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(read()).toEqual({ height: 800, offsetTop: 0 });

    await act(async () => {
      viewport.scale = 1;
      viewport.height = 800;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(read()).toEqual({ height: 800, offsetTop: 0 });
  });

  it('uses normal layout on desktop and updates when crossing the mobile breakpoint', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    await act(async () => root.render(createElement(Harness)));
    expect(read()).toBeNull();

    await act(async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(read()).toEqual({ height: 800, offsetTop: 0 });

    await act(async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(read()).toBeNull();
  });

  it('leaves CSS viewport sizing in charge when the browser has no visualViewport', async () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
    await act(async () => root.render(createElement(Harness)));
    expect(read()).toBeNull();
  });

  it('removes every viewport listener when the chat shell unmounts', async () => {
    const addViewport = vi.spyOn(viewport, 'addEventListener');
    const removeViewport = vi.spyOn(viewport, 'removeEventListener');
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    await act(async () => root.render(createElement(Harness)));
    await act(async () => root.unmount());

    for (const [event, callback] of addViewport.mock.calls) {
      expect(removeViewport).toHaveBeenCalledWith(event, callback);
    }
    const resizeListener = addWindow.mock.calls.find(([event]) => event === 'resize');
    expect(resizeListener).toBeDefined();
    expect(removeWindow).toHaveBeenCalledWith('resize', resizeListener?.[1]);
    root = createRoot(container);
  });
});

// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/marketplace' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

import { RouteMotion } from './route-motion';

describe('page navigation motion', () => {
  let container: HTMLDivElement;
  let root: Root;
  let reducedMotion: MediaQueryList;
  const cancel = vi.fn();
  const animate = vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => { cancel: typeof cancel }>(() => ({ cancel }));

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    route.pathname = '/marketplace';
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    reducedMotion = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => reducedMotion));
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    vi.stubGlobal('Animation', class {});
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    animate.mockClear();
    cancel.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function render(pathname = route.pathname) {
    route.pathname = pathname;
    await act(async () => root.render(createElement('div', null,
      createElement(RouteMotion),
      createElement('header', null, 'Header'),
      createElement('main', { 'data-page-transition': '' }, 'Page'),
      createElement('nav', null, 'Tabs'),
    )));
  }

  it('leaves the initial page and same-route refreshes still', async () => {
    await render();
    await render();
    expect(animate).not.toHaveBeenCalled();
  });

  it('animates content forward and back without animating or remounting navigation', async () => {
    await render();
    const navigation = container.querySelector('nav');
    await render('/marketplace/listing-1');
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]).toEqual([
      [{ opacity: 0.35, transform: 'translate3d(18px, 0, 0)' }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
      { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' },
    ]);
    expect(container.querySelector('nav')).toBe(navigation);
    await render('/marketplace');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[1]?.[0]).toEqual([
      { opacity: 0.35, transform: 'translate3d(-18px, 0, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
    ]);
  });

  it('follows bottom-tab order in either direction', async () => {
    await render();
    await render('/profile');
    expect(animate.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: 'translate3d(18px, 0, 0)' }),
    ]));
    await render('/chats');
    expect(animate.mock.calls[1]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: 'translate3d(-18px, 0, 0)' }),
    ]));
  });

  it('skips motion when reduced motion is enabled and cancels it when preference changes', async () => {
    await render();
    Object.assign(reducedMotion, { matches: true });
    await render('/chats');
    expect(animate).not.toHaveBeenCalled();
    Object.assign(reducedMotion, { matches: false });
    await render('/chats/chat-1');
    expect(animate).toHaveBeenCalledTimes(1);
    Object.assign(reducedMotion, { matches: true });
    reducedMotion.dispatchEvent(new Event('change'));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('leaves hidden panes alone and degrades safely without animation support', async () => {
    await render();
    vi.mocked(HTMLElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList);
    await render('/chats');
    expect(animate).not.toHaveBeenCalled();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    await render('/chats/chat-1');
    expect(container.textContent).toContain('Page');
  });

  it('waits for streamed content instead of animating its loading shell', async () => {
    await render();
    const content = container.querySelector('main')!;
    content.innerHTML = '<div data-page-transition-loading>Loading</div>';
    await render('/marketplace/listing-1');
    expect(animate).not.toHaveBeenCalled();
    await act(async () => { content.innerHTML = '<article>Listing details</article>'; });
    expect(animate).toHaveBeenCalledTimes(1);
    await act(async () => { content.innerHTML = '<article>Updated listing details</article>'; });
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('uses a fade without a transform when the page contains viewport-fixed actions', async () => {
    await render();
    const fixedActions = document.createElement('div');
    fixedActions.style.position = 'fixed';
    container.querySelector('main')!.append(fixedActions);
    await render('/marketplace/new');
    expect(animate.mock.calls[0]?.[0]).toEqual([{ opacity: 0.35 }, { opacity: 1 }]);
  });

  it('cancels a pending streamed animation if reduced motion is enabled', async () => {
    await render();
    const content = container.querySelector('main')!;
    content.innerHTML = '<div data-page-transition-loading>Loading</div>';
    await render('/marketplace/listing-1');
    Object.assign(reducedMotion, { matches: true });
    reducedMotion.dispatchEvent(new Event('change'));
    await act(async () => { content.innerHTML = '<article>Listing details</article>'; });
    expect(animate).not.toHaveBeenCalled();
  });

  it('uses only the latest route when another navigation interrupts a loading page', async () => {
    await render();
    const content = container.querySelector('main')!;
    content.innerHTML = '<div data-page-transition-loading>Loading</div>';
    await render('/profile');
    await render('/chats');
    await act(async () => { content.innerHTML = '<article>Chat list</article>'; });
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: 'translate3d(-18px, 0, 0)' }),
    ]));
  });
});

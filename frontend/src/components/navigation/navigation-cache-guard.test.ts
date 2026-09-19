// @vitest-environment jsdom

import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/marketplace', search: '', router: { refresh: vi.fn() } }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => route.router,
}));

import { NavigationCacheGuard } from './navigation-cache-guard';

describe('navigation cache freshness', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T08:00:00Z'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    route.pathname = '/marketplace';
    route.search = '';
    route.router.refresh.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function navigate(path = route.pathname, search = '') {
    route.pathname = path;
    route.search = search;
    await act(async () => root.render(createElement(StrictMode, null, createElement(NavigationCacheGuard))));
  }

  it('reuses browsing and conversation pages without flushing the router cache', async () => {
    await navigate();
    await navigate('/marketplace/listing-1');
    await navigate('/chats');
    await navigate('/chats/chat-1');
    await navigate('/marketplace', 'q=Messi');
    expect(route.router.refresh).not.toHaveBeenCalled();
  });

  it('leaves uncached workflows to the router without duplicate navigation requests', async () => {
    await navigate('/hamyon');
    expect(route.router.refresh).not.toHaveBeenCalled();
    const destinations = [
      ['/marketplace/new', ''], ['/marketplace/listing-1/edit', ''],
      ['/marketplace/listing-1/advertise', ''], ['/profile', ''],
      ['/profile', 'tab=kartalar'], ['/admin/trades', ''], ['/hamyon', ''],
    ];
    for (const [path, search] of destinations) await navigate(path, search);
    expect(route.router.refresh).not.toHaveBeenCalled();
    await navigate('/hamyon');
    expect(route.router.refresh).not.toHaveBeenCalled();
  });

  it('rechecks stale pages on resume and deduplicates visibility/focus events', async () => {
    await navigate();
    window.dispatchEvent(new Event('focus'));
    expect(route.router.refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(route.router.refresh).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
    expect(route.router.refresh).toHaveBeenCalledTimes(1);
  });

  it('removes listeners when the app unmounts', async () => {
    await navigate();
    await act(async () => root.render(null));
    vi.advanceTimersByTime(30_000);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(route.router.refresh).not.toHaveBeenCalled();
  });
});

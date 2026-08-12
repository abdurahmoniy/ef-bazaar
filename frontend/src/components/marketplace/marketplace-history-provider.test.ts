// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  pathname: '/marketplace',
  search: 'q=Messi',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock('next/link', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({ onNavigate, onClick, children, ...props }: {
      onNavigate?: () => void;
      onClick?: React.MouseEventHandler<HTMLAnchorElement>;
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => ReactModule.createElement('a', {
      ...props,
      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented && onNavigate) {
          event.preventDefault();
          onNavigate();
        }
      },
    }, children),
  };
});

vi.mock('@/hooks/use-telegram-back-button', () => ({
  useTelegramBackButton: () => false,
}));

import { TopBackButton } from '@/components/navigation/top-back-button';
import {
  MarketplaceHistoryProvider,
  useMarketplaceHistory,
} from './marketplace-history-provider';
import { MarketplaceListingLink } from './marketplace-listing-link';
import { MarketplaceScrollRestorer } from './marketplace-scroll-restorer';
import { MeasuredBottomBar } from './measured-bottom-bar';
import {
  MARKETPLACE_DETAIL_STATE_KEY,
  MARKETPLACE_FEED_STATE_KEY,
  MARKETPLACE_PENDING_STORAGE_KEY,
  type MarketplaceFeedMarker,
} from '@/lib/marketplace-scroll-state';

const ListingLinkForTest = MarketplaceListingLink as React.ComponentType<
  Omit<React.ComponentProps<typeof MarketplaceListingLink>, 'children'> & {
    children?: React.ReactNode;
  }
>;

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const feed: MarketplaceFeedMarker = {
  version: 1,
  kind: 'marketplace-feed',
  queryKey: 'q=Messi',
  listingId: 'listing-1',
  scrollY: 640,
  feedHref: '/marketplace?q=Messi',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  navigation.pathname = '/marketplace';
  navigation.search = 'q=Messi';
  navigation.replace.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/marketplace?q=Messi');
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.sessionStorage.clear();
  delete reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
  vi.restoreAllMocks();
});

describe('MarketplaceListingLink feed marker', () => {
  it('marks only opted-in genuine Next navigation and preserves private history state', async () => {
    window.history.replaceState({ __NA: true, tree: ['next'] }, '', '/marketplace?q=Messi');

    await act(async () => root.render(React.createElement(
      ListingLinkForTest,
      {
        listingId: 'listing-1',
        href: '/marketplace/listing-1',
        rawQuery: 'q=Messi',
        trackFeedNavigation: true,
      },
      'Open',
    )));
    const link = container.querySelector('a');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Expected listing link');

    await act(async () => link.click());

    expect(window.history.state).toMatchObject({ __NA: true, tree: ['next'] });
    expect(window.history.state[MARKETPLACE_FEED_STATE_KEY]).toMatchObject(feed);
    expect(JSON.parse(window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY) ?? '{}'))
      .toMatchObject({
        version: 1,
        targetHref: '/marketplace/listing-1?q=Messi',
        feed,
      });
  });

  it('does not mark non-feed cards', async () => {
    await act(async () => root.render(React.createElement(
      ListingLinkForTest,
      {
        listingId: 'listing-1',
        href: '/marketplace/listing-1',
        rawQuery: 'q=Messi',
      },
      'Open',
    )));
    const link = container.querySelector('a');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Expected listing link');

    await act(async () => link.click());

    expect(window.history.state[MARKETPLACE_FEED_STATE_KEY]).toBeUndefined();
    expect(window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY)).toBeNull();
  });

  it('never blocks genuine navigation when either marker persistence API throws', async () => {
    await act(async () => root.render(React.createElement(
      ListingLinkForTest,
      {
        listingId: 'listing-1',
        href: '/marketplace/listing-1',
        rawQuery: 'q=Messi',
        trackFeedNavigation: true,
      },
      'Open',
    )));
    const link = container.querySelector('a');
    if (!(link instanceof HTMLAnchorElement)) throw new Error('Expected listing link');

    const replaceState = vi.spyOn(window.history, 'replaceState')
      .mockImplementation(() => { throw new DOMException('Denied'); });
    await expect(act(async () => link.click())).resolves.toBeUndefined();
    expect(window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY)).not.toBeNull();

    replaceState.mockRestore();
    window.sessionStorage.clear();
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new DOMException('Denied'); });
    await expect(act(async () => link.click())).resolves.toBeUndefined();
    expect(window.history.state[MARKETPLACE_FEED_STATE_KEY]).toMatchObject(feed);
    setItem.mockRestore();
  });
});

describe('MarketplaceHistoryProvider lifecycle', () => {
  it('finalizes detail state, always removes pending, and publishes only popstate feed state', async () => {
    const pending = { version: 1, targetHref: '/marketplace/listing-1?q=Messi', createdAt: Date.now(), feed };
    window.sessionStorage.setItem(MARKETPLACE_PENDING_STORAGE_KEY, JSON.stringify(pending));
    window.history.replaceState({ __NA: true }, '', '/marketplace/listing-1?q=Messi');
    navigation.pathname = '/marketplace/listing-1';
    let latest: ReturnType<typeof useMarketplaceHistory> | undefined;
    function Consumer() {
      latest = useMarketplaceHistory();
      return null;
    }

    await act(async () => root.render(React.createElement(
      React.StrictMode,
      null,
      React.createElement(MarketplaceHistoryProvider, null, React.createElement(Consumer)),
    )));

    expect(window.history.state).toMatchObject({ __NA: true });
    expect(window.history.state[MARKETPLACE_DETAIL_STATE_KEY]).toMatchObject({
      previousFeedHref: '/marketplace?q=Messi',
      listingId: 'listing-1',
    });
    expect(window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY)).toBeNull();
    expect(latest?.popstateMarker).toBeNull();

    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', {
      state: { [MARKETPLACE_FEED_STATE_KEY]: feed },
    })));
    expect(latest?.popstateMarker).toEqual(feed);

    navigation.pathname = '/marketplace';
    window.history.replaceState({ [MARKETPLACE_FEED_STATE_KEY]: { ...feed, listingId: 'push-only' } }, '', '/marketplace?q=Messi');
    await act(async () => root.render(React.createElement(
      React.StrictMode,
      null,
      React.createElement(MarketplaceHistoryProvider, null, React.createElement(Consumer)),
    )));
    expect(latest?.popstateMarker?.listingId).toBe('listing-1');
  });

  it('removes malformed pending state and cleans its popstate listener', async () => {
    window.sessionStorage.setItem(MARKETPLACE_PENDING_STORAGE_KEY, '{bad-json');
    const remove = vi.spyOn(window, 'removeEventListener');

    await act(async () => root.render(React.createElement(
      MarketplaceHistoryProvider,
      null,
      React.createElement('span', null, 'child'),
    )));
    expect(window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY)).toBeNull();

    await act(async () => root.unmount());
    expect(remove).toHaveBeenCalledWith('popstate', expect.any(Function));
    root = createRoot(container);
  });

  it('survives blocked storage and history state writes without leaking stale popstate state', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });

    await expect(act(async () => root.render(React.createElement(
      MarketplaceHistoryProvider,
      null,
      React.createElement('span', null, 'child'),
    )))).resolves.toBeUndefined();
    getItem.mockRestore();

    const pending = {
      version: 1,
      targetHref: '/marketplace/listing-1?q=Messi',
      createdAt: Date.now(),
      feed,
    };
    window.sessionStorage.setItem(MARKETPLACE_PENDING_STORAGE_KEY, JSON.stringify(pending));
    navigation.pathname = '/marketplace/listing-1';
    const replaceState = vi.spyOn(window.history, 'replaceState')
      .mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });

    await expect(act(async () => root.render(React.createElement(
      MarketplaceHistoryProvider,
      null,
      React.createElement('span', null, 'detail'),
    )))).resolves.toBeUndefined();
    expect(window.sessionStorage.getItem(MARKETPLACE_PENDING_STORAGE_KEY)).toBeNull();
    replaceState.mockRestore();

    let latest: ReturnType<typeof useMarketplaceHistory> | undefined;
    function Consumer() {
      latest = useMarketplaceHistory();
      return null;
    }
    await act(async () => root.render(React.createElement(
      MarketplaceHistoryProvider,
      null,
      React.createElement(Consumer),
    )));
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', {
      state: { [MARKETPLACE_FEED_STATE_KEY]: feed },
    })));
    expect(latest?.popstateMarker).toEqual(feed);
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', { state: {} })));
    expect(latest?.popstateMarker).toBeNull();
  });
});

describe('MarketplaceScrollRestorer', () => {
  it('waits two animation frames, then prefers the listing anchor and clears notification', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const scrollIntoView = vi.fn();
    const anchor = document.createElement('article');
    anchor.id = 'marketplace-listing-listing-1';
    anchor.scrollIntoView = scrollIntoView;
    document.body.append(anchor);

    await act(async () => root.render(React.createElement(
      MarketplaceHistoryProvider,
      null,
      React.createElement(MarketplaceScrollRestorer, {
        rawQuery: 'q=Messi',
        listingIds: ['listing-1'],
      }),
    )));
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', {
      state: { [MARKETPLACE_FEED_STATE_KEY]: feed },
    })));

    expect(frames).toHaveLength(1);
    await act(async () => frames.shift()?.(1));
    expect(scrollIntoView).not.toHaveBeenCalled();
    await act(async () => frames.shift()?.(2));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    anchor.remove();
  });

  it('falls back to a clamped pixel and cancels outstanding frames on cleanup', async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 1_000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });

    await act(async () => root.render(React.createElement(
      MarketplaceHistoryProvider,
      null,
      React.createElement(MarketplaceScrollRestorer, {
        rawQuery: 'q=Messi',
        listingIds: [],
      }),
    )));
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', {
      state: { [MARKETPLACE_FEED_STATE_KEY]: { ...feed, scrollY: 900 } },
    })));
    const first = frames.get(1);
    if (!first) throw new Error('Expected first frame');
    await act(async () => first(1));
    const second = frames.get(2);
    if (!second) throw new Error('Expected second frame');
    await act(async () => second(2));
    expect(scrollTo).toHaveBeenCalledWith({ top: 600 });

    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', {
      state: { [MARKETPLACE_FEED_STATE_KEY]: feed },
    })));
    await act(async () => root.unmount());
    expect(cancel).toHaveBeenCalled();
    root = createRoot(container);
  });
});

describe('MeasuredBottomBar and marker-proven Back', () => {
  it('measures border-box height onto its shell and removes it on cleanup', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    await act(async () => root.render(React.createElement(
      'div',
      { 'data-marketplace-shell': true },
      React.createElement(MeasuredBottomBar, null, 'Tabs'),
    )));
    const shell = container.querySelector('[data-marketplace-shell]');
    const bar = shell?.firstElementChild;
    if (!(shell instanceof HTMLElement) || !(bar instanceof HTMLElement) || !resizeCallback) {
      throw new Error('Expected measured bar');
    }
    await act(async () => resizeCallback?.([{
      target: bar,
      borderBoxSize: [{ blockSize: 72, inlineSize: 320 }],
      contentBoxSize: [],
      contentRect: bar.getBoundingClientRect(),
      devicePixelContentBoxSize: [],
    }], {} as ResizeObserver));
    expect(shell.style.getPropertyValue('--marketplace-bottom-bar-height')).toBe('72px');

    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    expect(shell.style.getPropertyValue('--marketplace-bottom-bar-height')).toBe('');
    root = createRoot(container);
  });

  it('uses history.back only with a matching detail marker and otherwise replaces safely', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const detail = {
      version: 1,
      kind: 'marketplace-detail',
      previousFeedHref: '/marketplace?q=Messi',
      queryKey: 'q=Messi',
      listingId: 'listing-1',
    };
    window.history.replaceState({ [MARKETPLACE_DETAIL_STATE_KEY]: detail }, '', '/marketplace/listing-1?q=Messi');

    await act(async () => root.render(React.createElement(TopBackButton, {
      href: '/marketplace?q=Messi',
    })));
    const button = container.querySelector('a');
    if (!(button instanceof HTMLAnchorElement)) throw new Error('Expected Back link');
    await act(async () => button.click());
    expect(back).toHaveBeenCalledOnce();
    expect(navigation.replace).not.toHaveBeenCalled();

    window.history.replaceState({}, '', '/marketplace/listing-1?q=Messi');
    await act(async () => button.click());
    expect(navigation.replace).toHaveBeenCalledWith('/marketplace?q=Messi');
  });
});

describe('history source safety contracts', () => {
  it('does not infer history from length and removes fixed page padding', () => {
    const files = [
      'src/components/navigation/top-back-button.tsx',
      'src/components/navigation/back-link.tsx',
      'src/components/marketplace/marketplace-shell.tsx',
      'src/app/globals.css',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');

    expect(files).not.toContain('history.length');
    expect(files).not.toContain('pb-24');
    expect(files).toContain('--marketplace-bottom-bar-height');
  });
});

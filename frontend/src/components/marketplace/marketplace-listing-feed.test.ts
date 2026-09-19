// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceListingFeed } from './marketplace-listing-feed';
import { MarketplaceHistoryProvider } from './marketplace-history-provider';
import { MARKETPLACE_FEED_STATE_KEY, normalizeMarketplaceQuery } from '@/lib/marketplace-scroll-state';
import type { ListingResponse, PageResponse } from '@/lib/marketplace-types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/marketplace', useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ onNavigate: _onNavigate, ...props }: Record<string, unknown>) => createElement('a', props),
  useLinkStatus: () => ({ pending: false }),
}));

function listing(id: string): ListingResponse {
  return { id, sellerId: 'seller', description: `Account ${id}`, price: 50000,
    priceNegotiable: false, attributes: {}, mediaMessageIds: [], status: 'ACTIVE',
    likeCount: 0, forwardCount: 0, createdAt: '', updatedAt: '' };
}
function page(ids: string[], index = 0, totalPages = 3): PageResponse<ListingResponse> {
  return { content: ids.map(listing), page: index, size: 2, totalPages, totalElements: 6 };
}
let root: Root;
let host: HTMLDivElement;
let mobile: boolean;
let mediaChange: ((event: { matches: boolean }) => void) | undefined;
let observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[];
let fetchMock: ReturnType<typeof vi.fn>;
const initialPage = page(['one', 'two']);
const props = { initialPage, filters: { size: 2 }, rawQuery: '', view: 'auto' as const, matchCriteria: [] };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mobile = true;
  observers = [];
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: mobile, addEventListener: (_: string, callback: typeof mediaChange) => { mediaChange = callback; }, removeEventListener: vi.fn(),
  })));
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(page(['three', 'four'], 1))));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});
async function render(overrides: Partial<typeof props> = {}) {
  await act(async () => root.render(createElement(MarketplaceHistoryProvider, null,
    createElement(MarketplaceListingFeed, { ...props, ...overrides }))));
}
async function intersect() {
  await act(async () => observers.at(-1)!.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
}
function ids() { return Array.from(host.querySelectorAll('[data-marketplace-listing-id]')).map(el => el.getAttribute('data-marketplace-listing-id')); }

describe('mobile marketplace infinite scrolling', () => {
  it('appends the next page without navigation and preserves API filters and detail links', async () => {
    const rawQuery = 'q=Messi&matchCard=1%3Ax%3AN&matchCard=2%3Ay%3AP';
    await render({ rawQuery, filters: { size: 2, search: 'Messi', matchCards: ['1:x:N', '2:y:P'], matchStrictness: 4, attributes: { platform: 'STEAM' } } as typeof props.filters });
    expect(ids()).toEqual(['one', 'two']);
    expect(host.querySelector('nav[aria-label="Sahifalash"]')).toBeNull();
    await intersect();
    expect(ids()).toEqual(['one', 'two', 'three', 'four']);
    const url = new URL(fetchMock.mock.calls[0][0], 'https://efbazaar.uz');
    expect(url.pathname).toBe('/api/marketplace/v1/listings');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('search')).toBe('Messi');
    expect(url.searchParams.get('attr.platform')).toBe('STEAM');
    expect(url.searchParams.getAll('matchCard')).toEqual(['1:x:N', '2:y:P']);
    expect(host.querySelector('[data-marketplace-listing-link="three"]')?.getAttribute('href')).toBe(`/marketplace/three?${rawQuery}`);
  });

  it('loads one request at a time, deduplicates overlapping listings, and stops at the final page', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    await render(); await intersect(); await intersect();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Yuklanmoqda');
    await act(async () => resolve(new Response(JSON.stringify(page(['two', 'three'], 1, 2)))));
    expect(ids()).toEqual(['one', 'two', 'three']);
    expect(host.textContent).toContain('Barcha e‘lonlar ko‘rsatildi');
    expect(host.querySelector('button[data-load-more]')).toBeNull();
  });

  it('retains the feed on error and retries the same page explicitly', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await render(); await intersect();
    expect(ids()).toEqual(['one', 'two']);
    expect(host.textContent).toContain('Qayta urinish');
    await act(async () => host.querySelector<HTMLButtonElement>('button[data-load-more]')!.click());
    expect(ids()).toEqual(['one', 'two', 'three', 'four']);
    expect(fetchMock.mock.calls.map(call => new URL(call[0], 'https://efbazaar.uz').searchParams.get('page'))).toEqual(['1', '1']);
  });

  it('keeps numbered desktop pagination and never fetches automatically there', async () => {
    mobile = false; await render();
    expect(observers).toHaveLength(0);
    expect(host.querySelector('nav[aria-label="Sahifalash"]')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discards an in-flight page when filters change', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    await render(); await intersect();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await render({ rawQuery: 'q=Ronaldo', initialPage: page(['new-one', 'new-two']) });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(new Response(JSON.stringify(page(['stale'], 1)))));
    expect(ids()).toEqual(['new-one', 'new-two']);
  });

  it('restores appended listings after visiting a detail and returning with Back', async () => {
    await render(); await intersect();
    await act(async () => root.render(createElement(MarketplaceHistoryProvider, null, createElement('p', null, 'Detail'))));
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', { state: { [MARKETPLACE_FEED_STATE_KEY]: {
      version: 1, kind: 'marketplace-feed', queryKey: normalizeMarketplaceQuery(''), listingId: 'three', scrollY: 800, feedHref: '/marketplace',
    } } })));
    await render();
    expect(ids()).toEqual(['one', 'two', 'three', 'four']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('switches back to the initial page on desktop without losing the mobile feed', async () => {
    await render(); await intersect();
    await act(async () => mediaChange?.({ matches: false }));
    expect(ids()).toEqual(['one', 'two']);
    expect(host.querySelector('nav[aria-label="Sahifalash"]')).not.toBeNull();
    await act(async () => mediaChange?.({ matches: true }));
    expect(ids()).toEqual(['one', 'two', 'three', 'four']);
  });
});

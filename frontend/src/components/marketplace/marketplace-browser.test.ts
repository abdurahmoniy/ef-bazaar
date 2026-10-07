// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketplaceBrowser } from './marketplace-browser';
import { parseListingSearchParams } from '@/lib/marketplace-format';
import { getMarketplaceTab, searchParamsToInput } from '@/lib/marketplace-query';
import type { MarketplacePageLoad } from '@/lib/marketplace-page-server';

vi.mock('./listing-filters', () => ({ ListingFilters: () => null, QuickChips: () => null }));
vi.mock('./marketplace-filter-sheet', () => ({ MarketplaceFilterSheet: () => null }));
vi.mock('./player-filter-launcher', () => ({ PlayerFilterLauncher: () => null }));
vi.mock('./marketplace-listing-feed', () => ({ MarketplaceListingFeed: () => null }));

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});

function loaded(mode: 'mine' | 'market' | 'match' = 'mine'): MarketplacePageLoad {
  return { ok: true, data: {
    mode,
    page: { content: [], page: 0, size: 12, totalElements: 0, totalPages: 0 },
  } };
}

async function renderBrowser(rawQuery = '', load = loaded(), authenticated = true) {
  const params = new URLSearchParams(rawQuery);
  await act(async () => root.render(createElement(MarketplaceBrowser, {
    filters: parseListingSearchParams(searchParamsToInput(params)),
    activeFilter: 'all', rawQuery, load, authenticated,
    tab: getMarketplaceTab(params, authenticated), view: 'auto',
  })));
}

async function openSort() {
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label^="Saralash:"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger!.click());
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('[role="menuitemradio"]'));
}

describe('marketplace sort integration', () => {
  it('replaces the section tabs with interests selected first in the sort menu', async () => {
    await renderBrowser();

    expect(container.querySelector('nav[aria-label="Bozor bo\'limlari"]')).toBeNull();
    const items = await openSort();
    expect(items.map((item) => item.textContent)).toEqual([
      'Qiziqishlarim', "Qiymat bo'yicha", 'Arzon narx', 'Qimmat narx', "Ko'p yoqtirilgan", 'Eng yangi', 'Eng eski',
    ]);
    expect(items.filter((item) => item.getAttribute('aria-checked') === 'true')).toEqual([items[0]]);
    expect(document.activeElement).toBe(items[0]);
    expect(items[0].getAttribute('href')).toBe('/marketplace');
  });

  it.each(['feed_empty', 'rec_unavailable'] as const)('keeps interests selected during %s fallback', async (notice) => {
    const load = loaded('market');
    if (load.ok) load.data.notice = notice;
    await renderBrowser('', load);

    const items = await openSort();
    expect(items[0].textContent).toBe('Qiziqishlarim');
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Katta bozor');
  });

  it('allows leaving interests when the personalized feed fails', async () => {
    await renderBrowser('', { ok: false, mode: 'mine' });
    expect(await openSort()).toHaveLength(7);
  });

  it('switches to each public ordering with filters preserved and a fresh page', async () => {
    await renderBrowser(`q=Messi&minPrice=5&view=list&tracking=a&tracking=b&page=3&feed=${'a'.repeat(64)}`);
    const items = await openSort();

    for (const [index, sort] of ['valueScore,desc', 'price,asc', 'price,desc', 'likeCount,desc', 'createdAt,desc', 'createdAt,asc'].entries()) {
      const params = new URL(items[index + 1].href).searchParams;
      expect(getMarketplaceTab(params, true)).toBe('market');
      expect(params.get('sort')).toBe(sort);
      expect(params.get('q')).toBe('Messi');
      expect(params.get('minPrice')).toBe('5');
      expect(params.get('view')).toBe('list');
      expect(params.getAll('tracking')).toEqual(['a', 'b']);
      expect(params.has('page')).toBe(false);
      expect(params.has('feed')).toBe(false);
    }
  });

  it.each([['createdAt,desc', 'Eng yangi'], ['createdAt,asc', 'Eng eski']])('marks %s as selected', async (sort, label) => {
    await renderBrowser(`sort=${sort}`, loaded('market'));
    const items = await openSort();
    expect(items.filter((item) => item.getAttribute('aria-checked') === 'true').map((item) => item.textContent)).toEqual([label]);
  });

  it('returns from a public ordering to interests without retaining the old sort', async () => {
    await renderBrowser(`tab=market&sort=price,asc&minPrice=5&page=2&feed=${'a'.repeat(64)}`, loaded('market'));
    const items = await openSort();
    expect(items[2].getAttribute('aria-checked')).toBe('true');
    const params = new URL(items[0].href).searchParams;
    expect(getMarketplaceTab(params, true)).toBe('mine');
    expect(params.toString()).toBe('minPrice=5');
  });

  it('keeps public value ordering as the guest default without a personal option', async () => {
    await renderBrowser('', loaded('market'), false);
    const items = await openSort();
    expect(items).toHaveLength(6);
    expect(items[0].textContent).toBe("Qiymat bo'yicha");
    expect(items[0].getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).not.toContain('Qiziqishlarim');
  });

  it('keeps player-match ranking separate from public ordering', async () => {
    await renderBrowser('', loaded('match'));
    expect(container.querySelector('button[aria-label^="Saralash:"]')).toBeNull();
  });
});

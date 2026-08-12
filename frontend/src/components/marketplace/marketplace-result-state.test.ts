// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  MarketplaceEmptyState,
  MarketplaceErrorState,
  getMarketplaceEmptyState,
} from './marketplace-result-state';

const MESSI_MATCH = '101:11111111-1111-4111-8111-111111111111:N';
const NEYMAR_MATCH = '202:22222222-2222-4222-8222-222222222222:P';

describe('marketplace empty-state recovery', () => {
  it('prioritizes player match, then search, then general criteria', () => {
    const player = getMarketplaceEmptyState(new URLSearchParams(
      `q=Messi&matchCard=${encodeURIComponent(MESSI_MATCH)}&matchStrictness=7&view=grid`,
    ));
    expect(player.title).toBe('Bu tarkibga mos akkount topilmadi');
    expect(player.primaryHref).toContain('matchStrictness=6');
    expect(player.primaryHref).toContain('q=Messi');

    const search = getMarketplaceEmptyState(new URLSearchParams('q=Messi&view=list'));
    expect(search.title).toBe('“Messi” bo‘yicha natija yo‘q');
    expect(search.primaryHref).toBe('/marketplace?view=list#marketplace-search');

    const filtered = getMarketplaceEmptyState(
      new URLSearchParams('minPrice=100000&view=grid'),
    );
    expect(filtered.title).toBe('Bu filtrlarga mos e‘lon topilmadi');
    expect(filtered.primaryLabel).toBe('Filtrlarni yumshatish');
    expect(filtered.primaryHref).toBe('/marketplace?view=grid');
  });

  it('changes only player-match-owned state and preserves repeated public params', () => {
    const state = getMarketplaceEmptyState(new URLSearchParams(
      `q=Messi&matchCard=${encodeURIComponent(MESSI_MATCH)}`
      + `&matchCard=${encodeURIComponent(NEYMAR_MATCH)}`
      + '&matchStrictness=8&page=4&sort=price%2Casc&view=grid&tracking=one&tracking=two',
    ));
    const [href, hash = ''] = state.primaryHref.split('#');
    const next = new URL(href, 'https://efbazaar.example');

    expect(hash).toBe('');
    expect(next.searchParams.getAll('matchCard')).toEqual([MESSI_MATCH, NEYMAR_MATCH]);
    expect(next.searchParams.get('matchStrictness')).toBe('7');
    expect(next.searchParams.get('q')).toBe('Messi');
    expect(next.searchParams.get('sort')).toBe('price,asc');
    expect(next.searchParams.get('view')).toBe('grid');
    expect(next.searchParams.getAll('tracking')).toEqual(['one', 'two']);
    expect(next.searchParams.has('page')).toBe(false);
  });

  it('opens player editing at minimum strictness without discarding the match', () => {
    const state = getMarketplaceEmptyState(new URLSearchParams(
      `matchCard=${encodeURIComponent(MESSI_MATCH)}&matchStrictness=1&page=2&tracking=feed`,
    ));
    const [href, hash] = state.primaryHref.split('#');
    const next = new URL(href, 'https://efbazaar.example');

    expect(state.primaryLabel).toBe('O‘yinchilarni o‘zgartirish');
    expect(hash).toBe('marketplace-player-filter');
    expect(next.searchParams.getAll('matchCard')).toEqual([MESSI_MATCH]);
    expect(next.searchParams.get('matchStrictness')).toBe('1');
    expect(next.searchParams.get('tracking')).toBe('feed');
    expect(next.searchParams.has('page')).toBe(false);
  });

  it('removes only search-owned keys and page from search recovery', () => {
    const state = getMarketplaceEmptyState(new URLSearchParams(
      'search=Messi&q=ignored&minPrice=100000&page=3&sort=newest&view=list'
      + '&tracking=one&tracking=two',
    ));
    const [href, hash] = state.primaryHref.split('#');
    const next = new URL(href, 'https://efbazaar.example');

    expect(state.title).toBe('“ignored” bo‘yicha natija yo‘q');
    expect(hash).toBe('marketplace-search');
    expect(next.searchParams.has('q')).toBe(false);
    expect(next.searchParams.has('search')).toBe(false);
    expect(next.searchParams.has('page')).toBe(false);
    expect(next.searchParams.get('minPrice')).toBe('100000');
    expect(next.searchParams.get('sort')).toBe('newest');
    expect(next.searchParams.get('view')).toBe('list');
    expect(next.searchParams.getAll('tracking')).toEqual(['one', 'two']);
  });

  it('keeps non-criteria state when relaxing general filters', () => {
    const state = getMarketplaceEmptyState(new URLSearchParams(
      'filter=clean&minPrice=100000&attr.team_strength_min=3000&page=2'
      + '&sort=price%2Cdesc&view=grid&tracking=one&tracking=two',
    ));
    const next = new URL(state.primaryHref, 'https://efbazaar.example');

    expect(next.searchParams.get('sort')).toBe('price,desc');
    expect(next.searchParams.get('view')).toBe('grid');
    expect(next.searchParams.getAll('tracking')).toEqual(['one', 'two']);
    expect(next.searchParams.has('filter')).toBe(false);
    expect(next.searchParams.has('minPrice')).toBe(false);
    expect(next.searchParams.has('attr.team_strength_min')).toBe(false);
    expect(next.searchParams.has('page')).toBe(false);
  });

  it('uses platform-aware base copy without claiming the whole market is empty', () => {
    expect(getMarketplaceEmptyState(new URLSearchParams()).title)
      .toBe('Hozircha Mobile platformasida e‘lon yo‘q');
    expect(getMarketplaceEmptyState(new URLSearchParams('attr.platform=STEAM')).title)
      .toBe('Hozircha Steam platformasida e‘lon yo‘q');
    expect(getMarketplaceEmptyState(new URLSearchParams('attr.platform=PLAYSTATION')).title)
      .toBe('Hozircha PlayStation platformasida e‘lon yo‘q');
  });
});

describe('buyer-safe marketplace result components', () => {
  it('renders the chosen empty recovery as a 44px action', () => {
    const markup = renderToStaticMarkup(createElement(MarketplaceEmptyState, {
      state: getMarketplaceEmptyState(new URLSearchParams('q=Messi&view=list')),
    }));

    expect(markup).toContain('“Messi” bo‘yicha natija yo‘q');
    expect(markup).toContain('href="/marketplace?view=list#marketplace-search"');
    expect(markup).toContain('min-h-11');
  });

  it('redacts consumer-facing diagnostics and keeps a retry URL', () => {
    const markup = renderToStaticMarkup(createElement(MarketplaceErrorState, {
      retryHref: '/marketplace?q=Messi',
    }));

    expect(markup).toContain('E‘lonlarni yuklay olmadik');
    expect(markup).toContain('Qayta urinish');
    expect(markup).toContain('href="/marketplace?q=Messi"');
    expect(markup).toContain('min-h-11');
    const visibleText = markup.replace(/<[^>]+>/g, ' ');
    expect(visibleText).not.toMatch(/503|backend|path|stack|network_error/i);
  });
});

describe('marketplace route boundaries', () => {
  it('renders a stable automatic toolbar and listing skeleton', async () => {
    const { default: MarketplaceLoading } = await import('../../app/marketplace/loading');
    const markup = renderToStaticMarkup(createElement(MarketplaceLoading));
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/marketplace/loading.tsx'),
      'utf8',
    );

    expect(source).toContain("import { ResponsiveListingGridSkeleton }");
    expect(source).not.toMatch(/searchParams|useSearchParams/);
    expect(markup).toContain('data-marketplace-route-loading="true"');
    expect(markup).toContain('marketplace-toolbar-actions');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="E‘lonlar yuklanmoqda"');
    expect(markup).toContain('data-view="auto"');
    expect(markup).toContain('aspect-[4/3]');
  });

  it('logs an unexpected error but renders only safe copy and retries with reset', async () => {
    const { default: MarketplaceError } = await import('../../app/marketplace/error');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const reset = vi.fn();
    const error = Object.assign(
      new Error('503 backend /api/v1/listings network_error stack payload'),
      { digest: 'secret-digest' },
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;

    try {
      await act(async () => root.render(createElement(MarketplaceError, { error, reset })));

      const visibleText = container.textContent ?? '';
      const retry = Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Qayta urinish'));
      expect(visibleText).toContain('E‘lonlarni yuklay olmadik');
      expect(visibleText).not.toMatch(/503|backend|api\/v1|network_error|secret-digest/i);
      expect(retry?.className).toContain('min-h-11');
      expect(consoleError).toHaveBeenCalledWith(
        '[marketplace] Unexpected route error',
        error,
      );

      await act(async () => retry?.click());
      expect(reset).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      consoleError.mockRestore();
      delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
    }
  });

  it('disables route skeleton shimmer when reduced motion is requested', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^{]*\{[\s\S]*?\.skeleton::after[^{]*\{[^}]*animation:\s*none/s);
  });
});

describe('marketplace buyer-state integration', () => {
  it('wires safe empty and error states without diagnostic panels', () => {
    const browser = readFileSync(
      resolve(process.cwd(), 'src/components/marketplace/marketplace-browser.tsx'),
      'utf8',
    );
    const detail = readFileSync(
      resolve(process.cwd(), 'src/app/marketplace/[id]/page.tsx'),
      'utf8',
    );

    expect(browser).toContain('getMarketplaceEmptyState(rawParams)');
    expect(browser).toContain('<MarketplaceEmptyState');
    expect(browser).toContain('<MarketplaceErrorState');
    expect(browser).toContain('retryHref={marketplaceHref(rawParams)}');
    expect(browser).not.toContain('ApiErrorPanel');
    expect(browser).not.toContain('function BrowseEmpty');

    expect(detail).toContain("if (result.error.status === 404) notFound()");
    expect(detail).toContain('<MarketplaceErrorState retryHref={backHref}');
    expect(detail).not.toContain('ApiErrorPanel');
  });
});

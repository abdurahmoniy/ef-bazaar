// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListingCard } from './listing-card';
import { ListingCardMedia } from './listing-card-media';
import { ListingLikeButton } from './listing-like-button';
import type { ListingResponse } from '@/lib/marketplace-types';

const actionMocks = vi.hoisted(() => ({
  toggleListingLike: vi.fn(),
}));

vi.mock('@/lib/marketplace-actions', () => ({
  toggleListingLike: actionMocks.toggleListingLike,
}));

vi.mock('next/image', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({ fill: _fill, priority, ...props }: Record<string, unknown>) => React.createElement(
      'img',
      { ...props, 'data-priority': priority ? 'true' : undefined },
    ),
  };
});

const messiId = '11111111-1111-4111-8111-111111111111';
const neymarId = '22222222-2222-4222-8222-222222222222';

function listing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    sellerId: 'seller-1',
    description: 'Strong account with rare players',
    price: 500000,
    priceNegotiable: true,
    attributes: {
      highest_division_level: 2,
      team_strength: 3150,
      android_coins: 100,
      ios_coins: 50,
    },
    mediaMessageIds: [],
    status: 'ACTIVE',
    forwardCount: 0,
    likeCount: 3,
    likedByMe: false,
    createdAt: '2026-06-29T12:00:00Z',
    updatedAt: '2026-06-29T12:00:00Z',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  actionMocks.toggleListingLike.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ListingCard', () => {
  it('renders one full-card detail link with buyer facts in priority order', () => {
    const richListing = listing({
      mediaMessageIds: ['telegram file/id'],
      matchPercent: 58,
      matchDetails: {
        percent: 58,
        exactCount: 1,
        alternateCount: 1,
        missingCount: 1,
        selectedCount: 3,
        strictness: 5,
        exactEfhubIds: [101],
        alternateEfhubIds: [202],
        missingEfhubIds: [303],
        priorityEfhubIds: [],
        earnedWeight: 1.75,
        possibleWeight: 3,
      },
      attributes: {
        valuable_players: [
          { efhub_id: 101, player_id: messiId, name: 'Lionel Messi' },
          { efhub_id: 999, player_id: neymarId, name: 'Neymar Jr' },
          { efhub_id: 404, name: 'Mbappé', card_type: 'BIGTIME', meta_tier: 'NORMAL' },
        ],
        highest_division_level: 2,
        team_strength: 3150,
        android_coins: 100,
        ios_coins: 50,
        has_google_play_link: true,
        has_game_center_link: false,
        device_transfer_limit: 7,
      },
    });
    const markup = renderToStaticMarkup(createElement(ListingCard, {
      listing: richListing,
      layout: 'auto',
      matchCriteria: [
        { efhubId: 101, playerId: messiId, importance: 'N' },
        { efhubId: 202, playerId: neymarId, importance: 'N' },
      ],
      detailQuery: 'q=Messi&view=list&tracking=one&tracking=two',
      priority: true,
    }));

    expect((markup.match(/href="\/marketplace\/listing-1\?/g) ?? [])).toHaveLength(1);
    expect(markup).toContain(
      'href="/marketplace/listing-1?q=Messi&amp;view=list&amp;tracking=one&amp;tracking=two"',
    );
    expect(markup).toContain('aria-label="Sevimlilarga qo&#x27;shish"');
    expect(markup).toContain('min-h-11 min-w-11');
    expect(markup).toContain('data-marketplace-listing-id="listing-1"');
    expect(markup).toContain('data-layout="auto"');
    expect(markup).toContain('data-priority="true"');
    expect(markup.indexOf("500 000 so&#x27;m")).toBeLessThan(markup.indexOf('2/3 mos · 58%'));
    expect(markup.indexOf('2/3 mos · 58%')).toBeLessThan(markup.indexOf('Lionel Messi'));
    expect(markup).toContain('Neymar Jr');
    expect(markup).toContain('1 ta transfer xavfi');
    expect(markup).not.toContain('META');
  });

  it('renders exactly one META badge only for genuinely META attached cards', () => {
    const metaMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          valuable_players: [
            { efhub_id: 101, name: 'Messi', meta_tier: 'META' },
            { efhub_id: 202, name: 'Neymar', metaTier: 'META' },
          ],
        },
      }),
    }));
    const normalMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        description: 'META account',
        attributes: {
          valuable_players: [
            { efhub_id: 101, name: 'Messi', card_type: 'BIGTIME', meta_tier: 'NORMAL' },
          ],
          meta_tier: 'META',
        },
      }),
    }));

    expect((metaMarkup.match(/aria-label="META karta mavjud"/g) ?? [])).toHaveLength(1);
    expect((metaMarkup.match(/>META<\/span>/g) ?? [])).toHaveLength(1);
    expect(normalMarkup).not.toContain('aria-label="META karta mavjud"');
  });

  it('announces sold state and omits the favorite without removing the detail link', () => {
    const markup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({ status: 'SOLD' }),
      layout: 'vertical',
    }));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Sotilgan');
    expect(markup).not.toContain('Sevimlilarga');
    expect((markup.match(/href="\/marketplace\/listing-1"/g) ?? [])).toHaveLength(1);
  });

  it('keeps one article/content tree while supporting legacy variant callers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/marketplace/listing-card.tsx'),
      'utf8',
    );
    const markup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing(),
      variant: 'list',
    }));

    expect((source.match(/<article\b/g) ?? [])).toHaveLength(1);
    expect(markup).toContain('data-layout="horizontal"');
  });
});

describe('ListingCardMedia', () => {
  it('reserves 4:3 geometry and resets its fallback when the source changes', async () => {
    await act(async () => root.render(createElement(ListingCardMedia, {
      src: '/bot/photo/one',
      alt: 'Birinchi rasm',
      priority: false,
    })));

    const media = container.querySelector<HTMLElement>('[data-listing-card-media]');
    expect(media?.className).toContain('aspect-[4/3]');
    const firstImage = container.querySelector('img');
    expect(firstImage?.getAttribute('src')).toBe('/bot/photo/one');

    await act(async () => firstImage?.dispatchEvent(new Event('error', { bubbles: true })));
    expect(container.querySelector('[data-listing-card-fallback]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();

    await act(async () => root.render(createElement(ListingCardMedia, {
      src: '/bot/photo/two',
      alt: 'Ikkinchi rasm',
      priority: false,
    })));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/bot/photo/two');
    expect(container.querySelector('[data-listing-card-fallback]')).toBeNull();
  });
});

describe('ListingLikeButton', () => {
  function renderFavorite() {
    return act(async () => root.render(createElement(ListingLikeButton, {
      listingId: 'listing-1',
      initialLiked: false,
      initialCount: 3,
      authenticated: true,
    })));
  }

  it('allows only one rapid mutation while a request is pending', async () => {
    let resolveRequest: ((value: {
      ok: true;
      data: { listingId: string; liked: boolean; totalLikes: number };
    }) => void) | undefined;
    actionMocks.toggleListingLike.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    await renderFavorite();
    const button = container.querySelector('button')!;

    await act(async () => {
      button.click();
      button.click();
    });
    expect(actionMocks.toggleListingLike).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);

    await act(async () => resolveRequest?.({
      ok: true,
      data: { listingId: 'listing-1', liked: true, totalLikes: 4 },
    }));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('4');
  });

  it('rolls back the optimistic state for a non-ok response', async () => {
    actionMocks.toggleListingLike.mockResolvedValue({
      ok: false,
      status: 500,
      message: 'Like saqlanmadi',
    });
    await renderFavorite();
    const button = container.querySelector('button')!;

    await act(async () => button.click());

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('3');
    expect(button.disabled).toBe(false);
  });

  it('rolls back the optimistic state when the request throws', async () => {
    actionMocks.toggleListingLike.mockRejectedValue(new Error('offline'));
    await renderFavorite();
    const button = container.querySelector('button')!;

    await act(async () => button.click());

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('3');
    expect(button.disabled).toBe(false);
  });
});

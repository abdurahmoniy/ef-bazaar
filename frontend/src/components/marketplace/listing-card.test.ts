// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
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
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actionMocks.refresh }) }));

vi.mock('@/lib/marketplace-actions', () => ({
  toggleListingLike: actionMocks.toggleListingLike,
}));

vi.mock('next/image', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({ fill: _fill, priority, unoptimized, ...props }: Record<string, unknown>) => React.createElement(
      'img',
      {
        ...props,
        'data-priority': priority ? 'true' : undefined,
        'data-unoptimized': unoptimized ? 'true' : undefined,
      },
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
  actionMocks.refresh.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('ListingCard', () => {
  it('ships the coin mark with a transparent canvas instead of a white tile', async () => {
    const { data, info } = await sharp(resolve(process.cwd(), 'public/icons/efootball-coin.png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.channels).toBe(4);
    expect(info.width).toBe(64);
    expect(info.height).toBe(64);
    expect(data[3]).toBe(0);
    expect(data[((32 * info.width) + 32) * info.channels + 3]).toBeGreaterThan(0);
  });

  it('renders only the approved compact buyer facts on the feed card', () => {
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
        exchange_mode: 'EXCHANGE_WITH_SURCHARGE',
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
    expect(markup).toContain("500 000 so&#x27;m");
    expect(markup).toContain('Obmen + doplata');
    expect(markup).toContain('Google Play');
    expect(markup).not.toContain('Game Center');
    expect(markup).toContain('Android');
    expect(markup).toContain('100');
    expect(markup).toContain('iOS');
    expect(markup).toContain('50');
    expect((markup.match(/data-efootball-coin-icon/g) ?? [])).toHaveLength(1);

    expect(markup).not.toContain('2/3 mos · 58%');
    expect(markup).not.toContain('Lionel Messi');
    expect(markup).not.toContain('Neymar Jr');
    expect(markup).toContain('class="sr-only">Strong account with rare players</h2>');
    expect(markup).not.toContain('line-clamp-2');
    expect(markup).not.toContain('Division');
    expect(markup).not.toContain('3 150');
    expect(markup).not.toContain('3 karta');
    expect(markup).not.toContain('transfer xavfi');
    expect(markup).not.toContain('29 iyun');
    expect(markup).not.toContain('META');
  });

  it('renders linked identity providers with +1 shorthand when both are linked', () => {
    const gameCenterMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: false,
          has_game_center_link: true,
        },
      }),
    }));
    const bothLinkedMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: true,
          has_game_center_link: true,
        },
      }),
    }));
    const unlinkedMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: false,
          has_game_center_link: false,
        },
      }),
    }));

    expect(gameCenterMarkup).toContain('data-linked-service-warning="game-center"');
    expect(gameCenterMarkup).toContain('Game Center');
    expect(gameCenterMarkup).not.toContain('Google Play');
    expect(gameCenterMarkup).not.toContain('/icons/apple.svg');
    expect(gameCenterMarkup).toContain('lucide-triangle-alert');
    expect(gameCenterMarkup).toContain('bg-secondary/30');
    expect(gameCenterMarkup).toContain('text-secondary-foreground');
    expect((bothLinkedMarkup.match(/data-linked-service-warning=/g) ?? [])).toHaveLength(1);
    expect(bothLinkedMarkup).toContain('data-linked-service-warning="google-play"');
    expect(bothLinkedMarkup).toContain('Google Play +1');
    expect(bothLinkedMarkup).not.toContain('Game Center');
    expect(bothLinkedMarkup).not.toContain('/icons/google.svg');
    expect(bothLinkedMarkup).not.toContain('/icons/apple.svg');
    expect(unlinkedMarkup).not.toContain('data-linked-service-warning');
  });

  it('requires exact boolean true for linked services and omits trade icon for NONE exchange', () => {
    const markup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: 'true',
          has_game_center_link: 1,
          exchange_mode: 'NONE',
        },
      }),
    }));

    expect(markup).not.toContain('data-linked-service-warning');
    expect(markup).not.toContain('data-exchange-badge');
  });

  it('renders green Toza badge on clean listings without links or negative coins', () => {
    const cleanMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: false,
          has_game_center_link: false,
          android_coins: 500,
        },
      }),
    }));
    const linkedMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: true,
          has_game_center_link: false,
        },
      }),
    }));
    const negativeCoinMarkup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: {
          has_google_play_link: false,
          has_game_center_link: false,
          ios_coins: -100,
        },
      }),
    }));

    expect(cleanMarkup).toContain('data-clean-account-badge="true"');
    expect(cleanMarkup).toContain('Toza');
    expect(cleanMarkup).toContain('text-emerald-700');
    expect(linkedMarkup).not.toContain('data-clean-account-badge');
    expect(negativeCoinMarkup).not.toContain('data-clean-account-badge');
  });

  it('renders negative coin balances in red', () => {
    const markup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: { android_coins: 900, ios_coins: -900 },
      }),
    }));

    expect(markup).toContain('Android');
    expect(markup).toContain('900');
    expect(markup).toContain('aria-label="Android coin: 900, iOS coin: -900"');
    expect(markup).toContain('-900');
    expect(markup).toContain('text-destructive');
  });

  it('uses the supplied PNG and omits zero-valued platform coin facts', () => {
    const markup = renderToStaticMarkup(createElement(ListingCard, {
      listing: listing({
        attributes: { android_coins: 400, ios_coins: 0 },
      }),
    }));

    expect(markup).toContain('src="/icons/efootball-coin.png"');
    expect(markup).toContain('aria-label="Android coin: 400"');
    expect(markup).not.toContain('aria-label="iOS coin: 0"');
    expect((markup.match(/data-efootball-coin-icon/g) ?? [])).toHaveLength(1);
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
  it('reserves 19.5:9 geometry and resets its fallback when the source changes', async () => {
    await act(async () => root.render(createElement(ListingCardMedia, {
      src: '/bot/photo/one',
      alt: 'Birinchi rasm',
      priority: false,
    })));

    const media = container.querySelector<HTMLElement>('[data-listing-card-media]');
    expect(media?.className).toContain('aspect-[19.5/9]');
    const firstImage = container.querySelector('img');
    expect(firstImage?.getAttribute('src')).toBe('/bot/photo/one');
    expect(firstImage?.getAttribute('data-unoptimized')).toBe('true');
    expect(firstImage?.getAttribute('sizes')).toContain('(max-width: 551px) calc(100vw - 2rem)');

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

  it('keeps ordinary image URLs on the Next optimizer path', async () => {
    await act(async () => root.render(createElement(ListingCardMedia, {
      src: 'https://cdn.example.com/listing.jpg',
      alt: 'CDN rasmi',
    })));

    expect(container.querySelector('img')?.getAttribute('data-unoptimized')).toBeNull();
  });

  it('bypasses optimization for full https://efbazaar.uz/bot/photo/ URLs', async () => {
    await act(async () => root.render(createElement(ListingCardMedia, {
      src: 'https://efbazaar.uz/bot/photo/abc123',
      alt: 'Proxy rasm',
    })));

    expect(container.querySelector('img')?.getAttribute('data-unoptimized')).toBe('true');
  });
});

describe('ListingLikeButton', () => {
  it('updates mounted hearts after a fresh server snapshot', async () => {
    await act(async () => root.render(createElement(ListingLikeButton, {
      listingId: 'listing-1', initialLiked: false, initialCount: 3, authenticated: true,
    })));
    await act(async () => root.render(createElement(ListingLikeButton, {
      listingId: 'listing-1', initialLiked: true, initialCount: 4, authenticated: true,
    })));
    expect(container.querySelector('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('4');
  });

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
    expect(actionMocks.refresh).toHaveBeenCalledTimes(1);
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
    expect(actionMocks.refresh).not.toHaveBeenCalled();
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

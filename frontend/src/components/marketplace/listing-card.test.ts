import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ListingCard } from './listing-card';
import type { ListingResponse } from '@/lib/marketplace-types';

function listing(overrides: Partial<ListingResponse> = {}): ListingResponse {
  return {
    id: 'listing-1',
    sellerId: 'seller-1',
    description: 'Strong account with rare players',
    price: 450000,
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

describe('ListingCard', () => {
  it('renders the first Telegram media file through the bot photo proxy', () => {
    const markup = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: listing({ mediaMessageIds: ['telegram file/id'] }),
      }),
    );

    expect(markup).toContain('src="/bot/photo/telegram%20file%2Fid"');
    expect(markup).toContain('alt="Strong account with rare players rasmi"');
  });

  it('shows coin balances even when no store link is set', () => {
    const markup = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: listing({
          attributes: { android_coins: 12500, ios_coins: 900 },
        }),
      }),
    );

    expect(markup).toContain('12 500');
    expect(markup).toContain('900');
    expect(markup).not.toContain('Google Play');
    expect(markup).not.toContain('Game Center');
  });

  it('flags store-linked accounts with a warning, not a verified badge', () => {
    const markup = renderToStaticMarkup(
      createElement(ListingCard, {
        listing: listing({
          attributes: {
            has_google_play_link: true,
            has_game_center_link: true,
          },
        }),
      }),
    );

    expect(markup).toContain('Google Play');
    expect(markup).toContain('Game Center');
  });
});

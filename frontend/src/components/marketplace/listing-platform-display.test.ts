import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/lib/marketplace-actions', () => ({ toggleListingLike: vi.fn() }));
vi.mock('./listing-media-gallery', () => ({ ListingMediaGallery: () => null }));
vi.mock('./listing-actions', () => ({ ListingActions: () => null }));
vi.mock('./seller-card', () => ({ SellerCard: () => null }));
vi.mock('./share-listing-button', () => ({ ShareListingButton: () => null }));

import { ListingCard } from './listing-card';
import { buildListingCardModel } from './listing-card-model';
import { MarketplaceListingDetail } from './marketplace-listing-detail';
import type { ListingResponse } from '@/lib/marketplace-types';

function listing(platform: string | undefined, attributes: Record<string, unknown> = {}): ListingResponse {
  return {
    id: 'listing-1', sellerId: 'owner', description: 'Account', price: 100_000,
    priceNegotiable: true, mediaMessageIds: [], status: 'ACTIVE',
    forwardCount: 0, likeCount: 0,
    createdAt: '2026-09-06T00:00:00Z', updatedAt: '2026-09-06T00:00:00Z',
    attributes: {
      platform,
      highest_division_level: 2,
      team_strength: 3150,
      players_count: 125,
      exchange_mode: 'EXCHANGE_WITH_SURCHARGE',
      android_coins: 888,
      ios_coins: -999,
      has_google_play_link: true,
      has_game_center_link: true,
      device_transfer_limit: 2,
      ...attributes,
    },
  };
}

function detail(value: ListingResponse) {
  return renderToStaticMarkup(createElement(MarketplaceListingDetail, {
    listing: value, viewer: null, seller: null, similarListings: [],
  }));
}

describe('listing platform displays', () => {
  it.each(['STEAM', 'PLAYSTATION'])('hides stale mobile facts and warnings on %s cards and details', (platform) => {
    const value = listing(platform);
    const card = renderToStaticMarkup(createElement(ListingCard, { listing: value }));
    const page = detail(value);

    for (const html of [card, page]) {
      for (const text of ['Android', 'iOS', 'Google Play', 'Game Center', 'Qurilma limiti', 'almashtirish limiti', '888', '-999']) {
        expect(html).not.toContain(text);
      }
    }
    expect(card).not.toContain('data-clean-account-badge');
    expect(card).not.toContain('data-linked-service-warning');
    expect(buildListingCardModel(value, []).safety).toBeNull();
    expect(buildListingCardModel(listing(platform, {
      has_google_play_link: false, has_game_center_link: false,
      android_coins: 100, ios_coins: 100, device_transfer_limit: 10,
    }), [])).toMatchObject({ clean: false, safety: null });
  });

  it.each(['STEAM', 'PLAYSTATION'])('shows the general %s coin balance including negative and zero values', (platform) => {
    for (const coins of [-500, 0, 250]) {
      const value = listing(platform, { coins });
      const card = renderToStaticMarkup(createElement(ListingCard, { listing: value }));
      const page = detail(value);

      expect(card).toContain(`aria-label="Coin balansi: ${coins}"`);
      expect(page).toContain('Coin balansi');
      expect(page).toContain(`>${coins}<`);
      if (coins < 0) {
        expect(card).toContain('text-destructive');
        expect(page).toContain('text-destructive');
      }
    }
  });

  it.each(['MOBILE', undefined])('retains mobile display for platform %s', (platform) => {
    const value = listing(platform);
    const card = renderToStaticMarkup(createElement(ListingCard, { listing: value }));
    const page = detail(value);

    expect(card).toContain('Android coin: 888, iOS coin: -999');
    expect(card).toContain('Google Play +1');
    for (const text of ['Android coin', 'iOS coin', 'Google Play ulangan', 'Game Center ulangan', 'Qurilma limiti']) {
      expect(page).toContain(text);
    }
    expect(buildListingCardModel(value, []).safety?.label).toBe('3 ta transfer xavfi');
  });

  it('shows unanswered store-link information as unknown, not unlinked', () => {
    const value = listing('MOBILE', { has_google_play_link: undefined, has_game_center_link: null });
    const html = detail(value);
    expect(html).toContain('Noma’lum');
    expect(html).toContain('Sotuvchi taqdim etgan');
  });

  it.each(['MOBILE', 'STEAM', 'PLAYSTATION'])('retains global facts on %s', (platform) => {
    const value = listing(platform);
    const page = detail(value);

    expect(buildListingCardModel(value, [])).toMatchObject({ division: 2, teamStrength: 3150, exchange: true });
    for (const text of ['Eng yuqori Division', 'Team Strength', '3 150', '125', 'Obmen + doplata', 'Savdolashish']) {
      expect(page).toContain(text);
    }
    expect(renderToStaticMarkup(createElement(ListingCard, { listing: value }))).toContain('data-exchange-badge');
  });
});
